import { useNavigate, Navigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
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
import { isUsernameValid, getUsernameErrorMessage, isLoginPasswordValid, getPasswordErrorMessage, stripEmoji } from '../utils/passwordPolicy'
import Spinner from '../components/Spinner'
import CookieNotice from '../components/CookieNotice'

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
  const formRef = useRef(null)

  // Rate Limit / Lockout tracking (จัดการใน Memory: นับเวลาสดๆ และรีเซ็ตเมื่อผู้ใช้กด F5)
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  // Timer นับถอยหลังวินาทีต่อวินาที
  useEffect(() => {
    if (!isLocked || lockoutSeconds <= 0) return

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false)
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isLocked, lockoutSeconds])

  // ดักจับการกดปุ่ม Enter ทุกจุดบนหน้า Login
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if (e.key === 'Enter') {
        if (Swal.isVisible() || isLocked || isSubmitting) return
        const activeTag = document.activeElement?.tagName?.toLowerCase()
        if (activeTag === 'button' && document.activeElement?.type !== 'submit') return

        formRef.current?.requestSubmit()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isLocked, isSubmitting])

  function formatCountdown(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner text="กำลังตรวจสอบการเข้าสู่ระบบ..." />
      </div>
    )
  }

  // login อยู่แล้ว (ไม่ว่าจะ login เองในแท็บนี้ หรือ cookie จากแท็บอื่นถูก restore มา) → เด้งไป dashboard เลย ไม่ต้องโชว์ฟอร์ม
  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />
  }

  function handleUsernameChange(e) {
    const val = stripEmoji(e.target.value)
    setUsername(val)
    if (val.length > 36) {
      setUsernameError('Username ต้องไม่เกิน 36 ตัวอักษร')
    } else {
      setUsernameError('')
    }
  }

  function handlePasswordChange(e) {
    const val = stripEmoji(e.target.value)
    setPassword(val)
    if (passwordError) setPasswordError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (isLocked) {
      Swal.fire({
        icon: 'warning',
        title: 'บัญชีถูกระงับการใช้งานชั่วคราว',
        text: `กรุณารอสักครู่ (${lockoutSeconds} วินาที) ก่อนลองใหม่อีกครั้ง`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const trimmedUser = username.trim()
    let userErr = ''
    let passErr = ''

    if (!trimmedUser) {
      userErr = 'กรุณากรอก Username'
    } else if (trimmedUser.length < 4) {
      userErr = 'Username ต้องมีอย่างน้อย 4 ตัวอักษร'
    } else if (trimmedUser.length > 36) {
      userErr = 'Username ต้องไม่เกิน 36 ตัวอักษร'
    }

    if (!password) {
      passErr = 'กรุณากรอกรหัสผ่าน'
    }

    setUsernameError(userErr)
    setPasswordError(passErr)

    if (userErr || passErr) return

    setIsSubmitting(true)

    try {
      const result = await loginAPI(trimmedUser, password, remember)

      // รีเซ็ตตัวนับเมื่อเข้าสู่ระบบสำเร็จ
      setIsLocked(false)

      // เก็บข้อมูลลง Zustand (accessToken อยู่ใน memory, refresh_token เป็น httpOnly cookie ที่ backend set ให้เอง)
      login(result.user, result.access_token)

      // ตั้งค่าหมู่บ้านเริ่มต้นตาม role
      // superadmin -> ทุกหมู่บ้าน (null), admin/user -> ล็อกหมู่บ้านตัวเอง
      useVillageStore.getState().initSelectedVillage(result.user)

      // ไปหน้า Dashboard
      navigate('/dashboard')

    } catch (error) {
      console.error(error)
      setIsSubmitting(false)

      const status = error.response?.status
      const detail = error.response?.data?.detail
      const retryAfterHeader = error.response?.headers?.['retry-after'] || error.response?.headers?.['Retry-After']
      const dataLockedSec = error.response?.data?.locked_for_seconds || error.response?.data?.retry_after

      let dynamicSeconds = null
      if (retryAfterHeader && !isNaN(parseInt(retryAfterHeader, 10))) {
        dynamicSeconds = parseInt(retryAfterHeader, 10)
      } else if (dataLockedSec && !isNaN(parseInt(dataLockedSec, 10))) {
        dynamicSeconds = parseInt(dataLockedSec, 10)
      } else if (typeof detail === 'string') {
        const secMatch = detail.match(/(\d+)\s*(วินาที|วิ|seconds|sec|s\b)/i)
        const minMatch = detail.match(/(\d+)\s*(นาที|minutes|min|m\b)/i)
        if (secMatch) {
          dynamicSeconds = parseInt(secMatch[1], 10)
        } else if (minMatch) {
          dynamicSeconds = parseInt(minMatch[1], 10) * 60
        }
      }

      const isBackendLocked =
        status === 429 ||
        dynamicSeconds !== null ||
        (typeof detail === 'string' &&
          (detail.toLowerCase().includes('locked') ||
            detail.toLowerCase().includes('too many') ||
            detail.includes('ระงับ') ||
            detail.includes('ล็อค')))

      if (isBackendLocked) {
        const durationSec = dynamicSeconds || 5
        const lockUntil = Date.now() + durationSec * 1000
        try {
          localStorage.setItem(LOCKOUT_UNTIL_KEY, String(lockUntil))
        } catch {}

        setIsLocked(true)
        setLockoutSeconds(durationSec)

        await Swal.fire({
          icon: 'error',
          title: 'บัญชีถูกระงับชั่วคราว',
          text: typeof detail === 'string' ? detail : `ระบบได้ระงับการเข้าสู่ระบบชั่วคราวเป็นเวลา ${durationSec} วินาที กรุณารอจนกว่าจะครบเวลาที่กำหนด`,
          confirmButtonText: 'รับทราบ',
          confirmButtonColor: 'var(--sidebar-bg)',
          allowOutsideClick: false,
          allowEscapeKey: false
        })
        return
      }

      // แสดงข้อความตามที่ Backend ส่งมาโดยตรง
      const errorMessage = typeof detail === 'string' ? detail : 'Username หรือ Password ไม่ถูกต้อง'
      await Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: errorMessage,
        confirmButtonText: 'ลองอีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
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

          <form ref={formRef} onSubmit={handleSubmit}>
            {/* Lockout Banner (No Emojis) */}
            {isLocked && (
              <div className="login-lockout-banner">
                <div className="lockout-info">
                  <strong>บัญชีถูกระงับการใช้งานชั่วคราว</strong>
                  <p>
                    สามารถลองใหม่ได้ในอีก {lockoutSeconds} วินาที
                  </p>
                </div>
              </div>
            )}

            <div className="f-group">
              <label className="f-label">Username</label>
              <div className="f-row">
                <input
                  type="text"
                  autoFocus
                  className={`f-box ${usernameError ? 'f-box-error' : ''}`}
                  placeholder="กรอก Username ของคุณ"
                  value={username}
                  maxLength={50}
                  onChange={handleUsernameChange}
                  autoComplete="username"
                  disabled={isLocked || isSubmitting}
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
                  placeholder="กรอกรหัสผ่านของคุณ"
                  value={password}
                  onChange={handlePasswordChange}
                  autoComplete="current-password"
                  disabled={isLocked || isSubmitting}
                />
                <span className="eye-icon" onClick={() => !isLocked && setShowPassword(!showPassword)}>
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
                disabled={isLocked || isSubmitting}
              />
              <label htmlFor="remember">Remember me</label>
            </div>

            <button type="submit" className="btn" disabled={isLocked || isSubmitting}>
              {isSubmitting ? 'Signing in...' : isLocked ? `Locked (${formatCountdown(lockoutSeconds)})` : 'Login'}
            </button>
          </form>

          {!isLocked && (
            <p className="forgot">
              <span onClick={() => navigate('/forgot-password')}>Forgot password?</span>
            </p>
          )}
        </div>
      </motion.div>
      <CookieNotice />
    </div>
  )
}

export default Login