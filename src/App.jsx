import { useEffect } from 'react'
import { useThemeStore } from './store/themeStore'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import useAuthStore from './store/authStore'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Monitor from './pages/Monitor'
import History from './pages/History'
import Blacklist from './pages/Blacklist'
import Report from './pages/Report'
import UserManagement from './pages/UserManagement'
import CameraManagement from './pages/CameraManagement'


function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/history" element={<History />} />
        <Route path="/blacklist" element={<Blacklist />} />
        <Route path="/report" element={<Report />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/cameras" element={<CameraManagement />} />
      </Routes>
    </AnimatePresence>
  )
}

function App() {
  const theme = useThemeStore((state) => state.theme)
  const { loadFromStorage } = useAuthStore()

  // อ่าน cookie และ restore สถานะ login ทันทีตอน app เริ่มต้น
  // ป้องกัน sidebar/layout หาย ตอนกด refresh หรือ Vite hot reload
  useEffect(() => {
    loadFromStorage()
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}

export default App