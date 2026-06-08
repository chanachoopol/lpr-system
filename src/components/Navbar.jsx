import { useState, useEffect, useRef } from 'react'
import { FaBell, FaChevronDown, FaUser, FaMoon, FaSun, FaBars, FaSearch } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

function Navbar({ title, onToggle }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef(null)

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

  function toggleDarkMode() {
    setDarkMode(!darkMode)
    document.body.classList.toggle('dark-mode')
    setShowDropdown(false)
  }

  function handleLogout() {
    logout()
    navigate('/')
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

        <div className="nb-bell">
          <FaBell />
          <span className="nb-badge">2</span>
        </div>

        <div
          className="nb-profile"
          ref={dropdownRef}
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <div className="nb-avatar"><FaUser /></div>
          <span className="nb-name">{user?.username || 'Admin'}</span>
          <FaChevronDown className="nb-chevron" />

          <div className={`nb-dropdown ${showDropdown ? 'show' : ''}`}>
            <button className="nb-dropdown-item" onClick={toggleDarkMode}>
              {darkMode ? <FaSun /> : <FaMoon />}
              <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
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