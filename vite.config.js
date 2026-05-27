import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api/rihappy': {
        target: 'https://www.rihappy.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rihappy/, '')
      }
    }
  }
})
