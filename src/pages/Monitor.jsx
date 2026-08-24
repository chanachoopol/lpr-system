import { useState, useEffect, useRef } from 'react'
import { FaVideo, FaThLarge } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import '../styles/Monitor.css'
import { getCamerasAPI, getCameraLiveAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import { useSearchParams } from 'react-router-dom'
import Hls from 'hls.js'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import CameraGridTile from '../components/CameraGridTile'

const POLLING_INTERVAL_MS = 5000
const GRID_VIEW_VALUE = 'all' // 👈 ค่าพิเศษของ selectedCamera สำหรับโหมด Grid View

function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function Monitor() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const latestDetection = useNotificationStore((state) => state.latestDetection)
  const [cameras, setCameras] = useState([])
  const [isLoadingCameras, setIsLoadingCameras] = useState(true)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const [isVideoLoading, setIsVideoLoading] = useState(true)
  const [hasStreamError, setHasStreamError] = useState(false)

  const [latestCaptures, setLatestCaptures] = useState([])
  const [isLoadingDetections, setIsLoadingDetections] = useState(true)

  // 👇 Grid View — true เมื่อเลือก "ทุกกล้อง"
  const isGridMode = selectedCamera === GRID_VIEW_VALUE

  useEffect(() => {
    async function fetchCameras() {
      if (!user) return

      setIsLoadingCameras(true)
      try {
        const data = await getCamerasAPI(selectedVillageId)
        setCameras(data)

        const cameraFromURL = searchParams.get('camera')
        if (cameraFromURL && data.some((cam) => cam.id === cameraFromURL)) {
          setSelectedCamera(cameraFromURL)
        } else if (data.length > 0) {
          setSelectedCamera(data[0].id)
        }
      } catch (error) {
        console.error(error)
        Swal.fire({
          icon: 'error',
          title: 'โหลดรายการกล้องไม่สำเร็จ',
          text: 'กรุณาลองรีเฟรชหน้าใหม่อีกครั้ง',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } finally {
        setIsLoadingCameras(false)
      }
    }

    fetchCameras()
  }, [user, selectedVillageId])

  const currentCameraData = cameras.find((cam) => cam.id === selectedCamera)

  useEffect(() => {
    setIsVideoLoading(true)
  }, [selectedCamera])

  // 👇 HLS ของ single-camera view — ข้ามการทำงานถ้าอยู่ใน Grid Mode (แต่ละ tile จัดการ HLS เอง)
  useEffect(() => {
    if (isGridMode) return

    const video = videoRef.current
    const streamUrl = currentCameraData?.stream_url

    setHasStreamError(false)

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
        video.play().catch((err) => console.log("รอผู้ใช้กด Play:", err))
      })
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          setIsVideoLoading(false)
          setHasStreamError(true)
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setIsVideoLoading(false)
        video.play().catch((err) => console.log("รอผู้ใช้กด Play:", err))
      })
      video.addEventListener('error', () => {
        setIsVideoLoading(false)
        setHasStreamError(true)
      })
    }

    return () => {
      if (hls) hls.destroy()
    }
  }, [currentCameraData?.stream_url, isGridMode])

  // Polling ดึง latest detection — ปิดเมื่ออยู่ Grid Mode (ไม่ mount panel ฝั่งขวาแล้ว ไม่ต้อง poll)
  useEffect(() => {
    if (!selectedCamera || isGridMode) return

    let isCancelled = false

    async function fetchLive() {
      try {
        const data = await getCameraLiveAPI(selectedCamera, 5)
        if (!isCancelled) {
          setLatestCaptures(data.latest_captures || [])
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!isCancelled) setIsLoadingDetections(false)
      }
    }

    setIsLoadingDetections(true)
    fetchLive()

    const interval = setInterval(fetchLive, POLLING_INTERVAL_MS)

    return () => {
      isCancelled = true
      clearInterval(interval)
    }
  }, [selectedCamera, isGridMode])

  // bump แบบ real-time ผ่าน SSE — ปิดเมื่ออยู่ Grid Mode เช่นกัน
  useEffect(() => {
    if (isGridMode) return
    if (!latestDetection || latestDetection.camera?.id !== selectedCamera) return

    setLatestCaptures((prev) => {
      if (prev.some((item) => item.id === latestDetection.detection_id)) return prev
      const newItem = {
        id: latestDetection.detection_id,
        time_detect: latestDetection.time_detect,
        license_plate: latestDetection.license_plate,
        province: latestDetection.province,
        color: latestDetection.color
      }
      return [newItem, ...prev].slice(0, 5)
    })
  }, [latestDetection, selectedCamera, isGridMode])

  const latestCapture = latestCaptures[0] || null

  return (
    <Layout title="Monitor">
      <div className="monitor-wrapper">

        <div className="camera-bar content-card">
          <FaVideo className="camera-icon" />
          <label htmlFor="cameraSelect">Select Camera:</label>
          <select
            id="cameraSelect"
            className="camera-select"
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            disabled={isLoadingCameras || cameras.length === 0}
          >
            {isLoadingCameras ? (
              <option value="">กำลังโหลดกล้อง...</option>
            ) : cameras.length === 0 ? (
              <option value="">ไม่พบกล้องในระบบ</option>
            ) : (
              <>
                <option value={GRID_VIEW_VALUE}>ทุกกล้อง (Grid View)</option>
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {isGridMode ? (
          /* ---------- Grid View ---------- */
          <div className="content-card">
            <h3 className="card-title">
              <FaThLarge style={{ marginRight: 8 }} />
              All Cameras ({cameras.length})
            </h3>
            <div className="camera-grid">
              {cameras.map((cam) => (
                <CameraGridTile key={cam.id} camera={cam} />
              ))}
            </div>
          </div>
        ) : (
          /* ---------- Single Camera View (เดิม) ---------- */
          <div className="monitor-content">

            <div className="monitor-left content-card">
              <div className="video-wrapper">

                {isLoadingCameras ? (
                  <div className="video-skeleton">
                    <Spinner text="กำลังโหลดรายการกล้อง..." />
                  </div>
                ) : cameras.length === 0 ? (
                  <div className="video-skeleton">
                    <EmptyState
                      icon={<FaVideo />}
                      title="ไม่พบกล้องในระบบ"
                      description="กรุณาเพิ่มกล้องในหน้า Camera Management ก่อน"
                    />
                  </div>
                ) : hasStreamError ? (
                  <div className="video-skeleton">
                    <EmptyState
                      icon={<FaVideo />}
                      title="เชื่อมต่อกล้องไม่สำเร็จ"
                      description="ไม่สามารถเข้าถึงสัญญาณภาพจากกล้องนี้ได้ในขณะนี้"
                    />
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>

            <div className="monitor-right content-card">
              <h3 className="card-title">Latest Capture</h3>

              <div className="plate-showcase">
                <div className="thai-plate">
                  <h2 className="plate-number">
                    {latestCapture ? latestCapture.license_plate : '-'}
                  </h2>
                  <p className="plate-province">
                    {latestCapture ? latestCapture.province : 'ยังไม่มีข้อมูล'}
                  </p>
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
                    {isLoadingDetections ? (
                      <tr>
                        <td colSpan="4">
                          <Spinner text="กำลังโหลดข้อมูล..." />
                        </td>
                      </tr>
                    ) : latestCaptures.length > 0 ? (
                      latestCaptures.map((item) => (
                        <tr key={item.id}>
                          <td>{formatTime(item.time_detect)}</td>
                          <td className="bold-plate">{item.license_plate}</td>
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
        )}

      </div>
    </Layout>
  )
}

export default Monitor