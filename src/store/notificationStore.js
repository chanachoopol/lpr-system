import { create } from 'zustand'
import toast from 'react-hot-toast'
import { getSSEAlertsTicketAPI, BASE_URL } from '../data/api'

const RECONNECT_DELAY_MS = 3000
const MAX_NOTIFICATIONS = 50

let eventSource = null
let reconnectTimer = null
let isManuallyClosed = false

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// แปลง ISO timestamp เป็นเวลาแบบไทย HH:MM (รูปแบบเดียวกับที่ mock เดิมใช้)
function formatAlertTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

const useNotificationStore = create((set, get) => ({
  notifications: [],
  latestDetection: null, // ใช้ bump ตาราง Dashboard/Monitor แบบ real-time — ไม่เข้ากระดิ่ง
  isConnected: false,

  connect: async () => {
    if (eventSource) return // ต่ออยู่แล้ว ไม่ต้องเปิดซ้ำ
    isManuallyClosed = false

    try {
      const { ticket } = await getSSEAlertsTicketAPI()
      const es = new EventSource(`${BASE_URL}/api/sse/alerts?ticket=${ticket}`)
      eventSource = es

      es.addEventListener('ping', () => {
        // keep-alive event ทุก 15 วิ ไม่ต้องทำอะไร แค่กัน error handler ไม่ตีความผิด
      })

      // รถถูกตรวจจับใหม่ — bump ตารางเสมอ, เช็ค is_whitelist แยกเพราะ backend ไม่มี whitelist_alert event ให้
      es.addEventListener('detection_created', (e) => {
        try {
          const data = JSON.parse(e.data)
          set({ latestDetection: data })

          if (data.is_whitelist) {
            get()._pushAlert({
              type: 'whitelist',
              title: 'Whitelist Detected',
              plate: data.license_plate,
              location: data.camera?.name,
              time: formatAlertTime(data.time_detect)
            })
          }
        } catch (err) {
          console.error('parse detection_created error:', err)
        }
      })

      // ตรงกับ blacklist — toast + bell
      // หมายเหตุ: superadmin (global scope) ยังไม่ได้ event นี้จนกว่า backend จะเพิ่ม global publish ให้
      es.addEventListener('blacklist_alert', (e) => {
        try {
          const data = JSON.parse(e.data)
          get()._pushAlert({
            type: 'blacklist',
            title: 'Blacklist Detected',
            plate: data.license_plate,
            location: data.camera?.name,
            time: formatAlertTime(data.time_detect)
          })
        } catch (err) {
          console.error('parse blacklist_alert error:', err)
        }
      })

      es.addEventListener('camera_verification_failed', (e) => {
        try {
          const data = JSON.parse(e.data)
          get()._pushAlert({
            type: 'camera',
            title: 'Camera Verification Failed',
            plate: null,
            location: data.camera_name,
            time: formatAlertTime(new Date().toISOString())
          })
        } catch (err) {
          console.error('parse camera_verification_failed error:', err)
        }
      })

      // หมายเหตุ: superadmin (global scope) ยังไม่ได้ event นี้เช่นกัน (ปัญหาเดียวกับ blacklist_alert)
      es.addEventListener('camera_sync_failed', (e) => {
        try {
          const data = JSON.parse(e.data)
          get()._pushAlert({
            type: 'camera',
            title: 'Camera Sync Failed',
            plate: null,
            location: data.camera_name,
            time: formatAlertTime(new Date().toISOString())
          })
        } catch (err) {
          console.error('parse camera_sync_failed error:', err)
        }
      })

      es.onopen = () => set({ isConnected: true })

      es.onerror = () => {
        set({ isConnected: false })
        es.close()
        eventSource = null
        // reconnect เองถ้าไม่ได้ถูกสั่งปิดตรงๆ (เช่น logout) — ticket ใช้ครั้งเดียว ต้องขอใหม่ทุกครั้งที่ reconnect
        if (!isManuallyClosed) {
          reconnectTimer = setTimeout(() => get().connect(), RECONNECT_DELAY_MS)
        }
      }
    } catch (error) {
      console.error('ขอ SSE ticket ไม่สำเร็จ:', error)
      if (!isManuallyClosed) {
        reconnectTimer = setTimeout(() => get().connect(), RECONNECT_DELAY_MS)
      }
    }
  },

  disconnect: () => {
    isManuallyClosed = true
    clearTimeout(reconnectTimer)
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    set({ isConnected: false })
  },

  _pushAlert: (notif) => {
    const entry = { id: makeId(), read: false, ...notif }

    set((state) => ({
      notifications: [entry, ...state.notifications].slice(0, MAX_NOTIFICATIONS)
    }))

    const message = `${notif.title}${notif.plate ? ` — ${notif.plate}` : ''}`
    if (notif.type === 'blacklist') {
      toast.error(message)
    } else if (notif.type === 'whitelist') {
      toast.success(message)
    } else {
      toast(message)
    }
  },

  markAllRead: () => set((state) => ({
    notifications: state.notifications.map((n) => ({ ...n, read: true }))
  })),

  markRead: (id) => set((state) => ({
    notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
  })),

  // เรียกตอน logout — เคลียร์ notification ของ user เก่า กัน user คนถัดไปเห็นข้อมูลค้าง
  reset: () => {
    get().disconnect()
    set({ notifications: [], latestDetection: null })
  }
}))

export default useNotificationStore