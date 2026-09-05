import { useState, useEffect } from 'react'
import { FaCookieBite } from 'react-icons/fa6'
import '../styles/CookieNotice.css'

const STORAGE_KEY = 'cookie_notice_dismissed'

// Banner แจ้งการใช้ cookie — โชว์ครั้งแรกที่เข้าเว็บ กดปิดแล้วจำไว้ไม่โชว์ซ้ำ
// ไม่มีปุ่ม "ปฏิเสธ" เพราะ refresh token cookie จำเป็นต่อการ login/คงสถานะระบบ
// (เทียบเท่า strictly necessary cookie ตามหลัก PDPA/GDPR — แจ้งให้ทราบ ไม่ใช่ขอ consent แบบเลือกได้)
function CookieNotice() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (!dismissed) {
      setIsVisible(true)
    }
  }, [])

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="cookie-notice">
      <div className="cookie-notice-content">
        <span className="cookie-notice-icon"><FaCookieBite /></span>
        <p className="cookie-notice-text">
          เว็บไซต์นี้ใช้คุกกี้ที่จำเป็น (Strictly Necessary Cookies) สำหรับการเข้าสู่ระบบและรักษาความปลอดภัย
          โดยจะจดจำสถานะการเข้าสู่ระบบเมื่อเลือก &ldquo;Remember Me&rdquo; ตามระยะเวลาที่ระบบกำหนด คุกกี้นี้จำเป็นต่อการทำงานของระบบ
        </p>
      </div>
      <button className="cookie-notice-btn" onClick={handleDismiss}>
        เข้าใจแล้ว
      </button>
    </div>
  )
}

export default CookieNotice