import { create } from 'zustand'
import Cookies from 'js-cookie'

// จำนวนวันที่ cookie จะอยู่ ถ้าผู้ใช้ติ๊ก "Remember me"
// ไม่ติ๊ก = ไม่ตั้ง expires เลย → เป็น session cookie (หายตอนปิด browser)
const REMEMBER_ME_EXPIRY_DAYS = 7

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoggedIn: false,
  isLoading: true, // true ตอนเริ่ม เพื่อรอ loadFromStorage() ก่อน

  login: (user, token, rememberMe) => {
    const cookieOptions = rememberMe ? { expires: REMEMBER_ME_EXPIRY_DAYS } : {}
    Cookies.set('access_token', token, cookieOptions)
    Cookies.set('user', JSON.stringify(user), cookieOptions)
    set({ user, token, isLoggedIn: true, isLoading: false })
  },

  logout: () => {
    Cookies.remove('access_token')
    Cookies.remove('user')
    set({ user: null, token: null, isLoggedIn: false, isLoading: false })
  },

  // อ่าน cookie ตอนเปิดเว็บใหม่/refresh แล้ว set isLoading: false เสมอ
  // ไม่ว่าจะมี cookie หรือไม่ก็ตาม เพื่อให้ ProtectedRoute รู้ว่าตรวจเสร็จแล้ว
  loadFromStorage: () => {
    const token = Cookies.get('access_token')
    const user = Cookies.get('user')
    if (token && user) {
      set({ token, user: JSON.parse(user), isLoggedIn: true, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  }
}))

export default useAuthStore