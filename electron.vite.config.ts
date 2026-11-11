import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Khi chạy dev, Vite chèn script inline cho HMR nên phải bỏ CSP; bản build giữ nguyên CSP chặt.
const devCsp = (): Plugin => ({
  name: 'nibmark-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
})

export default defineConfig({
  // Bản đóng gói không kèm node_modules, nên mọi thư viện mà main/preload dùng phải được gộp
  // thẳng vào file build (chỉ electron và module có sẵn của Node là để ngoài).
  main: { build: { externalizeDeps: false } },
  preload: { build: { externalizeDeps: false } },
  renderer: {
    resolve: {
      alias: { '@': resolve('src/renderer/src') }
    },
    define: { global: 'globalThis' },
    plugins: [react(), devCsp()]
  }
})
