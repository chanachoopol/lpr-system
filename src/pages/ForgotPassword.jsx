import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaEye, FaEyeSlash, FaArrowLeft } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { motion } from 'framer-motion'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import '../styles/ForgotPassword.css'
import { mockUserData } from '../data/mockData'
import { pageVariants, pageTransition } from '../animations/pageTransition'

// จำนวนหลักของ OTP ที่จำลอง
const OTP_LENGTH = 6

// เวลานับถอยหลังก่อนกดขอ OTP ใหม่ได้ (วินาที)
const RESEND_COOLDOWN_SECONDS = 30

function generateMockOtp() {
  return Math.floor(Math.random() * 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0')
}

function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1 = กรอกเบอร์โทร, 2 = กรอก OTP, 3 = ตั้งรหัสใหม่
  const [phone, setPhone] = useState('')
  const [matchedUser, setMatchedUser] = useState(null)
  const [generatedOtp, setGeneratedOtp] = useState('')
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // นับถอยหลังปุ่ม "ส่งอีกครั้ง" ทีละ 1 วินาที
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  function sendOtpTo(targetUser) {
    const otp = generateMockOtp()
    setGeneratedOtp(otp)
    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setResendCooldown(RESEND_COOLDOWN_SECONDS)

    // จำลองการส่ง SMS ด้วย SweetAlert (backend/SMS gateway จริงยังไม่พร้อม)
    Swal.fire({
      icon: 'info',
      title: 'ส่ง OTP แล้ว (จำลอง)',
      html: `รหัส OTP สำหรับเบอร์ ${targetUser.phone} คือ <strong>${otp}</strong><br/><small>เมื่อเชื่อม SMS gateway จริง ข้อความนี้จะไม่โชว์รหัสตรงนี้อีก</small>`,
      confirmButtonColor: 'var(--sidebar-bg)'
    })
  }

  function handleRequestOtp(e) {
    e.preventDefault()

    const found = mockUserData.find((u) => u.phone === phone.trim())

    if (!found) {
      Swal.fire({
        icon: 'error',
        title: 'ไม่พบบัญชีนี้',
        text: 'ไม่พบเบอร์โทรนี้ในระบบ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setMatchedUser(found)
    sendOtpTo(found)
    setStep(2)
  }

  function handleResendOtp() {
    if (resendCooldown > 0 || !matchedUser) return
    sendOtpTo(matchedUser)
  }

  function handleOtpDigitChange(index, value) {
    // รับแค่ตัวเลขตัวเดียวต่อช่อง
    const digit = value.replace(/[^0-9]/g, '').slice(-1)
    const updated = [...otpDigits]
    updated[index] = digit
    setOtpDigits(updated)

    // ขยับ focus ไปช่องถัดไปอัตโนมัติเมื่อกรอกครบ 1 หลัก
    if (digit && index < OTP_LENGTH - 1) {
      const nextBox = document.getElementById(`otp-box-${index + 1}`)
      nextBox?.focus()
    }
  }

  function handleOtpKeyDown(index, e) {
    // กด Backspace ในช่องว่าง ให้ย้อนกลับไปช่องก่อนหน้า
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      const prevBox = document.getElementById(`otp-box-${index - 1}`)
      prevBox?.focus()
    }
  }

  function handleVerifyOtp(e) {
    e.preventDefault()
    const otpInput = otpDigits.join('')

    if (otpInput.length < OTP_LENGTH || otpInput !== generatedOtp) {
      Swal.fire({
        icon: 'error',
        title: 'รหัส OTP ไม่ถูกต้อง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setStep(3)
  }

  function handleResetPassword(e) {
    e.preventDefault()

    if (!newPassword || newPassword.length < 6) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านสั้นเกินไป',
        text: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านไม่ตรงกัน',
        text: 'กรุณายืนยันรหัสผ่านให้ตรงกัน',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    // TODO: ตอน backend พร้อม ให้เรียก API เปลี่ยนรหัสผ่านจริงตรงนี้แทน
    Swal.fire({
      icon: 'success',
      title: 'ตั้งรหัสผ่านใหม่สำเร็จ',
      text: 'กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่',
      confirmButtonColor: 'var(--sidebar-bg)'
    }).then(() => {
      navigate('/')
    })
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

          <h2 className="r-title">Forgot Password</h2>
          <p className="r-sub">
            {step === 1 && 'กรอกเบอร์โทรที่ผูกกับบัญชีของคุณ'}
            {step === 2 && `กรอกรหัส OTP ที่ส่งไปยังเบอร์ ${matchedUser?.phone}`}
            {step === 3 && 'ตั้งรหัสผ่านใหม่'}
          </p>

          <div className="fp-steps">
            <div className="fp-step">
              <span className={`fp-step-dot ${step >= 1 ? 'active' : ''}`}>1</span>
              <span className={`fp-step-label ${step >= 1 ? 'active' : ''}`}>Send OTP</span>
            </div>
            <span className={`fp-step-line ${step >= 2 ? 'active' : ''}`}></span>
            <div className="fp-step">
              <span className={`fp-step-dot ${step >= 2 ? 'active' : ''}`}>2</span>
              <span className={`fp-step-label ${step >= 2 ? 'active' : ''}`}>Verify</span>
            </div>
            <span className={`fp-step-line ${step >= 3 ? 'active' : ''}`}></span>
            <div className="fp-step">
              <span className={`fp-step-dot ${step >= 3 ? 'active' : ''}`}>3</span>
              <span className={`fp-step-label ${step >= 3 ? 'active' : ''}`}>Reset Password</span>
            </div>
          </div>

          {step === 1 && (
            <form onSubmit={handleRequestOtp}>
              <div className="f-group">
                <label className="f-label">เบอร์โทร</label>
                <div className="f-row">
                  <input
                    type="tel"
                    className="f-box"
                    placeholder="เบอร์โทรที่ผูกกับบัญชี"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn">ส่งรหัส OTP</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleVerifyOtp}>
              <div className="f-group">
                <label className="f-label">รหัส OTP</label>
                <div className="fp-otp-row">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-box-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className="fp-otp-box"
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    />
                  ))}
                </div>
              </div>

              <button type="submit" className="btn">ยืนยัน OTP</button>

              <button
                type="button"
                className="fp-resend"
                disabled={resendCooldown > 0}
                onClick={handleResendOtp}
              >
                {resendCooldown > 0
                  ? `ส่งอีกครั้งใน ${resendCooldown} วินาที`
                  : 'ไม่ได้รับ OTP? ส่งอีกครั้ง'}
              </button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleResetPassword}>
              <div className="f-group">
                <label className="f-label">รหัสผ่านใหม่</label>
                <div className="f-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="f-box"
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <span className="eye-icon" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </span>
                </div>
              </div>
              <div className="f-group">
                <label className="f-label">ยืนยันรหัสผ่านใหม่</label>
                <div className="f-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="f-box"
                    placeholder="พิมพ์อีกครั้ง"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn">บันทึกรหัสผ่านใหม่</button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default ForgotPassword