import { NavLink } from 'react-router-dom'
import { FaHome, FaDesktop, FaHistory, FaExclamationTriangle, FaChartBar, FaUser, FaSignOutAlt, FaUsers, FaVideo, FaClipboardList} from 'react-icons/fa'
import useAuthStore from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import { FaRoute } from 'react-icons/fa6'

// แต่ละเมนูมี roles กำกับว่า role ไหนเห็นได้บ้าง
// เมนูเดิมเปิดให้ทุก role เห็นเหมือนเดิม ไม่กระทบของเดิม
const menuItems = [
  { path: '/dashboard', icon: <FaHome />, label: 'Dashboard', roles: ['user', 'admin', 'superadmin'] },
  { path: '/monitor', icon: <FaDesktop />, label: 'Monitor', roles: ['user', 'admin', 'superadmin'] },
  { path: '/history', icon: <FaHistory />, label: 'History', roles: ['user', 'admin', 'superadmin'] },
  { path: '/blacklist', icon: <FaExclamationTriangle />, label: 'Blacklist & Whitelist', roles: ['user', 'admin', 'superadmin'] },
  { path: '/route-tracking', icon: <FaRoute />, label: 'Route Tracking', roles: ['user', 'admin', 'superadmin'] },
  { path: '/report', icon: <FaChartBar />, label: 'Report', roles: ['user', 'admin', 'superadmin'] },
  { path: '/users', icon: <FaUsers />, label: 'User Management', roles: ['admin', 'superadmin'] },
  { path: '/cameras', icon: <FaVideo />, label: 'Camera Management', roles: ['admin', 'superadmin'] },
  { path: '/audit-logs', icon: <FaClipboardList />, label: 'Audit Log', roles: ['admin', 'superadmin'] },
]

function Sidebar({ isCollapsed, isMobileOpen, onClose }) {
  const { user, avatarUrl, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
  const result = await Swal.fire({
    icon: 'question',
    title: 'ยืนยันการออกจากระบบ?',
    text: 'คุณต้องการออกจากระบบใช่หรือไม่',
    showCancelButton: true,
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: 'rgb(220, 38, 38)',
    cancelButtonColor: 'var(--sidebar-bg)'
  })

  if (!result.isConfirmed) return

  await logout()
  navigate('/')
}
  function handleMenuClick() {
    if (window.innerWidth <= 768) {
      onClose()
    }
  }

  // กรองเมนูให้เหลือเฉพาะที่ role ปัจจุบันเห็นได้
  const visibleMenuItems = menuItems.filter((item) => item.roles.includes(user?.role))

  return (
    <aside className={`sidebar 
      ${isCollapsed ? 'collapsed' : ''} 
      ${isMobileOpen ? 'mobile-open' : ''}
    `}>
      <div className="sb-user">
        <div className="sb-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="sb-avatar-img" /> : <FaUser />}
        </div>
        <div className="sb-user-info">
          <p className="sb-user-name">{user?.fullname || user?.fullName || user?.username || 'Admin'}</p>
          <p className="sb-user-role">{user?.role || 'Administrator'}</p>
        </div>
      </div>

      <nav className="sb-menu">
        {visibleMenuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive ? 'sb-item active' : 'sb-item'
            }
            onClick={handleMenuClick}
          >
            <span className="sb-icon">{item.icon}</span>
            <span className="sb-label">{item.label}</span>
            <span className="sb-tooltip">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sb-bottom">
        <button className="sb-logout" onClick={handleLogout}>
          <FaSignOutAlt />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar