import { useState, useEffect, useRef } from 'react'
import { FaBell, FaChevronDown, FaUser, FaBars, FaSignOutAlt, FaCheck } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import useNotificationStore from '../store/notificationStore'
import VillageSelector from './VillageSelector'
import Swal from 'sweetalert2'
import { FaTriangleExclamation, FaVideo, FaArrowRight, FaKey, FaIdCard, FaLock } from 'react-icons/fa6'

function Navbar({ title, onToggle }) {
  const { user, avatarUrl, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const { notifications, unreadCount, markAllRead, markRead, fetchNotifications } = useNotificationStore()
  const dropdownRef = useRef(null)
  const notifRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  function handleNotifClick(notif) {
    markRead(notif.id)
    setShowNotifications(false)

    const isWhitelist =
      notif.type === 'whitelist' ||
      notif.action === 'whitelist_alert' ||
      (notif.title && notif.title.toLowerCase().includes('whitelist'))

    const isBlacklist =
      notif.type === 'blacklist' ||
      notif.action === 'blacklist_alert' ||
      (notif.title && notif.title.toLowerCase().includes('blacklist'))

    if (isWhitelist) {
      navigate('/blacklist?tab=whitelist')
    } else if (isBlacklist) {
      navigate('/blacklist?tab=blacklist')
    } else if (notif.type === 'camera' || notif.action?.startsWith('camera_')) {
      if (user?.role === 'admin' || user?.role === 'superadmin') {
        navigate('/cameras')
      }
    } else if (notif.type === 'security' || notif.action?.includes('bruteforce') || notif.action?.includes('security')) {
      if (user?.role === 'admin' || user?.role === 'superadmin') {
        navigate('/audit-logs')
      }
    }
  }

  return (
    <header className="navbar">
      <button className="nb-toggle" onClick={onToggle} aria-label="toggle sidebar">
        <FaBars />
      </button>

      <h1 className="nb-title">{title}</h1>

      <div className="nb-right">
        <VillageSelector />

        {/* Notification Bell */}
        <div className="nb-bell-wrap" ref={notifRef}>
          <button
            className="nb-bell"
            onClick={() => {
              const next = !showNotifications
              setShowNotifications(next)
              if (next) fetchNotifications()
            }}
          >
            <FaBell />
            {unreadCount > 0 && (
              <span className="nb-badge">{unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="notif-panel">
              <div className="notif-header">
                <h4>Notifications</h4>
                {unreadCount > 0 && (
                  <button className="notif-mark-read" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
              </div>

              <div className="notif-list">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`notif-item ${!notif.read ? 'unread' : ''}`}
                      onClick={() => handleNotifClick(notif)}
                    >
                      <div className={`notif-icon ${notif.type}`}>
                        {notif.type === 'blacklist'
                          ? <FaTriangleExclamation />
                          : notif.type === 'whitelist'
                          ? <FaCheck />
                          : notif.type === 'camera'
                          ? <FaVideo />
                          : notif.type === 'security'
                          ? <FaLock />
                          : <FaBell />
                        }
                      </div>
                      <div className="notif-content">
                        <p className="notif-title">{notif.title}</p>
                        {notif.plate && (
                          <p className="notif-plate">{notif.plate}</p>
                        )}
                        <p className="notif-location">
                          {notif.location ? `${notif.location} • ${notif.time}` : `${notif.detail || ''}${notif.detail ? ' • ' : ''}${notif.time}`}
                        </p>
                      </div>
                      {!notif.read && <span className="notif-dot"></span>}
                    </div>
                  ))
                ) : (
                  <p className="notif-empty">No notifications</p>
                )}
              </div>

              <div className="notif-footer" onClick={() => { navigate('/blacklist'); setShowNotifications(false) }}>
                <span>View all in Blacklist</span>
                <FaArrowRight />
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div
          className="nb-profile"
          ref={dropdownRef}
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div className="nb-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="Avatar" className="nb-avatar-img" /> : <FaUser />}
          </div>
          <span className="nb-name">{user?.fullname || user?.fullName || user?.username || 'Admin'}</span>
          <FaChevronDown className="nb-chevron" />

          <div className={`nb-dropdown ${showDropdown ? 'show' : ''}`}>
            <button
                className="nb-dropdown-item"
                onClick={() => { navigate('/profile'); setShowDropdown(false) }}
              >
                <span className="nb-dropdown-icon"><FaIdCard /></span>
                <span>My Profile</span>
            </button>
            <button
                className="nb-dropdown-item"
                onClick={() => { navigate('/change-password'); setShowDropdown(false) }}
              >
                <span className="nb-dropdown-icon"><FaKey /></span>
                <span>Change Password</span>
            </button>

            <hr className="nb-divider" />

            <button className="nb-dropdown-item danger" onClick={handleLogout}>
              <span className="nb-dropdown-icon"><FaSignOutAlt /></span>
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Navbar