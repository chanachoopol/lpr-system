import { useState } from 'react'
import { FaVideo } from 'react-icons/fa'
import Layout from '../components/Layout'
import '../styles/Monitor.css'
import { mockLatestCapture, mockRecentHistory, mockCameras } from '../data/mockData'

function Monitor() {
  const [selectedCamera, setSelectedCamera] = useState('cam1')

  // ดึงค่าจากไฟล์ Mock มาตั้งเป็นค่าเริ่มต้น
  const [latestCapture, setLatestCapture] = useState(mockLatestCapture)
  const [recentHistory, setRecentHistory] = useState(mockRecentHistory)

  return (
    <Layout title="Monitor">
      <div className="monitor-wrapper">
        
        {/* แถบเลือกกล้อง (Camera Selector) */}
        <div className="camera-bar content-card">
          <FaVideo className="camera-icon" />
          <label htmlFor="cameraSelect">Select Camera:</label>
            <select
              id="cameraSelect"
              className="camera-select"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
            >
              {mockCameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))}
            </select>
        </div>

        <div className="monitor-content">
          
          {/* ฝั่งซ้าย: วิดีโอสตรีมมิ่ง */}
          <div className="monitor-left content-card">
            <div className="video-wrapper">
              <video autoPlay muted loop playsInline className="live-video">
                <source src="/assets/monitor-page/car-mock.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <div className="video-overlay">
                <span className="live-badge">● LIVE</span>
              </div>
            </div>
          </div>

          {/* ฝั่งขวา: ข้อมูลป้ายทะเบียนและประวัติ */}
          <div className="monitor-right content-card">
            <h3 className="card-title">Latest Capture</h3>
            
            <div className="plate-showcase">
              <div className="thai-plate">
                <h2 className="plate-number">{latestCapture.plate}</h2>
                <p className="plate-province">{latestCapture.province}</p>
              </div>
            </div>

            <div className="table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>License Plate</th>
                    <th>Province</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.length > 0 ? (
                    recentHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{item.time}</td>
                        <td className="bold-plate">{item.plate}</td>
                        <td>{item.province}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center' }}>No data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>

      </div>
    </Layout>
  )
}

export default Monitor