import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CommitDetailsSchema } from '@git-graph/shared';
import { GitCliClient, GitRepository, CommitDetailsQuery } from '../src/index';

describe('CommitDetailsQuery & GitRepository - Integration with real Git', () => {
  let client: GitCliClient;
  let tempRepoDir: string;
  let repo: GitRepository;
  let detailsQuery: CommitDetailsQuery;

  let rootSha: string;
  let normalSha: string;
  let renameSha: string;
  let featSha: string;
  let mergeSha: string;

  beforeAll(async () => {
    const info = await GitCliClient.detect();
    client = new GitCliClient(info.path);
    detailsQuery = new CommitDetailsQuery({ client });

    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-graph-details-int-'));

    // 1. Init repository with branch main
    await client.exec(['init', '-b', 'main', tempRepoDir]);
    await client.exec(['config', 'user.name', 'Integration Tester'], { cwd: tempRepoDir });
    await client.exec(['config', 'user.email', 'int-tester@example.com'], { cwd: tempRepoDir });
    await client.exec(['config', 'commit.gpgsign', 'false'], { cwd: tempRepoDir });

    // 2. Root commit: create initial files
    const rootFile = path.join(tempRepoDir, 'root.txt');
    fs.writeFileSync(rootFile, 'Initial line 1\nInitial line 2\n');
    await client.exec(['add', 'root.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: root commit\n\nFull root commit body.'], {
      cwd: tempRepoDir,
    });
    rootSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    // 3. Normal commit: modify root.txt, add src/file.ts, add binary file logo.png
    fs.appendFileSync(rootFile, 'Appended line 3\n');
    fs.mkdirSync(path.join(tempRepoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRepoDir, 'src', 'file.ts'), 'export const x = 42;\n');
    const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x01]);
    fs.writeFileSync(path.join(tempRepoDir, 'logo.png'), binaryData);

    await client.exec(['add', '.'], { cwd: tempRepoDir });
    await client.exec(
      ['commit', '-m', 'feat: add files and binary\n\nCommit with text and binary.'],
      { cwd: tempRepoDir },
    );
    normalSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    // 4. Rename commit: rename src/file.ts -> src/renamed.ts
    await client.exec(['mv', 'src/file.ts', 'src/renamed.ts'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'refactor: rename file.ts to renamed.ts'], {
      cwd: tempRepoDir,
    });
    renameSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    // 5. Branch and merge: create branch feat-merge, commit on it, commit on main, merge
    await client.exec(['checkout', '-b', 'feat-merge'], { cwd: tempRepoDir });
    fs.writeFileSync(path.join(tempRepoDir, 'feat.txt'), 'Feature line\n');
    await client.exec(['add', 'feat.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'feat: branch work'], { cwd: tempRepoDir });
    featSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    await client.exec(['checkout', 'main'], { cwd: tempRepoDir });
    fs.writeFileSync(path.join(tempRepoDir, 'main.txt'), 'Main branch update\n');
    await client.exec(['add', 'main.txt'], { cwd: tempRepoDir });
    await client.exec(['commit', '-m', 'chore: update on main'], { cwd: tempRepoDir });

    await client.exec(
      ['merge', '--no-ff', 'feat-merge', '-m', 'Merge branch feat-merge into main'],
      {
        cwd: tempRepoDir,
      },
    );
    mergeSha = (await client.exec(['rev-parse', 'HEAD'], { cwd: tempRepoDir })).stdout.trim();

    const openRepo = await GitRepository.open(tempRepoDir, {
      client,
      commitDetailsQuery: detailsQuery,
    });
    expect(openRepo).not.toBeNull();
    repo = openRepo!;
  });

  afterAll(() => {
    if (tempRepoDir && fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  });

  it('queries root commit details correctly with empty tree diff', async () => {
    const details = await detailsQuery.queryDetails(tempRepoDir, rootSha);

    expect(details).not.toBeNull();
    expect(details!.commit.sha).toBe(rootSha);
    expect(details!.commit.parents).toHaveLength(0);
    expect(details!.commit.subject).toBe('feat: root commit');
    expect(details!.commit.body).toContain('Full root commit body.');

    expect(details!.fileChanges).toHaveLength(1);
    expect(details!.fileChanges[0]!.path).toBe('root.txt');
    expect(details!.fileChanges[0]!.status).toBe('added');
    expect(details!.fileChanges[0]!.additions).toBe(2);
    expect(details!.stats.additions).toBe(2);
    expect(details!.stats.filesChanged).toBe(1);

    expect(CommitDetailsSchema.safeParse(details).success).toBe(true);
  });

  it('queries normal commit with modified, added, and binary file', async () => {
    const details = await detailsQuery.queryDetails(tempRepoDir, normalSha);

    expect(details).not.toBeNull();
    expect(details!.commit.sha).toBe(normalSha);
    expect(details!.commit.parents).toHaveLength(1);
    expect(details!.fileChanges).toHaveLength(3);

    const rootChange = details!.fileChanges.find((c) => c.path === 'root.txt');
    expect(rootChange).toBeDefined();
    expect(rootChange!.status).toBe('modified');
    expect(rootChange!.additions).toBe(1);
    expect(rootChange!.deletions).toBe(0);

    const tsChange = details!.fileChanges.find((c) => c.path === 'src/file.ts');
    expect(tsChange).toBeDefined();
    expect(tsChange!.status).toBe('added');
    expect(tsChange!.additions).toBe(1);

    const binaryChange = details!.fileChanges.find((c) => c.path === 'logo.png');
    expect(binaryChange).toBeDefined();
    expect(binaryChange!.status).toBe('added');
    expect(binaryChange!.isBinary).toBe(true);
    expect(binaryChange!.additions).toBeUndefined();

    expect(details!.stats.filesChanged).toBe(3);
    expect(details!.stats.additions).toBe(2);

    expect(CommitDetailsSchema.safeParse(details).success).toBe(true);
  });

  it('detects file rename correctly with oldPath and similarity', async () => {
    const details = await detailsQuery.queryDetails(tempRepoDir, renameSha);

    expect(details).not.toBeNull();
    expect(details!.fileChanges).toHaveLength(1);

    const renameChange = details!.fileChanges[0]!;
    expect(renameChange.path).toBe('src/renamed.ts');
    expect(renameChange.oldPath).toBe('src/file.ts');
    expect(renameChange.status).toBe('renamed');
    expect(renameChange.similarity).toBeDefined();
    expect(renameChange.similarity).toBeGreaterThanOrEqual(90);

    expect(CommitDetailsSchema.safeParse(details).success).toBe(true);
  });

  it('queries merge commit comparing against default parent 1 and explicit parent 2', async () => {
    // 1. Default comparison (against parent 1 - main branch)
    const defaultDetails = await detailsQuery.queryDetails(tempRepoDir, mergeSha);
    expect(defaultDetails).not.toBeNull();
    expect(defaultDetails!.commit.parents).toHaveLength(2);

    // Changes against parent 1 (main) should include feat.txt from feat-merge branch
    const featChange = defaultDetails!.fileChanges.find((c) => c.path === 'feat.txt');
    expect(featChange).toBeDefined();
    expect(featChange!.status).toBe('added');

    // 2. Comparison against parent 2 (feat-merge branch)
    const p2Details = await detailsQuery.queryDetails(tempRepoDir, mergeSha, {
      parentSha: featSha,
    });
    expect(p2Details).not.toBeNull();
    // Changes against feat branch should include main.txt from main branch
    const mainChange = p2Details!.fileChanges.find((c) => c.path === 'main.txt');
    expect(mainChange).toBeDefined();
    expect(mainChange!.status).toBe('added');
  });

  it('verifies GitRepository getCommitDetails and getCommitDetailsWithStats integration', async () => {
    const commit = await repo.getCommitDetails(normalSha);
    expect(commit).not.toBeNull();
    expect(commit!.fileChanges).toBeDefined();
    expect(commit!.fileChanges!).toHaveLength(3);
    expect(commit!.stats).toBeDefined();
    expect(commit!.stats!.filesChanged).toBe(3);

    const fullDetails = await repo.getCommitDetailsWithStats(normalSha);
    expect(fullDetails).not.toBeNull();
    expect(fullDetails!.commit.sha).toBe(normalSha);
    expect(fullDetails!.fileChanges).toHaveLength(3);
    expect(fullDetails!.stats.filesChanged).toBe(3);
  });
});
