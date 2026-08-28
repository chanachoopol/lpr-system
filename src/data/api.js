import axios from 'axios'
import useAuthStore from '../store/authStore'

// Base URL ของ backend
// พอย้าย server แก้แค่บรรทัดนี้พอ
export const BASE_URL = ''

// สร้าง axios instance สำหรับ request ทั่วไป (JSON)
export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // 👈 ต้องมี ไม่งั้น cookie httpOnly ของ refresh token จะไม่ถูกส่ง/ไม่ถูกเก็บเลย
  headers: { 'Content-Type': 'application/json' }
})

// แนบ token ทุก request อัตโนมัติ
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ==================== Response Interceptor — จัดการ 401 แบบ global ====================
// กันเรียก /refresh ซ้ำพร้อมกันหลาย request (เช่นหน้า dashboard ยิงหลาย API พร้อมกันแล้วโดน 401 พร้อมกันหมด)
let isRefreshing = false
let refreshSubscribers = []

function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback)
}

function onRefreshed(newToken) {
  refreshSubscribers.forEach((callback) => callback(newToken))
  refreshSubscribers = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const status = error.response?.status

    if (!originalRequest || status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // 👇 รวม 2 เงื่อนไข "terminal failure" (ไม่มีทางกู้ session คืนได้แล้ว) เป็นก้อนเดียว
    // เพื่อให้ skipAuthRedirect มีผลกับทุกเคส ไม่ใช่แค่เคส url ตรงกับ /auth/refresh เท่านั้น
    // - error_code ใน body = backend บอกตรงๆ ว่า session ถูก revoke แล้ว (เปลี่ยนรหัสผ่าน/ปิดบัญชี/ปิดหมู่บ้าน ฯลฯ)
    // - request เองคือ /api/auth/refresh ที่ยัง 401 = ไม่มี token อะไรให้ refresh ต่อแล้วจริงๆ
    const hasErrorCode = error.response?.data && 'error_code' in error.response.data
    const isRefreshCallItself = originalRequest.url?.includes('/api/auth/refresh')

    if (hasErrorCode || isRefreshCallItself) {
      useAuthStore.getState().clearSession()
      // silent request (เช่นตอน initSession เช็ค session ตอน mount แอปครั้งแรก ยังไม่เคย login)
      // ไม่ต้อง redirect เอง ปล่อยให้ store จัดการ isLoggedIn: false เงียบๆ พอ
      if (!originalRequest.skipAuthRedirect) {
        window.location.href = '/'
      }
      return Promise.reject(error)
    }

    originalRequest._retry = true

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(api(originalRequest))
          } else {
            reject(error)
          }
        })
      })
    }

    isRefreshing = true
    try {
      const newToken = await useAuthStore.getState().refreshAccessToken()
      isRefreshing = false
      onRefreshed(newToken)
      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    } catch (refreshError) {
      isRefreshing = false
      onRefreshed(null)
      window.location.href = '/'
      return Promise.reject(refreshError)
    }
  }
)

