import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Monitor from './pages/Monitor'
import History from './pages/History'
import Blacklist from './pages/Blacklist'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/history" element={<History />} />
        <Route path="/blacklist" element={<Blacklist />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App