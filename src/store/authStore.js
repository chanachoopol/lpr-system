import { create } from 'zustand'
import Cookies from 'js-cookie'
import { logoutAPI } from '../data/api'

const REMEMBER_ME_EXPIRY_DAYS = 7

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoggedIn: false,
  isLoading: true,

  login: (user, token, rememberMe) => {
    const cookieOptions = rememberMe ? { expires: REMEMBER_ME_EXPIRY_DAYS } : {}
    Cookies.set('access_token', token, cookieOptions)
    Cookies.set('user', JSON.stringify(user), cookieOptions)
    set({ user, token, isLoggedIn: true, isLoading: false })
  },

  // เรียก API logout ก่อน แล้วค่อยเคลียร์ cookie/state ฝั่ง client
  // ใช้ try/finally เพื่อให้ user logout ออกจากระบบได้เสมอ
  // แม้ backend จะ error หรือ token หมดอายุไปแล้วก็ตาม
  logout: async () => {
    try {
      await logoutAPI()
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      Cookies.remove('access_token')
      Cookies.remove('user')
      set({ user: null, token: null, isLoggedIn: false, isLoading: false })
    }
  },

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