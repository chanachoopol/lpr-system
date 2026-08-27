import { create } from 'zustand'
import Cookies from 'js-cookie'
import { logoutAPI } from '../data/api'
import useVillageStore from './villageStore'
import useNotificationStore from './notificationStore'

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
      // เคลียร์หมู่บ้านที่เลือกไว้ ไม่ให้ user คนถัดไปที่ login เจอค่าค้างจากคนก่อนหน้า
      useVillageStore.getState().reset()
      // ปิด SSE connection + เคลียร์ notification ของ user เก่า
      useNotificationStore.getState().reset()
    }
  },

  // เคลียร์ session ฝั่ง client เฉยๆ ไม่ยิง logoutAPI() ซ้ำ
  // ใช้ตอน "ตั้งรหัสผ่านใหม่" สำเร็จจากลิงก์อีเมล (Resetpassword.jsx) — ตอนนั้น
  // อาจไม่มี token อยู่ในเครื่องเลย (เข้ามาจากลิงก์ ไม่เคย login) หรือถ้ามี token เดิมค้างอยู่
  // (เปิดคนละแท็บ) backend ก็ revoke ทุก session ของ user คนนั้นไปแล้วตั้งแต่ตั้งรหัสผ่านสำเร็จ
  // ยิง logoutAPI() ซ้ำจะได้แค่ 401 เฉยๆ ไม่มีประโยชน์ แค่เคลียร์ cookie/state ฝั่งนี้ก็พอ
  clearSession: () => {
    Cookies.remove('access_token')
    Cookies.remove('user')
    set({ user: null, token: null, isLoggedIn: false, isLoading: false })
    useVillageStore.getState().reset()
    useNotificationStore.getState().reset()
  },

  loadFromStorage: () => {
    const token = Cookies.get('access_token')
    const user = Cookies.get('user')
    if (token && user) {
      const parsedUser = JSON.parse(user)
      set({ token, user: parsedUser, isLoggedIn: true, isLoading: false })
      useVillageStore.getState().initSelectedVillage(parsedUser)
    } else {
      set({ isLoading: false })
    }
  }
}))

export default useAuthStore