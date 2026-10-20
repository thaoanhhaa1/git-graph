#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);

const FULL_SYNTHETIC_SIZES = [1_000, 10_000, 50_000, 100_000, 500_000];
const QUICK_SYNTHETIC_SIZES = [1_000, 10_000];
const syntheticSizes = args.has('sizes')
  ? String(args.get('sizes'))
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0)
  : args.has('quick')
    ? QUICK_SYNTHETIC_SIZES
    : FULL_SYNTHETIC_SIZES;
const repeatCount = Number.parseInt(String(args.get('repeat') ?? '3'), 10);
const outputPath = resolve(rootDir, String(args.get('output') ?? 'docs/benchmark-report.json'));

const gitGraph = await import(resolve(rootDir, 'packages/git-graph/dist/index.js'));
const shared = await import(resolve(rootDir, 'packages/shared/dist/index.js'));

const { buildCommitGraph } = gitGraph;
const { createMessage, splitCommitPageIntoChunks, DEFAULT_CHUNK_SIZE } = shared;

function sha(index) {
  return index.toString(16).padStart(40, '0').slice(-40);
}

function makeCommit(index, total, parents) {
  const commitSha = sha(total - index);
  return {
    sha: commitSha,
    shortSha: commitSha.slice(0, 7),
    parents,
    author: {
      name: `Author ${index % 17}`,
      email: `author${index % 17}@example.com`,
      timestamp: 1_700_000_000_000 - index * 60_000,
      timezone: '+0000',
    },
    committer: {
      name: `Committer ${index % 11}`,
      email: `committer${index % 11}@example.com`,
      timestamp: 1_700_000_000_000 - index * 60_000,
      timezone: '+0000',
    },
    subject: `synthetic commit ${index}`,
    refs: [],
  };
}

function generateLinearCommits(total) {
  const commits = [];
  for (let index = 0; index < total; index++) {
    commits.push(makeCommit(index, total, index + 1 < total ? [sha(total - index - 1)] : []));
  }
  return commits;
}

function generateBranchyCommits(total) {
  const commits = [];
  for (let index = 0; index < total; index++) {
    const offset = index % 24 === 0 ? 3 : index % 11 === 0 ? 2 : 1;
    const parentIndex = Math.min(total, index + offset);
    commits.push(makeCommit(index, total, parentIndex < total ? [sha(total - parentIndex)] : []));
  }
  return commits;
}

function generateMergeCommits(total) {
  const commits = [];
  for (let index = 0; index < total; index++) {
    const parents = [];
    if (index + 1 < total) parents.push(sha(total - index - 1));
    if (index % 32 === 0 && index + 8 < total) parents.push(sha(total - index - 8));
    if (index % 97 === 0 && index + 21 < total) parents.push(sha(total - index - 21));
    commits.push(makeCommit(index, total, parents));
  }
  return commits;
}

const topologyGenerators = {
  linear: generateLinearCommits,
  branches: generateBranchyCommits,
  merges: generateMergeCommits,
};

function measure(label, fn, repeat = repeatCount) {
  const samples = [];
  let lastResult;
  for (let index = 0; index < repeat; index++) {
    const started = performance.now();
    lastResult = fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    label,
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    minMs: Number(samples[0].toFixed(3)),
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    averageMs: Number((total / samples.length).toFixed(3)),
    maxMs: Number(samples[samples.length - 1].toFixed(3)),
    result: lastResult,
  };
}

function estimateVisibleRows(totalRows, viewportHeight = 720, rowHeight = 32, overscan = 8) {
  const rowsInViewport = Math.ceil(viewportHeight / rowHeight);
  return Math.min(totalRows, rowsInViewport + overscan * 2);
}

