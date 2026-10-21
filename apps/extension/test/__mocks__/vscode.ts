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

export const window = {
  activeTextEditor: undefined as { viewColumn?: ViewColumn; document?: { uri: Uri } } | undefined,
  activeColorTheme: { kind: ColorThemeKind.Dark } as { kind: ColorThemeKind },
  showInformationMessage: (_msg: string, ..._items: unknown[]) => Promise.resolve(undefined),
  showWarningMessage: (_msg: string, ..._items: unknown[]) => Promise.resolve(undefined),
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

export const workspace = {
  workspaceFolders: undefined as Array<{ uri: Uri; name: string; index: number }> | undefined,
  onDidChangeWorkspaceFolders: _onDidChangeWorkspaceFoldersEmitter.event,
  _fireDidChangeWorkspaceFolders: () => _onDidChangeWorkspaceFoldersEmitter.fire(),
  onDidChangeConfiguration: _onDidChangeConfigurationEmitter.event,
  _fireDidChangeConfiguration: (section: string) =>
    _onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (s: string) => s === section }),
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
    update: async (_key: string, _value: unknown, _target?: unknown): Promise<void> => {},
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
