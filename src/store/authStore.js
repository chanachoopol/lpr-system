import { create } from 'zustand'
import Cookies from 'js-cookie'

// จำนวนวันที่ cookie จะอยู่ ถ้าผู้ใช้ติ๊ก "Remember me"
// ไม่ติ๊ก = ไม่ตั้ง expires เลย → เป็น session cookie (หายตอนปิด browser)
const REMEMBER_ME_EXPIRY_DAYS = 7

// Store เก็บข้อมูล user ที่ login อยู่
const useAuthStore = create((set) => ({

  // ข้อมูลเริ่มต้น
  user: null,
  token: null,
  isLoggedIn: false,

  // ฟังก์ชันเก็บข้อมูลหลัง login สำเร็จ
  // rememberMe: true = cookie อยู่นาน (REMEMBER_ME_EXPIRY_DAYS วัน), false/undefined = session cookie
  login: (user, token, rememberMe) => {
    const cookieOptions = rememberMe ? { expires: REMEMBER_ME_EXPIRY_DAYS } : {}
    Cookies.set('access_token', token, cookieOptions)
    Cookies.set('user', JSON.stringify(user), cookieOptions)
    set({ user, token, isLoggedIn: true })
  },

  // ฟังก์ชัน logout ล้างข้อมูลทั้งหมด
  logout: () => {
    Cookies.remove('access_token')
    Cookies.remove('user')
    set({ user: null, token: null, isLoggedIn: false })
  },

  // โหลดข้อมูลจาก cookie ตอนเปิดเว็บใหม่
  // ป้องกัน login หาย ตอน refresh หน้า
  loadFromStorage: () => {
    const token = Cookies.get('access_token')
    const user = Cookies.get('user')
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