// ฟังก์ชัน Login — ใช้ form-urlencoded ตามที่ backend กำหนด (OAuth2 standard)
// rememberMe: ตาม spec ที่ backend ยืนยัน — remember_me=true → refresh cookie อยู่ 7 วัน
// remember_me=false → session cookie + server-side expiry 12 ชม. (กัน browser restore session เก่า)
// ไม่ส่ง field นี้เลย = backend ถือเป็น false โดย default จึงต้องส่งเสมอ ไม่ปล่อยเป็น optional
//
// 👇 แก้: เปลี่ยนจาก axios.post ตรงๆ มาใช้ instance `api` แทน — endpoint นี้เป็นจุดที่ backend
// Set-Cookie refresh_token กลับมาเป็นครั้งแรก ถ้า request ไม่มี withCredentials: true
// (ซึ่ง axios เปล่าๆ ไม่มีให้โดย default) browser จะไม่เก็บ cookie httpOnly นี้ไว้เลยในกรณี cross-origin
// เป็นสาเหตุที่ auto-login ตอนเปิดแท็บใหม่ไม่เคยทำงาน เพราะไม่มี cookie ให้ /auth/refresh ใช้ตั้งแต่แรก
export async function loginAPI(username, password, rememberMe = false) {
  const formData = new URLSearchParams()
  formData.append('grant_type', 'password')
  formData.append('username', username)
  formData.append('password', password)
  formData.append('remember_me', rememberMe ? 'true' : 'false')

  const response = await api.post('/api/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })

  const data = response.data
  return {
    access_token: data.access_token,
    user: {
      id: data.user.id,
      username: data.user.username,
      fullName: data.user.fullname,
      email: data.user.email,
      role: data.user.role,
      is_active: data.user.is_active,
      village_id: data.user.village_id
    }
  }
}

// ==================== Blacklist APIs ====================

export async function getBlacklistAPI({ villageId, licensePlate, province, page = 1, pageSize = 100 } = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (licensePlate) params.license_plate = licensePlate
  if (province) params.province = province

  const response = await api.get('/api/blacklist', { params })
  return response.data
}

export async function createBlacklistAPI(villageId, licensePlate, province, reason) {
  const response = await api.post('/api/blacklist', {
    village_id: villageId,
    license_plate: licensePlate,
    province,
    reason
  })
  return response.data
}

export async function deleteBlacklistAPI(entryId) {
  const response = await api.delete(`/api/blacklist/${entryId}`)
  return response.data
}

export async function updateBlacklistAPI(entryId, { licensePlate, province, reason } = {}) {
  const payload = {}
  if (licensePlate !== undefined) payload.license_plate = licensePlate
  if (province !== undefined) payload.province = province
  if (reason !== undefined) payload.reason = reason

  const response = await api.patch(`/api/blacklist/${entryId}`, payload)
  return response.data
}

// ==================== Whitelist APIs ====================

export async function getWhitelistAPI({ villageId, category, name, licensePlate, province, page = 1, pageSize = 100 } = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (category) params.category = category
  if (name) params.name = name
  if (licensePlate) params.license_plate = licensePlate
  if (province) params.province = province

  const response = await api.get('/api/whitelist', { params })
  return response.data
}

export async function createWhitelistAPI(villageId, category, name, licensePlate, province, note) {
  const response = await api.post('/api/whitelist', {
    village_id: villageId,
    category,
    name,
    license_plate: licensePlate,
    province,
    note
  })
  return response.data
}

export async function updateWhitelistAPI(entryId, { category, name, licensePlate, province, note } = {}) {
  const payload = {}
  if (category !== undefined) payload.category = category
  if (name !== undefined) payload.name = name
  if (licensePlate !== undefined) payload.license_plate = licensePlate
  if (province !== undefined) payload.province = province
  if (note !== undefined) payload.note = note

  const response = await api.patch(`/api/whitelist/${entryId}`, payload)
  return response.data
}

export async function deleteWhitelistAPI(entryId) {
  const response = await api.delete(`/api/whitelist/${entryId}`)
  return response.data
}

// ==================== Audit Log APIs ====================

export async function getAuditLogsAPI({
  villageId,
  userId,
  action,
  createdAtFrom,
  createdAtTo,
  page = 1,
  pageSize = 20
} = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (userId) params.user_id = userId
  if (action) params.action = action
  if (createdAtFrom) params.created_at_from = createdAtFrom
  if (createdAtTo) params.created_at_to = createdAtTo

  const response = await api.get('/api/audit-logs', { params })
  return response.data
}

// ==================== Password Reset APIs ====================

export async function forgotPasswordAPI(email) {
  const response = await api.post('/api/auth/forgot-password', { email })
  return response.data
}

export async function setPasswordAPI(token, newPassword, confirmNewPassword) {
  const response = await api.post('/api/auth/set-password', {
    token,
    new_password: newPassword,
    confirm_new_password: confirmNewPassword
  })
  return response.data
}

export async function changePasswordAPI(currentPassword, newPassword, confirmNewPassword, logoutAllSessions = false) {
  const response = await api.post('/api/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
    confirm_new_password: confirmNewPassword,
    logout_all_sessions: logoutAllSessions
  })
  return response.data
}

