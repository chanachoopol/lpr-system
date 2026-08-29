import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { FaTriangleExclamation, FaCircleCheck, FaCircleXmark } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import { motion } from 'framer-motion'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import '../styles/ForgotPassword.css'
import { setPasswordAPI, verifySetPasswordTokenAPI } from '../data/api'
import { pageVariants, pageTransition } from '../animations/pageTransition'
import useAuthStore from '../store/authStore'
import Spinner from '../components/Spinner'

// ต้องตรงกับ rule ฝั่ง backend (อ้างอิงจาก error message จริง: "Password must be at least 8 characters long")
// เพิ่มเงื่อนไข complexity ฝั่ง frontend: ต้องมีตัวอักษร + ตัวเลข + อักขระพิเศษ อย่างน้อยอย่างละ 1 ตัว
// และห้ามมีภาษาไทย/อักขระนอกเหนือจาก a-z, A-Z, 0-9, สัญลักษณ์ ASCII ปนอยู่เลย
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 36

// อักขระที่รองรับ: a-z, A-Z, 0-9 และสัญลักษณ์ ASCII ที่พิมพ์ได้ (\x21-\x7E ครอบคลุม !"#$%...~) ไม่รวม space
const ALLOWED_CHAR_PATTERN = /[\x21-\x7E]/
const ALLOWED_CHARS_REGEX = /^[\x21-\x7E]+$/

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

// คำนวณเงื่อนไขรหัสผ่านทั้งหมดจาก string เดียว — ใช้ทั้งเช็ค realtime (checklist)
// และเช็คซ้ำก่อน submit จริง (กันเคสกด Enter ตอนปุ่มยัง disabled อยู่ไม่ทัน)
function evaluatePassword(password) {
  // นับเฉพาะตัวอักษรที่อยู่ในชุดที่รองรับ (อังกฤษ/ตัวเลข/สัญลักษณ์) เท่านั้น
  // ภาษาไทยหรืออักขระอื่นที่พิมพ์ปนเข้ามาจะไม่ถูกนับเป็นความยาวเลย
  // เช่น พิมพ์ "หหหหหหหหหห" (ไทยล้วน 10 ตัว) validCharCount = 0 ไม่ผ่านเงื่อนไขความยาว
  const validCharCount = (password.match(new RegExp(ALLOWED_CHAR_PATTERN, 'g')) || []).length

  return {
    length: validCharCount >= MIN_PASSWORD_LENGTH && validCharCount <= MAX_PASSWORD_LENGTH,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^a-zA-Z0-9]/.test(password) && ALLOWED_CHARS_REGEX.test(password), // นับเป็น "มีอักขระพิเศษ" เฉพาะตัวที่รองรับเท่านั้น กันเคสมีแต่ภาษาไทยแล้วเข้าใจผิดว่าผ่านข้อนี้
    onlyAllowedChars: password.length > 0 && ALLOWED_CHARS_REGEX.test(password) // false ทันทีถ้ามีภาษาไทย/อักขระนอกเหนือ ASCII ปนอยู่แม้แค่ตัวเดียว
  }
}

const CHECKLIST_ITEMS = [
  { key: 'length', label: `ความยาว ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} ตัวอักษร (นับเฉพาะอังกฤษ/ตัวเลข/สัญลักษณ์)` },
  { key: 'hasLetter', label: 'มีตัวอักษร (a-z, A-Z) อย่างน้อย 1 ตัว' },
  { key: 'hasNumber', label: 'มีตัวเลข (0-9) อย่างน้อย 1 ตัว' },
  { key: 'hasSpecial', label: 'มีอักขระพิเศษ (เช่น !@#$%) อย่างน้อย 1 ตัว' },
  { key: 'onlyAllowedChars', label: 'ใช้เฉพาะตัวอักษรอังกฤษ ตัวเลข และสัญลักษณ์เท่านั้น (ห้ามภาษาไทย)' }
]

