export interface GraphNode {
  hash: string;
  parents: string[];
}

export const GIT_GRAPH_ENGINE_VERSION = '0.2.0';

export * from './model';
export * from './algorithm';
