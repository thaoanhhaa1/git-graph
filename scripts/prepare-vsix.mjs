import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionRoot = path.join(repoRoot, 'apps', 'extension');
const packageOutputRoot = path.join(repoRoot, 'dist');

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Required build output is missing: ${path.relative(repoRoot, source)}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

function copyPackage(packageName, packagePath) {
  const packageRoot = path.join(repoRoot, packagePath);
  const targetRoot = path.join(extensionRoot, 'node_modules', '@git-graph', packageName);

  copyDirectory(path.join(packageRoot, 'dist'), path.join(targetRoot, 'dist'));
  fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(targetRoot, 'package.json'));
}

function copyRuntimeDependency(packageName) {
  copyDirectory(
    path.join(repoRoot, 'node_modules', packageName),
    path.join(extensionRoot, 'node_modules', packageName),
  );
}

function removeObsoleteWebviewBundle() {
  fs.rmSync(path.join(extensionRoot, 'dist', 'webview', 'assets'), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(extensionRoot, 'dist', 'webview', 'index.html'), { force: true });
}

removeObsoleteWebviewBundle();

copyDirectory(
  path.join(repoRoot, 'apps', 'webview', 'dist'),
  path.join(extensionRoot, 'dist', 'webview-ui'),
);

fs.mkdirSync(path.join(extensionRoot, 'node_modules', '@git-graph'), { recursive: true });
fs.mkdirSync(packageOutputRoot, { recursive: true });
copyRuntimeDependency('zod');
copyPackage('shared', path.join('packages', 'shared'));
copyPackage('git-core', path.join('packages', 'git-core'));
copyPackage('git-graph', path.join('packages', 'git-graph'));

function removeSourceMaps(directory) {
  if (!fs.existsSync(directory)) return;
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeSourceMaps(fullPath);
    } else if (entry.name.endsWith('.map')) {
      fs.rmSync(fullPath, { force: true });
    }
  }
}

removeSourceMaps(path.join(extensionRoot, 'dist'));
removeSourceMaps(path.join(extensionRoot, 'node_modules', '@git-graph'));

for (const fileName of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
  fs.copyFileSync(path.join(repoRoot, fileName), path.join(extensionRoot, fileName));
}

copyDirectory(path.join(repoRoot, 'resources'), path.join(extensionRoot, 'resources'));

console.log('Prepared VSIX assets and runtime workspace packages (source maps stripped).');
