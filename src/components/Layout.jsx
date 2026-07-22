import { useState, useEffect } from 'react'
import '../styles/global.css'
import '../styles/Layout.css'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

function Layout({ children, title }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // เช็คขนาดหน้าจอตอนเริ่ม
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth <= 768) {
        setIsCollapsed(false)
        setIsMobileOpen(false)
      } else if (window.innerWidth <= 1024) {
        setIsCollapsed(true)
      } else {
        setIsCollapsed(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function handleToggle() {
    if (window.innerWidth <= 768) {
      setIsMobileOpen(!isMobileOpen)
    } else {
      setIsCollapsed(!isCollapsed)
    }
  }

  return (
    <div className="layout">
      {/* Overlay สำหรับ Mobile */}
      {isMobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
      />

      <div className="layout-main">
        <Navbar
          title={title}
          onToggle={handleToggle}
        />
        <main className="layout-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout