import { create } from 'zustand'
import { getVillagesAPI } from '../data/api'

// เก็บรายชื่อหมู่บ้านทั้งหมด + หมู่บ้านที่กำลังดูอยู่ (สำหรับ superadmin สลับดูได้)
// admin/user ธรรมดา: selectedVillageId จะถูกล็อกไว้ที่หมู่บ้านของตัวเองเสมอ
const useVillageStore = create((set, get) => ({
  villages: [],
  isLoadingVillages: false,
  selectedVillageId: null, // null = "ทุกหมู่บ้าน" (มีความหมายเฉพาะ superadmin)
  hasFetched: false,

  // เรียกครั้งเดียวหลัง login/โหลดแอป — ใช้ได้ทั้ง superadmin (ทำ dropdown)
  // และ admin/user (lookup ชื่อหมู่บ้านตัวเองมาโชว์)
  fetchVillages: async () => {
    if (get().hasFetched) return // กันยิงซ้ำเวลาเปลี่ยนหน้าไปมา
    set({ isLoadingVillages: true })
    try {
      const data = await getVillagesAPI({ isActive: true, pageSize: 100 })
      set({ villages: data.items, hasFetched: true })
    } catch (error) {
      console.error('โหลดรายชื่อหมู่บ้านไม่สำเร็จ:', error)
    } finally {
      set({ isLoadingVillages: false })
    }
  },

  // เรียกตอน login สำเร็จ (หรือตอน restore session จาก cookie) — ตั้งค่าเริ่มต้นตาม role
  // superadmin: default = ทุกหมู่บ้าน (null) เลือกเปลี่ยนได้ทีหลังผ่าน dropdown
  // admin/user: ล็อกไว้ที่หมู่บ้านตัวเอง เปลี่ยนไม่ได้
  initSelectedVillage: (user) => {
    if (user?.role === 'superadmin') {
      set({ selectedVillageId: null })
    } else {
      set({ selectedVillageId: user?.village_id || null })
    }
  },

  // ใช้เฉพาะตอน superadmin เปลี่ยนหมู่บ้านจาก dropdown
  setSelectedVillage: (villageId) => set({ selectedVillageId: villageId }),

  // หาชื่อหมู่บ้านจาก id — คืน '-' ถ้ายังไม่โหลดหรือหาไม่เจอ
  getVillageName: (villageId) => {
    const village = get().villages.find((v) => v.id === villageId)
    return village ? village.name : '-'
  },

  // เรียกตอน logout — เคลียร์ทุกอย่างกันข้อมูลหมู่บ้านของ user เก่าค้าง
  reset: () => set({ villages: [], selectedVillageId: null, hasFetched: false })
}))

export default useVillageStore