import { create } from 'zustand'
import { refreshTokenAPI, logoutAPI, getMyProfileAPI, getUserAvatarBlobURL } from '../data/api'
import useVillageStore from './villageStore'
import useNotificationStore from './notificationStore'

const ACCESS_TOKEN_LIFETIME_MS = 300 * 60 * 1000 // 300 นาที ตามที่ backend ยืนยัน (ACCESS_TOKEN_EXPIRE_MINUTES)
const REFRESH_BUFFER_MS = 60 * 1000 // ขอ token ใหม่ก่อนหมดอายุจริง 60 วิ กัน network latency/clock skew

let refreshTimerId = null

// เก็บ promise ของการ refresh ที่กำลังทำอยู่ไว้ระดับ module (ไม่ใช่ state ของ store)
// เพราะต้อง dedupe ข้าม caller ทุกทาง — ทั้งจาก scheduleRefresh (timer) และจาก axios interceptor
// ที่อาจเจอ 401 พร้อมกันจากหลาย request วิ่งขนานกัน ถ้าไม่ share promise ตัวเดียวกัน แต่ละตัวจะยิง
// /auth/refresh ของตัวเอง และถ้า backend ทำ refresh-token rotation (revoke token เก่าทันทีที่ใช้ 1 ครั้ง)
// request ที่ยิงทีหลังจะได้ token ที่ถูก revoke ไปแล้ว ทำให้ user โดน clearSession ทั้งที่ session จริงยังไม่หมดอายุ
let inFlightRefresh = null
let sessionInitPromise = null

// ช่องสัญญาณสำหรับ sync สถานะ logout ข้ามแท็บของ origin เดียวกัน — ไม่ต้องกด refresh หน้าเว็บ
// แท็บไหน clearSession() ก่อน จะ broadcast บอกแท็บอื่นให้เคลียร์ session ตัวเองตามทันที
// รองรับทุก browser หลักยกเว้น Safari เก่ามาก (<15.4) — ถ้าไม่รองรับ ก็แค่ไม่ sync ข้ามแท็บ ไม่ error
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

