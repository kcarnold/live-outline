import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5008,
    allowedHosts: ["localhost", "127.0.0.1", "dev8.kenarnold.org"],
    proxy: {
      '/token': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/socket': {
        target: 'ws://localhost:8000',
        ws: true
      }
    }
  }
})
