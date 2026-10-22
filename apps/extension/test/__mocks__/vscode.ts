export class Uri {
  public readonly scheme: string;
  public readonly authority: string;
  public readonly path: string;
  public readonly query: string;
  public readonly fragment: string;
  public readonly fsPath: string;

  constructor(fsPath: string, scheme = 'file') {
    this.scheme = scheme;
    this.authority = '';
    this.path = fsPath;
    this.query = '';
    this.fragment = '';
    this.fsPath = fsPath;
  }

  public with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    const next = new Uri(change.path ?? this.fsPath, change.scheme ?? this.scheme);
    (next as { authority: string }).authority = change.authority ?? this.authority;
    (next as { query: string }).query = change.query ?? this.query;
    (next as { fragment: string }).fragment = change.fragment ?? this.fragment;
    return next;
  }

  public toJSON(): unknown {
    return {
      scheme: this.scheme,
      authority: this.authority,
      path: this.path,
      query: this.query,
      fragment: this.fragment,
      fsPath: this.fsPath,
    };
  }

  public toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }

  public static file(path: string): Uri {
    return new Uri(path, 'file');
  }

  public static parse(value: string): Uri {
    return new Uri(value.replace(/^[a-zA-Z0-9+-.]+:\/\//, ''), 'vscode-webview');
  }

  public static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.fsPath, ...pathSegments].join('/').replace(/\/+/g, '/');
    return new Uri(joined, base.scheme);
  }
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}

  public isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  public isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(
    startOrLine: Position | number,
    startCharacterOrEnd: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (startOrLine instanceof Position && startCharacterOrEnd instanceof Position) {
      this.start = startOrLine;
      this.end = startCharacterOrEnd;
    } else {
      this.start = new Position(Number(startOrLine), Number(startCharacterOrEnd));
      this.end = new Position(endLine ?? 0, endCharacter ?? 0);
    }
  }

  public get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  public isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }
}

export class Selection extends Range {
  public readonly anchor: Position;
  public readonly active: Position;

  constructor(anchor: Position, active: Position) {
    super(anchor, active);
    this.anchor = anchor;
    this.active = active;
  }

  public get isReversed(): boolean {
    return this.active.isBefore(this.anchor);
  }
}

export class MarkdownString {
  public value = '';
  public isTrusted = false;
  public supportHtml = false;

  constructor(value = '') {
    this.value = value;
  }

  public appendText(value: string): MarkdownString {
    this.value += value;
    return this;
  }

  public appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }

  public appendCodeblock(value: string, _language?: string): MarkdownString {
    this.value += `\n\n\`\`\`\n${value}\n\`\`\`\n\n`;
    return this;
  }
}

export class Hover {
  public readonly contents: MarkdownString[];
  public readonly range?: Range;

  constructor(contents: MarkdownString | MarkdownString[], range?: Range) {
    this.contents = Array.isArray(contents) ? contents : [contents];
    this.range = range;
  }
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export enum DecorationRangeBehavior {
  OpenOpen = 0,
  ClosedClosed = 1,
  OpenClosed = 2,
  ClosedOpen = 3,
}

export enum OverviewRulerLane {
  Left = 1,
  Center = 2,
  Right = 4,
  Full = 7,
}

export class MockTextLine {
  public readonly range: Range;
  public readonly text: string;

  constructor(
    public readonly lineNumber: number,
    text: string,
  ) {
    this.text = text;
    this.range = new Range(lineNumber, 0, lineNumber, text.length);
  }
}

export class MockTextDocument {
  public readonly uri: Uri;
  public readonly languageId = 'typescript';
  public version = 1;
  public isClosed = false;
  public readonly lines: string[];

  constructor(filePath: string, content = '') {
    this.uri = Uri.file(filePath);
    this.lines = content.split('\n');
  }

  public get lineCount(): number {
    return this.lines.length;
  }

  public getText(): string {
    return this.lines.join('\n');
  }

