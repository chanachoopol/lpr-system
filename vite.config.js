import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://d52a-137-59-112-51.ngrok-free.app',
        changeOrigin: true,
        secure: false,
        headers: {
          'ngrok-skip-browser-warning': '69420'
        },
        // SSE (EventSource) ใช้ long-lived connection แบบ stream — ปิด buffering กันดีเลย์ + ข้ามหน้าเตือน ngrok
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive')
            proxyReq.setHeader('ngrok-skip-browser-warning', '69420')
          })
        }
      }
    }
  }
})