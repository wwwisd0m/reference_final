import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** GitHub Pages 프로젝트 페이지: 빌드 시 VITE_BASE_PATH=/저장소이름/ (워크플로에서 설정) */
function normalizeBase(raw: string | undefined): string {
  const t = raw?.trim();
  if (!t || t === '/') return '/';
  return t.endsWith('/') ? t : `${t}/`;
}

export default defineConfig({
  plugins: [react()],
  base: normalizeBase(process.env.VITE_BASE_PATH),
});
