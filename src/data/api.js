import axios from 'axios'

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
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ฟังก์ชัน Login
// Mock ไว้ก่อน พอ Backend พร้อมค่อยเปิด axios จริง
export async function loginAPI(username, password) {

  // --- Mock ไว้ก่อน ลบทิ้งตอน Backend พร้อม ---
  if (username === 'admin' && password === '1234') {
    return {
      success: true,
      access_token: 'mock-token-12345',
      user: {
        id: 1,
        username: 'admin',
        role: 'admin'
      }
    }
  } else {
    return { success: false }
  }

  // --- เปิดใช้ตอน Backend พร้อม ---
  // const response = await api.post('/api/auth/login', {
  //   username,
  //   password
  // })
  // return response.data
}