import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { motion } from 'framer-motion'
import cctvImg from '../assets/bg43.png'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import { loginAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import { pageVariants, pageTransition } from '../animations/pageTransition'

function Login() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e) {
  e.preventDefault()
  setIsSubmitting(true)

  try {
    const result = await loginAPI(username, password)

    // เก็บข้อมูลลง Zustand + Cookie
    login(result.user, result.access_token, remember)

    // ไปหน้า Dashboard
    navigate('/dashboard')

  } catch (error) {
    console.error(error)

    await Swal.fire({
      icon: 'error',
      title: 'เข้าสู่ระบบไม่สำเร็จ',
      text: 'Username หรือ Password ไม่ถูกต้อง',
      confirmButtonText: 'ลองอีกครั้ง',
      confirmButtonColor: 'var(--sidebar-bg)'
    })

    setIsSubmitting(false)
  }
}

  return (
    <div className="bg">
      <div className="cloud-track">
        <img src={bg1} className="cloud-img" alt="" />
        <img src={bg1} className="cloud-img" alt="" />
        <img src={bg1} className="cloud-img" alt="" />
        <img src={bg1} className="cloud-img" alt="" />
      </div>

      <div className="glow-1"></div>
      <div className="glow-2"></div>
      <div className="grain-overlay"></div>

      <motion.div
        className="card"
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
      >
        {/* ฝั่งซ้าย */}
        <div className="card-left">
          <img src={cctvImg} alt="CCTV" className="cctv-img" />
        </div>

        {/* ฝั่งขวา */}
        <div className="card-right">
          <h2 className="r-title">Welcome back !</h2>
          <p className="r-sub">Sign in to access the system</p>

          <form onSubmit={handleSubmit}>
            <div className="f-group">
              <label className="f-label">Username</label>
              <div className="f-row">
                <input
                  type="text"
                  className="f-box"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="f-group">
              <label className="f-label">Password</label>
              <div className="f-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="f-box"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <span
                    className="eye-icon"
                    onClick={() => setShowPassword(!showPassword)}
                    >
                    {showPassword ? <FaEye /> : <FaEyeSlash />}
                </span>
              </div>
            </div>

            <div className="remember">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <label htmlFor="remember">Remember me</label>
            </div>

            <button type="submit" className="btn" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Access Control'}
            </button>
          </form>

          <p className="forgot">
            Forgot password? <span onClick={() => navigate('/forgot-password')}>Reset password</span>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default Login