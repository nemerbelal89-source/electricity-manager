import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'مدير الكهرباء',
        short_name: 'كهرباء',
        description: 'تطبيق لإدارة قراءات الكهرباء والدفعات',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        lang: 'ar',
        direction: 'rtl',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})