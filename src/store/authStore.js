import { create } from 'zustand'

import {
  refreshTokenAPI,
  logoutAPI,
  getMyProfileAPI,
  getUserAvatarBlobURL,
  setAccessTokenCookie,
  removeAccessTokenCookie,
  getAccessTokenCookie,
  getTokenRemainingMs
} from '../data/api'

import useVillageStore from './villageStore'
import useNotificationStore from './notificationStore'

// =============================================================================
// 01. CONSTANTS & MODULE-LEVEL VARIABLES
// =============================================================================

const USER_PROFILE_STORAGE_KEY = 'lpr_user_profile'

const POST_LOGIN_STORAGE_KEYS = [
  USER_PROFILE_STORAGE_KEY,
  'cookie_notice_dismissed',
  'lpr_forgot_pwd_email',
  'lpr_monitor_selected_camera',
  'lpr_historical_cameras',
  'lpr_historical_villages',
  'lpr_historical_blacklist_plates',
  'lpr_historical_whitelist_plates',
  'ldmap_center_epsg3857',
  'lpr_sidebar_collapsed'
]

// เก็บ promise ของการ refresh ที่กำลังทำอยู่ไว้ระดับ module ป้องกันการยิงซ้ำซ้อน
let inFlightRefresh = null
let sessionInitPromise = null
let proactiveTimer = null

// ช่องสัญญาณสำหรับ sync สถานะ login/logout ข้ามแท็บของ origin เดียวกัน
const AUTH_SYNC_CHANNEL_NAME = 'auth-sync-channel'
const authChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(AUTH_SYNC_CHANNEL_NAME)
  : null

// =============================================================================
// 02. STORAGE & DATA NORMALIZATION HELPERS
// =============================================================================

function getCachedUserProfile() {
  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setCachedUserProfile(user) {
  try {
    if (user) {
      localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_PROFILE_STORAGE_KEY)
    }
  } catch {
    // ป้องกันกรณี localStorage ติด quota หรือ disabled
  }
}

function clearPostLoginStorage() {
  try {
    POST_LOGIN_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
    // ล้างคีย์ที่ Longdo Map SDK สร้างขึ้นทั้งหมด (ldmap_*)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('ldmap_')) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    // Ignore storage errors
  }
  try {
    sessionStorage.removeItem('lpr_history_search_plate')
    sessionStorage.removeItem('lpr_selected_village_id')
  } catch {
    // Ignore storage errors
  }
}

function removeCachedUserProfile() {
  clearPostLoginStorage()
}

function normalizeUser(profile) {
  if (!profile) return null
  return {
    ...profile,
    fullName: profile.fullname || profile.fullName || profile.username,
    fullname: profile.fullname || profile.fullName || profile.username
  }
}

// =============================================================================
// 03. PROACTIVE TOKEN REFRESH ENGINE
// =============================================================================

// คำนวณเวลาและตั้งเวลาปลุก (Dynamic Proportional Refresh)
// ให้ความสำคัญกับ expiresInSec จาก Server เป็นหลัก เพื่อไม่ให้ติดปัญหา Clock Skew
function scheduleProactiveRefresh(expiresInSec = null, token = null) {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer)
    proactiveTimer = null
  }

  let durationMs = null
  if (typeof expiresInSec === 'number' && expiresInSec > 0) {
    durationMs = expiresInSec * 1000
  } else if (token) {
    durationMs = getTokenRemainingMs(token)
  }

  if (!durationMs || durationMs <= 0) return

  // เผื่อเวลาล่วงหน้า 20% ของอายุ Token (ขั้นต่ำ 10 วินาที สูงสุดไม่เกิน 3 นาที / 180 วินาที)
  // ปรับตัวตามอายุจริงแบบ Dynamic 100% ไม่มีการ Hardcode
  const bufferMs = Math.min(180 * 1000, Math.max(10 * 1000, durationMs * 0.2))
  const delayMs = Math.max(1000, durationMs - bufferMs)

  proactiveTimer = setTimeout(async () => {
    try {
      if (useAuthStore.getState().isLoggedIn) {
        await useAuthStore.getState().refreshAccessToken()
      }
    } catch (err) {
      console.warn('Proactive token refresh error:', err)
      // ถ้าล้มเหลวเพราะเน็ตกระตุกชั่วคราว (ไม่ใช่ 401) ให้ลองใหม่ในอีก 15 วินาที
      if (err?.response?.status !== 401 && useAuthStore.getState().isLoggedIn) {
        proactiveTimer = setTimeout(() => {
          if (useAuthStore.getState().isLoggedIn) {
            useAuthStore.getState().refreshAccessToken().catch(() => {})
          }
        }, 15000)
      }
    }
  }, delayMs)
}

