import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FaCircleCheck } from 'react-icons/fa6'
import { motion } from 'framer-motion'
import bg1 from '../assets/bg-login/bg1.webp'
import '../styles/Login.css'
import '../styles/ForgotPassword.css'
import { confirmEmailChangeAPI } from '../data/api'
import { pageVariants, pageTransition } from '../animations/pageTransition'

// หน้านี้ถูกเปิดจากลิงก์ยืนยันในอีเมล (?token=xxx) — ยิง confirm ให้อัตโนมัติทันทีที่โหลดหน้า
// ไม่ต้องให้ user กดปุ่มอะไรเพิ่ม เพราะ token ใช้ได้ครั้งเดียวและมักหมดอายุเร็ว
function ConfirmEmailChange() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState('loading') // loading | success | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage('ลิงก์นี้ไม่ถูกต้องหรือไม่สมบูรณ์')
      return
    }

    let isCancelled = false
    async function confirm() {
      try {
        await confirmEmailChangeAPI(token)
        if (!isCancelled) setStatus('success')
      } catch (error) {
        console.error(error)
        if (!isCancelled) {
          const backendMessage = error.response?.data?.detail
          setErrorMessage(
            typeof backendMessage === 'string'
              ? backendMessage
              : 'ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ยืนยันใหม่จากหน้าโปรไฟล์'
          )
          setStatus('error')
        }
      }
    }
    confirm()
    return () => { isCancelled = true }
  }, [token])

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
          <div className="fp-sent-state">
            {status === 'loading' && (
              <>
                <h2 className="r-title">กำลังยืนยันอีเมล...</h2>
                <p className="r-sub">กรุณารอสักครู่</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="fp-sent-icon">
                  <FaCircleCheck />
                </div>
                <h2 className="r-title">ยืนยันอีเมลสำเร็จ</h2>
                <p className="r-sub">อีเมลของคุณถูกอัปเดตเรียบร้อยแล้ว</p>
                <button type="button" className="btn" onClick={() => navigate('/profile')}>
                  กลับไปหน้าโปรไฟล์
                </button>
              </>
            )}

            {status === 'error' && (
              <>
                <h2 className="r-title" style={{ color: '#ef4444' }}>ยืนยันไม่สำเร็จ</h2>
                <p className="r-sub">{errorMessage}</p>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default ConfirmEmailChange