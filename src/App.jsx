import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Monitor from './pages/Monitor' // 1. นำเข้าหน้า Monitor 

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor" element={<Monitor />} /> {/* 2. เพิ่มเส้นทางหน้า Monitor */}
      </Routes>
    </BrowserRouter>
  )
}

export default App