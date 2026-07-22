import axios from 'axios'
import Cookies from 'js-cookie'

// ตั้งค่า Base URL ไว้ที่เดียว
// พอ Backend พร้อม แก้แค่บรรทัดนี้พอ
const BASE_URL = 'http://localhost:8000'

// สร้าง axios instance
// ทุก request จะใช้ตัวนี้ ไม่ต้องตั้งค่าซ้ำทุกครั้ง
export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// แนบ token ทุก request อัตโนมัติ
// ไม่ต้องใส่ token เองทุกครั้ง
api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Mock accounts ไว้ก่อน Backend พร้อม
// เพิ่มครบ 3 role เพื่อเทส role-based UI (user / admin / superadmin)
const mockAccounts = [
  { id: 1, username: 'admin', password: '1234', role: 'admin' },
  { id: 2, username: 'superadmin', password: '1234', role: 'superadmin' },
  { id: 3, username: 'user', password: '1234', role: 'user' }
]

// ฟังก์ชัน Login
// Mock ไว้ก่อน พอ Backend พร้อมค่อยเปิด axios จริง
export async function loginAPI(username, password) {

  // --- Mock ไว้ก่อน ลบทิ้งตอน Backend พร้อม ---
  const matched = mockAccounts.find(
    (account) => account.username === username && account.password === password
  )

  if (matched) {
    return {
      success: true,
      access_token: `mock-token-${matched.id}`,
      user: {
        id: matched.id,
        username: matched.username,
        role: matched.role
      }
    }
  }

  return { success: false }

  // --- เปิดใช้ตอน Backend พร้อม ---
  // const response = await api.post('/api/auth/login', {
  //   username,
  //   password
  // })
  // return response.data
}