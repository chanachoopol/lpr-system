import { useEffect } from 'react'
import { useThemeStore } from './store/themeStore' // เช็ก path ให้ตรงกับโฟลเดอร์ที่น้องเมษาสร้างไว้นะครับ
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Monitor from './pages/Monitor'
import History from './pages/History'
import Blacklist from './pages/Blacklist'
import Report from './pages/Report'

function App() {
  const theme = useThemeStore((state) => state.theme)

  // ให้ React คอยแปะหรือดึง Class 'dark' ออก ตามค่าของ theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/history" element={<History />} />
        <Route path="/blacklist" element={<Blacklist />} />
        <Route path="/report" element={<Report />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App