// ==================== Camera API (สำหรับ dropdown เลือกกล้อง เช่น Monitor/History) ====================
export async function getCamerasAPI(villageId) {
  const response = await api.get('/api/cameras', {
    params: {
      village_id: villageId,
      is_active: true,
      page: 1,
      page_size: 100
    }
  })
  return response.data.items
}

export async function getCameraLiveAPI(cameraId, limit) {
  const res = await api.get('/api/detections/live', {
    params: { camera_id: cameraId, limit }
  })
  return res.data
}

// ==================== Camera Management APIs ====================
export async function getCameraListAPI({ villageId, isActive, page = 1, pageSize = 100 } = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (isActive !== undefined) params.is_active = isActive

  const response = await api.get('/api/cameras', { params })
  return response.data
}

export async function getCameraByIdAPI(cameraId) {
  const response = await api.get(`/api/cameras/${cameraId}`)
  return response.data
}

export async function createCameraAPI(villageId, name, lat, long, streamAi, direction) {
  const response = await api.post('/api/cameras', {
    village_id: villageId,
    name,
    lat,
    long,
    stream_ai: streamAi,
    direction
  })
  return response.data
}

export async function updateCameraAPI(cameraId, payload) {
  const response = await api.patch(`/api/cameras/${cameraId}`, payload)
  return response.data
}

export async function deleteCameraAPI(cameraId) {
  const response = await api.delete(`/api/cameras/${cameraId}`)
  return response.data
}

export async function resyncAllCamerasAPI() {
  const response = await api.post('/api/cameras/resync-all')
  return response.data
}

export async function resyncCameraAiVisionAPI(cameraId) {
  const response = await api.post(`/api/cameras/${cameraId}/resync-ai-vision`)
  return response.data
}
// ==================== Camera Status (MediaMTX) API ====================
export async function getCameraStatusAPI(cameraId) {
  const response = await api.get(`/api/cameras/${cameraId}/status`)
  return response.data // { id, is_active, verification_status, stream_online }
}
// ==================== Detections (History) API ====================
export async function getDetectionsAPI(params) {
  const response = await api.get('/api/detections', { params })
  return response.data
}

export async function getAuthedImageURL(imageEndpointUrl) {
  const response = await api.get(imageEndpointUrl, { responseType: 'blob' })
  return URL.createObjectURL(response.data)
}

// ==================== Auth APIs ====================
export async function logoutAPI() {
  const response = await api.post('/api/auth/logout')
  return response.data
}

// ==================== Refresh Token ====================
// ทำงานผ่าน refresh_token cookie (httpOnly, path=/api/auth) ไม่ต้องส่ง body ใดๆ
// คืนแค่ { access_token, token_type } เท่านั้น ไม่มีข้อมูล user มาด้วย
export async function refreshTokenAPI({ silent = false } = {}) {
  const response = await api.post('/api/auth/refresh', null, {
    skipAuthRedirect: silent
  })
  return response.data
}

// ==================== Report APIs ====================
export async function getReportDailyAPI({ villageId, date } = {}) {
  const params = { date }
  if (villageId) params.village_id = villageId

  const response = await api.get('/api/reports/daily', { params })
  return response.data
}

export async function getReportSummaryAPI({ villageId, days = 7 } = {}) {
  const params = { days }
  if (villageId) params.village_id = villageId

  const response = await api.get('/api/reports/summary', { params })
  return response.data
}

// ==================== Village API ====================
export async function getVillagesAPI({ isActive, search, page = 1, pageSize = 100 } = {}) {
  const params = { page, page_size: pageSize }
  if (isActive !== undefined) params.is_active = isActive
  if (search) params.search = search

  const response = await api.get('/api/villages', { params })
  return response.data
}

