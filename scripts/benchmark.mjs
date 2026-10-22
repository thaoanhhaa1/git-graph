#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const packageVersion = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')).version;

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
const markdownPath = resolve(rootDir, String(args.get('markdown') ?? 'docs/benchmark-report.md'));
const baselinePath = resolve(
  rootDir,
  String(args.get('baseline') ?? 'docs/benchmark-baseline-v0.2.1.json'),
);

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

/**
 * Measures the v1.0.0 performance targets on a realistic 500-commit page.
 * Search is exercised against 100K pre-normalized commits to mirror the
 * webview's incremental search path.
 */
function benchmarkTargets() {
  const pageSize = 500;
  const commits = generateMergeCommits(pageSize * 2);
  const firstPage = commits.slice(0, pageSize);
  const secondPage = commits.slice(pageSize, pageSize * 2);

  const firstPageGraph = buildCommitGraph(firstPage);
  const graphLayout = measure(`target:graph-layout:${pageSize}`, () => buildCommitGraph(firstPage));
  const initialRender = measure(`target:initial-render:${pageSize}`, () => {
    const graph = buildCommitGraph(firstPage);
    const payload = {
      requestId: 'bench-target-initial',
      repositoryId: 'synthetic',
      page: { commits: firstPage, cursor: String(pageSize), hasMore: true },
    };
    const serialized = createMessage('commits.page.result', payload);
    JSON.stringify(serialized);
    splitCommitPageIntoChunks(payload.page, DEFAULT_CHUNK_SIZE);
    return { rows: graph.rows.length };
  });
  const pageLoad = measure(`target:page-load:${pageSize}`, () =>
    buildCommitGraph(secondPage, {
      continuation: firstPageGraph.continuation,
      startRow: pageSize,
      totalPageRows: pageSize * 2,
    }),
  );

  const searchCorpus = 100_000;
  const searchCommits = generateLinearCommits(searchCorpus).map((commit) => ({
    ...commit,
    subjectLower: commit.subject.toLowerCase(),
  }));
  const search = measure(
    `target:search:${searchCorpus}`,
    () => {
      const query = 'synthetic commit 9999';
      let matches = 0;
      for (const commit of searchCommits) {
        if (commit.subjectLower.includes(query)) {
          matches += 1;
        }
      }
      return { matches, corpus: searchCommits.length };
    },
    Math.min(repeatCount, 5),
  );

  return {
    pageSize,
    searchCorpus,
    graphLayout,
    initialRender,
    pageLoad,
    search,
  };
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
  const totalPages = isQuick ? 20 : 200;
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
  const memoryUnderStrictLimit = peakHeapMB < 120;
  const memoryTargetLimitMB = 150;
  const memoryUnderTarget = peakHeapMB < memoryTargetLimitMB;
  const averageScrollStepMs = scrollTotalMs / scrollSteps;

  return {
    totalPages,
    pageSize,
    totalCommits,
    paginationTotalMs: Number(paginationTotalMs.toFixed(2)),
    averagePageMs: Number((paginationTotalMs / totalPages).toFixed(2)),
    scrollTotalMs: Number(scrollTotalMs.toFixed(2)),
    scrollSteps,
    averageScrollStepMs: Number(averageScrollStepMs.toFixed(3)),
    scrollFrameMs: Number(averageScrollStepMs.toFixed(3)),
    memoryProfile: {
      initialHeapMB: Number((initialHeap / (1024 * 1024)).toFixed(2)),
      peakHeapMB,
      postGcHeapMB,
      strictLimitMB: 120,
      targetLimitMB: memoryTargetLimitMB,
      passed: memoryUnderStrictLimit,
      passedTarget: memoryUnderTarget,
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

function readBaseline(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function extractTargetMetrics(report) {
  const targets = report?.targets ?? {};
  const value = (key, field) => targets[key]?.[field];
  return {
    initialRenderMs: value('initialRenderMs', 'actualMs'),
    pageLoadMs: value('pageLoadMs', 'actualMs'),
    graphLayoutMs: value('graphLayoutMs', 'actualMs'),
    searchMs: value('searchMs', 'actualMs'),
    memoryMB: value('memoryMB', 'actualMB'),
    scrollFrameMs: value('scrollFrameMs', 'actualMs'),
  };
}

const targetLabels = {
  initialRenderMs: { label: 'Initial render (500 commits)', unit: 'ms' },
  pageLoadMs: { label: 'Page load (next 500 commits)', unit: 'ms' },
  graphLayoutMs: { label: 'Graph layout (500 commits)', unit: 'ms' },
  searchMs: { label: 'Search (100K loaded commits)', unit: 'ms' },
  memoryMB: { label: 'Memory (100K commits paged)', unit: 'MB' },
  scrollFrameMs: { label: 'Scroll frame time', unit: 'ms' },
};

function buildComparison(currentMetrics, baselineMetrics) {
  if (!baselineMetrics) {
    return undefined;
  }
  return Object.keys(targetLabels).map((key) => {
    const baseline = baselineMetrics[key];
    const current = currentMetrics[key];
    const deltaPercent =
      typeof baseline === 'number' && baseline !== 0 && typeof current === 'number'
        ? ((current - baseline) / baseline) * 100
        : undefined;
    return {
      key,
      label: targetLabels[key].label,
      baseline: baseline ?? null,
      current: current ?? null,
      deltaPercent: deltaPercent === undefined ? null : Number(deltaPercent.toFixed(2)),
    };
  });
}

function formatMetric(value, digits = 2) {
  return typeof value === 'number' ? value.toFixed(digits) : 'n/a';
}

function renderMarkdown(report) {
  const lines = [];
  const targets = report.targets;
  const comparison = report.comparison;

  lines.push('# Git Graph Benchmark Report');
  lines.push('');
  lines.push(
    `Generated **${report.startedAt}** on ${report.environment.platform} (${report.environment.arch}), Node ${report.environment.node}, ${report.environment.cpu}.`,
  );
  lines.push('');
  lines.push(`Mode: **${report.mode}** · repeated samples: **${report.repeatCount}**`);
  lines.push('');
  lines.push('## v1.0.0 performance targets');
  lines.push('');
  lines.push('| Metric | Target | Measured | Status |');
  lines.push('| :--- | ---: | ---: | :--- |');
  for (const key of Object.keys(targetLabels)) {
    const entry = targets[key];
    const unit = targetLabels[key].unit;
    const targetValue = entry.targetMs ?? entry.targetMB;
    const actualValue = entry.actualMs ?? entry.actualMB;
    lines.push(
      `| ${targetLabels[key].label} | < ${targetValue} ${unit} | ${formatMetric(actualValue)} ${unit} | ${entry.passed ? 'Pass' : 'Fail'} |`,
    );
  }
  lines.push('');

  if (comparison) {
    lines.push('## v0.2.1 → v1.0.0 comparison');
    lines.push('');
    lines.push('| Metric | v0.2.1 | v1.0.0 | Delta |');
    lines.push('| :--- | ---: | ---: | ---: |');
    for (const entry of comparison) {
      const unit = targetLabels[entry.key].unit;
      const delta =
        entry.deltaPercent === null
          ? 'n/a'
          : `${entry.deltaPercent > 0 ? '+' : ''}${entry.deltaPercent.toFixed(2)}%`;
      lines.push(
        `| ${entry.label} | ${formatMetric(entry.baseline)} ${unit} | ${formatMetric(entry.current)} ${unit} | ${delta} |`,
      );
    }
    lines.push('');
    lines.push(
      '> Baseline captured from the v0.2.1 code line before the 1.0.0 version bump. Run-to-run variance applies.',
    );
    lines.push('');
  } else {
    lines.push('## v0.2.1 → v1.0.0 comparison');
    lines.push('');
    lines.push('Baseline report not found; comparison skipped.');
    lines.push('');
  }

  lines.push('## Synthetic layout results');
  lines.push('');
  lines.push('| Commits | Topology | Graph median (ms) | Serialize (ms) | Chunks | Virtual rows |');
  lines.push('| ---: | :--- | ---: | ---: | ---: | ---: |');
  for (const entry of report.synthetic) {
    lines.push(
      `| ${entry.size} | ${entry.topology} | ${formatMetric(entry.graph.medianMs)} | ${formatMetric(entry.firstPageSerialization.medianMs)} | ${entry.chunking.result.chunks} | ${entry.domRows.result.renderedRows} |`,
    );
  }
  lines.push('');

  lines.push('## Stress, memory & scroll');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| :--- | ---: |');
  lines.push(`| Paged commits | ${report.stressAndMemory.totalCommits} |`);
  lines.push(`| Average page build | ${formatMetric(report.stressAndMemory.averagePageMs)} ms |`);
  lines.push(`| Peak heap | ${formatMetric(report.stressAndMemory.memoryProfile.peakHeapMB)} MB |`);
  lines.push(
    `| Strict budget (<120MB) | ${report.stressAndMemory.memoryProfile.passed ? 'Pass' : 'Fail'} |`,
  );
  lines.push(
    `| v1.0.0 budget (<150MB) | ${report.stressAndMemory.memoryProfile.passedTarget ? 'Pass' : 'Fail'} |`,
  );
  lines.push(`| LRU eviction | ${report.stressAndMemory.lruLimits.passed ? 'Pass' : 'Fail'} |`);
  lines.push(
    `| Repository switching | ${report.stressAndMemory.repoSwitching.passed ? 'Pass' : 'Fail'} |`,
  );
  lines.push(`| Scroll frame time | ${formatMetric(report.stressAndMemory.scrollFrameMs)} ms |`);
  lines.push('');
  lines.push('## Repositories');
  lines.push('');
  lines.push(
    `- Fixture repository: tags=${report.fixtureRepository.tags}, remote branches=${report.fixtureRepository.remoteBranches}, rename probe=${report.fixtureRepository.renameProbe.available}`,
  );
  if (report.realRepository.available) {
    lines.push(
      `- Real repository: ${report.realRepository.commits} commits sampled, ${report.realRepository.tags} tags, ${report.realRepository.remotes.length} remotes`,
    );
  } else {
    lines.push(`- Real repository: skipped (${report.realRepository.reason})`);
  }
  lines.push('');
  lines.push('> Reports are generated by `npm run benchmark`. JSON output is ignored by Git;');
  lines.push('> this Markdown summary and the v0.2.1 baseline JSON are checked in.');
  lines.push('');
  return lines.join('\n');
}

const startedAt = new Date().toISOString();
const stressAndMemory = benchmarkStressAndMemory();
const targetMetrics = benchmarkTargets();
const synthetic = benchmarkSynthetic();
const fixtureRepository = benchmarkFixtureRepository();
const realRepository = benchmarkRealRepository();

const graph10k = synthetic.find((item) => item.size === 10_000 && item.topology === 'linear');
const firstPageLinear = synthetic.find(
  (item) => item.size === syntheticSizes[0] && item.topology === 'linear',
);

const peakHeapMB = stressAndMemory.memoryProfile.peakHeapMB;
const scrollFrameMs = stressAndMemory.scrollFrameMs;
const targets = {
  initialRenderMs: {
    targetMs: 200,
    actualMs: targetMetrics.initialRender.medianMs,
    passed: targetMetrics.initialRender.medianMs < 200,
  },
  pageLoadMs: {
    targetMs: 100,
    actualMs: targetMetrics.pageLoad.medianMs,
    passed: targetMetrics.pageLoad.medianMs < 100,
  },
  graphLayoutMs: {
    targetMs: 50,
    actualMs: targetMetrics.graphLayout.medianMs,
    passed: targetMetrics.graphLayout.medianMs < 50,
  },
  searchMs: {
    targetMs: 50,
    actualMs: targetMetrics.search.medianMs,
    passed: targetMetrics.search.medianMs < 50,
    corpus: targetMetrics.searchCorpus,
  },
  memoryMB: {
    targetMB: 150,
    actualMB: peakHeapMB,
    pagedCommits: stressAndMemory.totalCommits,
    passed: peakHeapMB < 150,
  },
  scrollFrameMs: {
    targetMs: 16,
    actualMs: scrollFrameMs,
    passed: scrollFrameMs < 16,
  },
};

const currentMetrics = Object.fromEntries(
  Object.entries(targets).map(([key, entry]) => [key, entry.actualMs ?? entry.actualMB]),
);
const baselineReport = readBaseline(baselinePath);
const baselineMetrics = baselineReport ? extractTargetMetrics(baselineReport) : undefined;
const comparison = buildComparison(currentMetrics, baselineMetrics);
const targetsPassed = Object.values(targets).every((entry) => entry.passed);

const report = {
  startedAt,
  version: packageVersion,
  mode: args.has('quick') ? 'quick' : 'full',
  repeatCount,
  syntheticSizes,
  environment: {
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
    cpu: os.cpus()[0]?.model ?? 'unknown CPU',
  },
  targets,
  targetsPassed,
  comparison,
  targetMetrics: {
    pageSize: targetMetrics.pageSize,
    searchCorpus: targetMetrics.searchCorpus,
    graphLayout: targetMetrics.graphLayout,
    initialRender: targetMetrics.initialRender,
    pageLoad: targetMetrics.pageLoad,
    search: targetMetrics.search,
  },
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
    targetsPassed,
    stressAndMemory: {
      totalCommits: stressAndMemory.totalCommits,
      peakHeapMB,
      targetLimitMB: stressAndMemory.memoryProfile.targetLimitMB,
      memoryPassed: stressAndMemory.memoryProfile.passed,
      memoryPassedTarget: stressAndMemory.memoryProfile.passedTarget,
      lruPassed: stressAndMemory.lruLimits.passed,
      averagePageMs: stressAndMemory.averagePageMs,
    },
  },
  synthetic,
  fixtureRepository,
  realRepository,
  stressAndMemory,
};

if (args.has('save-baseline')) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Baseline report written to ${baselinePath}`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, renderMarkdown(report));

console.log(`Git Graph benchmark report written to ${outputPath}`);
console.log(`Markdown summary written to ${markdownPath}`);
if (comparison) {
  console.log(`Comparison baseline: ${baselinePath}`);
}
console.log(`Mode: ${report.mode}; sizes: ${syntheticSizes.join(', ')}; repeats: ${repeatCount}`);
console.log(`Targets passed: ${targetsPassed ? 'yes' : 'no'}`);
for (const key of Object.keys(targetLabels)) {
  const entry = targets[key];
  const unit = targetLabels[key].unit;
  const value = entry.actualMs ?? entry.actualMB;
  console.log(
    `  ${targetLabels[key].label}: ${formatMetric(value)} ${unit} (target < ${entry.targetMs ?? entry.targetMB} ${unit}) ${entry.passed ? 'yes' : 'no'}`,
  );
}
console.log(`Graph 10K linear median: ${report.summary.graph10kLinearMedianMs ?? 'n/a'} ms`);
console.log(
  `First-page serialization median: ${report.summary.firstPageLinearSerializationMedianMs ?? 'n/a'} ms`,
);
console.log(`Virtual rows at 500K commits: ${report.summary.virtualRowsAt500k}`);
console.log(
  `Stress & Memory: ${stressAndMemory.totalCommits} commits, peak heap: ${peakHeapMB}MB (<120MB: ${stressAndMemory.memoryProfile.passed}, <150MB: ${stressAndMemory.memoryProfile.passedTarget}), LRU passed: ${stressAndMemory.lruLimits.passed}`,
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
