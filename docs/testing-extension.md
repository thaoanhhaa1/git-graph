# Testing Guide

This repository uses three layers of tests:

| Layer | Command | What it covers |
| :--- | :--- | :--- |
| Unit + integration + mock E2E | `npm test` | Packages, stores, components, extension controllers, and the ten E2E scenarios against the in-process VS Code mock. |
| Real VS Code host E2E | `npm run test:e2e:host` | The same ten scenarios inside a downloaded VS Code Extension Development Host. |
| Performance benchmarks | `npm run benchmark:quick` / `npm run benchmark:500k` | Layout, serialization, paging, search, memory, and scroll budgets. |

## Prerequisites

- Node.js 20+ and npm 10+
- Git available on `PATH`
- macOS, Linux, or Windows

Install dependencies and build once:

```sh
npm ci
npm run build
```

## Unit, integration, and mock E2E

```sh
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
```

The mock E2E suite lives in `apps/extension/test/e2e/extension-e2e.test.ts` and covers:

- E1 open/render, commit pages, details
- E2 search by subject/author/hash + path filters
- E3 stage → commit → graph refresh
- E4 branch create → checkout → delete
- E5 merge with a merge commit
- E6 stash save → list → pop
- E7 push/pull against a local bare remote
- E8 inline blame toggle
- E9 multi-repository switching
- E10 paging through a large synthetic history

The suite uses deterministic temporary Git repositories and the VS Code mock in `apps/extension/test/__mocks__/vscode.ts`, so it runs quickly and does not need a display server.

## Real VS Code host E2E

```sh
npm run test:e2e:host
```

What happens:

1. The suite is compiled from `apps/extension/test/e2e/host/suite.ts` into `apps/extension/.vscode-test/e2e-out`.
2. Temporary fixtures (`primary` and `secondary` Git repositories) and a `.code-workspace` file are created.
3. `@vscode/test-electron` downloads VS Code on first run (cached under `.vscode-test/`) and launches an Extension Development Host.
4. The harness sets `GIT_GRAPH_E2E=1`. In that mode the extension registers a small test-only bridge:
   - `gitGraph.__e2e.handleWebviewMessage`
   - `gitGraph.__e2e.getPostedMessages`
   - `gitGraph.__e2e.clearPostedMessages`
   - `gitGraph.__e2e.getPanelState`
5. The suite drives the real extension through webview protocol messages, mutates real Git repositories, and asserts on posted messages, Git state, and configuration.

The bridge is completely inert unless `GIT_GRAPH_E2E=1` is set. It is never enabled for Marketplace builds.

### Troubleshooting the host suite

- **First run is slow:** VS Code (~300MB) is downloaded once into `.vscode-test/`.
- **Unix socket path too long (macOS):** the runner uses short temporary `--user-data-dir` and `--extensions-dir` paths to stay under the 103-character limit.
- **Stale Extension Development Host:** delete `.vscode-test/` and rerun.
- **Headless Linux CI:** run under `xvfb-run -a npm run test:e2e:host` or use the nightly workflow, which installs `xvfb`.

## Benchmarks

```sh
npm run benchmark:quick   # fast smoke run
npm run benchmark:500k    # full 1K/10K/100K/500K suites + 100K paging memory
npm run benchmark         # default full run (repeat = 3)
```

Outputs:

- `docs/benchmark-report.json` (ignored by Git)
- `docs/benchmark-report.md` (checked in)
- `docs/benchmark-baseline-v0.2.1.json` (checked in baseline for comparison)

Targets enforced by the report:

| Metric | Target |
| :--- | ---: |
| Initial render (500 commits) | < 200ms |
| Page load (next 500 commits) | < 100ms |
| Graph layout (500 commits) | < 50ms |
| Search (100K loaded commits) | < 50ms |
| Memory (100K commits paged) | < 150MB |
| Scroll frame time | < 16ms |

To refresh the baseline after an intentional performance change:

```sh
npm run benchmark:baseline
```
