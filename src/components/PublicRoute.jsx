import { useNavigate } from 'react-router-dom'
import { FaArrowLeft } from 'react-icons/fa6'
import useAuthStore from '../store/authStore'
import Spinner from './Spinner'
import '../styles/NotFound.css'

function PublicRoute({ children }) {
  const navigate = useNavigate()
  const { isLoggedIn, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner text="กำลังโหลด..." />
      </div>
    )
  }

  if (isLoggedIn) {
    const handleGoBack = () => {
      navigate('/dashboard', { replace: true })
    }

    return (
      <div className="notfound-minimal-wrap">
        <div className="notfound-text-block">
          <button
            type="button"
            className="notfound-block-back-btn"
            onClick={handleGoBack}
            title="ย้อนกลับ"
          >
            <FaArrowLeft /> ย้อนกลับ
          </button>
          <h2 className="notfound-minimal-title">คุณเข้าสู่ระบบอยู่แล้ว</h2>
          <p className="notfound-minimal-desc single-line">
            หากต้องการเข้าสู่หน้านี้ กรุณาออกจากระบบก่อน เนื่องจากคุณกำลังใช้งานระบบอยู่ในขณะนี้
          </p>
        </div>
      </div>
    )
  }

  return children
}

export default PublicRoute
