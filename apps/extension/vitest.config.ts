import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    alias: {
      vscode: path.resolve(__dirname, 'test/__mocks__/vscode.ts'),
      '@git-graph/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@git-graph/git-core': path.resolve(__dirname, '../../packages/git-core/src/index.ts'),
      '@git-graph/git-graph': path.resolve(__dirname, '../../packages/git-graph/src/index.ts'),
    },
  },
});
