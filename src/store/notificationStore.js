import { create } from 'zustand'
import toast from 'react-hot-toast'
import {
  getSSEAlertsTicketAPI,
  BASE_URL,
  getNotificationsAPI,
  getUnreadNotificationCountAPI,
  markNotificationReadAPI,
  markAllNotificationsReadAPI
} from '../data/api'

const RECONNECT_DELAY_MS = 3000
const NOTIF_PAGE_SIZE = 20

let eventSource = null
let reconnectTimer = null
let isManuallyClosed = false

// แปลง ISO timestamp เป็นเวลาแบบไทย HH:MM
function formatAlertTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

// map action ที่ backend ส่งมา -> ไอคอน/หัวข้อที่ใช้แสดงผลในกระดิ่ง
// action ไหนไม่รู้จัก จะ fallback ไป format string ให้อ่านง่าย (เหมือน pattern ใน Auditlog.jsx)
const NOTIF_META = {
  blacklist_alert:            { icon: 'blacklist', title: 'Blacklist Detected' },
  // ⚠️ ASSUMPTION: สมมติว่า field "action" ที่ backend เก็บลง notification ใช้ชื่อเดียวกับ event name ของ SSE
  // (ตรงกับ pattern ของ 3 ตัวล่างที่เหลือ) รอ backend ยืนยัน field จริงจาก endpoint /api/notifications อีกที
  camera_verified:            { icon: 'camera',    title: 'Camera Sync Success' },
  camera_verification_failed: { icon: 'camera',    title: 'Camera Verification Failed' },
  camera_sync_failed:         { icon: 'camera',    title: 'Camera Sync Failed' },
  login_bruteforce_detected:  { icon: 'security',  title: 'Login Blocked (Brute-force)' }
}

function formatActionTitle(action) {
  if (!action) return 'Notification'
  return action.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// แปลง notification object จาก backend ให้เป็น shape ที่ Navbar ใช้แสดงผล
// payload ยังไม่ทราบ schema แน่ชัด (ตัวอย่างที่ได้มาเป็น null) — เผื่อไว้เผื่อ backend ใส่ license_plate/camera_name มาทีหลัง
function mapNotification(n) {
  const meta = NOTIF_META[n.action] || { icon: 'general', title: formatActionTitle(n.action) }
  return {
    id: n.id,
    type: meta.icon,
    title: meta.title,
    detail: n.detail,
    plate: n.payload?.license_plate || null,
    location: n.payload?.camera_name || n.payload?.location || null,
    time: formatAlertTime(n.created_at),
    read: n.is_read
  }
}

const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoadingNotifications: false,
  latestDetection: null, // ใช้ bump ตาราง Dashboard/Monitor แบบ real-time — ไม่เข้ากระดิ่ง
  isConnected: false,

  // โหลดรายการแจ้งเตือนหน้าแรกจาก backend (ของจริง มี persistence แล้ว)
  fetchNotifications: async () => {
    set({ isLoadingNotifications: true })
    try {
      const data = await getNotificationsAPI({ page: 1, pageSize: NOTIF_PAGE_SIZE })
      set({ notifications: data.items.map(mapNotification) })
    } catch (error) {
      console.error('โหลดการแจ้งเตือนไม่สำเร็จ:', error)
    } finally {
      set({ isLoadingNotifications: false })
    }
  },

  fetchUnreadCount: async () => {
    try {
      const data = await getUnreadNotificationCountAPI()
      set({ unreadCount: data.count })
    } catch (error) {
      console.error('โหลดจำนวนแจ้งเตือนที่ยังไม่อ่านไม่สำเร็จ:', error)
    }
  },

  connect: async () => {
    if (eventSource) return // ต่ออยู่แล้ว ไม่ต้องเปิดซ้ำ
    isManuallyClosed = false

    // โหลดของเดิมที่มีอยู่แล้วใน backend ก่อน (กันกระดิ่งว่างตอนเพิ่ง login/refresh)
    get().fetchNotifications()
    get().fetchUnreadCount()

    try {
      const { ticket } = await getSSEAlertsTicketAPI()
      const es = new EventSource(`${BASE_URL}/api/sse/alerts?ticket=${ticket}`)
      eventSource = es

      es.addEventListener('ping', () => {
        // keep-alive event ทุก 15 วิ ไม่ต้องทำอะไร แค่กัน error handler ไม่ตีความผิด
      })

      // รถถูกตรวจจับใหม่ — bump ตารางเสมอ, whitelist ค่อย toast + refetch กระดิ่ง
      es.addEventListener('detection_created', (e) => {
        try {
          const data = JSON.parse(e.data)
          set({ latestDetection: data })

          if (data.is_whitelist) {
            toast.success(`Whitelist Detected${data.license_plate ? ` — ${data.license_plate}` : ''}`)
            get().fetchNotifications()
            get().fetchUnreadCount()
          }
        } catch (err) {
          console.error('parse detection_created error:', err)
        }
      })

      // ตรงกับ blacklist — toast ทันที แล้ว refetch จาก backend (แหล่งข้อมูลจริงตอนนี้)
      es.addEventListener('blacklist_alert', (e) => {
        try {
          const data = JSON.parse(e.data)
          toast.error(`Blacklist Detected${data.license_plate ? ` — ${data.license_plate}` : ''}`)
        } catch (err) {
          console.error('parse blacklist_alert error:', err)
        } finally {
          get().fetchNotifications()
          get().fetchUnreadCount()
        }
      })

      // sync/verify กล้องสำเร็จ — คู่กับ camera_verification_failed ด้านล่าง
      es.addEventListener('camera_verified', (e) => {
        try {
          const data = JSON.parse(e.data)
          toast.success(`Camera Synced${data.camera_name ? ` — ${data.camera_name}` : ''}`)
        } catch (err) {
          console.error('parse camera_verified error:', err)
          toast.success('Camera Synced')
        } finally {
          get().fetchNotifications()
          get().fetchUnreadCount()
        }
      })

      es.addEventListener('camera_verification_failed', () => {
        toast('Camera Verification Failed')
        get().fetchNotifications()
        get().fetchUnreadCount()
      })

      es.addEventListener('camera_sync_failed', () => {
        toast('Camera Sync Failed')
        get().fetchNotifications()
        get().fetchUnreadCount()
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

  // optimistic update ก่อน แล้วค่อยยิง API จริง — กด UI ตอบสนองทันที
  markAllRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0
    }))
    try {
      await markAllNotificationsReadAPI()
    } catch (error) {
      console.error('mark all read error:', error)
    }
  },

  markRead: async (id) => {
    const wasUnread = get().notifications.some((n) => n.id === id && !n.read)
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
    }))
    try {
      await markNotificationReadAPI(id)
    } catch (error) {
      console.error('mark read error:', error)
    }
  },

  // เรียกตอน logout — เคลียร์ notification ของ user เก่า กัน user คนถัดไปเห็นข้อมูลค้าง
  reset: () => {
    get().disconnect()
    set({ notifications: [], unreadCount: 0, latestDetection: null })
  }
}))

export default useNotificationStore