import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 設定 Vite：React + Tailwind v4 + path alias + dev 期間將 /api proxy 到後端
// 注意：Vite 8 在 stdout 為 pipe 時（concurrently / CI）會抑制 ready banner，
// dev server 仍在 :5173 正常運作，直接開瀏覽器即可
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
})
