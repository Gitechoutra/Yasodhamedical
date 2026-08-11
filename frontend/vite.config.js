import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind every interface, not just loopback. Vite's default listens on
    // localhost alone, which means the reset link in a staff member's email
    // is unreachable from their machine no matter what host the link names —
    // the connection is refused before any route is considered.
    host: true,
    port: 5173,
  },
})