  public lineAt(lineOrPosition: number | Position): MockTextLine {
    const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
    return new MockTextLine(line, this.lines[line] ?? '');
  }
}

export class MockTextEditorDecorationType {
  private static _nextId = 1;
  public readonly key: string;

  constructor(public readonly options: unknown) {
    this.key = `decoration-${MockTextEditorDecorationType._nextId++}`;
  }

  public dispose(): void {}
}

export const createdDecorationTypes: MockTextEditorDecorationType[] = [];

export class MockTextEditor {
  public options: Record<string, unknown> = {};
  public readonly appliedDecorations = new Map<MockTextEditorDecorationType, readonly unknown[]>();
  public document: MockTextDocument;
  public selection: Selection;
  public visibleRanges: Range[] | undefined;

  constructor(
    document: MockTextDocument,
    selection: Selection = new Selection(new Position(0, 0), new Position(0, 0)),
  ) {
    this.document = document;
    this.selection = selection;
  }

  public setDecorations(
    decorationType: MockTextEditorDecorationType,
    decorations: readonly unknown[],
  ): void {
    this.appliedDecorations.set(decorationType, decorations);
  }
}

export interface MockHoverProvider {
  provideHover(
    document: MockTextDocument,
    position: Position,
    token?: unknown,
  ): Promise<Hover | undefined>;
}

export const hoverProviders: Array<{ selector: unknown; provider: MockHoverProvider }> = [];

export const configurationValues = new Map<string, unknown>();
export const configurationUpdates: Array<{ key: string; value: unknown; target?: unknown }> = [];

export function setMockConfigurationValue(key: string, value: unknown): void {
  configurationValues.set(key, value);
}

export function resetMockConfiguration(): void {
  configurationValues.clear();
  configurationUpdates.length = 0;
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class Disposable {
  private _callOnDispose?: () => void;

  constructor(callOnDispose?: () => void) {
    this._callOnDispose = callOnDispose;
  }

  public dispose(): void {
    if (this._callOnDispose) {
      this._callOnDispose();
      this._callOnDispose = undefined;
    }
  }

  public static from(...disposables: { dispose(): unknown }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
}

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => unknown> = [];

  public event = (
    listener: (e: T) => unknown,
    _thisArgs?: unknown,
    disposables?: Disposable[],
  ): Disposable => {
    this._listeners.push(listener);
    const disposable = new Disposable(() => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) {
        this._listeners.splice(idx, 1);
      }
    });
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
  };

  public fire(data: T): void {
    for (const listener of [...this._listeners]) {
      listener(data);
    }
  }

  public dispose(): void {
    this._listeners = [];
  }
}

export interface MockWebviewOptions {
  enableScripts?: boolean;
  localResourceRoots?: readonly Uri[];
}

export class MockWebview {
  public html = '';
  public options: MockWebviewOptions = {};
  public cspSource = 'vscode-webview:';
  private _onDidReceiveMessageEmitter = new EventEmitter<unknown>();

  public onDidReceiveMessage = this._onDidReceiveMessageEmitter.event;

  public asWebviewUri(uri: Uri): Uri {
    return new Uri(`vscode-resource://${uri.fsPath}`, 'vscode-webview');
  }

  public postMessage(_message: unknown): Promise<boolean> {
    return Promise.resolve(true);
  }

  public fireMessage(message: unknown): void {
    this._onDidReceiveMessageEmitter.fire(message);
  }
}

export class MockWebviewPanel {
  public viewType: string;
  public title: string;
  public viewColumn: ViewColumn;
  public visible = true;
  public active = true;
  public webview: MockWebview;
  public isDisposed = false;
  public iconPath?: Uri | { readonly light: Uri; readonly dark: Uri };

  private _onDidDisposeEmitter = new EventEmitter<void>();
  private _onDidChangeViewStateEmitter = new EventEmitter<{ webviewPanel: MockWebviewPanel }>();

  public onDidDispose = this._onDidDisposeEmitter.event;
  public onDidChangeViewState = this._onDidChangeViewStateEmitter.event;

