import axios from 'axios'
import Cookies from 'js-cookie'

// Base URL ของ backend
// พอย้าย server แก้แค่บรรทัดนี้พอ
const BASE_URL = 'http://192.168.100.211:8000'

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
// หมายเหตุ: ไม่ครอบ try/catch ในนี้ เพื่อให้ error (เช่น 401 username/password ผิด)
// หลุดออกไปให้ฝั่งที่เรียกใช้ (Login.jsx) ดักจับเองผ่าน catch
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

// ดึงรายการ Blacklist — รองรับ filter ตามป้ายทะเบียน/จังหวัด และแบ่งหน้า (pagination)
// คืนค่าเป็น { items, total, page, page_size } ตามที่ backend ส่งมา
export async function getBlacklistAPI({ villageId, licensePlate, province, page = 1, pageSize = 100 } = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (licensePlate) params.license_plate = licensePlate
  if (province) params.province = province

  const response = await api.get('/api/blacklist', { params })
  return response.data
}

// เพิ่มรายการ Blacklist ใหม่
export async function createBlacklistAPI(villageId, licensePlate, province, reason) {
  const response = await api.post('/api/blacklist', {
    village_id: villageId,
    license_plate: licensePlate,
    province,
    reason
  })
  return response.data
}

// ลบรายการ Blacklist ตาม id (UUID)
export async function deleteBlacklistAPI(entryId) {
  const response = await api.delete(`/api/blacklist/${entryId}`)
  return response.data
}
// แก้ไขรายการ Blacklist (PATCH) — schema ตรงกับที่เดาไว้ ไม่ต้องแก้
export async function updateBlacklistAPI(entryId, { licensePlate, province, reason } = {}) {
  const payload = {}
  if (licensePlate !== undefined) payload.license_plate = licensePlate
  if (province !== undefined) payload.province = province
  if (reason !== undefined) payload.reason = reason

  const response = await api.patch(`/api/blacklist/${entryId}`, payload)
  return response.data
}
// ==================== Whitelist APIs ====================
// ยืนยันจาก Swagger จริง — ต่างจาก blacklist ตรงที่ไม่มี "reason"
// แต่มี category (resident/regular/guest), name (ชื่อเจ้าของ/ผู้พักอาศัย), note แทน

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

// ดึงรายการ Audit Log — filter ตาม action/user/village และช่วงวันที่ + pagination
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

// ขอลิงก์รีเซ็ตรหัสผ่าน — backend จะส่งอีเมลที่มี token แนบไปให้
export async function forgotPasswordAPI(email) {
  const response = await api.post('/api/auth/forgot-password', { email })
  return response.data
}

// ตั้งรหัสผ่านใหม่ด้วย token ที่ได้จากลิงก์ในอีเมล
export async function setPasswordAPI(token, newPassword, confirmNewPassword) {
  const response = await api.post('/api/auth/set-password', {
    token,
    new_password: newPassword,
    confirm_new_password: confirmNewPassword
  })
  return response.data
}
// ==================== Change Password API (สำหรับ user ที่ login อยู่แล้ว) ====================
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
// ==================== Camera Live Detection API ====================
export async function getCameraLiveAPI(cameraId, limit = 5) {
  const response = await api.get('/api/detections/live', {
    params: { camera_id: cameraId, limit }
  })
  return response.data
}

// ==================== Camera Management APIs (CRUD สำหรับหน้า Camera Management) ====================
// หมายเหตุ field ของ backend: lat/long (ไม่ใช่ lon), ไม่มี status online/offline
// มีแค่ is_active (เปิด/ปิดใช้งานกล้อง) และ ai_vision_synced_at (เวลาซิงค์ล่าสุดกับ AI Vision)
// stream_url เป็นค่าที่ backend generate ให้เองจาก stream_ai (RTSP source) ห้ามส่งตอน create/update

// ดึงรายการกล้องแบบเต็ม พร้อม pagination — ต่างจาก getCamerasAPI ด้านบนที่ใช้แค่ทำ dropdown
export async function getCameraListAPI({ villageId, isActive, page = 1, pageSize = 100 } = {}) {
  const params = { page, page_size: pageSize }
  if (villageId) params.village_id = villageId
  if (isActive !== undefined) params.is_active = isActive

  const response = await api.get('/api/cameras', { params })
  return response.data // { items, total, page, page_size }
}

// ดึงข้อมูลกล้องตัวเดียว
export async function getCameraByIdAPI(cameraId) {
  const response = await api.get(`/api/cameras/${cameraId}`)
  return response.data
}

// เพิ่มกล้องใหม่ — ต้องระบุ village_id เสมอ (backend คืน 404 "Village not found" ถ้า village_id ไม่มีจริง)
export async function createCameraAPI(villageId, name, lat, long, streamAi) {
  const response = await api.post('/api/cameras', {
    village_id: villageId,
    name,
    lat,
    long,
    stream_ai: streamAi
  })
  return response.data
}

// แก้ไขกล้อง (PATCH) — ส่งเฉพาะ field ที่จะอัปเดต เช่น { name, lat, long, stream_ai, is_active }
export async function updateCameraAPI(cameraId, payload) {
  const response = await api.patch(`/api/cameras/${cameraId}`, payload)
  return response.data
}

// ลบกล้อง
export async function deleteCameraAPI(cameraId) {
  const response = await api.delete(`/api/cameras/${cameraId}`)
  return response.data
}