// =============================================================================
// 04. ZUSTAND AUTH STORE
// =============================================================================

const useAuthStore = create((set, get) => ({
  // ---------------------------------------------------------------------------
  // 4.1 Initial State
  // ---------------------------------------------------------------------------
  user: null,
  accessToken: null,
  avatarUrl: null,
  isLoggedIn: false,
  isLoading: true, // true ตอนเริ่มแอป ระหว่างกู้คืน session จาก cookie

  // ---------------------------------------------------------------------------
  // 4.2 Core Authentication Actions (Lifecycle Order)
  // ---------------------------------------------------------------------------

  // 1. เรียกตอน login สำเร็จจาก Login.jsx — บันทึก Token ลง Cookie และแคช Profile
  login: (user, accessToken, expiresIn = null, fromSync = false) => {
    const normalizedUser = normalizeUser(user)
    setAccessTokenCookie(accessToken, expiresIn)
    setCachedUserProfile(normalizedUser)
    scheduleProactiveRefresh(expiresIn, accessToken)
    set({ user: normalizedUser, accessToken, isLoggedIn: true, isLoading: false })
    if (normalizedUser?.id) {
      getUserAvatarBlobURL(normalizedUser.id)
        .then((url) => get().setAvatarUrl(url))
        .catch(() => get().setAvatarUrl(null))
    }

    // กระจายสัญญาณ Login ให้แท็บอื่นทราบ
    if (!fromSync) {
      authChannel?.postMessage({
        type: 'login',
        user: normalizedUser,
        accessToken,
        expiresIn,
        at: Date.now()
      })
    }
  },

  // 2. กู้คืน Session อัตโนมัติเมื่อเปิดเว็บหรือกด F5
  initSession: async () => {
    if (sessionInitPromise) return sessionInitPromise

    sessionInitPromise = (async () => {
      set({ isLoading: true })
      try {
        const cookieToken = getAccessTokenCookie()
        const remainingMs = getTokenRemainingMs(cookieToken)

        // 1. ถ้ามี access_token ใน Cookie และยังไม่หมดอายุ -> กู้คืน Session
        if (cookieToken && remainingMs && remainingMs > 0) {
          const cachedUser = getCachedUserProfile()

          if (cachedUser) {
            // Instant 0-Network Restore ทันที ไม่ยิง Request ไป Backend
            set({
              user: cachedUser,
              accessToken: cookieToken,
              isLoggedIn: true,
              isLoading: false
            })
            useVillageStore.getState().initSelectedVillage(cachedUser)
            scheduleProactiveRefresh(null, cookieToken)

            if (cachedUser?.id) {
              getUserAvatarBlobURL(cachedUser.id)
                .then((url) => get().setAvatarUrl(url))
                .catch(() => get().setAvatarUrl(null))
            }
            return
          }

          // Fallback: ถ้าไม่มี cached user profile ใน localStorage ให้ยิงขอจาก Backend
          set({ accessToken: cookieToken })
          try {
            const profile = await getMyProfileAPI()
            const normalizedUser = normalizeUser(profile)
            setCachedUserProfile(normalizedUser)
            set({
              user: normalizedUser,
              isLoggedIn: true,
              isLoading: false
            })
            useVillageStore.getState().initSelectedVillage(normalizedUser)
            scheduleProactiveRefresh(null, cookieToken)

            if (profile?.id) {
              getUserAvatarBlobURL(profile.id)
                .then((url) => get().setAvatarUrl(url))
                .catch(() => get().setAvatarUrl(null))
            }
            return
          } catch {
            // ถ้าดึง Profile ไม่สำเร็จ (อาจถูก revoke token) -> ไหลต่อไปขั้นตอน Refresh Token
          }
        }

        // 2. ถ้าไม่มี access_token หรือหมดอายุแล้ว -> ใช้ refresh_token HttpOnly cookie ไปขอ Token ใหม่
        const data = await refreshTokenAPI({ silent: true })
        setAccessTokenCookie(data.access_token, data.expires_in)
        set({ accessToken: data.access_token })
        scheduleProactiveRefresh(data.expires_in, data.access_token)
        const profile = await getMyProfileAPI()
        const normalizedUser = normalizeUser(profile)
        setCachedUserProfile(normalizedUser)
        set({
          user: normalizedUser,
          isLoggedIn: true,
          isLoading: false
        })
        useVillageStore.getState().initSelectedVillage(normalizedUser)

        if (profile?.id) {
          getUserAvatarBlobURL(profile.id)
            .then((url) => get().setAvatarUrl(url))
            .catch(() => get().setAvatarUrl(null))
        }
      } catch {
        get().clearSession()
      } finally {
        sessionInitPromise = null
      }
    })()

    return sessionInitPromise
  },

  // 3. ขอ access_token ใหม่ผ่าน refresh_token HttpOnly cookie (On-Demand เมื่อเกิด 401 หรือ session หมดอายุ)
  refreshAccessToken: async () => {
    if (inFlightRefresh) return inFlightRefresh

    inFlightRefresh = (async () => {
      try {
        const data = await refreshTokenAPI()
        setAccessTokenCookie(data.access_token, data.expires_in)
        scheduleProactiveRefresh(data.expires_in, data.access_token)
        set({ accessToken: data.access_token, isLoggedIn: true, isLoading: false })
        return data.access_token
      } catch (error) {
        // เคลียร์ session เฉพาะเมื่อได้รับ 401 (Refresh Token หมดอายุหรือถูกเพิกถอนจริง)
        if (error?.response?.status === 401) {
          get().clearSession()
        }
        throw error
      } finally {
        inFlightRefresh = null
      }
    })()

    return inFlightRefresh
  },

  // 4. Logout ปกติ
  logout: async () => {
    // ปิด SSE ทันทีตั้งแต่ก่อนเริ่มยิง API เพื่อไม่ให้รับ event ตกค้างและงด reconnect
    useNotificationStore.getState().prepareLogout?.()
    try {
      await logoutAPI()
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      get().clearSession()
    }
  },

  // 5. เคลียร์ Session, ลบ Cookie, แคช Profile และรีเซ็ตทุก Store
  clearSession: (fromSync = false) => {
    const wasLoggedIn = get().isLoggedIn
    const currentAvatar = get().avatarUrl
    if (currentAvatar) {
      URL.revokeObjectURL(currentAvatar)
    }
    if (proactiveTimer) {
      clearTimeout(proactiveTimer)
      proactiveTimer = null
    }
    removeAccessTokenCookie()
    removeCachedUserProfile()
    inFlightRefresh = null
    sessionInitPromise = null
    set({ user: null, accessToken: null, avatarUrl: null, isLoggedIn: false, isLoading: false })
    useVillageStore.getState().reset()
    useNotificationStore.getState().reset()

    if (wasLoggedIn && !fromSync) {
      authChannel?.postMessage({ type: 'logout', at: Date.now() })
    }
  },

  // ---------------------------------------------------------------------------
  // 4.3 Getters & Profile Setters
  // ---------------------------------------------------------------------------
  getAccessToken: () => get().accessToken,

  // อัปเดตข้อมูล user บางส่วน
  updateUser: (partialUser) => {
    set((state) => {
      const updatedUser = state.user ? { ...state.user, ...partialUser } : null
      setCachedUserProfile(updatedUser)
      return { user: updatedUser }
    })
  },

  // อัปเดต avatarUrl ใน store
  setAvatarUrl: (newUrl) => {
    const prev = get().avatarUrl
    if (prev && prev !== newUrl) {
      URL.revokeObjectURL(prev)
    }
    set({ avatarUrl: newUrl })
  }
}))

