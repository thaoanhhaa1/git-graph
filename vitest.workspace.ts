import { defineWorkspace } from 'vitest/config';
import path from 'node:path';

export default defineWorkspace([
  'apps/*',
  'packages/*',
  {
    test: {
      name: 'integration',
      include: ['test/integration/**/*.test.ts'],
      alias: {
        vscode: path.resolve(__dirname, 'apps/extension/test/__mocks__/vscode.ts'),
        '@git-graph/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
        '@git-graph/git-core': path.resolve(__dirname, 'packages/git-core/src/index.ts'),
        '@git-graph/git-graph': path.resolve(__dirname, 'packages/git-graph/src/index.ts'),
      },
    },
  },
]);
