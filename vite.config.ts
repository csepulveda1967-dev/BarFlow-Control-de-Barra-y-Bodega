import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {defineConfig, type Plugin} from 'vite';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.aistudio']);
const SKIP_FILES = new Set(['barflow_local_data.json', 'bar_control.db', '.DS_Store', 'Thumbs.db']);

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  if (
    [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.json',
      '.html',
      '.css',
      '.sql',
      '.yml',
      '.yaml',
      '.md',
      '.txt',
      '.bat',
      '.svg',
      '.example',
      '.lock',
    ].includes(ext)
  ) {
    return true;
  }
  return base.startsWith('.env.') || base.startsWith('.gitignore');
}

function collectProjectFiles(rootDir: string): Array<{path: string; content: string; encoding: 'utf8' | 'base64'}> {
  const results: Array<{path: string; content: string; encoding: 'utf8' | 'base64'}> = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(path.join(dir, name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILES.has(name) || name.endsWith('.zip')) continue;
      if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) continue;

      const fullPath = path.join(dir, name);
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (isTextFile(fullPath)) {
        results.push({
          path: relPath,
          content: fs.readFileSync(fullPath, 'utf8'),
          encoding: 'utf8',
        });
      } else {
        results.push({
          path: relPath,
          content: fs.readFileSync(fullPath).toString('base64'),
          encoding: 'base64',
        });
      }
    }
  }

  walk(rootDir);
  return results;
}

function projectSourceArchivePlugin(rootDir: string): Plugin {
  const virtualId = 'virtual:project-source-archive';
  const resolvedId = '\0' + virtualId;
  return {
    name: 'barflow-project-source-archive',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) {
        const files = collectProjectFiles(rootDir);
        return `export default ${JSON.stringify(files)};`;
      }
    },
  };
}

export default defineConfig(() => {
  const rootDir = import.meta.dirname;
  return {
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), projectSourceArchivePlugin(rootDir)],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
