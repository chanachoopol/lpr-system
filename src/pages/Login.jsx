import { useNavigate, Navigate } from 'react-router-dom' 
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { motion } from 'framer-motion'
import cctvImg from '../assets/bg43.png'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import { loginAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import { pageVariants, pageTransition } from '../animations/pageTransition'
import { isUsernameValid, getUsernameErrorMessage, isLoginPasswordValid, getPasswordErrorMessage } from '../utils/passwordPolicy'


function Login() {
  const navigate = useNavigate()
  const { login, isLoggedIn, isLoading } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  async function handleSubmit(e) {
  e.preventDefault()

  const usernameErr = isUsernameValid(username) ? '' : getUsernameErrorMessage(username)
  const passwordErr = isLoginPasswordValid(password) ? '' : getPasswordErrorMessage(password)

  setUsernameError(usernameErr)
  setPasswordError(passwordErr)

  if (usernameErr || passwordErr) return

  setIsSubmitting(true)

  try {
    const result = await loginAPI(username.trim(), password, remember)

    // เก็บข้อมูลลง Zustand + Cookie
    login(result.user, result.access_token)

    // ตั้งค่าหมู่บ้านเริ่มต้นตาม role
    // superadmin -> ทุกหมู่บ้าน (null), admin/user -> ล็อกหมู่บ้านตัวเอง
    useVillageStore.getState().initSelectedVillage(result.user)

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
                  className={`f-box ${usernameError ? 'f-box-error' : ''}`}
                  placeholder="Enter your username"
                  value={username}
                  maxLength={36}
                  onChange={(e) => { setUsername(e.target.value); setUsernameError('') }}
                  autoComplete="username"
                />
              </div>
              {usernameError && <p className="f-error-text">{usernameError}</p>}
            </div>

            <div className="f-group">
              <label className="f-label">Password</label>
              <div className="f-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`f-box ${passwordError ? 'f-box-error' : ''}`}
                  placeholder="Enter your password"
                  value={password}
                  maxLength={36}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError('') }}
                  autoComplete="current-password"
                />
                <span className="eye-icon" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEye /> : <FaEyeSlash />}
                </span>
              </div>
              {passwordError && <p className="f-error-text">{passwordError}</p>}
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
            <span onClick={() => navigate('/forgot-password')}>Forgot password?</span>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default Login