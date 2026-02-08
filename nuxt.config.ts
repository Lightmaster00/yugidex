// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  // SPA : tout le rendu est côté client (pas de SSR)
  ssr: false,
  app: {
    // Pour GitHub Pages : https://<user>.github.io/yugidex/
    baseURL: process.env.NUXT_APP_BASE_URL || '/'
  },
  // Évite les 404 sur _payload.json quand baseURL != '/' (GitHub Pages sous /repo/)
  experimental: {
    payloadExtraction: false
  }
})
