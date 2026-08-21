import { create } from 'zustand'
import { getSSEPresenceTicketAPI, BASE_URL } from '../data/api'

const RECONNECT_DELAY_MS = 3000

let eventSource = null
let reconnectTimer = null
let isManuallyClosed = false

// แปลง payload presence_update (2 รูปแบบ) ให้เป็น Set ของ user_id ที่ online อยู่รูปแบบเดียวกัน
// รูปแบบ 1 (VillagePresenceSnapshot): user/admin หรือ superadmin ที่ระบุ village_id -> { online_users, online_superadmins }
// รูปแบบ 2 (AllVillagesPresenceSnapshot): superadmin ไม่ระบุ village_id -> { villages: [{ online_users }], online_superadmins }
function extractOnlineUserIds(payload) {
  const ids = new Set()

  // online_superadmins มีในทั้ง 2 รูปแบบ และเป็น superadmin ที่ online "ทั้งระบบ" เสมอ
  ;(payload.online_superadmins || []).forEach((u) => ids.add(u.user_id))

  if (Array.isArray(payload.villages)) {
    payload.villages.forEach((v) => {
      ;(v.online_users || []).forEach((u) => ids.add(u.user_id))
    })
  } else {
    ;(payload.online_users || []).forEach((u) => ids.add(u.user_id))
  }

  return ids
}

// Store แยกจาก notificationStore เพราะ scope ต่างกัน:
// notificationStore ต้องเปิดค้างทั้งแอปตลอดที่ login (สำหรับ alert ทุกหน้า)
// presenceStore ใช้เฉพาะตอนอยู่หน้า User Management เท่านั้น (connect ตอน mount / disconnect ตอน unmount หน้า)
const usePresenceStore = create((set, get) => ({
  onlineUserIds: new Set(),
  isConnected: false,

  connect: async () => {
    if (eventSource) return // ต่ออยู่แล้ว ไม่ต้องเปิดซ้ำ
    isManuallyClosed = false

    try {
      const { ticket } = await getSSEPresenceTicketAPI()
      const es = new EventSource(`${BASE_URL}/api/sse/presence?ticket=${ticket}`)
      eventSource = es

      es.addEventListener('ping', () => {
        // keep-alive ทุก 15 วิ ไม่ต้องทำอะไร
      })

      es.addEventListener('presence_update', (e) => {
        try {
          const data = JSON.parse(e.data)
          set({ onlineUserIds: extractOnlineUserIds(data) })
        } catch (err) {
          console.error('parse presence_update error:', err)
        }
      })

      es.onopen = () => set({ isConnected: true })

      // backend อาจปิด connection เงียบๆ ตอน revalidate ทุก 30 วิ (session/village ไม่ผ่านแล้ว)
      // หรือหลุดจาก network — ไม่ว่ากรณีไหน fallback คือ "ไม่รู้ใคร online" (เคลียร์เป็นว่างไปก่อนเงียบๆ) แล้วลอง reconnect
      es.onerror = () => {
        es.close()
        eventSource = null
        set({ isConnected: false, onlineUserIds: new Set() })
        if (!isManuallyClosed) {
          reconnectTimer = setTimeout(() => get().connect(), RECONNECT_DELAY_MS)
        }
      }
    } catch (error) {
      console.error('ขอ presence ticket ไม่สำเร็จ:', error)
      set({ isConnected: false, onlineUserIds: new Set() })
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
    set({ isConnected: false, onlineUserIds: new Set() })
  }
}))

export default usePresenceStore