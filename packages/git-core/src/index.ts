export * from './client/GitClient';
export * from './client/GitCliClient';
export * from './client/GitResult';
export * from './client/GitCommandError';
export * from './client/ProcessRunner';
export * from './repository/RepositoryLocator';
export * from './repository/GitRepository';
export * from './parsers/CommitLogParser';
export * from './parsers/RefParser';
export * from './parsers/DiffStatParser';
export * from './queries/CommitQuery';
export * from './queries/CommitDetailsQuery';
export * from './queries/DiffQuery';
export * from './queries/RefQuery';
export * from './queries/RemoteQuery';
export * from './queries/ReflogQuery';
export * from './queries/RebasePlanQuery';
export * from './queries/BlameQuery';
export * from './queries/LineHistoryQuery';
export * from './queries/WorktreeQuery';
export * from './queries/GitWorktreeQuery';
export * from './queries/SubmoduleQuery';

// Backwards compatibility alias
export type { GitResult as GitCommandResult } from './client/GitResult';

export const GIT_CORE_VERSION = '0.2.0';
