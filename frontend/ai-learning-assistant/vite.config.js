import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// A strict Content-Security-Policy for the production bundle, injected as a
// <meta> tag so it works on any static host (Vercel, Netlify, nginx) without
// header config. Scripts are 'self' only — no inline script anywhere — which
// is what turns an XSS injection point into a non-event instead of a session
// takeover. Not applied in dev: Vite's HMR needs inline scripts and a websocket.
// The API origin is baked in at build time, exactly like VITE_API_BASE_URL.
const cspPlugin = (apiOrigin) => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: [
          "default-src 'self'",
          "script-src 'self'",
          // Inline styles: React `style={}` and the syntax highlighter. Fonts are Google Fonts.
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          `connect-src 'self' ${apiOrigin}`,
          // The PDF viewer iframe loads from the API's /uploads.
          `frame-src ${apiOrigin}`,
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      },
      injectTo: 'head-prepend',
    },
  ],
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiOrigin = new URL(env.VITE_API_BASE_URL || 'http://localhost:8000').origin

  return {
    plugins: [react(), tailwindcss(), cspPlugin(apiOrigin)],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      globals: true,
    },
  }
})
