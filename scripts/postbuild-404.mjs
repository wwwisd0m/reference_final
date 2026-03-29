/**
 * GitHub Pages: SPA 직접 URL·새로고침 시 404 방지 — index.html을 404.html로 복사
 */
import { copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'dist', 'index.html');
const out404 = join(root, 'dist', '404.html');

if (!existsSync(indexPath)) {
  console.error('postbuild-404: dist/index.html not found');
  process.exit(1);
}
copyFileSync(indexPath, out404);
console.log('postbuild-404: dist/index.html -> dist/404.html');
