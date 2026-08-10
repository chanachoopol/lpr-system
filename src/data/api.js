import axios from 'axios'
import Cookies from 'js-cookie'

// =======================
// Environment
// =======================
const BASE_URL = import.meta.env.VITE_API_URL
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// =======================
// Axios Instance
// =======================
export const api = axios.create({
  baseURL: BASE_URL
})

// =======================
// Attach Token ทุก Request
// =======================
api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

// =======================
// Login API
// =======================
export async function loginAPI(username, password) {

  // ---------- Mock ----------
  if (USE_MOCK) {

    const mockAccounts = [
      { id: 1, username: 'admin', password: '1234', role: 'admin' },
      { id: 2, username: 'superadmin', password: '1234', role: 'superadmin' },
      { id: 3, username: 'user', password: '1234', role: 'user' }
    ]

    const matched = mockAccounts.find(
      account =>
        account.username === username &&
        account.password === password
    )

    if (!matched) {
      throw new Error('Username หรือ Password ไม่ถูกต้อง')
    }

    return {
      access_token: `mock-token-${matched.id}`,
      token_type: 'bearer',
      user: {
        id: matched.id,
        username: matched.username,
        role: matched.role
      }
    }
  }

  // ---------- Backend ----------
  const formData = new URLSearchParams()

  formData.append('grant_type', 'password')
  formData.append('username', username)
  formData.append('password', password)
  formData.append('scope', '')
  formData.append('client_id', 'string')
  formData.append('client_secret', 'string')

  const response = await api.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    }
  })

  return response.data
}

// =======================
// History API
// =======================
export async function getDetections(page = 1, pageSize = 20) {

  // ---------- Mock ----------
  if (USE_MOCK) {
    return {
      items: [
        {
          id: 1,
          license_plate: 'กข 1234',
          province: 'กรุงเทพมหานคร',
          color: 'ขาว',
          time_detect: '2026-07-31T10:00:00Z',
          is_blacklist: false
        },
        {
          id: 2,
          license_plate: 'ฮฮ 8197',
          province: 'เชียงใหม่',
          color: 'แดง',
          time_detect: '2026-07-31T10:10:00Z',
          is_blacklist: true
        }
      ],
      total: 2,
      page,
      page_size: pageSize
    }
  }

  // ---------- Backend ----------
  const response = await api.get('/detections', {
    params: {
      page,
      page_size: pageSize
    }
  })

  return response.data
}