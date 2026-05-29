import '../styles/Layout.css'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

function Layout({ children, title }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="layout-main">
        <Navbar title={title} />
        <main className="layout-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout