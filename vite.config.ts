import { defineConfig, mergeConfig } from 'vite'
import { defineConfig as defineVitestConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default mergeConfig(
  defineConfig({
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*.svg', 'icons/*.png'],
        manifest: {
          name: 'Bookmarks Manager',
          short_name: 'Bookmarks',
          description: 'A modern bookmarks management application with offline support and cloud sync',
          theme_color: '#3b82f6',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ],
          categories: ['productivity', 'utilities'],
          // Share Target API - receive shared links from other apps
          share_target: {
            action: '/',
            method: 'GET',
            params: {
              title: 'title',
              text: 'text', 
              url: 'url'
            }
          }
        },
        workbox: {
          // Cache all static assets
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
          // No runtime caching of Firebase/Firestore API calls: the Firestore SDK
          // handles its own offline behaviour, and cached responses would keep
          // signed-in data in Cache Storage after sign-out.
        },
        devOptions: {
          enabled: true // Enable PWA in development for testing
        }
      })
    ],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      }
    }
  }),
  defineVitestConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    }
  })
)
