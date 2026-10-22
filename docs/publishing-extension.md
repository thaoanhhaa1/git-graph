# Publishing Guide

Git Graph publishes from GitHub Actions when a `v*` tag is pushed. The workflow (`.github/workflows/release.yml`) runs quality gates, builds a production bundle, packages the VSIX, creates a GitHub Release, and publishes to the Visual Studio Marketplace.

## Release checklist

1. Update versions in every workspace and the lockfile:

   ```sh
   npm version 1.1.0 --workspaces --include-workspace-root --no-git-tag-version
   ```

2. Update `CHANGELOG.md` and `apps/extension/CHANGELOG.md` with the release notes.
3. Refresh the benchmark report if performance-sensitive code changed:

   ```sh
   npm run benchmark:500k
   ```

4. Run the full local definition of done:

   ```sh
   npm run build
   npm run typecheck
   npm run lint
   npm run format
   npm test
   ```

5. Optionally run the real host E2E suite:

   ```sh
   npm run test:e2e:host
   ```

6. Commit the release changes, then create and push a tag:

   ```sh
   git tag v1.1.0
   git push origin v1.1.0
   ```

## Local packaging

```sh
# Stable production packaging
npm run package

# Pre-release nightly packaging
npm run package:nightly
```

This builds all workspaces, strips source maps, copies the webview assets, stages the extension package, and runs `vsce package`. The VSIX is written under `dist/`.

Useful environment variables:

- `NODE_ENV=production` — disables source maps in the bundled extension.
- `npm run prepare:vsix` — only stages assets for packaging.

## Marketplace publishing

The publisher is `CTS` and the extension ID is `CTS.cts-git-graph`.

1. Create a Personal Access Token in Azure DevOps with **Marketplace → Manage** scope.
2. Add it to the repository as the `VSCE_PAT` secret.
3. Publish locally (optional):

   ```sh
   npx @vscode/vsce login CTS
   npx @vscode/vsce publish --no-dependencies --packagePath dist/*.vsix
   ```

The release workflow publishes automatically when `VSCE_PAT` is present. If the secret is missing, the job still attaches the VSIX to the GitHub Release and skips Marketplace publishing.

## CI/CD workflows

| Workflow | Trigger | Purpose |
| :--- | :--- | :--- |
| `ci.yml` | Push/PR to `master` or `main` | Build, typecheck, lint, format, tests, VSIX artifact on Ubuntu/macOS/Windows. |
| `nightly.yml` | Daily schedule (03:00 UTC) + manual dispatch | Production build, tests, real-host E2E smoke, 500K benchmark, rolling GitHub Pre-Release (`nightly` tag) with downloadable VSIX, and optional Marketplace pre-release publishing. |
| `release.yml` | `v*` tag push | Quality gates, production package, GitHub Release, Marketplace publish. |

## Marketplace listing checklist

- Short description matches the extension manifest.
- Categories: `SCM Providers`, `Other`.
- Keywords: `git`, `graph`, `history`, `branches`, `commits`, `tags`, `diff`.
- At least five high-quality screenshots covering graph, staging, dialogs, blame, and worktrees.
- README badges resolve to HTTPS URLs.
- Icon at `resources/icon.png` (128px+).
- Publisher verified in the Marketplace portal.

## Nightly builds & pre-releases

The nightly workflow (`nightly.yml`) runs every morning at 03:00 UTC or on-demand via `workflow_dispatch`:

1. Executes the full quality pipeline: typecheck, lint, format, unit/integration tests.
2. Runs the real VS Code host E2E suite under `xvfb`:

   ```sh
   xvfb-run -a npm run test:e2e:host
   ```

3. Runs the 500K-commit performance benchmark suite.
4. Packages the pre-release VSIX (`npm run package:nightly`).
5. Updates the rolling `nightly` tag to `HEAD` and publishes/updates the [Nightly GitHub Pre-Release](https://github.com/thaoanhhaa1/git-graph/releases/tag/nightly) with `cts-git-graph-nightly.vsix`.
6. If `VSCE_PAT` is set, publishes the pre-release to Visual Studio Marketplace automatically.

If the host suite fails, download the workflow artifacts and inspect the Extension Development Host logs. Clear `.vscode-test/` before rerunning locally.
