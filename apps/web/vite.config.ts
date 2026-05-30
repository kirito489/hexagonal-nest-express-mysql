/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 設定 Vite：React + Tailwind v4 + path alias + dev 期間將 /api proxy 到後端
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // 後端在 main.ts 設了 setGlobalPrefix('api')，故不需 rewrite
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      // 覆蓋率聚焦可獨立單元測試的純邏輯（lib 工具函式、共用元件）。
      // 排除需 React Router / API client context 的組合層（guard component、
      // 與 /me、URL state 整合的 hooks），這些由 e2e 與手動驗證涵蓋。
      include: [
        'src/lib/format-relative-time.ts',
        'src/lib/status-filter.ts',
        'src/lib/storage.ts',
        'src/lib/use-debounced-value.ts',
        'src/lib/use-has-permission.ts',
        'src/components/DeleteConfirmDialog.tsx',
      ],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 60,
        lines: 75,
      },
    },
  },
})