  constructor(
    viewType: string,
    title: string,
    viewColumn: ViewColumn,
    options?: MockWebviewOptions,
  ) {
    this.viewType = viewType;
    this.title = title;
    this.viewColumn = viewColumn;
    this.webview = new MockWebview();
    if (options) {
      this.webview.options = options;
    }
  }

  public reveal(viewColumn?: ViewColumn): void {
    if (viewColumn !== undefined) {
      this.viewColumn = viewColumn;
    }
    this.visible = true;
    this.active = true;
    this._onDidChangeViewStateEmitter.fire({ webviewPanel: this });
  }

  public dispose(): void {
    if (!this.isDisposed) {
      this.isDisposed = true;
      this.visible = false;
      this.active = false;
      this._onDidDisposeEmitter.fire();
      this._onDidDisposeEmitter.dispose();
      this._onDidChangeViewStateEmitter.dispose();
    }
  }
}

export const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
export const serializers = new Map<
  string,
  { deserializeWebviewPanel(panel: MockWebviewPanel, state: unknown): Promise<void> }
>();

export const commands = {
  registerCommand: (command: string, callback: (...args: unknown[]) => unknown): Disposable => {
    registeredCommands.set(command, callback);
    return new Disposable(() => {
      registeredCommands.delete(command);
    });
  },
  executeCommand: async (command: string, ...args: unknown[]): Promise<unknown> => {
    const handler = registeredCommands.get(command);
    if (handler) {
      return handler(...args);
    }
    throw new Error(`Command ${command} not found`);
  },
};

export class RelativePattern {
  public base: string;
  public pattern: string;

  constructor(base: string | Uri, pattern: string) {
    this.base = typeof base === 'string' ? base : base.fsPath;
    this.pattern = pattern;
  }
}

export class MockFileSystemWatcher extends Disposable {
  private _onDidChange = new EventEmitter<Uri>();
  private _onDidCreate = new EventEmitter<Uri>();
  private _onDidDelete = new EventEmitter<Uri>();

  public onDidChange = this._onDidChange.event;
  public onDidCreate = this._onDidCreate.event;
  public onDidDelete = this._onDidDelete.event;

  public pattern: unknown;
  public ignoreCreateEvents: boolean;
  public ignoreChangeEvents: boolean;
  public ignoreDeleteEvents: boolean;

  constructor(
    pattern: unknown,
    ignoreCreateEvents = false,
    ignoreChangeEvents = false,
    ignoreDeleteEvents = false,
  ) {
    super();
    this.pattern = pattern;
    this.ignoreCreateEvents = ignoreCreateEvents;
    this.ignoreChangeEvents = ignoreChangeEvents;
    this.ignoreDeleteEvents = ignoreDeleteEvents;
  }

  public fireChange(uri: Uri): void {
    if (!this.ignoreChangeEvents) {
      this._onDidChange.fire(uri);
    }
  }

  public fireCreate(uri: Uri): void {
    if (!this.ignoreCreateEvents) {
      this._onDidCreate.fire(uri);
    }
  }

  public fireDelete(uri: Uri): void {
    if (!this.ignoreDeleteEvents) {
      this._onDidDelete.fire(uri);
    }
  }

  public override dispose(): void {
    super.dispose();
    this._onDidChange.dispose();
    this._onDidCreate.dispose();
    this._onDidDelete.dispose();
    const idx = activeWatchers.indexOf(this);
    if (idx >= 0) {
      activeWatchers.splice(idx, 1);
    }
  }
}

export const activeWatchers: MockFileSystemWatcher[] = [];

export class MockStatusBarItem {
  public alignment: StatusBarAlignment;
  public priority?: number;
  public text: string = '';
  public tooltip?: string;
  public command?: string;
  public visible: boolean = false;

  constructor(alignment: StatusBarAlignment = StatusBarAlignment.Left, priority?: number) {
    this.alignment = alignment;
    this.priority = priority;
  }

  public show(): void {
    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }

  public dispose(): void {
    this.visible = false;
  }
}

