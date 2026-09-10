import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import '../styles/global.css'
import '../styles/Layout.css'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import { pageVariants, pageTransition } from '../animations/pageTransition'

const STORAGE_KEY_SIDEBAR_COLLAPSED = 'lpr_sidebar_collapsed'

function getInitialCollapsed() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED)
    if (saved !== null) {
      return saved === 'true'
    }
  } catch (e) {}
  if (typeof window !== 'undefined') {
    return window.innerWidth <= 1024 && window.innerWidth > 768
  }
  return false
}

function Layout({ children, title }) {
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsed)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // ปรับสถานะตามการ Resize หน้าจอจริง
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth <= 768) {
        setIsMobileOpen(false)
      } else if (window.innerWidth <= 1024) {
        setIsCollapsed(true)
      } else {
        try {
          const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED)
          if (saved !== null) {
            setIsCollapsed(saved === 'true')
          }
        } catch (e) {}
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function handleToggle() {
    if (window.innerWidth <= 768) {
      setIsMobileOpen(!isMobileOpen)
    } else {
      setIsCollapsed((prev) => {
        const next = !prev
        try {
          localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, String(next))
        } catch (e) {}
        return next
      })
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
        <motion.div
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageVariants}
          transition={pageTransition}
        >
          {children}
        </motion.div>
      </main>
    </div>
  </div>
)
}

export default Layout