import { create } from 'zustand'
import toast from 'react-hot-toast'
import Swal from 'sweetalert2'
import {
  getSSEAlertsTicketAPI,
  BASE_URL,
  getNotificationsAPI,
  getUnreadNotificationCountAPI,
  markNotificationReadAPI,
  markAllNotificationsReadAPI,
  getAuthedImageURL,
  getDetectionsAPI,
  getCameraByIdAPI
} from '../data/api'
import useAuthStore from './authStore'

const RECONNECT_DELAY_MS = 3000
const NOTIF_PAGE_SIZE = 20
const MAX_BLACKLIST_QUEUE = 20 // กันคิวบวมไม่รู้จบถ้าเจอรัวๆ ผิดปกติ (เช่น backend ยิงซ้ำ)
const BLACKLIST_LOOKUP_WINDOW_MS = 5 * 60 * 1000 // ขอบเขตย้อนหลังตอนหา detection จริงที่ตรงกับ alert (5 นาที)

let eventSource = null
let reconnectTimer = null
let isManuallyClosed = false

// ---------- คิวของ Blacklist Alert (จัดการผ่าน Zustand Store เพื่อ render เป็น 3D Stacked Cards) ----------

function formatAlertDateTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' })
}

// ดึงรายละเอียด detection ตัวจริงจาก backend (รูปภาพ/กล้อง/เวลา) แทนพึ่ง field ที่อาจไม่มีใน payload
// ของ event "blacklist_alert" เอง — ใช้วิธีเดียวกับหน้า History.jsx คือกรองด้วยป้ายทะเบียน เอาผลล่าสุดมาใช้
// ⚠️ ASSUMPTION: backend คืนผลเรียงจากใหม่ไปเก่า (สมมติฐานเดียวกับที่ Dashboard.jsx ใช้อยู่แล้วตอนดึง Recent History)
async function fetchBlacklistDetectionDetail(alertData) {
  try {
    const params = {
      license_plate: alertData.license_plate,
      time_detect_from: new Date(Date.now() - BLACKLIST_LOOKUP_WINDOW_MS).toISOString(),
      page: 1,
      page_size: 1
    }
    if (alertData.village_id) params.village_id = alertData.village_id

    const data = await getDetectionsAPI(params)
    const detection = data.items?.[0]
    if (!detection) return null

    let cameraName = null
    if (detection.camera_id) {
      try {
        const camera = await getCameraByIdAPI(detection.camera_id)
        cameraName = camera?.name || null
      } catch (error) {
        console.error('โหลดชื่อกล้องสำหรับ blacklist alert ไม่สำเร็จ:', error)
      }
    }

    return { ...detection, camera_name: cameraName }
  } catch (error) {
    console.error('ดึงรายละเอียด detection สำหรับ blacklist alert ไม่สำเร็จ:', error)
    return null
  }
}

function formatAlertTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

const NOTIF_META = {
  blacklist_alert:            { icon: 'blacklist', title: 'Blacklist Detected' },
  camera_verified:            { icon: 'camera',    title: 'Camera Sync Success' },
  camera_verification_failed: { icon: 'camera',    title: 'Camera Verification Failed' },
  camera_sync_failed:         { icon: 'camera',    title: 'Camera Sync Failed' },
  login_bruteforce_detected:  { icon: 'security',  title: 'Login Blocked (Brute-force)' }
}

