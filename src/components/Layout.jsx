import { useState } from 'react'
import '../styles/global.css'
import '../styles/Layout.css'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

function Layout({ children, title }) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  return (
    <div className="layout">
      <Sidebar isCollapsed={isCollapsed} />
      <div className="layout-main">
        <Navbar
          title={title}
          onToggle={() => setIsCollapsed(!isCollapsed)}
        />
        <main className="layout-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout