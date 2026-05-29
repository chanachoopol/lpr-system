import Layout from '../components/Layout'

function Dashboard() {
  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div className="stat-card">
            <p className="stat-label">รถเข้าวันนี้</p>
            <h2 className="stat-val blue">-</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">รถออกวันนี้</p>
            <h2 className="stat-val green">-</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Blacklist วันนี้</p>
            <h2 className="stat-val red">-</h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">สถานะ AI</p>
            <h2 className="stat-val" id="ai-status">-</h2>
          </div>
        </div>

        {/* แถวล่าง */}
        <div className="bottom-row">
          <div className="content-card">
            <h3 className="card-title">แผนที่กล้อง LPR</h3>
            <div className="map-placeholder">
              <p>Map Coming Soon</p>
            </div>
          </div>
          <div className="content-card">
            <h3 className="card-title">ประวัติล่าสุด</h3>
            <table className="history-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ทะเบียน</th>
                  <th>จังหวัด</th>
                </tr>
              </thead>
              <tbody id="history-body">
                <tr>
                  <td colSpan="3">ยังไม่มีข้อมูล</td>
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