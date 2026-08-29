import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Served from the root of messenger.earth.io.vn. public/CNAME rides along in
  // the build output so the custom domain survives every Actions deploy.
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
})