export interface WindowState {
  focused: boolean;
}

const _onDidChangeWindowStateEmitter = new EventEmitter<WindowState>();
const _onDidChangeActiveTextEditorEmitter = new EventEmitter<unknown>();
const _onDidChangeVisibleTextEditorsEmitter = new EventEmitter<readonly unknown[]>();
const _onDidChangeTextEditorVisibleRangesEmitter = new EventEmitter<{
  textEditor: unknown;
  visibleRanges: readonly Range[];
}>();

export const window = {
  activeTextEditor: undefined as
    { viewColumn?: ViewColumn; document?: { uri: Uri }; selection?: Selection } | undefined,
  visibleTextEditors: [] as MockTextEditor[],
  _setVisibleTextEditors(editors: MockTextEditor[]): void {
    window.visibleTextEditors = editors;
    _onDidChangeVisibleTextEditorsEmitter.fire(editors);
  },
  onDidChangeVisibleTextEditors: _onDidChangeVisibleTextEditorsEmitter.event,
  onDidChangeTextEditorVisibleRanges: _onDidChangeTextEditorVisibleRangesEmitter.event,
  _fireDidChangeTextEditorVisibleRanges: (textEditor: unknown): void =>
    _onDidChangeTextEditorVisibleRangesEmitter.fire({
      textEditor,
      visibleRanges: (textEditor as { visibleRanges?: readonly Range[] }).visibleRanges ?? [],
    }),
  createTextEditorDecorationType: (options?: unknown): MockTextEditorDecorationType => {
    const decorationType = new MockTextEditorDecorationType(options);
    createdDecorationTypes.push(decorationType);
    return decorationType;
  },
  activeColorTheme: { kind: ColorThemeKind.Dark } as { kind: ColorThemeKind },
  showInformationMessage: (_msg: string, ..._items: unknown[]) => Promise.resolve(undefined),
  showWarningMessage: (_msg: string, ..._items: unknown[]) => Promise.resolve(undefined),
  showErrorMessage: (_msg: string, ..._items: unknown[]) => Promise.resolve(undefined),
  showInputBox: (_options?: unknown) => Promise.resolve(undefined),
  showQuickPick: (_items: unknown, _options?: unknown) => Promise.resolve(undefined),
  showTextDocument: async (_docOrUri: unknown, _options?: unknown) => ({}),
  onDidChangeWindowState: _onDidChangeWindowStateEmitter.event,
  _fireDidChangeWindowState: (state: WindowState) => _onDidChangeWindowStateEmitter.fire(state),
  onDidChangeActiveTextEditor: _onDidChangeActiveTextEditorEmitter.event,
  _fireDidChangeActiveTextEditor: (editor: unknown) =>
    _onDidChangeActiveTextEditorEmitter.fire(editor),
  createStatusBarItem: (alignment?: StatusBarAlignment, priority?: number) =>
    new MockStatusBarItem(alignment, priority),
  createWebviewPanel: (
    viewType: string,
    title: string,
    showOptions: ViewColumn | { viewColumn: ViewColumn; preserveFocus?: boolean },
    options?: MockWebviewOptions,
  ): MockWebviewPanel => {
    const col = typeof showOptions === 'number' ? showOptions : showOptions.viewColumn;
    return new MockWebviewPanel(viewType, title, col, options);
  },
  registerWebviewPanelSerializer: (
    viewType: string,
    serializer: { deserializeWebviewPanel(panel: MockWebviewPanel, state: unknown): Promise<void> },
  ): Disposable => {
    serializers.set(viewType, serializer);
    return new Disposable(() => {
      serializers.delete(viewType);
    });
  },
};

const _onDidChangeWorkspaceFoldersEmitter = new EventEmitter<void>();
const _onDidChangeConfigurationEmitter = new EventEmitter<{
  affectsConfiguration: (section: string) => boolean;
}>();
const _onDidChangeTextDocumentEmitter = new EventEmitter<{
  document: MockTextDocument;
  contentChanges: unknown[];
}>();
const _onDidSaveTextDocumentEmitter = new EventEmitter<MockTextDocument>();
const _onDidCloseTextDocumentEmitter = new EventEmitter<MockTextDocument>();