// สั่งซิงค์กล้องทั้งหมดกับ AI Vision ใหม่ทั้งระบบ
export async function resyncAllCamerasAPI() {
  const response = await api.post('/api/cameras/resync-all')
  return response.data
}

// สั่งซิงค์กล้องตัวเดียวกับ AI Vision ใหม่
export async function resyncCameraAiVisionAPI(cameraId) {
  const response = await api.post(`/api/cameras/${cameraId}/resync-ai-vision`)
  return response.data
}

// ==================== Detections (History) API ====================
export async function getDetectionsAPI(params) {
  const response = await api.get('/api/detections', { params })
  return response.data // { items, total, page, page_size }
}

// ดึงรูปภาพแบบแนบ Bearer token (เพราะ endpoint รูปมี auth คุ้มครองอยู่)
// คืนค่าเป็น blob URL ชั่วคราวไว้ใส่ใน <img src>
export async function getAuthedImageURL(imageEndpointUrl) {
  const response = await api.get(imageEndpointUrl, { responseType: 'blob' })
  return URL.createObjectURL(response.data)
}
// ==================== Auth APIs ====================

// Logout — บอก backend ให้ invalidate session/token
// ไม่ต้องส่ง body ใด ๆ, token แนบไปกับ header อัตโนมัติผ่าน interceptor อยู่แล้ว
export async function logoutAPI() {
  const response = await api.post('/api/auth/logout')
  return response.data
}
// ==================== Report APIs ====================

// สรุปรายวัน — ใช้กับ KPI cards + กราฟ hourly ของวันที่เลือกจาก DatePicker
export async function getReportDailyAPI({ villageId, date } = {}) {
  const params = { date }
  if (villageId) params.village_id = villageId

  const response = await api.get('/api/reports/daily', { params })
  return response.data
}

// สรุปแบบช่วงหลายวัน (1-60 วัน) — ใช้กับตาราง Top Frequent Visitors
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
  return response.data // { items, total, page, page_size }
}
// ==================== Profile API ====================

// ดูข้อมูลบัญชีตัวเอง — ใช้ได้ทุก role ที่ login สำเร็จ (เช็คจาก token ไม่เช็ค role)
// GET อย่างเดียว ยังไม่มี endpoint แก้ไข (PATCH) จาก backend
export async function getMyProfileAPI() {
  const response = await api.get('/api/users/me')
  return response.data
}
// ==================== Contacts API ====================
// content_type: 'phone' | 'line' | 'facebook' | 'instagram' | 'email' | 'other'
// custom_label ส่งเฉพาะตอน content_type === 'other' เท่านั้น
export async function createContactAPI({ userId, contentType, value, customLabel }) {
  const payload = { user_id: userId, content_type: contentType, value }
  if (contentType === 'other' && customLabel) {
    payload.custom_label = customLabel
  }
  const response = await api.post('/api/contacts', payload)
  return response.data
}

// แก้ไขช่องทางการติดต่อ — ส่งเฉพาะ field ที่เปลี่ยน (ทุก field เป็น optional ฝั่ง backend)
export async function updateContactAPI(contactId, { contentType, value, customLabel } = {}) {
  const payload = {}
  if (contentType !== undefined) payload.content_type = contentType
  if (value !== undefined) payload.value = value
  if (customLabel !== undefined) payload.custom_label = customLabel

  const response = await api.patch(`/api/contacts/${contactId}`, payload)
  return response.data
}

// ลบช่องทางการติดต่อ
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
  return response.data // { items, total, page, page_size }
}

// ไม่มี field password ตอนสร้าง — backend เป็นระบบ invite ผ่านอีเมล
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

// PATCH นี้แก้ได้แค่ is_active เท่านั้น (ยืนยันจาก schema UserStatusUpdate)
export async function updateUserStatusAPI(userId, isActive) {
  const response = await api.patch(`/api/users/${userId}`, { is_active: isActive })
  return response.data
}

export async function deleteUserAPI(userId) {
  const response = await api.delete(`/api/users/${userId}`)
  return response.data
}

// admin พิมพ์รหัสใหม่เอง ไม่ใช่ auto-generate (ยืนยันจาก schema จริง)
export async function resetUserPasswordAPI(userId, newPassword, confirmNewPassword) {
  const response = await api.post(`/api/users/${userId}/reset-password`, {
    new_password: newPassword,
    confirm_new_password: confirmNewPassword
  })
  return response.data // { detail, username }
}

export async function resendInviteAPI(userId) {
  const response = await api.post(`/api/users/${userId}/resend-invite`)
  return response.data
}

// ==================== Village Management ====================
// ⚠️ ยังไม่มี schema VillageCreate ยืนยัน — เดาตาม field ที่น่าจะมี ถ้าผิดส่ง schema มาแก้จุดเดียว
export async function createVillageAPI(name, address) {
  const response = await api.post('/api/villages', { name, address })
  return response.data
}
// แก้ไขหมู่บ้าน (PATCH) — ใช้ทั้งเปลี่ยนชื่อ และ suspend/activate
// ส่งเฉพาะ field ที่จะอัปเดต ตาม schema { name?, is_active? }
export async function updateVillageAPI(villageId, { name, isActive } = {}) {
  const payload = {}
  if (name !== undefined) payload.name = name
  if (isActive !== undefined) payload.is_active = isActive

  const response = await api.patch(`/api/villages/${villageId}`, payload)
  return response.data
}