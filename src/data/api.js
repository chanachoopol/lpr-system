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