import type { CommitStats, FileChange, FileChangeStatus } from '@git-graph/shared';

export interface ParsedNumstatEntry {
  path: string;
  oldPath?: string;
  additions?: number;
  deletions?: number;
  isBinary: boolean;
}

export interface ParsedNameStatusEntry {
  path: string;
  oldPath?: string;
  status: FileChangeStatus;
  similarity?: number;
  isSubmodule?: boolean;
}

const GIT_SUBMODULE_MODE = '160000';

function mapStatusCode(statusCode: string | undefined): FileChangeStatus {
  switch (statusCode) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'typeChanged';
    case 'U':
      return 'unmerged';
    default:
      return 'unknown';
  }
}

/**
 * Parses Git diff statistics and changed file outputs (--numstat, --name-status, --summary).
 */
export class DiffStatParser {
  /**
   * Unquotes paths if Git enclosed them in quotes (e.g., when containing spaces or special chars).
   */
  public static unquotePath(path: string): string {
    const trimmed = path.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      try {
        return JSON.parse(trimmed) as string;
      } catch {
        return trimmed.slice(1, -1).replace(/\\"/g, '"');
      }
    }
    return trimmed;
  }

  /**
   * Resolves rename path syntax commonly used by Git numstat:
   * Examples:
   * - "old => new"
   * - "{old => new}/file.ts"
   * - "src/{old => new}/file.ts"
   * - "src/{old => new}"
   * - "{ => dir}/file.ts"
   * - "{dir => }/file.ts"
   */
  public static parseRenamePath(rawPath: string): { oldPath?: string; newPath: string } {
    const path = DiffStatParser.unquotePath(rawPath);

    // Matches brace rename syntax: prefix{old => new}suffix
    const braceMatch = /^(.*?)\{(.*?)\s*=>\s*(.*?)\}(.*)$/.exec(path);
    if (braceMatch) {
      const prefix = braceMatch[1] ?? '';
      const oldPart = braceMatch[2] ?? '';
      const newPart = braceMatch[3] ?? '';
      const suffix = braceMatch[4] ?? '';

      const normalize = (part: string) => {
        const full = `${prefix}${part}${suffix}`;
        // Clean double slashes if an empty part resulted in '//' and strip leading slashes
        return full
          .replace(/\/{2,}/g, '/')
          .replace(/^\.\//, '')
          .replace(/^\/+/, '');
      };

      return {
        oldPath: normalize(oldPart),
        newPath: normalize(newPart),
      };
    }

    // Matches arrow syntax without braces: "old => new"
    const arrowMatch = /^(.*?)\s*=>\s*(.*)$/.exec(path);
    if (arrowMatch && arrowMatch[1] && arrowMatch[2]) {
      return {
        oldPath: DiffStatParser.unquotePath(arrowMatch[1]),
        newPath: DiffStatParser.unquotePath(arrowMatch[2]),
      };
    }

    return {
      newPath: path,
    };
  }

  /**
   * Parses git `diff --numstat` output.
   *
   * Format per line: `<additions>\t<deletions>\t<path>`
   * For binary files: `-\t-\t<path>`
   */
  public static parseNumstat(output: string): ParsedNumstatEntry[] {
    if (!output || !output.trim()) {
      return [];
    }

    const entries: ParsedNumstatEntry[] = [];
    const lines = output.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parts = line.split('\t');
      if (parts.length < 3) {
        continue;
      }

      const rawAdd = parts[0]!.trim();
      const rawDel = parts[1]!.trim();
      const rawPath = parts.slice(2).join('\t');

      const isBinary = rawAdd === '-' && rawDel === '-';
      const { oldPath, newPath } = DiffStatParser.parseRenamePath(rawPath);

      entries.push({
        path: newPath,
        oldPath,
        additions: isBinary ? undefined : Number.parseInt(rawAdd, 10) || 0,
        deletions: isBinary ? undefined : Number.parseInt(rawDel, 10) || 0,
        isBinary,
      });
    }

    return entries;
  }