// ==================== Profile API ====================
export async function getMyProfileAPI() {
  const response = await api.get('/api/users/me')
  return response.data
}

// ==================== Contacts API ====================
export async function createContactAPI({ userId, contentType, value, customLabel }) {
  const payload = { user_id: userId, content_type: contentType, value }
  if (contentType === 'other' && customLabel) {
    payload.custom_label = customLabel
  }
  const response = await api.post('/api/contacts', payload)
  return response.data
}

export async function updateContactAPI(contactId, { contentType, value, customLabel } = {}) {
  const payload = {}
  if (contentType !== undefined) payload.content_type = contentType
  if (value !== undefined) payload.value = value
  if (customLabel !== undefined) payload.custom_label = customLabel

  const response = await api.patch(`/api/contacts/${contactId}`, payload)
  return response.data
}

export async function deleteContactAPI(contactId) {
  const response = await api.delete(`/api/contacts/${contactId}`)
  return response.data
}

// ==================== User Management APIs ====================
export async function getUsersAPI({
  villageId,
  role,
  isActive,
  search,
  page = 1,
  pageSize = 20
} = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (role) params.role = role
  if (isActive !== undefined) params.is_active = isActive
  if (search) params.search = search

  const response = await api.get('/api/users', { params })
  return response.data
}

export async function createUserAPI({ username, fullname, email, role, villageId }) {
  const response = await api.post('/api/users', {
    username,
    fullname,
    email,
    role,
    village_id: villageId || null
  })
  return response.data
}

export async function getUserDetailAPI(userId) {
  const response = await api.get(`/api/users/${userId}`)
  return response.data
}

export async function updateUserStatusAPI(userId, isActive) {
  const response = await api.patch(`/api/users/${userId}`, { is_active: isActive })
  return response.data
}

export async function deleteUserAPI(userId) {
  const response = await api.delete(`/api/users/${userId}`)
  return response.data
}

export async function resetUserPasswordAPI(userId, newPassword, confirmNewPassword) {
  const response = await api.post(`/api/users/${userId}/reset-password`, {
    new_password: newPassword,
    confirm_new_password: confirmNewPassword
  })
  return response.data
}

export async function resendInviteAPI(userId) {
  const response = await api.post(`/api/users/${userId}/resend-invite`)
  return response.data
}
export async function getLockedAccountsAPI() {
  const response = await api.get('/api/users/locked-accounts')
  return response.data
}

export async function unlockUserAccountAPI(userId) {
  const response = await api.post(`/api/users/${userId}/unlock-account`)
  return response.data
}

// ==================== Village Management ====================
export async function createVillageAPI(name, address) {
  const response = await api.post('/api/villages', { name, address })
  return response.data
}

export async function updateVillageAPI(villageId, { name, isActive } = {}) {
  const payload = {}
  if (name !== undefined) payload.name = name
  if (isActive !== undefined) payload.is_active = isActive

  const response = await api.patch(`/api/villages/${villageId}`, payload)
  return response.data
}

// ==================== SSE Alerts ====================
// ขอ ticket ก่อนเปิด stream เสมอ (ticket ใช้ได้ครั้งเดียว อายุสั้นมาก ~30 วิ ห้าม cache reuse)
export async function getSSEAlertsTicketAPI() {
  const response = await api.post('/api/sse/ticket')
  return response.data // { ticket }
}
// ==================== Notifications APIs ====================
export async function getNotificationsAPI({ isRead, page = 1, pageSize = 20 } = {}) {
  const params = { page, page_size: pageSize }
  if (isRead !== undefined) params.is_read = isRead

  const response = await api.get('/api/notifications', { params })
  return response.data
}

export async function getUnreadNotificationCountAPI() {
  const response = await api.get('/api/notifications/unread-count')
  return response.data
}

export async function markNotificationReadAPI(notificationId) {
  const response = await api.post(`/api/notifications/${notificationId}/read`)
  return response.data
}

