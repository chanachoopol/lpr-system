import { NavLink } from 'react-router-dom'
import { FaHome, FaDesktop, FaHistory, FaExclamationTriangle, FaChartBar, FaUser, FaSignOutAlt, FaUsers, FaVideo, FaClipboardList} from 'react-icons/fa'
import useAuthStore from '../store/authStore'
import { useNavigate } from 'react-router-dom'

// แต่ละเมนูมี roles กำกับว่า role ไหนเห็นได้บ้าง
// เมนูเดิมเปิดให้ทุก role เห็นเหมือนเดิม ไม่กระทบของเดิม
const menuItems = [
  { path: '/dashboard', icon: <FaHome />, label: 'Dashboard', roles: ['user', 'admin', 'superadmin'] },
  { path: '/monitor', icon: <FaDesktop />, label: 'Monitor', roles: ['user', 'admin', 'superadmin'] },
  { path: '/history', icon: <FaHistory />, label: 'History', roles: ['user', 'admin', 'superadmin'] },
  { path: '/blacklist', icon: <FaExclamationTriangle />, label: 'Blacklist', roles: ['user', 'admin', 'superadmin'] },
  { path: '/report', icon: <FaChartBar />, label: 'Report', roles: ['user', 'admin', 'superadmin'] },
  { path: '/users', icon: <FaUsers />, label: 'User Management', roles: ['admin', 'superadmin'] },
  { path: '/cameras', icon: <FaVideo />, label: 'Camera Management', roles: ['admin', 'superadmin'] },
  { path: '/audit-logs', icon: <FaClipboardList />, label: 'Audit Log', roles: ['admin', 'superadmin'] },
]

function Sidebar({ isCollapsed, isMobileOpen, onClose }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
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
        <div className="sb-avatar"><FaUser /></div>
        <div className="sb-user-info">
          <p className="sb-user-name">{user?.username || 'Admin'}</p>
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