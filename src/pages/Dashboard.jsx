import Layout from '../components/Layout'

function Dashboard() {
  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div className="stat-card">
            <p className="stat-label">Vehicles In Today</p>
            <h2 className="stat-val blue">-</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Vehicles Out Today</p>
            <h2 className="stat-val green">-</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Blacklist Today</p>
            <h2 className="stat-val red">-</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">AI Status</p>
            <h2 className="stat-val" id="ai-status">-</h2>
          </div>
        </div>

        {/* แถวล่าง */}
        <div className="bottom-row">
          <div className="content-card">
            <h3 className="card-title">LPR Camera Map</h3>
            <div className="map-placeholder">
              <p>Map Coming Soon</p>
            </div>
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
              <tbody id="history-body">
                <tr>
                  <td colSpan="3">No data available</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  )
}

export default Dashboard