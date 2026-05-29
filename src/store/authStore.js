import { create } from 'zustand'

// Store เก็บข้อมูล user ที่ login อยู่
const useAuthStore = create((set) => ({
  
  // ข้อมูลเริ่มต้น
  user: null,
  token: null,
  isLoggedIn: false,

  // ฟังก์ชันเก็บข้อมูลหลัง login สำเร็จ
  login: (user, token) => {
    localStorage.setItem('access_token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token, isLoggedIn: true })
  },

  // ฟังก์ชัน logout ล้างข้อมูลทั้งหมด
  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    set({ user: null, token: null, isLoggedIn: false })
  },

  // โหลดข้อมูลจาก localStorage ตอนเปิดเว็บใหม่
  // ป้องกัน login หาย ตอน refresh หน้า
  loadFromStorage: () => {
    const token = localStorage.getItem('access_token')
    const user = localStorage.getItem('user')
    if (token && user) {
      set({ 
        token, 
        user: JSON.parse(user), 
        isLoggedIn: true 
      })
    }
  }
}))

export default useAuthStore