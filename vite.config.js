import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Importante para Electron: usar base relativa, para que os assets em dist/
// sejam carregados corretamente via file:// dentro do app empacotado.
export default defineConfig({
  plugins: [react()],
  base: './',
})
