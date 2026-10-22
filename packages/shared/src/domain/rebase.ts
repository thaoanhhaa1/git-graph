import { z } from 'zod';

export type RebasePlanAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';

export const RebasePlanActionSchema = z.enum(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']);

export interface RebasePlanEntry {
  action: RebasePlanAction;
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: number;
  message?: string;
}

export const RebasePlanEntrySchema = z.object({
  action: RebasePlanActionSchema,
  sha: z
    .string()
    .min(4)
    .max(64)
    .regex(/^[0-9a-fA-F]+$/, 'Commit SHA must be hexadecimal'),
  shortSha: z.string().min(1),
  subject: z.string(),
  author: z.string(),
  date: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export const RebasePlanSchema = z.array(RebasePlanEntrySchema);

export interface RebasePlanValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validates an interactive rebase plan expressed in execution (todo) order.
 */
export function validateRebasePlan(entries: readonly RebasePlanEntry[]): RebasePlanValidation {
  if (entries.length === 0) {
    return { valid: false, error: 'The rebase plan is empty.' };
  }

  let firstAppliedAction: RebasePlanAction | undefined;
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.sha)) {
      return { valid: false, error: `Commit ${entry.shortSha} appears more than once.` };
    }
    seen.add(entry.sha);

    if (entry.action === 'drop') {
      continue;
    }

    if (!firstAppliedAction) {
      firstAppliedAction = entry.action;
      if (entry.action === 'squash' || entry.action === 'fixup') {
        return {
          valid: false,
          error: 'The first applied commit cannot be squashed or fixed up.',
        };
      }
    }

    if (entry.action === 'reword' && !entry.message?.trim()) {
      return {
        valid: false,
        error: `Commit ${entry.shortSha} needs a message before it can be reworded.`,
      };
    }
  }

  return { valid: true };
}