// เก็บ access_token ใน memory เท่านั้น (ไม่ persist ลง cookie/localStorage อีกต่อไป)
// session ยาวจริงๆ อยู่ที่ refresh_token httpOnly cookie ซึ่ง backend คุมทั้งหมด
// frontend มีหน้าที่แค่ขอ access_token ใหม่ผ่าน /api/auth/refresh ตอน token ใกล้หมดอายุ
const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  avatarUrl: null, // blob URL ของรูปโปรไฟล์ผู้ใช้ (sync ข้าม Navbar/Sidebar/Profile)
  isLoggedIn: false,
  isLoading: true, // true ตอนเริ่มแอป ระหว่างเช็คว่ามี session ค้างอยู่จาก refresh cookie ไหม

  // อัปเดตข้อมูล user บางส่วน (เช่น fullname) ให้ Navbar/Sidebar re-render ทันที
  updateUser: (partialUser) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...partialUser } : null
    }))
  },

  // อัปเดต avatarUrl ใน store พร้อมเคลียร์ blob เก่ากัน memory leak
  setAvatarUrl: (newUrl) => {
    const prev = get().avatarUrl
    if (prev && prev !== newUrl) {
      URL.revokeObjectURL(prev)
    }
    set({ avatarUrl: newUrl })
  },

  // เรียกตอน login สำเร็จจาก Login.jsx — ไม่แตะ cookie เลย backend set refresh_token ให้เองแล้ว
  login: (user, accessToken) => {
    set({ user, accessToken, isLoggedIn: true, isLoading: false })
    get().scheduleRefresh()
    if (user?.id) {
      getUserAvatarBlobURL(user.id)
        .then((url) => get().setAvatarUrl(url))
        .catch(() => get().setAvatarUrl(null))
    }
  },

  getAccessToken: () => get().accessToken,

  // ตั้ง timer ขอ token ใหม่ล่วงหน้าก่อนหมดอายุจริง (แนวคิดเดียวกับ scheduleNext ใน useCameraStream.js)
  scheduleRefresh: () => {
    clearRefreshTimer()
    refreshTimerId = setTimeout(() => {
      get().refreshAccessToken().catch(() => {
        // เงียบไว้ตรงนี้พอ — refreshAccessToken เคลียร์ state ให้เองแล้วถ้าพัง
      })
    }, ACCESS_TOKEN_LIFETIME_MS - REFRESH_BUFFER_MS)
  },

  // ขอ access_token ใหม่ผ่าน refresh_token cookie — ใช้ทั้งตอน silent refresh (timer)
  // และตอน api.js interceptor เจอ 401
  //
  // 👇 สำคัญ: ใช้ inFlightRefresh (module-level) เป็นตัว dedupe — ถ้ามีการ refresh ทำงานอยู่แล้ว
  // caller ตัวถัดไปจะได้ promise ตัวเดียวกันกลับไป ไม่ยิง /auth/refresh ซ้ำ
  refreshAccessToken: async () => {
    if (inFlightRefresh) return inFlightRefresh

    inFlightRefresh = (async () => {
      try {
        const data = await refreshTokenAPI()
        set({ accessToken: data.access_token, isLoggedIn: true, isLoading: false })
        get().scheduleRefresh()
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

  // เรียกตอน App mount ครั้งแรกเท่านั้น — แทนที่ loadFromStorage เดิมที่เคยอ่าน cookie เอง
  // ตอนนี้ frontend ไม่มี cookie ให้อ่านแล้ว (refresh_token เป็น httpOnly) ต้องถาม backend แทน
  //
  // ส่ง { silent: true } ไปให้ refreshTokenAPI แนบเป็น axios config พิเศษ (ดู api.js) เพื่อบอก
  // response interceptor ว่า "นี่คือการเช็ค session เฉยๆ ตอนเปิดแอป ไม่ใช่ error จริง" — ถ้าเจอ 401
  // ตรงนี้ ห้าม redirect ไปหน้า login เอง (เดี๋ยว catch ด้านล่างจัดการ set isLoggedIn: false ให้เอง
  // ปกติของเคสนี้คือ "ไม่เคย login" หรือ "refresh token หมดอายุแล้ว" ซึ่งไม่ใช่ error ที่ควร alert user)
  initSession: async () => {
    if (sessionInitPromise) return sessionInitPromise

    sessionInitPromise = (async () => {
      set({ isLoading: true })
      try {
        const data = await refreshTokenAPI({ silent: true })
        set({ accessToken: data.access_token })   // 👈 set token ให้ store ก่อน ให้ interceptor เห็นทัน
        const profile = await getMyProfileAPI()    // 👈 ตอนนี้ request นี้จะมี Authorization header แนบไปแล้ว
        set({
          user: profile,
          isLoggedIn: true,
          isLoading: false
        })
        get().scheduleRefresh()
        useVillageStore.getState().initSelectedVillage(profile)

        // โหลดรูป avatar สำหรับ Navbar/Sidebar
        if (profile?.id) {
          try {
            const avatar = await getUserAvatarBlobURL(profile.id)
            get().setAvatarUrl(avatar)
          } catch {
            get().setAvatarUrl(null)
          }
        }
      } catch (error) {
        set({ isLoading: false, isLoggedIn: false, user: null, accessToken: null, avatarUrl: null })
      }
    })()

    return sessionInitPromise
  },

  // logout ปกติที่ user กดเอง — เรียก backend ให้ revoke + clear cookie ให้เรียบร้อยก่อน
  logout: async () => {
    try {
      await logoutAPI()
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      get().clearSession()
    }
  },

  // ใช้ตอนเจอ 401 ที่ระบุว่า session ถูกลบไปแล้วจากฝั่ง server (ไม่ต้องเรียก logout API ซ้ำ)
  // และใช้เป็น cleanup กลางที่ logout()/refreshAccessToken() เรียกใช้ร่วมกัน
  clearSession: () => {
    const wasLoggedIn = get().isLoggedIn // 👈 เช็คก่อนเคลียร์ กันกรณี broadcast ตอนที่ session ไม่เคย login เลย
    const currentAvatar = get().avatarUrl
    if (currentAvatar) {
      URL.revokeObjectURL(currentAvatar)
    }
    clearRefreshTimer()
    inFlightRefresh = null
    sessionInitPromise = null
    set({ user: null, accessToken: null, avatarUrl: null, isLoggedIn: false, isLoading: false })
    useVillageStore.getState().reset()
    useNotificationStore.getState().reset()

    // แจ้งแท็บอื่นว่า session นี้ถูก logout แล้ว — ยิงเฉพาะตอนเปลี่ยนจาก login -> logout จริงๆ
    // (ไม่ยิงตอน initSession ล้มเหลวเพราะไม่เคย login มาก่อน กันสัญญาณหลอกไปแท็บอื่น)
    if (wasLoggedIn) {
      logoutChannel?.postMessage({ type: 'logout', at: Date.now() })
    }
  }
}))

// ฟังสัญญาณ logout จากแท็บอื่น — ถ้าแท็บนี้ยัง login อยู่ ให้เคลียร์ session ทันทีโดยไม่ต้อง refresh หน้า
// ไม่เรียก useAuthStore.getState().clearSession() ตรงๆ เพราะจะ broadcast ซ้ำออกไปอีกรอบโดยไม่จำเป็น
// (setState ตรงๆ ทำให้ component ที่ subscribe อยู่ เช่น ProtectedRoute re-render ทันทีเหมือนกัน)
if (logoutChannel) {
  logoutChannel.onmessage = (event) => {
    if (event.data?.type !== 'logout') return
    if (!useAuthStore.getState().isLoggedIn) return // แท็บนี้ logout ไปแล้ว ไม่ต้องทำอะไรซ้ำ

    clearRefreshTimer()
    inFlightRefresh = null
    sessionInitPromise = null
    useAuthStore.setState({ user: null, accessToken: null, isLoggedIn: false, isLoading: false })
    useVillageStore.getState().reset()
    useNotificationStore.getState().reset()
  }
}

export default useAuthStore