function formatActionTitle(action) {
  if (!action) return 'Notification'
  return action.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

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
  latestDetection: null,
  isConnected: false,
  activeBlacklistAlerts: [],

  pushBlacklistAlert: (alert) => {
    if (!alert) return

    // 1. กรอง Role: ไม่แจ้งเตือน superadmin — แจ้งเฉพาะ admin และ user ประจำหมู่บ้านเท่านั้น
    const currentUser = useAuthStore.getState().user
    if (!currentUser || currentUser.role === 'superadmin') {
      return
    }

    // 2. ถ้ามี village_id ให้กรองเฉพาะกล้องในหมู่บ้านของตนเอง
    if (currentUser.village_id && alert.village_id && currentUser.village_id !== alert.village_id) {
      return
    }

    set((state) => {
      if (state.activeBlacklistAlerts.length >= MAX_BLACKLIST_QUEUE) return state

      // 3. Deduplication Guard: ป้องกันไม่ให้ Alert เดียวกันเด้งซ้อน 2 ใบ (จากทั้ง detection_created และ blacklist_alert)
      const alertDetId = alert.detection_id || alert.id
      const isDuplicate = state.activeBlacklistAlerts.some((existing) => {
        const existingDetId = existing.detection_id || existing.id
        if (alertDetId && existingDetId) {
          return alertDetId === existingDetId
        }
        const samePlate = existing.license_plate && existing.license_plate === alert.license_plate
        if (samePlate) {
          const t1 = new Date(existing.time_detect || 0).getTime()
          const t2 = new Date(alert.time_detect || 0).getTime()
          if (Math.abs(t1 - t2) < 8000) return true
        }
        return false
      })

      if (isDuplicate) {
        return state
      }

      return { activeBlacklistAlerts: [...state.activeBlacklistAlerts, alert] }
    })
  },

  dismissFrontBlacklistAlert: () => {
    set((state) => ({
      activeBlacklistAlerts: state.activeBlacklistAlerts.slice(1)
    }))
  },

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
    if (eventSource) return
    isManuallyClosed = false

    get().fetchNotifications()
    get().fetchUnreadCount()

    try {
      const { ticket } = await getSSEAlertsTicketAPI()
      const es = new EventSource(`${BASE_URL}/api/sse/alerts?ticket=${ticket}`)
      eventSource = es

      es.addEventListener('ping', () => {})

      es.addEventListener('detection_created', (e) => {
        try {
          const data = JSON.parse(e.data)
          set({ latestDetection: data })

          const currentUser = useAuthStore.getState().user
          const isSuperadmin = currentUser?.role === 'superadmin'

          // ตรวจสอบหมู่บ้าน: แจ้งเตือนเฉพาะกล้องในหมู่บ้านของตนเอง ไม่แจ้งเตือนข้ามหมู่บ้าน
          const detVillageId = data.village_id || data.camera?.village_id
          const isSameVillage = !currentUser?.village_id || !detVillageId || currentUser.village_id === detVillageId

          if (data.is_blacklist || data.is_black_list || data.blacklist) {
            // ไม่แจ้งเตือน superadmin และไม่แจ้งเตือนข้ามหมู่บ้าน
            if (!isSuperadmin && isSameVillage) {
              get().pushBlacklistAlert({
                ...data,
                _stackId: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                time_detect: data.time_detect || data.created_at || new Date().toISOString()
              })
            }
          } else if (data.is_whitelist || data.is_white_list || data.whitelist) {
            // Whitelist Toast: ไม่แจ้งเตือน superadmin และไม่แจ้งเตือนข้ามหมู่บ้าน
            if (!isSuperadmin && isSameVillage) {
              toast.success(
                `Whitelist Detected${data.license_plate ? ` — ${data.license_plate}` : ''}`,
                { icon: '🏠', duration: 6000 }
              )
            }
          }
        } catch (err) {
          console.error('parse detection_created error:', err)
        } finally {
          get().fetchNotifications()
          get().fetchUnreadCount()
        }
      })

      // Blacklist — modal 3D Stacked Alerts กลางจอทันที (ไม่ใช้ toast มุมขวา)
      es.addEventListener('blacklist_alert', (e) => {
        try {
          const data = JSON.parse(e.data)
          const currentUser = useAuthStore.getState().user
          const isSuperadmin = currentUser?.role === 'superadmin'
          const detVillageId = data.village_id || data.camera?.village_id
          const isSameVillage = !currentUser?.village_id || !detVillageId || currentUser.village_id === detVillageId

          if (!isSuperadmin && isSameVillage) {
            const alertItem = {
              ...data,
              _stackId: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              time_detect: data.time_detect || data.created_at || new Date().toISOString()
            }

            // เด้ง Pop-up กลางจอทันที
            get().pushBlacklistAlert(alertItem)
          }
        } catch (err) {
          console.error('parse blacklist_alert error:', err)
        } finally {
          get().fetchNotifications()
          get().fetchUnreadCount()
        }
      })

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

  reset: () => {
    get().disconnect()
    set({ notifications: [], unreadCount: 0, latestDetection: null, activeBlacklistAlerts: [] })
  }
}))

export default useNotificationStore