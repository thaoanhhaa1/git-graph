import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [path.join(repoRoot, 'apps', 'extension', 'src', 'extension.ts')],
  outfile: path.join(repoRoot, 'apps', 'extension', 'dist', 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: process.env.NODE_ENV === 'production' ? false : true,
  sourcesContent: false,
});

console.log('Bundled extension runtime.');
