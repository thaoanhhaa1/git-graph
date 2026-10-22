import * as vscode from 'vscode';
import type { BlameResult } from '@git-graph/shared';
import { DEFAULT_BLAME_FORMAT, buildBlameHover, formatBlameAnnotation } from './BlameFormatter';
import { BlameRepositoryResolver, type BlameTarget } from './BlameRepositoryResolver';

const BLAME_CONFIG_SECTION = 'gitGraph.blame';
const REFRESH_DEBOUNCE_MS = 1000;
const BODY_CACHE_LIMIT = 100;
const VISIBLE_RANGE_BUFFER_LINES = 60;

interface DocumentBlameState {
  target: BlameTarget;
  result: BlameResult;
  version: number;
}

export class BlameDecorationProvider implements vscode.Disposable {
  private readonly _decorationType: vscode.TextEditorDecorationType;
  private readonly _resolver = new BlameRepositoryResolver();
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _inFlightByDocument = new Map<string, AbortController>();
  private readonly _timersByDocument = new Map<string, NodeJS.Timeout>();
  private readonly _blameByDocument = new Map<string, DocumentBlameState>();
  private readonly _bodyCache = new Map<string, Promise<string | null>>();
  private _enabled: boolean;
  private _format: string;
  private _disposed = false;
  private _gitRefreshTimer?: NodeJS.Timeout;

