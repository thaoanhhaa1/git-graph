#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = join(repoRoot, 'apps', 'extension');
const suiteTsconfig = join(extensionPath, 'test', 'e2e', 'host', 'tsconfig.json');
const compiledSuite = join(extensionPath, '.vscode-test', 'e2e-out', 'suite.js');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function initializeRepository(root) {
  try {
    git(root, ['init', '-b', 'main']);
  } catch {
    git(root, ['init']);
    try {
      git(root, ['checkout', '-b', 'main']);
    } catch {
      // Keep the platform default branch name.
    }
  }
  git(root, ['config', 'user.name', 'Git Graph Host E2E']);
  git(root, ['config', 'user.email', 'host-e2e@gitgraph.test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
}

function commitFile(root, filePath, content, message) {
  writeFileSync(join(root, filePath), content);
  git(root, ['add', filePath]);
  git(root, ['commit', '-m', message]);
}

function createFixtures() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'git-graph-host-e2e-'));
  const primary = join(fixtureRoot, 'primary');
  const secondary = join(fixtureRoot, 'secondary');

  mkdirSync(primary, { recursive: true });
  initializeRepository(primary);
  commitFile(primary, 'README.md', '# Git Graph Host E2E\n', 'feat: graph fixture commit');
  commitFile(primary, 'search.txt', 'search fixture\n', 'fix: searchable subject commit');

  mkdirSync(secondary, { recursive: true });
  initializeRepository(secondary);
  commitFile(
    secondary,
    'README.md',
    '# Git Graph Host E2E (secondary)\n',
    'feat: secondary repository commit',
  );

  const workspaceFile = join(fixtureRoot, 'git-graph-e2e.code-workspace');
  writeFileSync(
    workspaceFile,
    `${JSON.stringify(
      {
        folders: [{ path: primary }, { path: secondary }],
        settings: {
          'git.autofetch': false,
          'git.enabled': true,
          'workbench.startupEditor': 'none',
        },
      },
      null,
      2,
    )}\n`,
  );

  return { fixtureRoot, workspaceFile };
}

async function main() {
  execFileSync(
    process.execPath,
    [join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', suiteTsconfig],
    {
      stdio: 'inherit',
    },
  );

  const { fixtureRoot, workspaceFile } = createFixtures();
  const runRoot = mkdtempSync(join(tmpdir(), 'gg-e2e-'));
  const userDataDir = join(runRoot, 'ud');
  const extensionsDir = join(runRoot, 'ext');
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(extensionsDir, { recursive: true });

  try {
    await runTests({
      extensionDevelopmentPath: extensionPath,
      extensionTestsPath: compiledSuite,
      launchArgs: [
        workspaceFile,
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        '--disable-gpu',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--no-sandbox',
      ],
      extensionTestsEnv: {
        GIT_GRAPH_E2E: '1',
      },
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(runRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
