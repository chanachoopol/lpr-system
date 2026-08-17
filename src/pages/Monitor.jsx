import { useState, useEffect, useRef } from 'react'
import { FaVideo } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import '../styles/Monitor.css'
import { getCamerasAPI, getCameraLiveAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import { useSearchParams } from 'react-router-dom'
import Hls from 'hls.js'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

// ดึงข้อมูล detection ใหม่ทุกๆ กี่มิลลิวินาที (ปรับตัวเลขนี้ได้ตามต้องการ)
const POLLING_INTERVAL_MS = 5000

// แปลง ISO timestamp จาก backend เป็นเวลาแบบ HH:MM:SS โซนไทย
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
  const { selectedVillageId } = useVillageStore() // 👈 หมู่บ้านที่กำลังดูอยู่ (null = ทุกหมู่บ้าน, เฉพาะ superadmin)
  const [cameras, setCameras] = useState([])
  const [isLoadingCameras, setIsLoadingCameras] = useState(true)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [searchParams] = useSearchParams()
  const videoRef = useRef(null)
  const [isVideoLoading, setIsVideoLoading] = useState(true)
  const [hasStreamError, setHasStreamError] = useState(false)

  // ข้อมูล detection ล่าสุดจาก /api/detections/live
  const [latestCaptures, setLatestCaptures] = useState([])
  const [isLoadingDetections, setIsLoadingDetections] = useState(true)

  // ดึงรายการกล้องจาก backend ตอนเปิดหน้า
  // ยึดตาม selectedVillageId (หมู่บ้านที่กำลังดูอยู่) ไม่ใช่ user.village_id ตรงๆ
  // เพราะ superadmin สลับหมู่บ้านผ่าน dropdown ใน Navbar ได้
  useEffect(() => {
    async function fetchCameras() {
      if (!user) return   // รอแค่ login เสร็จ ไม่ใช่รอ village_id

      setIsLoadingCameras(true)
      try {
        // ส่ง selectedVillageId ไปถ้ามี (admin ถูกล็อกไว้ / superadmin เลือกจาก dropdown)
        // ไม่ส่ง (null) ถ้า superadmin เลือก "ทุกหมู่บ้าน" → ได้ทุกหมู่บ้าน
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

  // Reset loading ทุกครั้งที่เปลี่ยนกล้อง
  useEffect(() => {
    setIsVideoLoading(true)
  }, [selectedCamera])

  // โหลดวิดีโอ HLS
  useEffect(() => {
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
  }, [currentCameraData?.stream_url])

  // Polling ดึง latest detection ทุกๆ POLLING_INTERVAL_MS วินาที
  useEffect(() => {
    if (!selectedCamera) return

    let isCancelled = false

    async function fetchLive() {
      try {
        const data = await getCameraLiveAPI(selectedCamera, 5)
        if (!isCancelled) {
          setLatestCaptures(data.latest_captures || [])
        }
      } catch (error) {
        console.error(error)
        // ไม่ต้องเด้ง alert ทุกครั้งที่ polling พลาด กันรบกวนผู้ใช้ถี่เกินไป
      } finally {
        if (!isCancelled) setIsLoadingDetections(false)
      }
    }

    setIsLoadingDetections(true)
    fetchLive() // ดึงทันทีครั้งแรกตอนเปลี่ยนกล้อง ไม่ต้องรอ interval รอบแรก

    const interval = setInterval(fetchLive, POLLING_INTERVAL_MS)

    return () => {
      isCancelled = true
      clearInterval(interval)
    }
  }, [selectedCamera])

  const latestCapture = latestCaptures[0] || null

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
            disabled={isLoadingCameras || cameras.length === 0}
          >
            {isLoadingCameras ? (
              <option value="">กำลังโหลดกล้อง...</option>
            ) : cameras.length === 0 ? (
              <option value="">ไม่พบกล้องในระบบ</option>
            ) : (
              cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="monitor-content">

          {/* ฝั่งซ้าย: วิดีโอ */}
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

          {/* ฝั่งขวา: ข้อมูล */}
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

      </div>
    </Layout>
  )
}

export default Monitor