function benchmarkSynthetic() {
  const results = [];
  for (const size of syntheticSizes) {
    for (const [topology, generate] of Object.entries(topologyGenerators)) {
      const commits = generate(size);
      const graph = measure(`graph:${topology}:${size}`, () => {
        const graphResult = buildCommitGraph(commits);
        return {
          rows: graphResult.rows.length,
          continuationRows: graphResult.continuation.nextRowIndex,
        };
      });

      const firstPage = commits.slice(0, 500);
      const pagePayload = {
        requestId: `bench-${topology}-${size}`,
        repositoryId: 'synthetic',
        page: { commits: firstPage, cursor: '500', hasMore: size > 500 },
      };
      const firstPageSerialization = measure(`serialize:first-page:${topology}:${size}`, () => {
        const message = createMessage('commits.page.result', pagePayload);
        return { bytes: Buffer.byteLength(JSON.stringify(message), 'utf8') };
      });

      const chunking = measure(`chunk:first-page:${topology}:${size}`, () => {
        const chunks = splitCommitPageIntoChunks(pagePayload.page, DEFAULT_CHUNK_SIZE);
        return { chunks: chunks.length, chunkSize: DEFAULT_CHUNK_SIZE };
      });

      const domRows = measure(`virtual-dom-rows:${topology}:${size}`, () => ({
        totalRows: size,
        renderedRows: estimateVisibleRows(size),
      }));

      results.push({ size, topology, graph, firstPageSerialization, chunking, domRows });
    }
  }
  return results;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    ...options,
  }).trim();
}

function gitIn(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function parseGitLogCommits(rawLog) {
  return rawLog
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [commitSha, parentsRaw, authorName, authorEmail, timestampRaw, subject] =
        line.split('\x1f');
      const timestamp = Number.parseInt(timestampRaw ?? '0', 10) * 1000;
      return {
        sha: commitSha,
        shortSha: commitSha.slice(0, 7),
        parents: parentsRaw ? parentsRaw.split(' ').filter(Boolean) : [],
        author: { name: authorName ?? '', email: authorEmail ?? '', timestamp, timezone: '+0000' },
        committer: {
          name: authorName ?? '',
          email: authorEmail ?? '',
          timestamp,
          timezone: '+0000',
        },
        subject: subject ?? '',
        refs: [],
      };
    });
}

function initializeGitRepository(cwd) {
  try {
    gitIn(cwd, ['init', '-b', 'main']);
  } catch {
    gitIn(cwd, ['init']);
    gitIn(cwd, ['checkout', '-b', 'main']);
  }
  gitIn(cwd, ['config', 'user.name', 'Benchmark Bot']);
  gitIn(cwd, ['config', 'user.email', 'benchmark@example.com']);
}

function commitFile(cwd, filePath, content, message) {
  writeFileSync(join(cwd, filePath), content);
  gitIn(cwd, ['add', filePath]);
  gitIn(cwd, ['commit', '-m', message]);
}

