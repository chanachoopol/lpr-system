import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaEye, FaEyeSlash, FaArrowLeft } from 'react-icons/fa'
import { FaKey, FaCircleCheck, FaCircleXmark } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { changePasswordAPI } from '../data/api'
import '../styles/ChangePassword.css'

// ใช้เงื่อนไขชุดเดียวกับหน้า Set New Password (Resetpassword.jsx) ทุกอย่าง
// เพื่อให้ policy รหัสผ่านตรงกันทั้งระบบ ไม่ว่าจะตั้งจากลิงก์อีเมลหรือเปลี่ยนจากในระบบเอง
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 36

// อักขระที่รองรับ: a-z, A-Z, 0-9 และสัญลักษณ์ ASCII ที่พิมพ์ได้ (\x21-\x7E ครอบคลุม !"#$%...~) ไม่รวม space
const ALLOWED_CHAR_PATTERN = /[\x21-\x7E]/
const ALLOWED_CHARS_REGEX = /^[\x21-\x7E]+$/

// คำนวณเงื่อนไขรหัสผ่านทั้งหมดจาก string เดียว — ใช้ทั้งเช็ค realtime (checklist)
// และเช็คซ้ำก่อน submit จริง (กันเคสกด Enter ตอนปุ่มยัง disabled อยู่ไม่ทัน)
function evaluatePassword(password) {
  // นับเฉพาะตัวอักษรที่อยู่ในชุดที่รองรับ (อังกฤษ/ตัวเลข/สัญลักษณ์) เท่านั้น
  // ภาษาไทยหรืออักขระอื่นที่พิมพ์ปนเข้ามาจะไม่ถูกนับเป็นความยาวเลย
  const validCharCount = (password.match(new RegExp(ALLOWED_CHAR_PATTERN, 'g')) || []).length

  return {
    length: validCharCount >= MIN_PASSWORD_LENGTH && validCharCount <= MAX_PASSWORD_LENGTH,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^a-zA-Z0-9]/.test(password) && ALLOWED_CHARS_REGEX.test(password),
    onlyAllowedChars: password.length > 0 && ALLOWED_CHARS_REGEX.test(password)
  }
}

const CHECKLIST_ITEMS = [
  { key: 'length', label: `ความยาว ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} ตัวอักษร (นับเฉพาะอังกฤษ/ตัวเลข/สัญลักษณ์)` },
  { key: 'hasLetter', label: 'มีตัวอักษร (a-z, A-Z) อย่างน้อย 1 ตัว' },
  { key: 'hasNumber', label: 'มีตัวเลข (0-9) อย่างน้อย 1 ตัว' },
  { key: 'hasSpecial', label: 'มีอักขระพิเศษ (เช่น !@#$%) อย่างน้อย 1 ตัว' },
  { key: 'onlyAllowedChars', label: 'ใช้เฉพาะตัวอักษรอังกฤษ ตัวเลข และสัญลักษณ์เท่านั้น (ห้ามภาษาไทย)' }
]

const EMPTY_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
}

function ChangePassword() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const passwordChecks = useMemo(() => evaluatePassword(formData.newPassword), [formData.newPassword])
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)

  const showMatchHint = formData.confirmPassword.length > 0
  const passwordsMatch = formData.newPassword === formData.confirmPassword

  const canSubmit =
    formData.currentPassword.trim() !== '' &&
    isPasswordValid &&
    passwordsMatch &&
    formData.confirmPassword.length > 0 &&
    !isSubmitting

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

    if (!isPasswordValid) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านใหม่ยังไม่ตรงตามเงื่อนไข',
        text: 'กรุณาตรวจสอบเงื่อนไขรหัสผ่านด้านล่างให้ครบทุกข้อ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!passwordsMatch) {
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

    // เพื่อความปลอดภัย บังคับออกจากระบบทุกอุปกรณ์เสมอเมื่อเปลี่ยนรหัสผ่านสำเร็จ ไม่มีทางเลือกให้ปิด
    const confirmResult = await Swal.fire({
      icon: 'question',
      title: 'ยืนยันการเปลี่ยนรหัสผ่าน?',
      text: 'ระบบจะออกจากระบบทุกอุปกรณ์ รวมถึงอุปกรณ์นี้ด้วย คุณจะต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่',
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
      // logoutAllSessions บังคับเป็น true เสมอ ไม่มี option ให้เลือกอีกต่อไป
      await changePasswordAPI(
        formData.currentPassword,
        formData.newPassword,
        formData.confirmPassword,
        true
      )

      await Swal.fire({
        icon: 'success',
        title: 'เปลี่ยนรหัสผ่านสำเร็จ',
        text: 'ระบบออกจากระบบทุกอุปกรณ์แล้ว กรุณาเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่ของคุณ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      logout()
      navigate('/', { replace: true })
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
                placeholder="เช่น Abcd1234!"
                value={formData.newPassword}
                onChange={handleChange}
                autoComplete="new-password"
                maxLength={MAX_PASSWORD_LENGTH}
              />

              <ul className="cp-password-checklist">
                {CHECKLIST_ITEMS.map((item) => {
                  const isValid = passwordChecks[item.key]
                  return (
                    <li key={item.key} className={`cp-check-item ${isValid ? 'valid' : ''}`}>
                      <span className="cp-check-icon">
                        {isValid ? <FaCircleCheck /> : <FaCircleXmark />}
                      </span>
                      {item.label}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="cp-field">
              <label>ยืนยันรหัสผ่านใหม่</label>
              <div className="cp-input-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="พิมพ์รหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <span className="cp-eye-icon" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEye /> : <FaEyeSlash />}
                </span>
              </div>

              {showMatchHint && (
                <p className={`cp-match-hint ${passwordsMatch ? 'valid' : 'invalid'}`}>
                  {passwordsMatch ? (
                    <>
                      <FaCircleCheck /> รหัสผ่านตรงกัน
                    </>
                  ) : (
                    <>
                      <FaCircleXmark /> รหัสผ่านไม่ตรงกัน
                    </>
                  )}
                </p>
              )}
            </div>

            <p className="cp-force-logout-note">
              <FaKey /> เพื่อความปลอดภัย เมื่อเปลี่ยนรหัสผ่านสำเร็จ ระบบจะออกจากระบบทุกอุปกรณ์
              รวมถึงอุปกรณ์นี้ด้วย คุณจะต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่
            </p>

            <div className="cp-actions">
              <button type="button" className="btn-cancel-cp" onClick={() => navigate(-1)} disabled={isSubmitting}>
                ยกเลิก
              </button>
              <button type="submit" className="btn-confirm-cp" disabled={!canSubmit}>
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