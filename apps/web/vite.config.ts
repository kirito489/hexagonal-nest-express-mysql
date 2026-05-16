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
})
