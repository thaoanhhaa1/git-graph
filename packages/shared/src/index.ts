import { z } from 'zod';

export const ProtocolVersionSchema = z.string().default('1.0.0');
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;

export const SHARED_CONSTANT = 'git-graph-shared';

export * from './domain';
export * from './errors';
export * from './protocol';