// =============================================================================
// 05. CROSS-TAB SYNCHRONIZATION (BROADCAST CHANNEL)
// =============================================================================

// ฟังสัญญาณ login/logout ข้ามแท็บ
if (authChannel) {
  authChannel.onmessage = (event) => {
    const { type, user, accessToken, expiresIn } = event.data || {}

    // กรณีได้รับสัญญาณ Logout ข้ามแท็บ
    if (type === 'logout') {
      if (!useAuthStore.getState().isLoggedIn) return
      useAuthStore.getState().clearSession(true)
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.replace('/')
      }
      return
    }

    // กรณีได้รับสัญญาณ Login ข้ามแท็บ
    if (type === 'login' && user && accessToken) {
      // ถ้าแท็บนี้ล็อกอินอยู่แล้วด้วย token เดียวกัน ให้ข้ามไป
      if (useAuthStore.getState().isLoggedIn && useAuthStore.getState().accessToken === accessToken) return

      // อัปเดตสถานะ Login ตามแท็บต้นทาง (ระบุ fromSync = true เพื่อไม่ให้ส่ง postMessage วนลูป)
      useAuthStore.getState().login(user, accessToken, expiresIn, true)
      useVillageStore.getState().initSelectedVillage(user)

      // ถ้าแท็บนี้เปิดค้างอยู่ที่หน้า Login หรือหน้าแรก ให้พาเข้าหน้า Dashboard ทันที
      if (typeof window !== 'undefined' && (window.location.pathname === '/' || window.location.pathname === '/login')) {
        window.location.replace('/dashboard')
      }
    }
  }
}

export default useAuthStore