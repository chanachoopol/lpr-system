import { useState, useEffect, useRef } from 'react'
import { FaVideo } from 'react-icons/fa'
import Layout from '../components/Layout'
import '../styles/Monitor.css'
import { mockLatestCapture, mockRecentHistory, mockCameraLocations } from '../data/mockData'
import { useSearchParams } from 'react-router-dom'
import Hls from 'hls.js'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

function Monitor() {
  const [selectedCamera, setSelectedCamera] = useState('cam1')
  const [latestCapture, setLatestCapture] = useState(mockLatestCapture)
  const [recentHistory, setRecentHistory] = useState(mockRecentHistory)
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const [isVideoLoading, setIsVideoLoading] = useState(true)

  useEffect(() => {
    const cameraFromURL = searchParams.get('camera')
    if (cameraFromURL) {
      setSelectedCamera(cameraFromURL)
    }
  }, [searchParams])

  const currentCameraData = mockCameraLocations.find(cam => cam.id === selectedCamera)

  // Reset loading ทุกครั้งที่เปลี่ยนกล้อง
  useEffect(() => {
    setIsVideoLoading(true)
  }, [selectedCamera])

  useEffect(() => {
    const video = videoRef.current
    const streamUrl = currentCameraData?.streamUrl

    if (!video || !streamUrl) {
      setIsVideoLoading(false)
      return
    }

    let hls

    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsVideoLoading(false)
        video.play().catch(err => console.log("รอผู้ใช้กด Play:", err))
      })
      hls.on(Hls.Events.ERROR, () => {
        setIsVideoLoading(false)
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setIsVideoLoading(false)
        video.play().catch(err => console.log("รอผู้ใช้กด Play:", err))
      })
    }

    return () => {
      if (hls) hls.destroy()
    }
  }, [currentCameraData?.streamUrl])

  return (
    <Layout title="Monitor">
      <div className="monitor-wrapper">

        {/* แถบเลือกกล้อง */}
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

          {/* ฝั่งซ้าย: วิดีโอ */}
          <div className="monitor-left content-card">
            <div className="video-wrapper">

              {/* Loading Skeleton */}
              {isVideoLoading && (
                <div className="video-skeleton">
                  <Spinner text="Connecting to camera..." />
                </div>
              )}

              <video
                ref={videoRef}
                className="live-video"
                controls={true}
                muted={true}
                style={{ display: isVideoLoading ? 'none' : 'block' }}
              />

              {!isVideoLoading && (
                <div className="video-overlay">
                  <span className="live-badge">● LIVE</span>
                </div>
              )}
            </div>
          </div>

          {/* ฝั่งขวา: ข้อมูล */}
          <div className="monitor-right content-card">
            <h3 className="card-title">Latest Capture</h3>

            <div className="plate-showcase">
              <div className="thai-plate">
                <h2 className="plate-number">{latestCapture.plate}</h2>
                <p className="plate-province">{latestCapture.province}</p>
                {latestCapture.color && (
                  <p className="plate-province" style={{ marginTop: '2px' }}>{latestCapture.color}</p>
                )}
              </div>
            </div>

            <div className="table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>License Plate</th>
                    <th>Province</th>
                    <th>Color</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.length > 0 ? (
                    recentHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{item.time}</td>
                        <td className="bold-plate">{item.plate}</td>
                        <td>{item.province}</td>
                        <td>{item.color}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">
                        <EmptyState
                          title="No capture yet"
                          description="Waiting for vehicle detection..."
                        />
                      </td>
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