  public constructor() {
    this._decorationType = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      after: {
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 2em',
      },
    });

    this._enabled = this.readEnabledSetting();
    this._format = this.readFormatSetting();

    const gitMetadataWatcher = vscode.workspace.createFileSystemWatcher(
      '**/.git/{HEAD,index,refs/**,logs/HEAD}',
    );

    this._disposables.push(
      gitMetadataWatcher,
      gitMetadataWatcher.onDidChange(() => this.scheduleGitRefresh()),
      gitMetadataWatcher.onDidCreate(() => this.scheduleGitRefresh()),
      gitMetadataWatcher.onDidDelete(() => this.scheduleGitRefresh()),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        void this.refreshEditor(editor);
      }),
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        void this.refreshEditors(editors);
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        const state = this._blameByDocument.get(event.textEditor.document.uri.toString());
        if (state && this._enabled && state.version === event.textEditor.document.version) {
          this.applyDecorationsToEditor(event.textEditor, state.result);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.scheduleRefresh(event.document);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.scheduleRefresh(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.clearDocument(document.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(BLAME_CONFIG_SECTION)) {
          this.handleConfigurationChange();
        }
      }),
      vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        {
          provideHover: (document, position) => this.provideHover(document, position),
        },
      ),
    );

    if (this._enabled) {
      void this.refreshEditors(vscode.window.visibleTextEditors ?? []);
    }
  }

  public get enabled(): boolean {
    return this._enabled;
  }

  public async toggle(): Promise<void> {
    await this.setEnabled(!this._enabled);
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    if (this._enabled === enabled) {
      return;
    }

    this._enabled = enabled;
    if (!enabled) {
      this.clearAll();
    }

    try {
      await vscode.workspace
        .getConfiguration(BLAME_CONFIG_SECTION)
        .update('enabled', enabled, vscode.ConfigurationTarget.Global);
    } catch {
      // Configuration may be read-only (e.g. in untrusted workspaces).
    }

    if (enabled) {
      await this.refreshEditors(vscode.window.visibleTextEditors ?? [], true);
    }
  }

  public async refreshVisibleEditors(): Promise<void> {
    await this.refreshEditors(vscode.window.visibleTextEditors ?? []);
  }

  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;

    for (const timer of this._timersByDocument.values()) {
      clearTimeout(timer);
    }
    this._timersByDocument.clear();

    if (this._gitRefreshTimer) {
      clearTimeout(this._gitRefreshTimer);
      this._gitRefreshTimer = undefined;
    }

    for (const controller of this._inFlightByDocument.values()) {
      controller.abort();
    }
    this._inFlightByDocument.clear();

    this._blameByDocument.clear();
    this._bodyCache.clear();
    this._resolver.dispose();

    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables.length = 0;
    this._decorationType.dispose();
  }

  private readEnabledSetting(): boolean {
    return vscode.workspace.getConfiguration(BLAME_CONFIG_SECTION).get<boolean>('enabled', false);
  }

  private readFormatSetting(): string {
    return (
      vscode.workspace
        .getConfiguration(BLAME_CONFIG_SECTION)
        .get<string>('format', DEFAULT_BLAME_FORMAT) ?? DEFAULT_BLAME_FORMAT
    );
  }

  private handleConfigurationChange(): void {
    const enabled = this.readEnabledSetting();
    const format = this.readFormatSetting();
    if (enabled === this._enabled && format === this._format) {
      return;
    }

    this._enabled = enabled;
    this._format = format;

    if (!enabled) {
      this.clearAll();
      return;
    }

    for (const [key, timer] of this._timersByDocument) {
      clearTimeout(timer);
      this._timersByDocument.delete(key);
    }
    void this.refreshEditors(vscode.window.visibleTextEditors ?? [], true);
  }

  private scheduleGitRefresh(): void {
    if (!this._enabled || this._disposed) {
      return;
    }
    if (this._gitRefreshTimer) {
      clearTimeout(this._gitRefreshTimer);
    }
    this._gitRefreshTimer = setTimeout(() => {
      this._gitRefreshTimer = undefined;
      void this.refreshEditors(vscode.window.visibleTextEditors ?? [], true);
    }, REFRESH_DEBOUNCE_MS);
  }

  private scheduleRefresh(document: vscode.TextDocument): void {
    if (!this._enabled || this._disposed || document.uri.scheme !== 'file') {
      return;
    }

    const key = document.uri.toString();
    const existing = this._timersByDocument.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this._timersByDocument.delete(key);
      void this.refreshDocument(document, { forceFresh: true });
    }, REFRESH_DEBOUNCE_MS);

    this._timersByDocument.set(key, timer);
  }

  private async refreshEditors(
    editors: readonly vscode.TextEditor[],
    forceFresh = false,
  ): Promise<void> {
    if (!this._enabled) {
      return;
    }

    await Promise.all(editors.map((editor) => this.refreshEditor(editor, forceFresh)));
  }

  private async refreshEditor(
    editor: vscode.TextEditor | undefined,
    forceFresh = false,
  ): Promise<void> {
    if (!editor) {
      return;
    }
    if (!this._enabled || editor.document.uri.scheme !== 'file') {
      this.clearEditor(editor);
      return;
    }

    await this.refreshDocument(editor.document, { forceFresh });
  }

  private async refreshDocument(
    document: vscode.TextDocument,
    options: { forceFresh: boolean },
  ): Promise<void> {
    if (!this._enabled || this._disposed || document.uri.scheme !== 'file') {
      return;
    }

    const key = document.uri.toString();
    const version = document.version;

    const target = await this._resolver.resolve(document.uri.fsPath);
    if (!target) {
      this.clearDocument(key);
      return;
    }

    const previousController = this._inFlightByDocument.get(key);
    if (previousController) {
      previousController.abort();
    }

    const controller = new AbortController();
    this._inFlightByDocument.set(key, controller);

    try {
      const result = await target.repository.getBlame(target.relativePath, undefined, {
        signal: controller.signal,
        noCache: options.forceFresh,
      });

      if (
        controller.signal.aborted ||
        this._disposed ||
        !this._enabled ||
        document.isClosed ||
        document.version !== version
      ) {
        return;
      }

      this._blameByDocument.set(key, { target, result, version });
      this.applyDecorations(document, result);
    } catch {
      if (!controller.signal.aborted) {
        this.clearDocument(key);
      }
    } finally {
      if (this._inFlightByDocument.get(key) === controller) {
        this._inFlightByDocument.delete(key);
      }
    }
  }

  private applyDecorations(document: vscode.TextDocument, result: BlameResult): void {
    const editors = (vscode.window.visibleTextEditors ?? []).filter(
      (editor) => editor.document.uri.toString() === document.uri.toString(),
    );

    for (const editor of editors) {
      this.applyDecorationsToEditor(editor, result);
    }
  }

  private applyDecorationsToEditor(editor: vscode.TextEditor, result: BlameResult): void {
    if (!this._enabled) {
      return;
    }

    const document = editor.document;
    const visibleLines = this.collectVisibleLines(editor, document.lineCount);
    const options: vscode.DecorationOptions[] = [];

    for (const line of result.lines) {
      const lineIndex = line.lineNumber - 1;
      if (lineIndex < 0 || lineIndex >= document.lineCount) {
        continue;
      }
      if (visibleLines && !visibleLines.has(lineIndex)) {
        continue;
      }

      const annotation = formatBlameAnnotation(line, this._format);
      if (!annotation) {
        continue;
      }

      options.push({
        range: document.lineAt(lineIndex).range,
        renderOptions: {
          after: {
            contentText: `  ${annotation}`,
          },
        },
      });
    }

    editor.setDecorations(this._decorationType, options);
  }

  private collectVisibleLines(
    editor: vscode.TextEditor,
    lineCount: number,
  ): Set<number> | undefined {
    const ranges = editor.visibleRanges;
    if (!ranges || ranges.length === 0) {
      return undefined;
    }

    const lines = new Set<number>();
    for (const range of ranges) {
      const start = Math.max(0, range.start.line - VISIBLE_RANGE_BUFFER_LINES);
      const end = Math.min(lineCount - 1, range.end.line + VISIBLE_RANGE_BUFFER_LINES);
      for (let line = start; line <= end; line += 1) {
        lines.add(line);
      }
    }
    return lines;
  }

  private async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (!this._enabled || this._disposed) {
      return undefined;
    }

    const state = this._blameByDocument.get(document.uri.toString());
    if (!state) {
      return undefined;
    }

    const info = state.result.lines[position.line];
    if (!info) {
      return undefined;
    }

    const body = await this.loadCommitBody(state, info.sha);
    return new vscode.Hover(buildBlameHover(info, body ?? undefined, state.target.repository.id));
  }

  private loadCommitBody(state: DocumentBlameState, sha: string): Promise<string | null> {
    if (!sha || /^0+$/.test(sha)) {
      return Promise.resolve(null);
    }

    const cached = this._bodyCache.get(sha);
    if (cached) {
      this._bodyCache.delete(sha);
      this._bodyCache.set(sha, cached);
      return cached;
    }

    const pending = state.target.repository.getCommitBody(sha).catch(() => null);
    this._bodyCache.set(sha, pending);
    if (this._bodyCache.size > BODY_CACHE_LIMIT) {
      const oldestKey = this._bodyCache.keys().next().value;
      if (oldestKey !== undefined) {
        this._bodyCache.delete(oldestKey);
      }
    }
    return pending;
  }

  private clearAll(): void {
    for (const [key, timer] of this._timersByDocument) {
      clearTimeout(timer);
      this._timersByDocument.delete(key);
    }
    for (const controller of this._inFlightByDocument.values()) {
      controller.abort();
    }
    this._inFlightByDocument.clear();
    this._blameByDocument.clear();
    this._bodyCache.clear();

    for (const editor of vscode.window.visibleTextEditors ?? []) {
      this.clearEditor(editor);
    }
  }

  private clearDocument(key: string): void {
    const timer = this._timersByDocument.get(key);
    if (timer) {
      clearTimeout(timer);
      this._timersByDocument.delete(key);
    }

    const controller = this._inFlightByDocument.get(key);
    if (controller) {
      controller.abort();
      this._inFlightByDocument.delete(key);
    }

    this._blameByDocument.delete(key);

    for (const editor of vscode.window.visibleTextEditors ?? []) {
      if (editor.document.uri.toString() === key) {
        this.clearEditor(editor);
      }
    }
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this._decorationType, []);
  }
}
