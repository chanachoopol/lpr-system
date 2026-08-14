import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { FaTriangleExclamation } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import { motion } from 'framer-motion'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import '../styles/ForgotPassword.css'
import { setPasswordAPI } from '../data/api'
import { pageVariants, pageTransition } from '../animations/pageTransition'

// ต้องตรงกับ rule ฝั่ง backend (อ้างอิงจาก error message จริง: "Password must be at least 8 characters long")
const MIN_PASSWORD_LENGTH = 8

function CloudBackground() {
  return (
    <>
      <div className="cloud-track">
        <img src={bg1} className="cloud-img" alt="" />
        <img src={bg1} className="cloud-img" alt="" />
        <img src={bg1} className="cloud-img" alt="" />
        <img src={bg1} className="cloud-img" alt="" />
      </div>
      <div className="glow-1"></div>
      <div className="glow-2"></div>
      <div className="grain-overlay"></div>
    </>
  )
}

function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านสั้นเกินไป',
        text: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
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

    setIsSubmitting(true)
    try {
      await setPasswordAPI(token, newPassword, confirmPassword)

      await Swal.fire({
        icon: 'success',
        title: 'ตั้งรหัสผ่านใหม่สำเร็จ',
        text: 'กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      navigate('/')
    } catch (error) {
      console.error(error)

      // backend ส่ง validation message ที่อ่านรู้เรื่องมาใน detail อยู่แล้ว (เช่นตอนรหัสผ่านสั้นไป)
      // ส่วน token หมดอายุ/ไม่ถูกต้อง มักได้ 400/404 — ใช้ข้อความ fallback ให้ผู้ใช้ไปขอลิงก์ใหม่
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'ตั้งรหัสผ่านไม่สำเร็จ',
        text: backendMessage || 'ลิงก์อาจหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ไม่มี token แนบมาใน URL เลย → ลิงก์ผิดตั้งแต่ต้น ไม่ต้องโชว์ฟอร์มให้กรอกเปล่าๆ
  if (!token) {
    return (
      <div className="bg">
        <CloudBackground />
        <motion.div
          className="card fp-card"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          transition={pageTransition}
        >
          <div className="card-right fp-panel">
            <div className="fp-sent-state">
              <div className="fp-sent-icon invalid">
                <FaTriangleExclamation />
              </div>
              <h2 className="r-title">Invalid Link</h2>
              <p className="r-sub">
                ลิงก์นี้ไม่ถูกต้องหรือไม่สมบูรณ์ กรุณาขอลิงก์รีเซ็ตรหัสผ่านใหม่อีกครั้ง
              </p>
              <button type="button" className="btn" onClick={() => navigate('/forgot-password')}>
                ขอลิงก์ใหม่
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="bg">
      <CloudBackground />
      <motion.div
        className="card fp-card"
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
      >
        <div className="card-right fp-panel">
          <h2 className="r-title">Set New Password</h2>
          <p className="r-sub">ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>

          <form onSubmit={handleSubmit}>
            <div className="f-group">
              <label className="f-label">รหัสผ่านใหม่</label>
              <div className="f-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="f-box"
                  placeholder={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <span className="eye-icon" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEye /> : <FaEyeSlash />}
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
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button type="submit" className="btn" disabled={isSubmitting}>
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

export default ResetPassword