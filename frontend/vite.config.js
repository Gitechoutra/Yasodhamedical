import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Loopback only, so `npm run dev` prints the one Local URL and nothing
    // else. `host: true` binds every interface and adds a Network line per
    // adapter — which is what a staff member on another machine needs to
    // reach an emailed link, and what to set again if that is ever wanted
    // back. It also has to agree with VITE_API_BASE_URL in .env: the page and
    // the API it calls are named by the same host.
    host: 'localhost',
    port: 5173,
  },
})
