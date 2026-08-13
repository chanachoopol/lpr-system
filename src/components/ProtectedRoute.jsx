import { Navigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import Spinner from './Spinner'

// ProtectedRoute — ห่อ route ที่ต้องการป้องกัน
// allowedRoles: array ของ role ที่เข้าได้ เช่น ['admin', 'superadmin']
//               ถ้าไม่ส่งมา (undefined) = ทุก role เข้าได้ แค่ต้อง login ก่อน
function ProtectedRoute({ children, allowedRoles }) {
  const { isLoggedIn, isLoading, user } = useAuthStore()

  // กำลังอ่าน cookie อยู่ → รอก่อน ยังไม่ตัดสินใจ redirect
  // ป้องกันปัญหา redirect กลับ Login ทันทีตอน refresh ก่อน cookie โหลดเสร็จ
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner text="กำลังโหลด..." />
      </div>
    )
  }

  // ยังไม่ login → กลับไปหน้า Login
  if (!isLoggedIn) {
    return <Navigate to="/" replace />
  }

  // login แล้ว แต่ role ไม่ตรงกับที่ route นี้อนุญาต → กลับไป Dashboard
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default ProtectedRoute 