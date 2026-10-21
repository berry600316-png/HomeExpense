import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 部署子路徑：GitHub Pages 為 /<repo>/，例如 BASE_PATH=/HomeExpense/ npm run build。
// 未設定時以根目錄 / 建置（本機 dev／preview 用）。
// 注意：Windows Git Bash 會把 /HomeExpense/ 改寫成 C:/Program Files/Git/HomeExpense/，
// 所以格式不對就直接中止建置，不產出錯誤路徑的版本（Git Bash 下請加 MSYS_NO_PATHCONV=1）。
const base = process.env.BASE_PATH ?? '/'
if (!/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(base)) {
  throw new Error(`BASE_PATH 格式錯誤：「${base}」。應為 / 或 /<repo>/，例如 /HomeExpense/`)
}

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // Service Worker 只控制本 App 的子路徑，不影響同網域其他專案。
      scope: base,
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: '周家計帳簿',
        short_name: '周家計帳簿',
        description: '每月整理一次的個人支出管理',
        lang: 'zh-Hant-TW',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F5F0',
        theme_color: '#F7F5F0',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
})
