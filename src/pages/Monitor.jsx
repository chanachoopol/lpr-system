import { useState, useEffect, useRef } from 'react'
import { FaVideo } from 'react-icons/fa'
import Layout from '../components/Layout'
import '../styles/Monitor.css'
import { mockLatestCapture, mockRecentHistory, mockCameraLocations } from '../data/mockData'
import { useSearchParams } from 'react-router-dom'
import Hls from 'hls.js' // นำเข้า hls.js อย่างเป็นทางการ (ไม่มี react-player แล้ว!)

function Monitor() {
  const [selectedCamera, setSelectedCamera] = useState('cam1')
  
  // ดึงค่าจากไฟล์ Mock มาตั้งเป็นค่าเริ่มต้น
  const [latestCapture, setLatestCapture] = useState(mockLatestCapture)
  const [recentHistory, setRecentHistory] = useState(mockRecentHistory)
  const [searchParams] = useSearchParams()

  // สร้าง Ref เพื่ออ้างอิงถึงแท็กวิดีโอ
  const videoRef = useRef(null)

  useEffect(() => {
    const cameraFromURL = searchParams.get('camera')
    if (cameraFromURL) {
      setSelectedCamera(cameraFromURL)
    }
  }, [searchParams])

  // ค้นหาข้อมูลกล้องจาก mockData ที่ ID ตรงกับที่ User เลือก
  const currentCameraData = mockCameraLocations.find(cam => cam.id === selectedCamera)

  // จัดการระบบสตรีมมิ่งด้วย hls.js
  useEffect(() => {
    const video = videoRef.current
    const streamUrl = currentCameraData?.streamUrl

    // ถ้ายังไม่มีแท็กวิดีโอ หรือไม่มีลิงก์ ให้หยุดการทำงาน
    if (!video || !streamUrl) return

    let hls;

    // ตรวจสอบว่าบราวเซอร์รองรับ hls.js หรือไม่ (Chrome, Edge, Firefox)
    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // เมื่อพร้อมเล่น ให้พยายามเล่นอัตโนมัติ (ถ้าโดนบล็อก ให้รอ User กดเอง)
        video.play().catch(err => console.log("รอผู้ใช้กด Play:", err))
      })
    } 
    // สำหรับ Safari ที่รองรับไฟล์ .m3u8 ในตัวอยู่แล้ว
    else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(err => console.log("รอผู้ใช้กด Play:", err))
      })
    }

    // Cleanup: ล้างข้อมูลสตรีมเก่าทิ้งเมื่อผู้ใช้เปลี่ยนกล้อง
    return () => {
      if (hls) {
        hls.destroy()
      }
    }
  }, [currentCameraData?.streamUrl]) // ทำงานใหม่ทุกครั้งที่ลิงก์สตรีมเปลี่ยน

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
              {mockCameraLocations.map((cam) => (
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
              
              {/* เปลี่ยนมาใช้แท็ก Video ธรรมดา ควบคุมด้วย hls.js */}
              <video
                ref={videoRef}
                className="live-video"
                controls={true}
                muted={true}
              />

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