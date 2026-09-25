import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      pwaAssets: { disabled: true },
      manifest: {
        name: 'MercaYa',
        short_name: 'MercaYa',
        description: 'Compra y vende productos varios',
        theme_color: '#4F46E5',
        background_color: '#FFFFFF',
        display: 'standalone',
        lang: 'es',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'mercaya-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'mercaya-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/productos') || url.pathname.startsWith('/api/v1/categorias'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'catalogo-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'imagenes',
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        navigateFallback: 'index.html',
        suppressWarnings: true,
        type: 'module',
      },
    }),
  ],
})
