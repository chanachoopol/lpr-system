import { useNavigate, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
import Spinner from '../components/Spinner'

const LOCKOUT_UNTIL_KEY = 'lpr_login_lockout_until'
const FAILED_ATTEMPTS_KEY = 'lpr_login_failed_attempts'
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_SEC = 300 // 5 นาที

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

  // Rate Limit / Lockout tracking (Sync ข้ามทุกแท็บ & ป้องกัน Refresh F5)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [isLocked, setIsLocked] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  // ตรวจสอบสถานะการล็อคเมื่อเปิดหน้าจอ หรือเมื่อแท็บอื่นมีการอัปเดต storage
  useEffect(() => {
    function checkStoredLockout() {
      try {
        const storedUntil = localStorage.getItem(LOCKOUT_UNTIL_KEY)
        const storedAttempts = parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10)

        if (storedUntil) {
          const remainingMs = parseInt(storedUntil, 10) - Date.now()
          if (remainingMs > 0) {
            const remainingSec = Math.ceil(remainingMs / 1000)
            setIsLocked(true)
            setLockoutSeconds(remainingSec)
            setFailedAttempts(MAX_ATTEMPTS)
            return
          } else {
            // หมดเวลาแล้ว ล้างข้อมูลออก
            localStorage.removeItem(LOCKOUT_UNTIL_KEY)
            localStorage.removeItem(FAILED_ATTEMPTS_KEY)
            setIsLocked(false)
            setLockoutSeconds(0)
            setFailedAttempts(0)
          }
        } else {
          setFailedAttempts(isNaN(storedAttempts) ? 0 : storedAttempts)
        }
      } catch (err) {
        console.error('อ่านสถานะ lockout จาก localStorage ไม่สำเร็จ:', err)
      }
    }

    checkStoredLockout()

    // Sync ข้ามแท็บอัตโนมัติเมื่อแท็บอื่นมีการอัปเดต storage
    function handleStorageChange(e) {
      if (e.key === LOCKOUT_UNTIL_KEY || e.key === FAILED_ATTEMPTS_KEY) {
        checkStoredLockout()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Timer นับถอยหลังวินาทีต่อวินาที
  useEffect(() => {
    if (!isLocked || lockoutSeconds <= 0) return

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false)
          setFailedAttempts(0)
          try {
            localStorage.removeItem(LOCKOUT_UNTIL_KEY)
            localStorage.removeItem(FAILED_ATTEMPTS_KEY)
          } catch {}
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isLocked, lockoutSeconds])

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
    const val = e.target.value
    setUsername(val)
    if (val.length > 36) {
      setUsernameError('Username ต้องไม่เกิน 36 ตัวอักษร')
    } else {
      setUsernameError('')
    }
  }

  function handlePasswordChange(e) {
    setPassword(e.target.value)
    if (passwordError) setPasswordError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (isLocked) {
      Swal.fire({
        icon: 'warning',
        title: 'บัญชีถูกระงับการใช้งานชั่วคราว',
        text: `กรุณารอสักครู่ (${formatCountdown(lockoutSeconds)} นาที) ก่อนลองใหม่อีกครั้ง`,
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
      setFailedAttempts(0)
      setIsLocked(false)
      try {
        localStorage.removeItem(LOCKOUT_UNTIL_KEY)
        localStorage.removeItem(FAILED_ATTEMPTS_KEY)
      } catch {}

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
      const isBackendLocked =
        status === 429 ||
        (typeof detail === 'string' &&
          (detail.toLowerCase().includes('locked') ||
            detail.toLowerCase().includes('too many') ||
            detail.includes('ระงับ') ||
            detail.includes('ล็อค')))

      const newFailedCount = failedAttempts + 1
      setFailedAttempts(newFailedCount)
      try {
        localStorage.setItem(FAILED_ATTEMPTS_KEY, String(newFailedCount))
      } catch {}

      const remainingAttempts = Math.max(0, MAX_ATTEMPTS - newFailedCount)

      // ถ้า backend แจ้งว่าถูกล็อค หรือล็อกอินผิดสะสมครบ 5 ครั้ง
      if (isBackendLocked || newFailedCount >= MAX_ATTEMPTS) {
        const lockUntil = Date.now() + (LOCKOUT_DURATION_SEC * 1000)
        try {
          localStorage.setItem(LOCKOUT_UNTIL_KEY, String(lockUntil))
        } catch {}

        setIsLocked(true)
        setLockoutSeconds(LOCKOUT_DURATION_SEC)

        await Swal.fire({
          icon: 'error',
          title: 'บัญชีถูกระงับชั่วคราว',
          text: 'คุณกรอกรหัสผ่านไม่ถูกต้องเกินจำนวนครั้งที่กำหนด ระบบได้ระงับการเข้าสู่ระบบชั่วคราวเป็นเวลา 5 นาที กรุณารอจนกว่าจะครบเวลาที่กำหนด',
          confirmButtonText: 'รับทราบ',
          confirmButtonColor: 'var(--sidebar-bg)',
          allowOutsideClick: false,
          allowEscapeKey: false
        })
        return
      }

      // รอบที่ 1-2: แสดงข้อความปกติ / รอบที่ 3-4: ค่อยแจ้งเตือนจำนวนครั้งที่เหลือ
      const errorMessage =
        newFailedCount >= 3
          ? `Username หรือ Password ไม่ถูกต้อง (เหลือโอกาสอีก ${remainingAttempts} ครั้งก่อนบัญชีจะถูกระงับ)`
          : 'Username หรือ Password ไม่ถูกต้อง'

      await Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: errorMessage,
        confirmButtonText: 'ลองอีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  const MAX_ATTEMPTS = 5

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
            {/* Lockout & Progressive Warning Banner (No Emojis) */}
            {isLocked ? (
              <div className="login-lockout-banner">
                <div className="lockout-info">
                  <strong>บัญชีถูกระงับการใช้งานชั่วคราว</strong>
                  <p>
                    สามารถลองใหม่ได้ในอีก <span className="lockout-timer">{formatCountdown(lockoutSeconds)}</span> นาที
                  </p>
                </div>
              </div>
            ) : failedAttempts >= 3 ? (
              <div className="login-warning-banner">
                <div className="warning-info">
                  <p>
                    รหัสผ่านไม่ถูกต้อง (เหลือโอกาสอีก <strong>{Math.max(0, MAX_ATTEMPTS - failedAttempts)}</strong> ครั้งก่อนบัญชีจะถูกระงับ)
                  </p>
                </div>
              </div>
            ) : null}

            <div className="f-group">
              <label className="f-label">Username</label>
              <div className="f-row">
                <input
                  type="text"
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
              {isSubmitting ? 'Signing in...' : isLocked ? `Locked (${formatCountdown(lockoutSeconds)})` : 'Access Control'}
            </button>
          </form>

          {!isLocked && (
            <p className="forgot">
              <span onClick={() => navigate('/forgot-password')}>Forgot password?</span>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default Login