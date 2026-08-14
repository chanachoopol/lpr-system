import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaEye, FaEyeSlash, FaArrowLeft } from 'react-icons/fa'
import { FaKey } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { changePasswordAPI } from '../data/api'
import '../styles/ChangePassword.css'

// ต้องตรงกับ rule ฝั่ง backend (อ้างอิงจาก error message ตอนตั้งรหัสผ่านผ่านลิงก์อีเมล)
const MIN_PASSWORD_LENGTH = 8

const EMPTY_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  logoutAllSessions: false
}

function ChangePassword() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!formData.currentPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกรหัสผ่านปัจจุบัน',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (formData.newPassword.length < MIN_PASSWORD_LENGTH) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านใหม่สั้นเกินไป',
        text: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านใหม่ไม่ตรงกัน',
        text: 'กรุณายืนยันรหัสผ่านใหม่ให้ตรงกัน',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (formData.newPassword === formData.currentPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านใหม่ซ้ำกับรหัสเดิม',
        text: 'กรุณาตั้งรหัสผ่านใหม่ที่ไม่เหมือนรหัสผ่านปัจจุบัน',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsSubmitting(true)

    // ถามยืนยันก่อนเปลี่ยนรหัสผ่านจริง
    const confirmResult = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการเปลี่ยนรหัสผ่าน?',
      text: 'คุณจะต้องเข้าสู่ระบบใหม่หลังเปลี่ยนรหัสผ่านสำเร็จ',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'var(--sidebar-bg)',
      cancelButtonColor: '#9ca3af'
    })

    if (!confirmResult.isConfirmed) {
      setIsSubmitting(false)
      return
    }

    try {
      await changePasswordAPI(
        formData.currentPassword,
        formData.newPassword,
        formData.confirmPassword,
        formData.logoutAllSessions
      )

      await Swal.fire({
        icon: 'success',
        title: 'เปลี่ยนรหัสผ่านสำเร็จ',
        text: 'กรุณาเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่ของคุณ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })

      // บังคับ logout เสมอหลังเปลี่ยนรหัสผ่านสำเร็จ เพื่อความปลอดภัย
      logout()
      navigate('/')
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      const errorText = typeof backendMessage === 'string'
        ? backendMessage
        : Array.isArray(backendMessage)
          ? backendMessage.map((e) => e.msg).join(', ')
          : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'

      Swal.fire({
        icon: 'error',
        title: 'เปลี่ยนรหัสผ่านไม่สำเร็จ',
        text: errorText,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Layout title="Change Password">
      <div className="cp-page-wrapper">
        <div className="content-card cp-card">
          <button className="cp-back" onClick={() => navigate(-1)}>
            <FaArrowLeft /> ย้อนกลับ
          </button>

          <div className="cp-page-header">
            <div className="cp-page-icon"><FaKey /></div>
            <div>
              <h2 className="cp-page-title">เปลี่ยนรหัสผ่าน</h2>
              <p className="cp-page-sub">เพื่อความปลอดภัย กรุณายืนยันรหัสผ่านปัจจุบันก่อนตั้งรหัสผ่านใหม่</p>
            </div>
          </div>

          <form className="cp-form" onSubmit={handleSubmit}>
            <div className="cp-field">
              <label>รหัสผ่านปัจจุบัน</label>
              <input
                type={showPassword ? 'text' : 'password'}
                name="currentPassword"
                placeholder="กรอกรหัสผ่านปัจจุบัน"
                value={formData.currentPassword}
                onChange={handleChange}
                autoComplete="current-password"
              />
            </div>

            <div className="cp-field">
              <label>รหัสผ่านใหม่</label>
              <input
                type={showPassword ? 'text' : 'password'}
                name="newPassword"
                placeholder={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
                value={formData.newPassword}
                onChange={handleChange}
                autoComplete="new-password"
              />
            </div>

            <div className="cp-field">
              <label>ยืนยันรหัสผ่านใหม่</label>
              <div className="cp-input-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="พิมพ์อีกครั้ง"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
                <span className="cp-eye-icon" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEye /> : <FaEyeSlash />}
                </span>
              </div>
            </div>

            <label className="cp-checkbox-row">
              <input
                type="checkbox"
                name="logoutAllSessions"
                checked={formData.logoutAllSessions}
                onChange={handleChange}
              />
              <span className="cp-checkbox-text">
                ออกจากระบบในอุปกรณ์/เบราว์เซอร์อื่นทั้งหมด
                <small>ไม่กระทบเซสชันที่ใช้งานอยู่ตอนนี้</small>
              </span>
            </label>

            <div className="cp-actions">
              <button type="button" className="btn-cancel-cp" onClick={() => navigate(-1)} disabled={isSubmitting}>
                ยกเลิก
              </button>
              <button type="submit" className="btn-confirm-cp" disabled={isSubmitting}>
                {isSubmitting ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  )
}

export default ChangePassword