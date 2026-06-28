import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Honra el puerto asignado por el preview gestionado (autoPort) vía PORT;
    // por defecto 5173 en arranque manual.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
})
