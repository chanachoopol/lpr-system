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
// ==================== Camera API ====================
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