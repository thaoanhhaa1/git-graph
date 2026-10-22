<p align="center">
  <img src="https://raw.githubusercontent.com/thaoanhhaa1/git-graph/master/resources/banner.png" alt="Git Graph for VS Code Banner" width="100%" />
</p>

# Git Graph for VS Code

[![CI](https://github.com/thaoanhhaa1/git-graph/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/thaoanhhaa1/git-graph/actions/workflows/ci.yml)
[![Nightly](https://github.com/thaoanhhaa1/git-graph/actions/workflows/nightly.yml/badge.svg?branch=master)](https://github.com/thaoanhhaa1/git-graph/actions/workflows/nightly.yml)
[![Release](https://github.com/thaoanhhaa1/git-graph/actions/workflows/release.yml/badge.svg)](https://github.com/thaoanhhaa1/git-graph/actions/workflows/release.yml)
[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/CTS.cts-git-graph?label=Marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=CTS.cts-git-graph)
[![Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/CTS.cts-git-graph?label=Installs)](https://marketplace.visualstudio.com/items?itemName=CTS.cts-git-graph)
[![Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/CTS.cts-git-graph?label=Rating)](https://marketplace.visualstudio.com/items?itemName=CTS.cts-git-graph)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Git Graph** is a high-performance, developer-friendly VS Code extension for exploring Git histories in an interactive graph. It discovers repositories across your workspace, renders branches, tags, merge topologies, worktrees, submodules, and working tree changes, and exposes safe local Git operations directly from a responsive webview UI — with no telemetry and no repository data leaving your machine.

## What's new in 1.1.0

- **Direct 1-click Fetch** — toolbar fetch button executes `git fetch --prune` across all remotes immediately with non-intrusive progress and success toasts, removing unnecessary confirmation modals.
- **Fast-forward strategy memory** — `MergeDialog` persists and remembers your preferred merge mode (`--ff`, `--no-ff`, `--ff-only`) across sessions.
- **Git index cache synchronization & VS Code SCM refresh** — automatically reconciles the Git index cache (`update-index -q --refresh`) and triggers native `git.refresh` after Git operations, preventing false-positive dirty status.
- **Branching with uncommitted changes** — create and checkout new branches smoothly without being blocked by dirty working tree files.
- **Consistent status bar navigation** — clicking the status bar item always opens Git Graph while displaying live branch ahead/behind status (`↑ ahead ↓ behind`).

## Highlights from 1.0.0

- **Production-grade E2E coverage** — ten scenarios (E1–E10) exercised both in a deterministic harness and in a real VS Code host via `@vscode/test-electron`.
- **500K-commit performance hardening** — explicit render/page/layout/search/memory/scroll budgets, a 100K-commit paging memory profile, and a checked-in benchmark report with a v0.2.1 baseline.
- **Release engineering** — Marketplace auto-publish on `v*` tags, nightly build + smoke workflow, Dependabot, expanded documentation, and refreshed Marketplace branding.

See [CHANGELOG.md](https://github.com/thaoanhhaa1/git-graph/blob/master/CHANGELOG.md) for the full release history and [docs/benchmark-report.md](https://github.com/thaoanhhaa1/git-graph/blob/master/docs/benchmark-report.md) for measured results.

---

## Quick start

1. Install **Git Graph - CTS** from the Marketplace, or run the extension from this repository with `F5`.
2. Run **Git Graph: View Git Graph** from the Command Palette, the Source Control title bar, or the status bar.
3. Use the repository switcher, search box, and date/branch filters to focus the history.
4. Click a commit for details, changed files, and diffs; right-click refs for checkout, branch, merge, rebase, reset, tag, and remote actions.

```
* (HEAD -> main, origin/main) feat: finalize phase 6 marketplace release
| * (feature/safe-rebase) test: add rebase published branch guard tests
|/
* chore: prepare vsix packaging and performance benchmarks
* (tag: v0.2.0) feat: uncommitted changes staging and direct commit form
```

---

## Key features

### 1. Virtualized graph topology
- **Virtualized rendering** keeps scrolling smooth on repositories of any size by rendering only visible rows plus overscan.
- **Topological SVG lanes** with distinct palettes, branching/merge connections, and pass-through tracks.
- **Graph minimap** with viewport tracking and a visibility toggle.
- **Multi-repository switcher** for monorepos and multi-root workspaces.
- **Instant search** by subject, author, hash, or ref, plus path, branch, author, and date-range filters.
- **Compact mode** (18px rows) and persisted column widths for dense histories.

### 2. Working tree, staging & committing
- **Uncommitted changes row** pinned above HEAD with a live status counter.
- **Staged vs unstaged split** for modified (`M`), added (`A`), deleted (`D`), renamed (`R`), and untracked (`?`) files.
- **One-click stage/unstage/discard** for individual files or the whole worktree, with destructive-action confirmation.
- **Direct commit form** with summary, multiline description, and amend mode that pre-fills the previous commit.
- **Branching with uncommitted changes** — create and switch branches smoothly even when the working tree has uncommitted modifications.
- **Stash lifecycle** — save (including untracked), list, apply, pop, and drop.

### 3. Merge, rebase, reset & sequencer workflows
- **Merge dialog** with fast-forward modes (`--ff`, `--no-ff`, `--ff-only`), persistent strategy memory across dialog sessions, and squash support.
- **Interactive rebase** with drag-and-drop ordering and reword/edit/squash/fixup/drop actions.
- **Published-branch protection** warning before rebasing or force-pushing commits already on a remote.
- **Reset dialog** with soft, mixed, and hard modes plus prominent destructive confirmation.
- **Cherry-pick, revert, and sequencer controls** with mainline parent selection and continue/abort/skip.
- **Tag lifecycle** for annotated/lightweight tags and local/remote deletion.
- **Reflog-backed undo** for the last HEAD-changing operation.

### 4. Remote operations & sync
- **Toolbar Fetch & Remote dialogs** — instant 1-click Fetch with prune directly from the toolbar, plus Pull and Push dialogs with strategy (`merge`/`rebase`/`ff-only`), autostash, force-with-lease, tags, and upstream tracking.
- **Remote management** — add, remove, rename, and update URLs.
- **Ahead/behind status & navigation** — status bar item and sync indicators display live ahead/behind counters, with single-click navigation directly to the graph.

### 5. File history, blame & line history
- **Range diff** by `Ctrl`/`Cmd` + Click on two commits.
- **File history filter** from the Explorer context menu or editor title.
- **Inline blame annotations** with configurable format, hover details, and automatic refresh on Git metadata changes.
- **Line/range history panel** from the editor context menu.

### 6. Worktrees & submodules
- **Worktree manager** — list, add, remove, open, and inspect worktrees without leaving the graph.
- **Submodule awareness** — detect `.gitmodules`, list submodules, open a submodule graph, and inspect dirty/ahead/behind status.

### 7. Localization & accessibility
- **Extension host localization** via `vscode.l10n` with English, Vietnamese, Japanese, and Simplified Chinese bundles.
- **Webview localization** through a lightweight locale wrapper with the same four locales.
- **Accessibility** — dialog/menu roles, `aria` labels, focus management, and full keyboard navigation.

---

## Feature comparison

| Capability | Git Graph (CTS) | GitLens | Git Graph (mhutchie) |
| :--- | :---: | :---: | :---: |
| Interactive commit graph | Yes | Yes | Yes |
| Multi-repository switching | Yes | Yes | Yes |
| Inline blame annotations | Yes | Yes | No |
| Line/range history | Yes | Yes | Partial |
| Interactive rebase UI | Yes | Yes | Yes |
| Worktree manager | Yes | Yes | No |
| Submodule awareness | Yes | Yes | Partial |
| Graph minimap | Yes | No | No |
| Local-only, no telemetry | Yes | Partial (opt-out) | Yes |
| Webview localization | Yes | Yes | Yes |

> Comparison reflects publicly documented capabilities at the 1.0.0 release date; competing extensions evolve quickly. `Partial` = partial/indirect support; `No` = not a documented feature.

---

## Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| `ArrowDown` / `ArrowUp` | Move commit selection down / up |
| `Enter` | Toggle commit details / diff panel open or closed |
| `Space` | Open details / diff for the currently focused commit |
| `Escape` | Close details panel or dismiss active dialog |
| `Home` / `End` | Jump to the newest (top) / oldest (bottom) commit |
| `Ctrl + F` / `Cmd + F` | Focus search filter input |

---

## Configuration reference

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `gitGraph.showStatusBarItem` | `boolean` | `true` | Show a status bar item to open Git Graph. |
| `gitGraph.pageSize` | `number` | `500` | Number of commits requested per graph page. |
| `gitGraph.showAuthor` | `boolean` | `true` | Show or hide the Author column. |
| `gitGraph.showDate` | `boolean` | `true` | Show or hide the Date column. |
| `gitGraph.showRemoteBranches` | `boolean` | `true` | Display remote branch references. |
| `gitGraph.showTags` | `boolean` | `true` | Display tag references. |
| `gitGraph.showMinimap` | `boolean` | `true` | Show the vertical graph minimap. |
| `gitGraph.compactMode` | `boolean` | `false` | Use compact 18px rows. |
| `gitGraph.blame.enabled` | `boolean` | `false` | Show inline blame annotations. |
| `gitGraph.blame.format` | `string` | `${author}, ${relativeDate} • ${subject}` | Inline blame format. Placeholders: `${author}`, `${relativeDate}`, `${subject}`, `${shortSha}`, `${sha}`. |
| `gitGraph.dateType` | `string` | `"relative"` | `"relative"` or `"absolute"` timestamps. |
| `gitGraph.commitOrdering` | `string` | `"date-order"` | `"date-order"`, `"topo-order"`, or `"author-date-order"`. |

---

## Commands

- `Git Graph: View Git Graph` (`gitGraph.openGraph`)
- `Git Graph: View History in Git Graph` (`gitGraph.viewFileHistory`)
- `Git Graph: Open File at Revision` (`gitGraph.openFileAtRevision`)
- `Git Graph: Fetch from Remote` (`gitGraph.fetch`)
- `Git Graph: Pull` (`gitGraph.pull`)
- `Git Graph: Push` (`gitGraph.push`)
- `Git Graph: Manage Remotes` (`gitGraph.manageRemotes`)
- `Git Graph: Manage Worktrees` (`gitGraph.manageWorktrees`)
- `Git Graph: Toggle Git Blame Annotations` (`gitGraph.toggleBlame`)
- `Git Graph: View Line History` (`gitGraph.viewLineHistory`)

---

## Requirements

- **VS Code:** `1.85.0` or newer.
- **Git:** Git CLI available on your system `PATH`.
- **Platform:** macOS, Linux, and Windows supported.

---

## Architecture & performance guarantees

Git Graph is a modular TypeScript monorepo designed for scale:

- **Virtualized rendering** with row-band scroll quantization and overscan.
- **Strict memory budget:** 100K-commit paging peaks around **26MB** in the benchmark suite, well under the 120MB strict budget and the 150MB v1.0.0 target.
- **Bounded LRU caches:** commit details capped at **500** entries, diffs capped at **100**.
- **O(1) lookups:** hash/ref maps replace render-path array scans.
- **Incremental graph layout:** `GraphContinuation` avoids recomputing prior pages.
- **Index cache synchronization (`syncAndRefreshGit`):** automatically reconciles Git index stat cache (`update-index -q --refresh`) and syncs VS Code's internal Git provider.
- **Zero inline allocations:** granular Zustand selectors and memoized callbacks prevent cascade re-renders.
- **Measured budgets:** initial render <200ms, page load <100ms, graph layout <50ms, search <50ms, scroll frame <16ms. See [the benchmark report](https://github.com/thaoanhhaa1/git-graph/blob/master/docs/benchmark-report.md).

---

## Privacy & security

Git Graph executes the local `git` binary only to read repository metadata and execute requested operations. **No repository code, commits, author names, branch names, or diffs are transmitted to external servers or telemetry endpoints.** Everything remains local to your machine.

---

## Development & building

```sh
# Install dependencies
npm ci

# Build all packages & webview
npm run build

# Type checking, linting, formatting
npm run typecheck
npm run lint
npm run format

# Unit + integration + mock E2E suites
npm test

# Real VS Code host E2E suite (downloads VS Code on first run)
npm run test:e2e:host

# Performance benchmarks
npm run benchmark:quick
npm run benchmark:500k

# Package production VSIX
npm run package

# Package nightly pre-release VSIX
npm run package:nightly
```

Packaging builds all workspaces, removes source maps, copies webview assets, and creates a versioned VSIX under `dist/`. Pre-release nightly builds are automatically published on each master commit to the [Nightly GitHub Pre-Release](https://github.com/thaoanhhaa1/git-graph/releases/tag/nightly).

### Documentation

- [Testing Guide](https://github.com/thaoanhhaa1/git-graph/blob/master/docs/testing-extension.md)
- [Publishing Guide](https://github.com/thaoanhhaa1/git-graph/blob/master/docs/publishing-extension.md)
- [Benchmark Report](https://github.com/thaoanhhaa1/git-graph/blob/master/docs/benchmark-report.md)
- [Development Plan](https://github.com/thaoanhhaa1/git-graph/blob/master/DEVELOPMENT_PLAN.md)

---

## License

[MIT](LICENSE) © Git Graph Contributors.
