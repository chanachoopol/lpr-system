import { create } from 'zustand'

// แปลง payload presence_update (2 รูปแบบ) ให้เป็น Set ของ user_id ที่ online อยู่รูปแบบเดียวกัน
// รูปแบบ 1 (VillagePresenceSnapshot): user/admin หรือ superadmin ที่ระบุ village_id -> { online_users, online_superadmins }
// รูปแบบ 2 (AllVillagesPresenceSnapshot): superadmin ไม่ระบุ village_id -> { villages: [{ online_users }], online_superadmins }
export function extractOnlineUserIds(payload) {
  const ids = new Set()
  if (!payload) return ids

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

// Presence State จัดการข้อมูลผู้ใช้งานที่กำลังออนไลน์ผ่าน Multiplexed SSE Stream (/api/sse/stream)
const usePresenceStore = create((set) => ({
  onlineUserIds: new Set(),
  isConnected: false,

  setOnlineUsers: (ids) => set({ onlineUserIds: ids instanceof Set ? ids : new Set(ids) }),
  setConnected: (isConnected) => set((state) => ({
    isConnected,
    onlineUserIds: isConnected ? state.onlineUserIds : new Set()
  })),

  // ฟังก์ชัน backward-compatible
  connect: () => {},
  disconnect: () => set({ isConnected: false, onlineUserIds: new Set() }),
  reset: () => set({ isConnected: false, onlineUserIds: new Set() })
}))

export default usePresenceStore