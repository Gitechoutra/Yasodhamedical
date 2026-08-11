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
    // Fail if 5173 is taken, rather than quietly moving to 5174. `port` on
    // its own is only a preference — a dev server left running in another
    // terminal is enough to make the next `npm run dev` pick a different one,
    // and nothing announces that beyond one line of startup output.
    //
    // Drifting is not harmless here, because the port is written down on the
    // backend as well: dev.ini pins cors_origins and frontend_base_url to
    // :5173, so a frontend on :5174 has every API call refused by CORS, and
    // every password-reset link the portal emails points at a port with
    // nothing behind it. Better to be told the port is busy and close the
    // other server than to debug that.
    strictPort: true,
  },
})
