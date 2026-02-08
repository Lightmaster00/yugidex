// https://nuxt.com/docs/api/configuration/nuxt-config
const baseURL = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    // Pour GitHub Pages : https://<user>.github.io/yugidex/
    baseURL
  },
  // Pour que les chunks JS/CSS soient chargés sous le bon préfixe (GitHub Pages)
  vite: {
    base: baseURL
  },
  // Évite les 404 sur _payload.json quand baseURL != '/' (GitHub Pages sous /repo/)
  experimental: {
    payloadExtraction: false
  }
})
