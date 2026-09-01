import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaArrowLeft } from 'react-icons/fa'
import { FaEnvelopeCircleCheck } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import { motion } from 'framer-motion'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import '../styles/ForgotPassword.css'
import { forgotPasswordAPI } from '../data/api'
import { pageVariants, pageTransition } from '../animations/pageTransition'
import { isEmailValid, getEmailErrorMessage, stripEmoji } from '../utils/passwordPolicy'
const SKIP_API_FOR_DEV = false

const FORGOT_PASSWORD_COOLDOWN_KEY = 'lpr_forgot_pwd_cooldown_until'
const FORGOT_PASSWORD_EMAIL_KEY = 'lpr_forgot_pwd_email'
const DEFAULT_COOLDOWN_SECONDS = 180

function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [emailError, setEmailError] = useState('')

  // ตรวจสอบสถานะการนับถอยหลังเมื่อเปิดหน้าเว็บ (ทนทานต่อการกด F5 Refresh)
  useEffect(() => {
    try {
      const storedUntil = localStorage.getItem(FORGOT_PASSWORD_COOLDOWN_KEY)
      const storedEmail = localStorage.getItem(FORGOT_PASSWORD_EMAIL_KEY)
      if (storedUntil) {
        const remainingSec = Math.ceil((parseInt(storedUntil, 10) - Date.now()) / 1000)
        if (remainingSec > 0) {
          setResendCooldown(remainingSec)
          setIsSent(true)
          if (storedEmail) setEmail(storedEmail)
        } else {
          localStorage.removeItem(FORGOT_PASSWORD_COOLDOWN_KEY)
        }
      }
    } catch (err) {
      console.error('อ่านสถานะ cooldown ไม่สำเร็จ:', err)
    }
  }, [])

  // นับถอยหลังปุ่ม "ส่งอีกครั้ง" อิงตามเวลาจริง (Real-time Clock Sync)
  useEffect(() => {
    if (resendCooldown <= 0) return

    const timer = setInterval(() => {
      try {
        const storedUntil = localStorage.getItem(FORGOT_PASSWORD_COOLDOWN_KEY)
        if (storedUntil) {
          const remainingSec = Math.ceil((parseInt(storedUntil, 10) - Date.now()) / 1000)
          if (remainingSec <= 0) {
            localStorage.removeItem(FORGOT_PASSWORD_COOLDOWN_KEY)
            setResendCooldown(0)
            clearInterval(timer)
          } else {
            setResendCooldown(remainingSec)
          }
        } else {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }
      } catch {
        setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [resendCooldown])

  function startCooldown(seconds, targetEmail) {
    const until = Date.now() + seconds * 1000
    try {
      localStorage.setItem(FORGOT_PASSWORD_COOLDOWN_KEY, String(until))
      if (targetEmail) localStorage.setItem(FORGOT_PASSWORD_EMAIL_KEY, targetEmail)
    } catch {}
    setResendCooldown(seconds)
  }

  function formatCooldown(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  async function sendResetLink(e) {
  e?.preventDefault()

  const errorMsg = getEmailErrorMessage(email)
  if (errorMsg) {
    setEmailError(errorMsg)
    Swal.fire({
      icon: 'warning',
      title: errorMsg,
      confirmButtonColor: 'var(--sidebar-bg)'
    })
    return
  }
  setEmailError('')

  setIsSubmitting(true)

  // ⚠️ TEMP BYPASS — ข้ามการยิง API จริง ไปหน้า "ส่งแล้ว" ทันที เพื่อทดสอบ UI flow ต่อได้
  if (SKIP_API_FOR_DEV) {
    setTimeout(() => {
      setIsSent(true)
      startCooldown(DEFAULT_COOLDOWN_SECONDS, email.trim())
      setIsSubmitting(false)
    }, 500)
    return
  }

  try {
    await forgotPasswordAPI(email.trim())
    setIsSent(true)
    startCooldown(DEFAULT_COOLDOWN_SECONDS, email.trim())
  } catch (error) {
    console.error(error)
    if (error.response?.status === 429) {
      const msg = typeof error.response.data?.detail === 'string'
        ? error.response.data.detail
        : 'กรุณารอสักครู่ ก่อนขอรหัสผ่านใหม่ได้อีกครั้ง'

      // สกัดตัวเลขนาทีหรือวินาทีจากข้อความ Backend แบบ Dynamic
      let waitSeconds = DEFAULT_COOLDOWN_SECONDS
      const matchMin = msg.match(/(\d+)\s*นาที/)
      const matchSec = msg.match(/(\d+)\s*วินาที/)
      if (matchMin) {
        waitSeconds = parseInt(matchMin[1], 10) * 60
      } else if (matchSec) {
        waitSeconds = parseInt(matchSec[1], 10)
      }

      // ถ้ามีเวลาคูลดาวน์เดิมอยู่แล้ว ให้ใช้เวลาเดิมที่เหลือจริง
      let currentRemaining = 0
      try {
        const storedUntil = localStorage.getItem(FORGOT_PASSWORD_COOLDOWN_KEY)
        if (storedUntil) {
          currentRemaining = Math.ceil((parseInt(storedUntil, 10) - Date.now()) / 1000)
        }
      } catch {}

      const actualWait = currentRemaining > 0 ? currentRemaining : waitSeconds
      startCooldown(actualWait, email.trim())

      Swal.fire({
        icon: 'warning',
        title: 'คำขอถี่เกินไป',
        text: msg,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      setIsSent(true)
    } else if (error.response && error.response.status < 500) {
      setIsSent(true)
      startCooldown(DEFAULT_COOLDOWN_SECONDS, email.trim())
    } else {
      Swal.fire({
        icon: 'error',
        title: 'ส่งอีเมลไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  } finally {
    setIsSubmitting(false)
  }
}

  function handleResend() {
    if (resendCooldown > 0) return
    sendResetLink()
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
        className="card fp-card"
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
      >
        <div className="card-right fp-panel">
          <button className="fp-back" onClick={() => navigate('/')}>
            <FaArrowLeft /> กลับไปหน้าเข้าสู่ระบบ
          </button>

          {!isSent ? (
            <>
              <h2 className="r-title">Forgot Password</h2>
              <p className="r-sub">
                กรอกอีเมลที่ผูกกับบัญชีของคุณ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้
              </p>

              <form onSubmit={sendResetLink}>
                <div className="f-group">
                  <label className="f-label">Email</label>
                  <div className="f-row">
                    <input
                      type="email"
                      className={`f-box ${emailError ? 'f-box-error' : ''}`}
                      placeholder="กรอกอีเมลของคุณ เช่น user@example.com"
                      value={email}
                      onChange={(e) => { setEmail(stripEmoji(e.target.value)); setEmailError('') }}
                      autoComplete="email"
                    />
                  </div>
                  {/* 👆 ปิด .f-row ตรงนี้ก่อน แล้วค่อยวาง error message ไว้นอกกล่อง flex */}
                  {emailError && <p className="f-error-text">{emailError}</p>}
                </div>

                <button type="submit" className="btn" disabled={isSubmitting}>
                  {isSubmitting ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                </button>
              </form>
            </>
          ) : (
            <div className="fp-sent-state">
              <div className="fp-sent-icon">
                <FaEnvelopeCircleCheck />
              </div>
              <h2 className="r-title">Check your email</h2>
              <p className="r-sub">
                หากอีเมลของคุณตรงกับบัญชีที่มีอยู่แล้ว เราจะส่งอีเมลสำหรับทำการตั้งค่ารหัสผ่านใหม่ไปที่อีเมลนั้นโดยเร็วที่สุด หากคุณไม่ได้รับอีเมลกรุณาตรวจสอบกล่องจดหมายขยะ
              </p>
              <button
                type="button"
                className="fp-resend"
                disabled={resendCooldown > 0 || isSubmitting}
                onClick={handleResend}
              >
                {resendCooldown > 0
                  ? `ส่งอีกครั้งได้ในอีก ${formatCooldown(resendCooldown)} นาที`
                  : isSubmitting
                    ? 'กำลังส่ง...'
                    : 'ไม่ได้รับอีเมล? ส่งอีกครั้ง'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default ForgotPassword