function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { clearSession } = useAuthStore()

  // 'checking' = กำลังเช็ค token กับ backend, 'valid' = ใช้ได้ โชว์ฟอร์ม, 'invalid' = ลิงก์ผิด/หมดอายุ/ไม่มี token
  const [tokenStatus, setTokenStatus] = useState('checking')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // เช็ค token กับ backend ทันทีที่เปิดหน้า — ไม่รอจน submit ถึงจะรู้ว่าลิงก์ผิด/หมดอายุ
  // ไม่มี token แนบมาใน URL เลย ก็ถือว่า invalid ไปเลย ไม่ต้องยิง API
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid')
      return
    }

    let isCancelled = false

    async function checkToken() {
      try {
        await verifySetPasswordTokenAPI(token)
        if (!isCancelled) setTokenStatus('valid')
      } catch (error) {
        console.error('Token ไม่ถูกต้องหรือหมดอายุ:', error)
        if (!isCancelled) setTokenStatus('invalid')
      }
    }

    checkToken()

    return () => {
      isCancelled = true
    }
  }, [token])

  // คำนวณใหม่ทุกครั้งที่ newPassword เปลี่ยน — ใช้ useMemo กันคำนวณ regex ซ้ำโดยไม่จำเป็นตอน re-render อื่นๆ
  const passwordChecks = useMemo(() => evaluatePassword(newPassword), [newPassword])
  const isPasswordValid = Object.values(passwordChecks).every(Boolean)

  // โชว์สถานะ "ตรงกัน/ไม่ตรงกัน" เฉพาะตอนผู้ใช้เริ่มพิมพ์ช่องยืนยันแล้วเท่านั้น กันโชว์ผิดตั้งแต่ยังไม่ได้พิมพ์อะไรเลย
  const showMatchHint = confirmPassword.length > 0
  const passwordsMatch = newPassword === confirmPassword

  const canSubmit = isPasswordValid && passwordsMatch && confirmPassword.length > 0 && !isSubmitting

  async function handleSubmit(e) {
    e.preventDefault()

    // เผื่อเคสกด Enter ตอนปุ่ม submit ยัง disabled อยู่ (บาง browser ยังยิง onSubmit ของ form ได้)
    if (!isPasswordValid) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านยังไม่ตรงตามเงื่อนไข',
        text: 'กรุณาตรวจสอบเงื่อนไขรหัสผ่านด้านล่างให้ครบทุกข้อ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!passwordsMatch) {
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

      // เคลียร์ cookie/session ฝั่ง client ทันที — เผื่อเครื่องนี้มี session เก่าค้างอยู่
      // (เช่นเปิดคนละแท็บ หรือเคย login ค้างไว้ก่อนมาขอลิงก์รีเซ็ต) กันข้อมูล user เก่าหลุดติดไปหน้าอื่น
      // ฝั่ง backend จะ revoke token เดิมทุกอุปกรณ์ให้แล้วเช่นกัน
      clearSession()

      await Swal.fire({
        icon: 'success',
        title: 'ตั้งรหัสผ่านใหม่สำเร็จ',
        text: 'ระบบออกจากระบบทุกอุปกรณ์แล้วเพื่อความปลอดภัย กรุณาเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      navigate('/', { replace: true })
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

  // กำลังเช็ค token อยู่ — โชว์ spinner รอ ยังไม่ตัดสินใจว่าจะโชว์ฟอร์มหรือหน้า Invalid Link
  if (tokenStatus === 'checking') {
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
          <div className="card-right fp-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner text="กำลังตรวจสอบลิงก์..." />
          </div>
        </motion.div>
      </div>
    )
  }

  // token ไม่ valid (ไม่มีเลย, ผิด, หรือหมดอายุ) — ไม่ต้องโชว์ฟอร์มให้กรอกเปล่าๆ
  if (tokenStatus === 'invalid') {
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

  // tokenStatus === 'valid' — โชว์ฟอร์มตั้งรหัสผ่านใหม่ (ฟอร์มเดิม ไม่มีการแก้ไข)
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
                  placeholder="กรอกรหัสผ่านใหม่ (เช่น Abcd1234!)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <span className="eye-icon" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEye /> : <FaEyeSlash />}
                </span>
              </div>

              {/* Checklist เงื่อนไขรหัสผ่าน — อัปเดตแบบ realtime ทุกครั้งที่พิมพ์ */}
              <ul className="fp-password-checklist">
                {CHECKLIST_ITEMS.map((item) => {
                  const isValid = passwordChecks[item.key]
                  return (
                    <li key={item.key} className={`fp-check-item ${isValid ? 'valid' : ''}`}>
                      <span className="fp-check-icon">
                        {isValid ? <FaCircleCheck /> : <FaCircleXmark />}
                      </span>
                      {item.label}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="f-group">
              <label className="f-label">ยืนยันรหัสผ่านใหม่</label>
              <div className="f-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="f-box"
                  placeholder="พิมพ์รหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
              </div>

              {/* สถานะตรง/ไม่ตรงกัน — โชว์เฉพาะตอนเริ่มพิมพ์ช่องนี้แล้วเท่านั้น */}
              {showMatchHint && (
                <p className={`fp-match-hint ${passwordsMatch ? 'valid' : 'invalid'}`}>
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

            <button type="submit" className="btn" disabled={!canSubmit}>
              {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

export default ResetPassword