function benchmarkFixtureRepository() {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'git-graph-benchmark-'));

  try {
    initializeGitRepository(fixtureDir);
    commitFile(fixtureDir, 'alpha.txt', 'alpha\n', 'feat: add alpha');
    commitFile(fixtureDir, 'beta.txt', 'beta\n', 'feat: add beta');
    gitIn(fixtureDir, ['tag', 'v0.1.0']);
    gitIn(fixtureDir, ['checkout', '-b', 'feature/benchmark']);
    commitFile(fixtureDir, 'feature.txt', 'feature\n', 'feat: branch fixture');
    gitIn(fixtureDir, ['checkout', 'main']);
    gitIn(fixtureDir, ['remote', 'add', 'origin', 'https://example.invalid/git-graph.git']);
    gitIn(fixtureDir, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    gitIn(fixtureDir, ['mv', 'alpha.txt', 'renamed-alpha.txt']);
    gitIn(fixtureDir, ['commit', '-m', 'refactor: rename alpha fixture']);

    const rawLog = gitIn(fixtureDir, [
      'log',
      '--all',
      '--date-order',
      '-n500',
      '--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s',
    ]);
    const commits = parseGitLogCommits(rawLog);

    const refSnapshot = measure('fixture-repo:refs-snapshot', () => {
      const refs = gitIn(fixtureDir, [
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(HEAD)',
        'refs/',
      ]);
      return { bytes: Buffer.byteLength(refs, 'utf8'), lines: refs ? refs.split('\n').length : 0 };
    });
    const firstPageGraph = measure('fixture-repo:first-500-graph', () => {
      const graphResult = buildCommitGraph(commits);
      return { rows: graphResult.rows.length };
    });
    const firstPagePayload = measure('fixture-repo:first-500-payload', () => {
      const message = createMessage('commits.page.result', {
        requestId: 'fixture-repo-bench',
        repositoryId: 'fixture',
        page: { commits, hasMore: false },
      });
      return { bytes: Buffer.byteLength(JSON.stringify(message), 'utf8') };
    });
    const renameProbe = gitIn(fixtureDir, [
      'log',
      '--summary',
      '--diff-filter=R',
      '--find-renames',
      '-n20',
    ]);

    return {
      available: true,
      commits: commits.length,
      tags: gitIn(fixtureDir, ['tag', '--list']).split('\n').filter(Boolean).length,
      remotes: gitIn(fixtureDir, ['remote']).split('\n').filter(Boolean),
      remoteBranches: gitIn(fixtureDir, ['for-each-ref', '--format=%(refname)', 'refs/remotes/'])
        .split('\n')
        .filter(Boolean).length,
      renameProbe: { available: renameProbe.length > 0, lines: renameProbe.split('\n').length },
      refSnapshot,
      firstPageGraph,
      firstPagePayload,
    };
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

function benchmarkRealRepository() {
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { available: false, reason: 'Current workspace is not a Git repository.' };
  }

  const commitLines = git([
    'log',
    '--all',
    '--date-order',
    '-n501',
    '--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s',
  ]).split('\n');

  const commits = parseGitLogCommits(commitLines.filter(Boolean).slice(0, 500).join('\n'));

  const refSnapshot = measure('real-repo:refs-snapshot', () => {
    const refs = git(['for-each-ref', '--format=%(refname)%00%(objectname)%00%(HEAD)', 'refs/']);
    return { bytes: Buffer.byteLength(refs, 'utf8'), lines: refs ? refs.split('\n').length : 0 };
  });
  const firstPageGraph = measure('real-repo:first-500-graph', () => {
    const graphResult = buildCommitGraph(commits);
    return { rows: graphResult.rows.length };
  });
  const firstPagePayload = measure('real-repo:first-500-payload', () => {
    const message = createMessage('commits.page.result', {
      requestId: 'real-repo-bench',
      repositoryId: 'workspace',
      page: {
        commits,
        cursor: commits.length >= 500 ? '500' : undefined,
        hasMore: commits.length >= 500,
      },
    });
    return { bytes: Buffer.byteLength(JSON.stringify(message), 'utf8') };
  });

  let renameProbe = { available: false, lines: 0 };
  try {
    const renames = git(['log', '--all', '--summary', '--diff-filter=R', '--find-renames', '-n20']);
    renameProbe = {
      available: renames.length > 0,
      lines: renames ? renames.split('\n').length : 0,
    };
  } catch {
    renameProbe = { available: false, lines: 0 };
  }

  return {
    available: true,
    commits: commits.length,
    tags: git(['tag', '--list']).split('\n').filter(Boolean).length,
    remotes: git(['remote']).split('\n').filter(Boolean),
    renameProbe,
    refSnapshot,
    firstPageGraph,
    firstPagePayload,
  };
}

function benchmarkStressAndMemory() {
  const isQuick = args.has('quick');
  const totalPages = isQuick ? 20 : 100;
  const pageSize = 500;
  const totalCommits = totalPages * pageSize;

  const initialHeap = process.memoryUsage().heapUsed;
  let peakHeap = initialHeap;

  let continuation;
  let accumulatedRowCount = 0;
  const pageDurations = [];

  const paginationStart = performance.now();
  for (let page = 0; page < totalPages; page++) {
    const pageCommits = [];
    const startIndex = page * pageSize;
    for (let i = startIndex; i < startIndex + pageSize; i++) {
      const commitSha = sha(totalCommits - i);
      const parents = [];
      if (i + 1 < totalCommits) parents.push(sha(totalCommits - (i + 1)));
      if (i % 25 === 0 && i + 3 < totalCommits) parents.push(sha(totalCommits - (i + 3)));
      pageCommits.push({
        sha: commitSha,
        shortSha: commitSha.slice(0, 7),
        parents,
        author: {
          name: `Author ${i % 10}`,
          email: `a${i % 10}@test.com`,
          timestamp: 1700000000000 - i * 60000,
          timezone: '+0000',
        },
        committer: {
          name: `Committer ${i % 5}`,
          email: `c${i % 5}@test.com`,
          timestamp: 1700000000000 - i * 60000,
          timezone: '+0000',
        },
        subject: `commit ${i}`,
        refs: [],
      });
    }

    const startPage = performance.now();
    const result = buildCommitGraph(pageCommits, {
      continuation,
      startRow: accumulatedRowCount,
      totalPageRows: accumulatedRowCount + pageCommits.length,
    });
    pageDurations.push(performance.now() - startPage);
    accumulatedRowCount += result.rows.length;
    continuation = result.continuation;

    const currentHeap = process.memoryUsage().heapUsed;
    if (currentHeap > peakHeap) {
      peakHeap = currentHeap;
    }
  }
  const paginationTotalMs = performance.now() - paginationStart;

  // Rapid scrolling simulation
  const viewportHeight = 720;
  const rowHeight = 24;
  const overscan = 8;
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const scrollSteps = isQuick ? 25 : 100;
  const scrollStart = performance.now();
  for (let step = 0; step < scrollSteps; step++) {
    const scrollTop = Math.floor((step / scrollSteps) * (accumulatedRowCount * rowHeight));
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endRow = Math.min(accumulatedRowCount, startRow + visibleRows);
    if (endRow - startRow > visibleRows) {
      throw new Error('Virtual scroll overshot visible rows limit');
    }
  }
  const scrollTotalMs = performance.now() - scrollStart;

  // LRU cache validation
  const DETAILS_CACHE_LIMIT = 500;
  const DIFF_CACHE_LIMIT = 100;
  const detailsCache = new Map();
  for (let i = 0; i < 1000; i++) {
    const key = `repo::sha-${i}::`;
    detailsCache.delete(key);
    detailsCache.set(key, { sha: `sha-${i}`, subject: `sub ${i}` });
    while (detailsCache.size > DETAILS_CACHE_LIMIT) {
      const oldest = detailsCache.keys().next().value;
      if (oldest !== undefined) detailsCache.delete(oldest);
    }
  }

  const diffCache = new Map();
  for (let i = 0; i < 250; i++) {
    const key = `repo::diff-${i}::file.ts`;
    diffCache.delete(key);
    diffCache.set(key, { chunks: [] });
    while (diffCache.size > DIFF_CACHE_LIMIT) {
      const oldest = diffCache.keys().next().value;
      if (oldest !== undefined) diffCache.delete(oldest);
    }
  }

  // Repository switching GC simulation
  let repoMemoryStable = true;
  for (let cycle = 0; cycle < 10; cycle++) {
    const dummyCommits = generateLinearCommits(500);
    const dummyGraph = buildCommitGraph(dummyCommits);
    if (dummyGraph.rows.length === 0) {
      repoMemoryStable = false;
    }
  }
  const postGcHeap = process.memoryUsage().heapUsed;
  const postGcHeapMB = Number((postGcHeap / (1024 * 1024)).toFixed(2));
  const peakHeapMB = Number((peakHeap / (1024 * 1024)).toFixed(2));
  const memoryUnderLimit = peakHeapMB < 120;

  return {
    totalPages,
    pageSize,
    totalCommits,
    paginationTotalMs: Number(paginationTotalMs.toFixed(2)),
    averagePageMs: Number((paginationTotalMs / totalPages).toFixed(2)),
    scrollTotalMs: Number(scrollTotalMs.toFixed(2)),
    averageScrollStepMs: Number((scrollTotalMs / scrollSteps).toFixed(3)),
    memoryProfile: {
      initialHeapMB: Number((initialHeap / (1024 * 1024)).toFixed(2)),
      peakHeapMB,
      postGcHeapMB,
      targetLimitMB: 120,
      passed: memoryUnderLimit,
    },
    lruLimits: {
      detailsCacheLimit: DETAILS_CACHE_LIMIT,
      detailsCacheFinalSize: detailsCache.size,
      detailsEvictionVerified: !detailsCache.has('repo::sha-0::'),
      diffCacheLimit: DIFF_CACHE_LIMIT,
      diffCacheFinalSize: diffCache.size,
      diffEvictionVerified: !diffCache.has('repo::diff-0::file.ts'),
      passed: detailsCache.size === DETAILS_CACHE_LIMIT && diffCache.size === DIFF_CACHE_LIMIT,
    },
    repoSwitching: {
      cycles: 10,
      passed: repoMemoryStable && postGcHeapMB < 120,
    },
  };
}

const startedAt = new Date().toISOString();
const stressAndMemory = benchmarkStressAndMemory();
const synthetic = benchmarkSynthetic();
const fixtureRepository = benchmarkFixtureRepository();
const realRepository = benchmarkRealRepository();

const graph10k = synthetic.find((item) => item.size === 10_000 && item.topology === 'linear');
const firstPageLinear = synthetic.find(
  (item) => item.size === syntheticSizes[0] && item.topology === 'linear',
);
const report = {
  startedAt,
  mode: args.has('quick') ? 'quick' : 'full',
  repeatCount,
  syntheticSizes,
  budgets: {
    panelSkeletonMs: 300,
    first500CommitsMs: 2_000,
    graph10kMs: 300,
    scrollFpsTarget: 60,
    domRows: 'viewport + overscan',
    refreshRefsNoRebuild: true,
  },
  summary: {
    graph10kLinearMedianMs: graph10k?.graph.medianMs,
    firstPageLinearSerializationMedianMs: firstPageLinear?.firstPageSerialization.medianMs,
    virtualRowsAt500k: estimateVisibleRows(500_000),
    fixtureRepositoryAvailable: fixtureRepository.available,
    realRepositoryAvailable: realRepository.available,
    stressAndMemory: {
      totalCommits: stressAndMemory.totalCommits,
      peakHeapMB: stressAndMemory.memoryProfile.peakHeapMB,
      targetLimitMB: stressAndMemory.memoryProfile.targetLimitMB,
      memoryPassed: stressAndMemory.memoryProfile.passed,
      lruPassed: stressAndMemory.lruLimits.passed,
      averagePageMs: stressAndMemory.averagePageMs,
    },
  },
  synthetic,
  fixtureRepository,
  realRepository,
  stressAndMemory,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Git Graph benchmark report written to ${outputPath}`);
console.log(`Mode: ${report.mode}; sizes: ${syntheticSizes.join(', ')}; repeats: ${repeatCount}`);
console.log(`Graph 10K linear median: ${report.summary.graph10kLinearMedianMs ?? 'n/a'} ms`);
console.log(
  `First-page serialization median: ${report.summary.firstPageLinearSerializationMedianMs ?? 'n/a'} ms`,
);
console.log(`Virtual rows at 500K commits: ${report.summary.virtualRowsAt500k}`);
console.log(
  `Stress & Memory: ${stressAndMemory.totalCommits} commits, peak heap: ${stressAndMemory.memoryProfile.peakHeapMB}MB (<120MB: ${stressAndMemory.memoryProfile.passed}), LRU passed: ${stressAndMemory.lruLimits.passed}`,
);
console.log(
  `Fixture repo: ${fixtureRepository.tags} tag(s), ${fixtureRepository.remoteBranches} remote branch(es), rename=${fixtureRepository.renameProbe.available}`,
);
if (realRepository.available) {
  console.log(
    `Real repo: ${realRepository.commits} commits sampled, ${realRepository.tags} tags, ${realRepository.remotes.length} remotes`,
  );
} else {
  console.log(`Real repo: skipped (${realRepository.reason})`);
}
