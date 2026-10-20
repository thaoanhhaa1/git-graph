import { z } from 'zod';
import { CommitSchema, type Commit } from './commit';

export type GraphSegmentKind = 'straight' | 'branch' | 'merge' | 'pass-through';

export const GraphSegmentKindSchema = z.enum(['straight', 'branch', 'merge', 'pass-through']);

export interface GraphSegment {
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  kind: GraphSegmentKind;
  colorIndex: number;
  isBoundary?: boolean;
}

export const GraphSegmentSchema = z.object({
  fromRow: z.number().int().nonnegative(),
  fromLane: z.number().int().nonnegative(),
  toRow: z.number().int().nonnegative(),
  toLane: z.number().int().nonnegative(),
  kind: GraphSegmentKindSchema,
  colorIndex: z.number().int().nonnegative(),
  isBoundary: z.boolean().optional(),
});

export interface GraphRow {
  commit: Commit;
  row: number;
  lane: number;
  segments: GraphSegment[];
  maxLane: number;
}

export const GraphRowSchema = z.object({
  commit: CommitSchema,
  row: z.number().int().nonnegative(),
  lane: z.number().int().nonnegative(),
  segments: z.array(GraphSegmentSchema),
  maxLane: z.number().int().nonnegative(),
});
