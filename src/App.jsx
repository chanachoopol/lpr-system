import { useEffect } from 'react'
import { useThemeStore } from './store/themeStore'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import useAuthStore from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Monitor from './pages/Monitor'
import History from './pages/History'
import Blacklist from './pages/Blacklist'
import Report from './pages/Report'
import UserManagement from './pages/UserManagement'
import CameraManagement from './pages/CameraManagement'
import AuditLog from './pages/AuditLog'
import ResetPassword from './pages/ResetPassword'
import ChangePassword from './pages/ChangePassword'
import Profile from './pages/Profile'

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public routes — ไม่ต้อง login */}
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/set-password" element={<ResetPassword />} />

        {/* Protected routes — ต้อง login ทุก role */}
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/monitor" element={
          <ProtectedRoute><Monitor /></ProtectedRoute>
        } />
        <Route path="/history" element={
          <ProtectedRoute><History /></ProtectedRoute>
        } />
        <Route path="/blacklist" element={
          <ProtectedRoute><Blacklist /></ProtectedRoute>
        } />
        <Route path="/report" element={
          <ProtectedRoute><Report /></ProtectedRoute>
        } />
        <Route path="/change-password" element={
          <ProtectedRoute><ChangePassword /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />

        {/* Admin routes — เฉพาะ admin และ superadmin */}
        <Route path="/users" element={
          <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
            <UserManagement />
          </ProtectedRoute>
        } />
        <Route path="/cameras" element={
          <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
            <CameraManagement />
          </ProtectedRoute>
        } />
        {<Route path="/audit-logs" element={
          <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
            <AuditLog />
          </ProtectedRoute>
          } />}
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