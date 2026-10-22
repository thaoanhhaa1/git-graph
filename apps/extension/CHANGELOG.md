# Changelog

All notable changes to Git Graph are documented in this file.

## 1.0.0 - 2026-10-22

### Added

- **Production-grade E2E coverage:**
  - Ten end-to-end scenarios (E1–E10) covering graph rendering, search/filter, commit workflow, branch operations, merge, stash, push/pull, blame, multi-repo switching, and large-history paging.
  - Real VS Code host suite powered by `@vscode/test-electron` (`npm run test:e2e:host`) with deterministic Git fixtures and a test-only message bridge gated behind `GIT_GRAPH_E2E=1`.

- **500K-commit performance hardening:**
  - Benchmark targets for initial render (<200ms), page load (<100ms), graph layout (<50ms), search (<50ms), memory (<150MB), and scroll frame time (<16ms).
  - Automated Markdown + JSON benchmark report with a checked-in v0.2.1 baseline for release-over-release comparison (`npm run benchmark`, `npm run benchmark:500k`).
  - 100K-commit paging memory profile verified under the strict 120MB budget.

- **Release engineering & documentation:**
  - Marketplace auto-publish on `v*` tags, nightly build/smoke workflow, and Dependabot configuration.
  - Upgraded README with Marketplace badges, feature comparison, quick start, and 1.0.0 highlights.
  - New testing and publishing guides under `docs/`.

## 0.5.0 - 2026-10-21

### Added

- **Git worktrees:** list, add, remove, and open worktrees from the graph, with a dedicated `WorktreeManagerDialog` and worktree status surface.
- **Submodule awareness:** detect `.gitmodules`, list submodules, show `[submodule]` context, open a submodule graph, and inspect dirty/ahead/behind status.
- **Internationalization:** VS Code `l10n` bundles for English, Vietnamese, Japanese, and Simplified Chinese on the extension host, plus a lightweight locale wrapper for webview UI strings.
- SVG remains the default renderer; the conditional Canvas renderer from the roadmap was evaluated but not shipped because the 500K benchmark stayed within budget.

## 0.4.1 - 2026-10-21

### Added

- **Graph minimap:** canvas overview with viewport tracking and visibility toggle (`gitGraph.showMinimap`).
- **Branch drag & drop:** drag refs to branch actions, touch-friendly branch dragging, and compare/branch action dialogs.
- **Settings UI:** in-webview settings dialog with display, Git, graph, and performance categories backed by the VS Code configuration bridge.
- **Accessibility polish:** dialog/menu roles, `aria` labels, focus management, and full keyboard navigation audit across graph, menus, and dialogs.

## 0.4.0 - 2026-10-21

### Added

- **Interactive rebase:** plan parser, drag-and-drop reorder UI, and reword/edit/squash/fixup/drop actions.
- Published-branch protection with explicit confirmation, plus continue/abort/skip controls for conflicted rebases.

## 0.3.1 - 2026-10-21

### Added

- **Git blame engine:** parser and repository queries for line-level blame and line history.
- **Inline blame annotations:** configurable decorations with hover details, automatic refresh on Git metadata changes, and `gitGraph.toggleBlame`.
- **Line history view:** per-line/per-range history panel from the editor context menu (`gitGraph.viewLineHistory`).

## 0.3.0 - 2026-10-21

### Added

- **Remote operations:** Fetch, Pull, and Push dialogs with prune, strategy (`merge`/`rebase`/`ff-only`), autostash, force-with-lease, tags, and upstream tracking options.
- **Remote management:** add, remove, rename, and update remote URLs from `RemoteManagerDialog`.
- **Undo last operation:** reflog-backed undo for HEAD-changing operations with safety checks.
- **Sync status:** ahead/behind indicators surfaced through the status bar and repository sync status messages.

## 0.2.1 - 2026-10-21

### Fixed

