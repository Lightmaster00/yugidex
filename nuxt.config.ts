// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    // Pour GitHub Pages : https://<user>.github.io/yugidex/
    baseURL: process.env.NUXT_APP_BASE_URL || '/'
  }
})
