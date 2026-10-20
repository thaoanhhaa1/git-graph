# Git Graph Benchmarks

M6.3 benchmark coverage is implemented by `scripts/benchmark.mjs` and exposed through npm scripts.

## Commands

- `npm run benchmark` builds workspace packages and runs the full synthetic matrix: 1K, 10K, 50K, 100K, and 500K commits across linear, branch-heavy, and merge-heavy topologies.
- `npm run benchmark:quick` builds workspace packages and runs a short 1K/10K smoke benchmark for local verification.
- `node scripts/benchmark.mjs --sizes=1000,10000 --repeat=5` runs a custom matrix after packages are built.

## Report

The runner writes JSON to `docs/benchmark-report.json` by default. The report includes:

- Synthetic graph calculation timings per topology and repository size.
- First-page 500 commit payload serialization and chunking timings.
- A virtual DOM row count check proving rendered rows stay at viewport plus overscan scale.
- A deterministic temporary Git fixture with a tag, remote-tracking branch, and rename commit.
- Current workspace repository checks for refs snapshot timing, tags, remotes, and rename history availability when the workspace is a Git repository.

The MVP budgets in `IMPLEMENTATION_PLAN.md` are targets for tuning and CI baselining, not hard guarantees on every development machine.
