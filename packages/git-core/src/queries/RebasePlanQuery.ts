import type { RebasePlanAction, RebasePlanEntry } from '@git-graph/shared';
import { GitCliClient } from '../client/GitCliClient';
import { GitCommandMaxBufferBytes, GitCommandTimeoutMs } from '../client/GitExecutionDefaults';
import type { GitClient } from '../client/GitClient';

export interface RebasePlanQueryDependencies {
  client?: GitClient;
}

const REBASE_ACTION_ALIASES: Record<string, RebasePlanAction> = {
  p: 'pick',
  pick: 'pick',
  r: 'reword',
  reword: 'reword',
  e: 'edit',
  edit: 'edit',
  s: 'squash',
  squash: 'squash',
  f: 'fixup',
  fixup: 'fixup',
  d: 'drop',
  drop: 'drop',
};

function isSafeRevision(revision: string): boolean {
  if (!revision || revision.startsWith('-')) {
    return false;
  }
  return !Array.from(revision).some(
    (character) => /\s/.test(character) || character.charCodeAt(0) < 32,
  );
}

export class RebasePlanQuery {
  private readonly _client: GitClient;

  public constructor(deps?: RebasePlanQueryDependencies) {
    this._client = deps?.client ?? new GitCliClient();
  }

  public async list(
    repoPath: string,
    onto: string,
    signal?: AbortSignal,
  ): Promise<RebasePlanEntry[]> {
    if (!isSafeRevision(onto)) {
      throw new Error(`'${onto}' is not a valid rebase target.`);
    }

    let resolved;
    try {
      resolved = await this._client.exec(['rev-parse', '--verify', '--quiet', `${onto}^{commit}`], {
        cwd: repoPath,
        signal,
        timeoutMs: GitCommandTimeoutMs.fast,
        maxBufferBytes: GitCommandMaxBufferBytes.small,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      throw new Error(`'${onto}' does not resolve to a commit.`);
    }
    const ontoSha = resolved.stdout.trim().split('\n')[0];
    if (resolved.exitCode !== 0 || !ontoSha) {
      throw new Error(`'${onto}' does not resolve to a commit.`);
    }

    const result = await this._client.exec(
      [
        'log',
        '--no-merges',
        '--reverse',
        '--topo-order',
        '--format=%H%x00%h%x00%an%x00%at%x00%s',
        `${ontoSha}..HEAD`,
        '--',
      ],
      {
        cwd: repoPath,
        signal,
        timeoutMs: GitCommandTimeoutMs.normal,
        maxBufferBytes: GitCommandMaxBufferBytes.normal,
      },
    );

    return RebasePlanQuery.parse(result.stdout);
  }

  public static parse(stdout: string): RebasePlanEntry[] {
    const entries: RebasePlanEntry[] = [];

    for (const line of stdout.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      const [sha, shortSha, author, date, ...subjectParts] = line.split('\0');
      if (!sha || !shortSha) {
        continue;
      }
      const timestamp = Number.parseInt(date ?? '', 10);
      entries.push({
        action: 'pick',
        sha,
        shortSha,
        subject: subjectParts.join('\0'),
        author: author ?? '',
        date: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0,
      });
    }

    return entries;
  }

  public static parseTodo(todo: string): RebasePlanEntry[] {
    const entries: RebasePlanEntry[] = [];

    for (const rawLine of todo.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const match = /^(\S+)\s+([0-9a-fA-F]{4,64})(?:\s+(.*))?$/.exec(line);
      if (!match) {
        continue;
      }

      const action = REBASE_ACTION_ALIASES[match[1]!.toLowerCase()];
      const sha = match[2]!;
      if (!action) {
        continue;
      }

      entries.push({
        action,
        sha,
        shortSha: sha.slice(0, 7),
        subject: match[3]?.trim() ?? '',
        author: '',
        date: 0,
      });
    }

    return entries;
  }

  public static formatTodo(entries: readonly RebasePlanEntry[]): string {
    const lines = entries.map((entry) => {
      const subject = entry.subject.replace(/[\r\n]+/g, ' ').trim();
      return `${entry.action} ${entry.sha}${subject ? ` ${subject}` : ''}`;
    });
    return `${lines.join('\n')}\n`;
  }
}
