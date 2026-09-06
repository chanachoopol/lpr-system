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

const REFRESH_BUFFER_MS = 60 * 1000 // ขอ token ใหม่ล่วงหน้าก่อนหมดอายุจริง 60 วิ กัน network latency
const USER_PROFILE_STORAGE_KEY = 'lpr_user_profile'

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

function removeCachedUserProfile() {
  try {
    localStorage.removeItem(USER_PROFILE_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

function normalizeUser(profile) {
  if (!profile) return null
  return {
    ...profile,
    fullName: profile.fullname || profile.fullName || profile.username,
    fullname: profile.fullname || profile.fullName || profile.username
  }
}

let refreshTimerId = null

// เก็บ promise ของการ refresh ที่กำลังทำอยู่ไว้ระดับ module
let inFlightRefresh = null
let sessionInitPromise = null

// ช่องสัญญาณสำหรับ sync สถานะ logout ข้ามแท็บของ origin เดียวกัน
const LOGOUT_CHANNEL_NAME = 'auth-logout-channel'
const logoutChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(LOGOUT_CHANNEL_NAME)
  : null

function clearRefreshTimer() {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId)
    refreshTimerId = null
  }
}

const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  avatarUrl: null,
  isLoggedIn: false,
  isLoading: true, // true ตอนเริ่มแอป ระหว่างกู้คืน session จาก cookie

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
  },

  // เรียกตอน login สำเร็จจาก Login.jsx — บันทึก Token ลง Cookie แบบ Dynamic, แคช Profile และตั้ง Timer
  login: (user, accessToken, expiresIn = null) => {
    const normalizedUser = normalizeUser(user)
    setAccessTokenCookie(accessToken, expiresIn)
    setCachedUserProfile(normalizedUser)
    set({ user: normalizedUser, accessToken, isLoggedIn: true, isLoading: false })
    get().scheduleRefresh(accessToken)
    if (normalizedUser?.id) {
      getUserAvatarBlobURL(normalizedUser.id)
        .then((url) => get().setAvatarUrl(url))
        .catch(() => get().setAvatarUrl(null))
    }
  },

  getAccessToken: () => get().accessToken,

  // ตั้ง timer ขอ token ใหม่ล่วงหน้าก่อนหมดอายุจริงแบบ Dynamic โดยอ่านค่า exp จากตัว Token (ห้าม Hardcode)
  scheduleRefresh: (explicitToken) => {
    clearRefreshTimer()
    const token = explicitToken || get().accessToken
    const remainingMs = getTokenRemainingMs(token)

    if (remainingMs === null || remainingMs <= 0) return

    // ขอ token ใหม่ล่วงหน้าก่อนหมดอายุ 60 วินาที (แต่อย่างน้อย 5 วินาทีก่อนหมด)
    const delayMs = Math.max(remainingMs - REFRESH_BUFFER_MS, 5000)

    refreshTimerId = setTimeout(() => {
      get().refreshAccessToken().catch(() => {
        // เงียบไว้ตรงนี้ — refreshAccessToken เคลียร์ session ให้อัตโนมัติถ้า refresh ไม่ผ่าน
      })
    }, delayMs)
  },

  // ขอ access_token ใหม่ผ่าน refresh_token HttpOnly cookie
  refreshAccessToken: async () => {
    if (inFlightRefresh) return inFlightRefresh

    inFlightRefresh = (async () => {
      try {
        const data = await refreshTokenAPI()
        setAccessTokenCookie(data.access_token, data.expires_in)
        set({ accessToken: data.access_token, isLoggedIn: true, isLoading: false })
        get().scheduleRefresh(data.access_token)
        return data.access_token
      } catch (error) {
        get().clearSession()
        throw error
      } finally {
        inFlightRefresh = null
      }
    })()

    return inFlightRefresh
  },

  // กู้คืน Session อัตโนมัติเมื่อเปิดเว็บหรือกด F5
  initSession: async () => {
    if (sessionInitPromise) return sessionInitPromise

    sessionInitPromise = (async () => {
      set({ isLoading: true })
      try {
        const cookieToken = getAccessTokenCookie()
        const remainingMs = getTokenRemainingMs(cookieToken)

        // 1. ถ้ามี access_token ใน Cookie และยังไม่หมดอายุ -> กู้คืน Session
        if (cookieToken && remainingMs && remainingMs > 5000) {
          const cachedUser = getCachedUserProfile()

          if (cachedUser) {
            // Instant 0-Network Restore ทันที ไม่ยิง Request ไป Backend
            set({
              user: cachedUser,
              accessToken: cookieToken,
              isLoggedIn: true,
              isLoading: false
            })
            get().scheduleRefresh(cookieToken)
            useVillageStore.getState().initSelectedVillage(cachedUser)

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
            get().scheduleRefresh(cookieToken)
            useVillageStore.getState().initSelectedVillage(normalizedUser)

            if (profile?.id) {
              getUserAvatarBlobURL(profile.id)
                .then((url) => get().setAvatarUrl(url))
                .catch(() => get().setAvatarUrl(null))
            }
            return
          } catch (profileErr) {
            // ถ้าดึง Profile ไม่สำเร็จ (อาจถูก revoke token) -> ไหลต่อไปขั้นตอน Refresh Token
          }
        }

        // 2. ถ้าไม่มี access_token หรือหมดอายุแล้ว -> ใช้ refresh_token HttpOnly cookie ไปขอ Token ใหม่
        const data = await refreshTokenAPI({ silent: true })
        setAccessTokenCookie(data.access_token, data.expires_in)
        set({ accessToken: data.access_token })
        const profile = await getMyProfileAPI()
        const normalizedUser = normalizeUser(profile)
        setCachedUserProfile(normalizedUser)
        set({
          user: normalizedUser,
          isLoggedIn: true,
          isLoading: false
        })
        get().scheduleRefresh(data.access_token)
        useVillageStore.getState().initSelectedVillage(normalizedUser)

        if (profile?.id) {
          getUserAvatarBlobURL(profile.id)
            .then((url) => get().setAvatarUrl(url))
            .catch(() => get().setAvatarUrl(null))
        }
      } catch (error) {
        get().clearSession()
      } finally {
        sessionInitPromise = null
      }
    })()

    return sessionInitPromise
  },

  // Logout ปกติ
  logout: async () => {
    try {
      await logoutAPI()
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      get().clearSession()
    }
  },

  // เคลียร์ Session, ลบ Cookie, แคช Profile และรีเซ็ตทุก Store
  clearSession: () => {
    const wasLoggedIn = get().isLoggedIn
    const currentAvatar = get().avatarUrl
    if (currentAvatar) {
      URL.revokeObjectURL(currentAvatar)
    }
    clearRefreshTimer()
    removeAccessTokenCookie()
    removeCachedUserProfile()
    inFlightRefresh = null
    sessionInitPromise = null
    set({ user: null, accessToken: null, avatarUrl: null, isLoggedIn: false, isLoading: false })
    useVillageStore.getState().reset()
    useNotificationStore.getState().reset()

    if (wasLoggedIn) {
      logoutChannel?.postMessage({ type: 'logout', at: Date.now() })
    }
  }
}))

// ฟังสัญญาณ logout จากแท็บอื่น
if (logoutChannel) {
  logoutChannel.onmessage = (event) => {
    if (event.data?.type !== 'logout') return
    if (!useAuthStore.getState().isLoggedIn) return

    clearRefreshTimer()
    removeAccessTokenCookie()
    removeCachedUserProfile()
    inFlightRefresh = null
    sessionInitPromise = null
    useAuthStore.setState({ user: null, accessToken: null, avatarUrl: null, isLoggedIn: false, isLoading: false })
    useVillageStore.getState().reset()
    useNotificationStore.getState().reset()
  }
}

export default useAuthStore