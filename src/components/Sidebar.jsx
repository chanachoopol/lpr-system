import { NavLink } from 'react-router-dom'
import { FaHome, FaDesktop, FaHistory, FaExclamationTriangle, FaChartBar, FaUser, FaSignOutAlt } from 'react-icons/fa'
import useAuthStore from '../store/authStore'
import { useNavigate } from 'react-router-dom'

const menuItems = [
  { path: '/dashboard', icon: <FaHome />, label: 'Dashboard' },
  { path: '/monitor', icon: <FaDesktop />, label: 'Monitor' },
  { path: '/history', icon: <FaHistory />, label: 'History' },
  { path: '/blacklist', icon: <FaExclamationTriangle />, label: 'Blacklist' },
  { path: '/report', icon: <FaChartBar />, label: 'Report' },
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
        {menuItems.map((item) => (
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