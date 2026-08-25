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

const RECONNECT_DELAY_MS = 3000
const NOTIF_PAGE_SIZE = 20
const MAX_BLACKLIST_QUEUE = 20 // กันคิวบวมไม่รู้จบถ้าเจอรัวๆ ผิดปกติ (เช่น backend ยิงซ้ำ)
const BLACKLIST_LOOKUP_WINDOW_MS = 5 * 60 * 1000 // ขอบเขตย้อนหลังตอนหา detection จริงที่ตรงกับ alert (5 นาที)

let eventSource = null
let reconnectTimer = null
let isManuallyClosed = false

// ---------- คิวของ Blacklist Alert (module-level เพราะต้อง persist ข้ามการ re-render ของทุก component) ----------
let blacklistAlertQueue = []
let isBlacklistAlertShowing = false

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

// แสดง Blacklist Alert ทีละอันจากคิว — modal นี้ตั้งใจปิดไม่ได้ด้วยการคลิกนอกกรอบ/กด Esc
// ต้องกด "รับทราบ" เท่านั้น เพราะเป็นการแจ้งเตือนอันตรายตามที่ตกลงกันไว้
async function showNextBlacklistAlert() {
  if (isBlacklistAlertShowing) return
  const next = blacklistAlertQueue.shift()
  if (!next) return

  isBlacklistAlertShowing = true

  // ไปขอรายละเอียด detection จริงจาก backend มาเสริม (รูป/ชื่อกล้อง) — ถ้าหาไม่เจอ/พลาด
  // ก็ fallback ไปใช้ field เท่าที่ alert payload มีมาให้ (license_plate ยืนยันแล้วว่ามีแน่นอน)
  const detail = await fetchBlacklistDetectionDetail(next)
  const merged = { ...next, ...detail }

  let imageUrl = null
  const imageSource = merged.image_full || merged.image_crop
  if (imageSource) {
    try {
      imageUrl = await getAuthedImageURL(imageSource)
    } catch (error) {
      console.error('โหลดรูปภาพ blacklist alert ไม่สำเร็จ:', error)
    }
  }

  const imageHtml = imageUrl
    ? `<img src="${imageUrl}" alt="ภาพรถที่ตรวจจับได้" style="width:100%; max-height:220px; object-fit:cover; border-radius:12px; margin-bottom:14px; border:1px solid rgba(220,38,38,0.2);" />`
    : `<div style="width:100%; height:120px; display:flex; align-items:center; justify-content:center; background:rgba(220,38,38,0.06); border-radius:12px; margin-bottom:14px; color:rgb(148,163,184); font-size:13px;">ไม่มีรูปภาพ</div>`

  Swal.fire({
    icon: 'error',
    title: 'พบรถต้องสงสัย (Blacklist)',
    html: `
      <div style="text-align:left; font-family:'DM Sans', sans-serif; font-size:14px; line-height:1.8;">
        ${imageHtml}
        <p><strong>ป้ายทะเบียน:</strong> ${merged.license_plate || '-'}</p>
        <p><strong>จังหวัด:</strong> ${merged.province || '-'}</p>
        <p><strong>กล้อง:</strong> ${merged.camera_name || '-'}</p>
        <p><strong>เวลา:</strong> ${formatAlertDateTime(merged.time_detect)}</p>
        ${next.reason ? `<p><strong>เหตุผล:</strong> ${next.reason}</p>` : ''}
      </div>
    `,
    confirmButtonText: 'รับทราบ',
    confirmButtonColor: 'rgb(220, 38, 38)',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showCloseButton: false,
    width: 460,
    customClass: { popup: 'blacklist-alert-popup' }
  }).then(() => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    isBlacklistAlertShowing = false
    showNextBlacklistAlert()
  })
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

          if (data.is_whitelist) {
            toast.success(
              `Whitelist Detected${data.license_plate ? ` — ${data.license_plate}` : ''}`,
              { icon: '🏠', duration: 6000 }
            )
            get().fetchNotifications()
            get().fetchUnreadCount()
          }
        } catch (err) {
          console.error('parse detection_created error:', err)
        }
      })

      // Blacklist — toast แจ้งเตือนแบบเดิม + modal บล็อกหน้าจอพร้อมรูปถ่าย (ดึงจาก getDetectionsAPI จริง)
      es.addEventListener('blacklist_alert', (e) => {
        try {
          const data = JSON.parse(e.data)
          toast.error(`Blacklist Detected${data.license_plate ? ` — ${data.license_plate}` : ''}`)

          if (blacklistAlertQueue.length < MAX_BLACKLIST_QUEUE) {
            blacklistAlertQueue.push(data)
            showNextBlacklistAlert()
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
    blacklistAlertQueue = []
    isBlacklistAlertShowing = false
    set({ notifications: [], unreadCount: 0, latestDetection: null })
  }
}))

export default useNotificationStore