  /**
   * Parses git `diff --name-status` output.
   *
   * Format per line: `<status_code>\t<path>` or `<status_code><similarity>\t<oldPath>\t<newPath>`
   */
  public static parseNameStatus(output: string): ParsedNameStatusEntry[] {
    if (!output || !output.trim()) {
      return [];
    }

    const entries: ParsedNameStatusEntry[] = [];
    const lines = output.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parts = line.split('\t');
      if (parts.length < 2) {
        continue;
      }

      const code = parts[0]!.trim();
      const statusCode = code[0]?.toUpperCase();
      let similarity: number | undefined;

      if (code.length > 1) {
        const parsedSim = Number.parseInt(code.slice(1), 10);
        if (!Number.isNaN(parsedSim)) {
          similarity = parsedSim;
        }
      }

      let status: FileChangeStatus = 'unknown';
      let path: string;
      let oldPath: string | undefined;

      switch (statusCode) {
        case 'A':
          status = 'added';
          path = DiffStatParser.unquotePath(parts[1]!);
          break;
        case 'M':
          status = 'modified';
          path = DiffStatParser.unquotePath(parts[1]!);
          break;
        case 'D':
          status = 'deleted';
          path = DiffStatParser.unquotePath(parts[1]!);
          break;
        case 'R':
          status = 'renamed';
          oldPath = DiffStatParser.unquotePath(parts[1]!);
          path = DiffStatParser.unquotePath(parts[2] ?? parts[1]!);
          break;
        case 'C':
          status = 'copied';
          oldPath = DiffStatParser.unquotePath(parts[1]!);
          path = DiffStatParser.unquotePath(parts[2] ?? parts[1]!);
          break;
        case 'T':
          status = 'typeChanged';
          path = DiffStatParser.unquotePath(parts[1]!);
          break;
        case 'U':
          status = 'unmerged';
          path = DiffStatParser.unquotePath(parts[1]!);
          break;
        default:
          status = 'unknown';
          path = DiffStatParser.unquotePath(parts[1]!);
          break;
      }

      entries.push({
        path,
        oldPath,
        status,
        similarity,
      });
    }