export async function markAllNotificationsReadAPI() {
  const response = await api.post('/api/notifications/read-all')
  return response.data
}
// ==================== SSE Presence ====================
export async function getSSEPresenceTicketAPI() {
  const response = await api.post('/api/sse/presence/ticket')
  return response.data // { ticket }
}
// ==================== Route Tracking API ====================
export async function getRouteTrackingAPI({
  licensePlate,
  province,
  color,
  direction,
  villageId,
  dateFrom,
  dateTo,
  page = 1,
  pageSize = 20
} = {}) {
  const params = {
    license_plate: licensePlate,
    date_from: dateFrom,
    date_to: dateTo,
    page,
    page_size: pageSize
  }

  if (province) params.province = province
  if (color) params.color = color
  if (direction) params.direction = direction
  if (villageId) params.village_id = villageId

  try {
    const response = await api.get('/api/detections/route-tracking', {
      params
    })

    return response.data
  } catch (error) {
    console.log('Route Tracking 422 DETAIL:', error.response?.data)
    console.log('Route Tracking REQUEST:', error.config?.url)
    throw error
  }
}
export async function getContactsListAPI({ village_id, search, page = 1, page_size = 20 } = {}) {
  const params = { page, page_size }
  if (village_id) params.village_id = village_id
  if (search) params.search = search

  const response = await api.get('/api/contacts', { params })
  return response.data
}

export async function getUserContactsDetailAPI(userId) {
  const response = await api.get(`/api/contacts/users/${userId}`)
  return response.data
}
export async function getCameraStreamTokenAPI(cameraId) {
  const res = await api.get(`/api/cameras/${cameraId}/stream-token`)
  return res.data
}
// ==================== Dashboard Today API ====================
export async function getTodayDashboardAPI({ villageId, latestLimit = 10 } = {}) {
  const params = { latest_limit: latestLimit }
  if (villageId) params.village_id = villageId

  const response = await api.get('/api/detections/dashboard/today', { params })
  return response.data
}
// ==================== ONVIF Probe API ====================
export async function probeOnvifCameraAPI({ host, port, username, password }) {
  const response = await api.post('/api/cameras/onvif/probe', {
    host,
    port,
    username,
    password
  })
  return response.data
}
export async function deleteVillageAPI(villageId) {
  const response = await api.delete(`/api/villages/${villageId}`)
  return response.data
}
// ==================== User Avatar APIs ====================
export async function uploadUserAvatarAPI(userId, file) {
  const formData = new FormData()
  formData.append('avatar', file) // ⚠️ field name เดา — ยืนยันจาก Body_upload_user_avatar_api_users__user_id__avatar_post ให้ชัวร์อีกที
  const response = await api.post(`/api/users/${userId}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data
}

export async function deleteUserAvatarAPI(userId) {
  const response = await api.delete(`/api/users/${userId}/avatar`)
  return response.data
}

// คืน object URL ของรูป หรือ null ถ้า user ยังไม่เคยอัปโหลด avatar (คาดว่า backend ตอบ 404)
export async function getUserAvatarBlobURL(userId) {
  try {
    const response = await api.get(`/api/users/${userId}/avatar`, { responseType: 'blob' })
    return URL.createObjectURL(response.data)
  } catch (error) {
    if (error.response?.status === 404) return null
    throw error
  }
}

// ==================== Fullname Update ====================
// PATCH /api/users/{user_id}/profile — schema UserFullnameUpdate
// ⚠️ ตอนนี้ backend ยังไม่มี endpoint แก้ "username" โดยตรง มีแค่ fullname เท่านั้น
export async function updateUserFullnameAPI(userId, fullname) {
  const response = await api.patch(`/api/users/${userId}/profile`, { fullname })
  return response.data
}

// ==================== Email Change APIs ====================
export async function requestEmailChangeAPI(userId, newEmail) {
  const response = await api.post(`/api/users/${userId}/email-change`, { new_email: newEmail })
  return response.data
}

export async function confirmEmailChangeAPI(token) {
  const response = await api.post('/api/auth/confirm-email-change', { token })
  return response.data
}