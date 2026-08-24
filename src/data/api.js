import axios from 'axios'
import Cookies from 'js-cookie'

// Base URL ของ backend
// พอย้าย server แก้แค่บรรทัดนี้พอ
export const BASE_URL = 'http://192.168.100.211:8000'

// สร้าง axios instance สำหรับ request ทั่วไป (JSON)
export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// แนบ token ทุก request อัตโนมัติ
api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ฟังก์ชัน Login — ใช้ form-urlencoded ตามที่ backend กำหนด (OAuth2 standard)
export async function loginAPI(username, password) {
  const formData = new URLSearchParams()
  formData.append('grant_type', 'password')
  formData.append('username', username)
  formData.append('password', password)

  const response = await axios.post(
    `${BASE_URL}/api/auth/login`,
    formData,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

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

export async function getCameraLiveAPI(cameraId, limit = 5) {
  const response = await api.get('/api/detections/live', {
    params: { camera_id: cameraId, limit }
  })
  return response.data
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
// ticket สำหรับ presence stream (online/offline) แยกจาก ticket ของ alert (getSSEAlertsTicketAPI)
// ตามข้อตกลง: ไม่ส่ง village_id เลยไม่ว่า role ไหน
// - user/admin ห้ามส่งอยู่แล้ว (backend คืนหมู่บ้านตัวเองให้อัตโนมัติ)
// - superadmin เลือกไม่ส่งเพื่อความง่าย (ได้ snapshot ทุกหมู่บ้านในคอนเนกชันเดียว ไม่ต้อง reconnect ตอนสลับหมู่บ้าน)
export async function getSSEPresenceTicketAPI() {
  const response = await api.post('/api/sse/presence/ticket')
  return response.data // { ticket }
}
// ==================== Route Tracking API ====================

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