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
import { isEmailValid, getEmailErrorMessage } from '../utils/passwordPolicy'
const SKIP_API_FOR_DEV = false

// เวลานับถอยหลังก่อนกดขอส่งอีเมลใหม่ได้ (วินาที)
const RESEND_COOLDOWN_SECONDS = 30

function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [emailError, setEmailError] = useState('')

  // นับถอยหลังปุ่ม "ส่งอีกครั้ง" ทีละ 1 วินาที
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

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
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setIsSubmitting(false)
    }, 500) // หน่วงเล็กน้อยให้เห็น loading state จริงๆ ก่อน ไม่ใช่โผล่ทันทีจนดูแปลก
    return
  }

  try {
    await forgotPasswordAPI(email.trim())
    setIsSent(true)
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
  } catch (error) {
    console.error(error)
    if (error.response && error.response.status < 500) {
      setIsSent(true)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
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
                      onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
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
                เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่ <strong>{email}</strong> แล้ว
                กรุณาเปิดอีเมลและกดลิงก์เพื่อดำเนินการต่อ
              </p>
              <button
                type="button"
                className="fp-resend"
                disabled={resendCooldown > 0}
                onClick={handleResend}
              >
                {resendCooldown > 0
                  ? `ส่งอีกครั้งใน ${resendCooldown} วินาที`
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