- Fixed broken banner and CI/Release badge images on Visual Studio Marketplace by referencing canonical HTTPS raw assets and updating repository URLs.
- Added `master` branch to GitHub Actions CI workflow triggers (`.github/workflows/ci.yml`).
- Enhanced responsive breakpoints for Toolbar and Commit Table layout on compact viewports.
- Updated extension packaging script to target versioned output directory dynamically.

## 0.2.0 - 2026-10-19

### Added

- **Virtualized Graph Topology View:**
  - High-performance virtualized commit table rendering only visible rows plus overscan.
  - Smooth SVG graph lanes, branch merges, forks, and pass-through segments with distinct color palettes.
  - Granular multi-repository discovery and instant switcher with search filter.
  - Commit search by message, author, file, or SHA with instant highlighting.

- **Working Tree Staging & Committing:**
  - Integrated uncommitted changes row (`*`) pinned to graph HEAD.
  - Dedicated `UncommittedChangesPanel` displaying Staged vs Unstaged changes with status indicators.
  - Single and bulk file Stage (`+`), Unstage (`-`), and Discard actions with safety confirmation modals.
  - Direct commit creation with Summary, multiline Description, and Amend mode (pre-filling previous HEAD commit details).
  - Stash management lifecycle: `StashSaveDialog` (include untracked), apply, pop, and drop from `StashManagerDialog`.

- **Safe Git Operations & Sequencer Workflows:**
  - `CreateTagDialog` (lightweight and annotated with message) & `DeleteTagDialog` (local and remote tags).
  - `MergeDialog` with Fast-Forward mode selection (`--ff`, `--no-ff`, `--ff-only`, `--squash`).
  - `RebaseDialog` with published branch guard and interactive risk confirmation warning.
  - `ResetDialog` with Soft, Mixed, and Hard modes (prominent destructive warning on hard reset).
  - `CherryPickDialog` and `RevertDialog` with mainline parent selector for merge commits and `--no-commit` option.

- **Range Diff, File History & Date Filters:**
  - Multi-commit range diff selection (`Ctrl`/`Cmd` + Click) with side-by-side comparison.
  - Preset Date Range filters (Last 24 Hours, 7 Days, 30 Days) and `CustomDateRangeDialog`.
  - File History Path filter integration (`gitGraph.viewFileHistory`) from Explorer context menu and editor title.
  - Configurable commit ordering: `--date-order`, `--topo-order`, and `--author-date-order`.

- **Status Bar, Keyboard Navigation & Column Customization:**
  - VS Code Status Bar item displaying active branch, ahead/behind counters, and quick navigation.
  - Complete keyboard navigation: ArrowUp/Down, Enter/Space (toggle details), Escape (close), Home/End, and Ctrl+F (focus search).
  - Draggable table column dividers with minimum width constraints and persisted column widths.
  - Compact View mode (toggle between 28px standard and 18px compact row height).

- **Stress Testing, Performance & Bundling Optimization:**
  - Stress tested over 100 commit pages (50,000–100,000 commits) maintaining heap memory footprint well under 120MB.
  - Strictly bounded LRU caches: `DETAILS_CACHE_LIMIT = 500`, `DIFF_CACHE_LIMIT = 100`.
  - Garbage collection and memory stability verified across repeated repository switching cycles.
  - Production bundle optimization: stripped redundant source maps and minimized SVG icon assets.
  - Automated GitHub Actions release pipeline (`release.yml`) for automated VSIX artifact packaging and publishing.

## 0.1.0 - 2026-09-21

### Added

- Initial VS Code extension release with a Git graph webview.
- Repository discovery, branch/tag/commit visualization, commit search, details, changed files, and diff opening.
- Local Git operations for checkout, branch creation, and tag creation with preflight validation.
- Watcher-driven refresh, repository caching, and webview message validation.
- Release packaging workflow, VSIX staging script, CI quality gates, and privacy/security documentation.