export const workspace = {
  textDocuments: [] as MockTextDocument[],
  onDidChangeTextDocument: _onDidChangeTextDocumentEmitter.event,
  onDidSaveTextDocument: _onDidSaveTextDocumentEmitter.event,
  onDidCloseTextDocument: _onDidCloseTextDocumentEmitter.event,
  _fireDidChangeTextDocument: (document: MockTextDocument): void =>
    _onDidChangeTextDocumentEmitter.fire({ document, contentChanges: [] }),
  _fireDidSaveTextDocument: (document: MockTextDocument): void =>
    _onDidSaveTextDocumentEmitter.fire(document),
  _fireDidCloseTextDocument: (document: MockTextDocument): void => {
    document.isClosed = true;
    _onDidCloseTextDocumentEmitter.fire(document);
  },
  openTextDocument: async (uriOrPath: Uri | string): Promise<MockTextDocument> => {
    const path = typeof uriOrPath === 'string' ? uriOrPath : uriOrPath.fsPath;
    const existing = workspace.textDocuments.find((document) => document.uri.fsPath === path);
    return existing ?? new MockTextDocument(path);
  },
  getWorkspaceFolder: (uri: Uri): { uri: Uri; name: string; index: number } | undefined => {
    return workspace.workspaceFolders?.find((folder) => uri.fsPath.startsWith(folder.uri.fsPath));
  },
  workspaceFolders: undefined as Array<{ uri: Uri; name: string; index: number }> | undefined,
  onDidChangeWorkspaceFolders: _onDidChangeWorkspaceFoldersEmitter.event,
  _fireDidChangeWorkspaceFolders: () => _onDidChangeWorkspaceFoldersEmitter.fire(),
  onDidChangeConfiguration: _onDidChangeConfigurationEmitter.event,
  _fireDidChangeConfiguration: (section: string) =>
    _onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: (s: string) => s === section || section.startsWith(`${s}.`),
    }),
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => {
      const fullKey = section ? `${section}.${key}` : key;
      return configurationValues.has(fullKey)
        ? (configurationValues.get(fullKey) as T)
        : defaultValue;
    },
    update: async (key: string, value: unknown, target?: unknown): Promise<void> => {
      const fullKey = section ? `${section}.${key}` : key;
      configurationValues.set(fullKey, value);
      configurationUpdates.push({ key: fullKey, value, target });
    },
  }),
  createFileSystemWatcher: (
    pattern: unknown,
    ignoreCreateEvents?: boolean,
    ignoreChangeEvents?: boolean,
    ignoreDeleteEvents?: boolean,
  ): MockFileSystemWatcher => {
    const watcher = new MockFileSystemWatcher(
      pattern,
      ignoreCreateEvents,
      ignoreChangeEvents,
      ignoreDeleteEvents,
    );
    activeWatchers.push(watcher);
    return watcher;
  },
  registerTextDocumentContentProvider: (_scheme: string, _provider: unknown) => {
    return new Disposable();
  },
  fs: {
    readFile: async (_uri: Uri): Promise<Uint8Array> => new Uint8Array(),
  },
};

export const env = {
  language: 'en',
};

export const l10n = {
  t: (message: string, ...args: Array<string | number | boolean>): string =>
    message.replace(/\{(\d+)\}/g, (match, index: string) => {
      const value = args[Number.parseInt(index, 10)];
      return value === undefined ? match : String(value);
    }),
};

export const languages = {
  registerHoverProvider: (selector: unknown, provider: MockHoverProvider): Disposable => {
    hoverProviders.push({ selector, provider });
    return new Disposable(() => {
      const index = hoverProviders.findIndex((entry) => entry.provider === provider);
      if (index >= 0) {
        hoverProviders.splice(index, 1);
      }
    });
  },
};
