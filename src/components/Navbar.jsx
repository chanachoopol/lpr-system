import { useState, useEffect, useRef } from 'react'
import { FaBell, FaChevronDown, FaUser, FaMoon, FaSun, FaBars, FaSearch } from 'react-icons/fa'
import { FaTriangleExclamation, FaVideo, FaArrowRight } from 'react-icons/fa6'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { mockNotifications } from '../data/mockData'
import { useThemeStore } from '../store/themeStore'

function Navbar({ title, onToggle }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState(mockNotifications)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef(null)
  const notifRef = useRef(null)
  const { theme, toggleTheme } = useThemeStore()

  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    function updateClock() {
      const now = new Date()
      setTime(now.toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }))
    }
    updateClock()
    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [])

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

  function handleSearch(e) {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/history?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

 function handleToggleMode() {
    toggleTheme() // สั่งเปลี่ยนค่าแสงในสมองกล
    setShowDropdown(false) // ปิดเมนู Dropdown
    // (เราไม่ต้องสั่งแก้ document.body ตรงนี้แล้ว เพราะ App.jsx คอยจัดการให้แบบอัตโนมัติแล้วครับ!)
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  function markAllRead() {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  function handleNotifClick(notif) {
  setNotifications(notifications.map(n =>
    n.id === notif.id ? { ...n, read: true } : n
  ))
  setShowNotifications(false)

  if (notif.type === 'blacklist') {
    navigate('/blacklist')
  } else if (notif.type === 'camera') {
    navigate('/monitor')
  }
}

  return (
    <header className="navbar">
      <button className="nb-toggle" onClick={onToggle} aria-label="toggle sidebar">
        <FaBars />
      </button>

      <h1 className="nb-title">{title}</h1>

      {/* Search Bar */}
      <form className="nb-search" onSubmit={handleSearch}>
        <FaSearch className="nb-search-icon" />
        <input
          type="text"
          className="nb-search-input"
          placeholder="Search license plate..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      <div className="nb-right">
        <div className="nb-time">{time}</div>

        {/* Notification Bell */}
        <div className="nb-bell-wrap" ref={notifRef}>
          <button
            className="nb-bell"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <FaBell />
            {unreadCount > 0 && (
              <span className="nb-badge">{unreadCount}</span>
            )}
          </button>

          {/* Notification Panel */}
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
                          : <FaVideo />
                        }
                      </div>
                      <div className="notif-content">
                        <p className="notif-title">{notif.title}</p>
                        {notif.plate && (
                          <p className="notif-plate">{notif.plate}</p>
                        )}
                        <p className="notif-location">
                          {notif.location} • {notif.time}
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
          <div className="nb-avatar"><FaUser /></div>
          <span className="nb-name">{user?.username || 'Admin'}</span>
          <FaChevronDown className="nb-chevron" />

          <div className={`nb-dropdown ${showDropdown ? 'show' : ''}`}>
            <button className="nb-dropdown-item" onClick={handleToggleMode}>
              {theme === 'dark' ? <FaSun /> : <FaMoon />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <hr className="nb-divider" />
            <button className="nb-dropdown-item danger" onClick={handleLogout}>
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Navbar