    return entries;
  }

  /**
   * Parses git `diff --raw` output, detecting submodule (mode 160000) changes.
   *
   * Format per line:
   * `:oldmode newmode oldsha newsha status\tpath`
   * Renames/copies append the old path: `... R100\toldPath\tnewPath`.
   */
  public static parseRawDiff(output: string): ParsedNameStatusEntry[] {
    if (!output || !output.trim()) {
      return [];
    }

    const entries: ParsedNameStatusEntry[] = [];

    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith(':')) {
        continue;
      }

      const tabIndex = line.indexOf('\t');
      if (tabIndex === -1) {
        continue;
      }

      const header = line.slice(0, tabIndex);
      const pathParts = line.slice(tabIndex + 1).split('\t');
      const headerMatch = /^:(\d{6})\s+(\d{6})\s+[0-9a-fA-F]+\s+[0-9a-fA-F]+\s+([A-Z])(\d*)$/.exec(
        header,
      );
      if (!headerMatch) {
        continue;
      }

      const [, oldMode, newMode, statusCode, similarityRaw] = headerMatch;
      const isSubmodule = oldMode === GIT_SUBMODULE_MODE || newMode === GIT_SUBMODULE_MODE;
      const status = mapStatusCode(statusCode);
      const similarity = similarityRaw ? Number.parseInt(similarityRaw, 10) : undefined;

      let path: string | undefined;
      let oldPath: string | undefined;
      if (status === 'renamed' || status === 'copied') {
        oldPath = DiffStatParser.unquotePath(pathParts[0] ?? '');
        path = DiffStatParser.unquotePath(pathParts[1] ?? pathParts[0] ?? '');
      } else {
        path = DiffStatParser.unquotePath(pathParts[0] ?? '');
      }

      if (!path) {
        continue;
      }

      entries.push({
        path,
        ...(oldPath ? { oldPath } : {}),
        status,
        ...(similarity !== undefined && !Number.isNaN(similarity) ? { similarity } : {}),
        ...(isSubmodule ? { isSubmodule: true } : {}),
      });
    }

    return entries;
  }

  /**
   * Combines parsed numstat entries with name-status entries to build complete FileChange objects.
   */
  public static combine(
    numstatEntries: ParsedNumstatEntry[],
    nameStatusEntries: ParsedNameStatusEntry[],
  ): FileChange[] {
    const nameStatusMap = new Map<string, ParsedNameStatusEntry>();
    for (const ns of nameStatusEntries) {
      nameStatusMap.set(ns.path, ns);
    }

    const processedPaths = new Set<string>();
    const changes: FileChange[] = [];

    for (const num of numstatEntries) {
      processedPaths.add(num.path);
      const ns = nameStatusMap.get(num.path);

      let status: FileChangeStatus;
      if (ns) {
        status = ns.status;
      } else if (num.oldPath) {
        status = 'renamed';
      } else {
        status = 'modified';
      }

      changes.push({
        path: num.path,
        oldPath: ns?.oldPath ?? num.oldPath,
        status,
        additions: num.additions,
        deletions: num.deletions,
        isBinary: num.isBinary,
        ...(ns?.isSubmodule ? { isSubmodule: true } : {}),
        similarity: ns?.similarity,
      });
    }

    // Any files in name-status not matched in numstat (e.g. empty file creations or renames without changes)
    for (const ns of nameStatusEntries) {
      if (!processedPaths.has(ns.path)) {
        changes.push({
          path: ns.path,
          oldPath: ns.oldPath,
          status: ns.status,
          additions: 0,
          deletions: 0,
          isBinary: false,
          ...(ns.isSubmodule ? { isSubmodule: true } : {}),
          similarity: ns.similarity,
        });
      }
    }

    return changes;
  }

  /**
   * Parses git `diff --numstat` output combined with `--summary` lines if passed in single output.
   */
  public static parseNumstatWithSummary(output: string): FileChange[] {
    if (!output || !output.trim()) {
      return [];
    }

    const numstatLines: string[] = [];
    const summaryStatusMap = new Map<
      string,
      { status: FileChangeStatus; oldPath?: string; similarity?: number }
    >();

    const lines = output.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      // Check summary lines
      const createMatch = /^create mode \d+ (.+)$/.exec(line);
      if (createMatch && createMatch[1]) {
        const path = DiffStatParser.unquotePath(createMatch[1]);
        summaryStatusMap.set(path, { status: 'added' });
        continue;
      }

      const deleteMatch = /^delete mode \d+ (.+)$/.exec(line);
      if (deleteMatch && deleteMatch[1]) {
        const path = DiffStatParser.unquotePath(deleteMatch[1]);
        summaryStatusMap.set(path, { status: 'deleted' });
        continue;
      }

      const renameMatch = /^rename (.+) => (.+) \((\d+)%\)$/.exec(line);
      if (renameMatch && renameMatch[1] && renameMatch[2]) {
        const oldP = DiffStatParser.unquotePath(renameMatch[1]);
        const newP = DiffStatParser.unquotePath(renameMatch[2]);
        const sim = Number.parseInt(renameMatch[3]!, 10);
        summaryStatusMap.set(newP, { status: 'renamed', oldPath: oldP, similarity: sim });
        continue;
      }

      const copyMatch = /^copy (.+) => (.+) \((\d+)%\)$/.exec(line);
      if (copyMatch && copyMatch[1] && copyMatch[2]) {
        const oldP = DiffStatParser.unquotePath(copyMatch[1]);
        const newP = DiffStatParser.unquotePath(copyMatch[2]);
        const sim = Number.parseInt(copyMatch[3]!, 10);
        summaryStatusMap.set(newP, { status: 'copied', oldPath: oldP, similarity: sim });
        continue;
      }

      const modeMatch = /^mode change \d+ => \d+ (.+)$/.exec(line);
      if (modeMatch && modeMatch[1]) {
        const path = DiffStatParser.unquotePath(modeMatch[1]);
        summaryStatusMap.set(path, { status: 'typeChanged' });
        continue;
      }

      // Regular numstat line
      if (rawLine.includes('\t')) {
        numstatLines.push(rawLine);
      }
    }

    const numstatEntries = DiffStatParser.parseNumstat(numstatLines.join('\n'));
    const result: FileChange[] = [];
    const processed = new Set<string>();

    for (const num of numstatEntries) {
      processed.add(num.path);
      const summaryInfo = summaryStatusMap.get(num.path);

      let status: FileChangeStatus;
      if (summaryInfo) {
        status = summaryInfo.status;
      } else if (num.oldPath) {
        status = 'renamed';
      } else {
        status = 'modified';
      }

      result.push({
        path: num.path,
        oldPath: summaryInfo?.oldPath ?? num.oldPath,
        status,
        additions: num.additions,
        deletions: num.deletions,
        isBinary: num.isBinary,
        similarity: summaryInfo?.similarity,
      });
    }

    for (const [path, info] of summaryStatusMap.entries()) {
      if (!processed.has(path)) {
        result.push({
          path,
          oldPath: info.oldPath,
          status: info.status,
          additions: 0,
          deletions: 0,
          isBinary: false,
          similarity: info.similarity,
        });
      }
    }

    return result;
  }

  /**
   * Computes aggregate totals (additions, deletions, filesChanged) from a list of FileChanges.
   */
  public static computeStats(fileChanges: FileChange[]): CommitStats {
    let additions = 0;
    let deletions = 0;

    for (const change of fileChanges) {
      if (!change.isBinary) {
        additions += change.additions ?? 0;
        deletions += change.deletions ?? 0;
      }
    }

    return {
      filesChanged: fileChanges.length,
      additions,
      deletions,
    };
  }
}
