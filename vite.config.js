import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // โหลดตัวแปรสภาพแวดล้อมตามโหมดการรัน (เช่น development / production)
  const env = loadEnv(mode, process.cwd(), '')

  // Target ปลายทางของ Backend และ MediaMTX:
  // อ่านจาก VITE_TARGET_HOST ใน .env ถ้าไม่มีให้ใช้ VM 192.168.100.97 เป็นค่าเริ่มต้นอัตโนมัติ
  const targetHost = env.VITE_TARGET_HOST || 'http://192.168.100.97'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true, // อนุญาตการเชื่อมต่อผ่าน ngrok ทุกโดเมน
      proxy: {
        '/api': {
          target: targetHost,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: '', // ปลด domain ให้คุกกี้ผูกกับ Host/IP ที่เปิดใช้งานจริง (เช่น 192.168.x.x หรือ localhost)
          headers: {
            'ngrok-skip-browser-warning': '69420'
          },
          // SSE (EventSource) ใช้ long-lived connection แบบ stream — ปิด buffering กันดีเลย์
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Connection', 'keep-alive')
              proxyReq.setHeader('ngrok-skip-browser-warning', '69420')
            })

            // ดักจับ Set-Cookie จาก backend: ปรับแต่งให้เบราว์เซอร์ในวง LAN (HTTP) ยอมรับและบันทึกคุกกี้ refresh_token
            proxy.on('proxyRes', (proxyRes) => {
              const setCookieHeaders = proxyRes.headers['set-cookie']
              if (setCookieHeaders) {
                proxyRes.headers['set-cookie'] = (
                  Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
                ).map((cookieStr) =>
                  cookieStr
                    .replace(/;\s*Secure/gi, '')
                    .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
                )
              }
            })
          }
        },
        // Proxy สตรีมมิ่งวิดีโอ MediaMTX (HLS .m3u8 / .ts)
        '/mediamtx': {
          target: targetHost,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})