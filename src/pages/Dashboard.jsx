import { useState } from 'react'
import Layout from '../components/Layout'
import { mockDashboardStats, mockDashboardHistory } from '../data/mockData'
import '../styles/Dashboard.css'
import MapView from '../components/Map'

function Dashboard() {
  const [stats] = useState(mockDashboardStats)
  const [history] = useState(mockDashboardHistory)

  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div className="stat-card">
            <p className="stat-label">Vehicles In Today</p>
            <h2 className="stat-val blue">{stats.carsIn}</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Vehicles Out Today</p>
            <h2 className="stat-val green">{stats.carsOut}</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Blacklist Today</p>
            <h2 className="stat-val red">{stats.blacklist}</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">AI Status</p>
            <div className="status-wrapper">
              <span className={`status-dot ${stats.aiStatus === 'Online' ? 'online' : 'offline'}`}></span>
              <h2 className="stat-val">{stats.aiStatus}</h2>
            </div>
          </div>
        </div>

        {/* แถวล่าง */}
        <div className="bottom-row">
          <div className="content-card">
            <h3 className="card-title">LPR Camera Map</h3>
               <MapView />
          </div>

          <div className="content-card">
            <h3 className="card-title">Recent History</h3>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>License Plate</th>
                  <th>Province</th>
                </tr>
              </thead>
              <tbody>
                {history.length > 0 ? (
                  history.map((item) => (
                    <tr key={item.id}>
                      <td>{item.time}</td>
                      <td className="plate-text">{item.plate}</td>
                      <td>{item.province}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3">No data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  )
}

export default Dashboard