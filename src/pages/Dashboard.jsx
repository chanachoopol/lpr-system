import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import MapView from '../components/Map'
import { getTodayDashboardAPI, getCameraListAPI, getAuthedImageURL } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { FaCar, FaEye } from 'react-icons/fa'
import { FaXmark } from 'react-icons/fa6'
import '../styles/Dashboard.css'
import '../styles/History.css' // 👈 ใช้ style ของ modal ดูรูป (modal-img-section, image-fullscreen-overlay ฯลฯ) ร่วมกับหน้า History

const RECENT_HISTORY_LIMIT = 10

function toDateParam(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// เพิ่มเข้ามาให้ตรงกับหน้า History.jsx (แสดงวันที่แยกจากเวลา)
function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH')
}

function Dashboard() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const latestDetection = useNotificationStore((state) => state.latestDetection)

  

  // ---------- Camera Map ----------
  const [cameras, setCameras] = useState([])
  const [isLoadingCameras, setIsLoadingCameras] = useState(true)

  const fetchCameras = useCallback(async () => {
    if (!user) return
    setIsLoadingCameras(true)
    try {
      const data = await getCameraListAPI({
        villageId: selectedVillageId || undefined,
        page: 1,
        pageSize: 100
      })
      setCameras(data.items)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingCameras(false)
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // หาชื่อกล้องจาก camera_id — reuse "cameras" ที่ดึงมาแสดงบนแผนที่อยู่แล้ว (เหมือน pattern ใน History.jsx)
  function getCameraName(cameraId) {
    const cam = cameras.find((c) => c.id === cameraId)
    return cam ? cam.name : '-'
  }

  // ---------- Stat Cards + Recent History (endpoint เดียว) ----------
const [dailyData, setDailyData] = useState(null)
const [isLoadingStats, setIsLoadingStats] = useState(true)
const [history, setHistory] = useState([])
const [isLoadingHistory, setIsLoadingHistory] = useState(true)

const fetchDashboard = useCallback(async () => {
  if (!user) return
  setIsLoadingStats(true)
  setIsLoadingHistory(true)
  try {
    const data = await getTodayDashboardAPI({
      villageId: selectedVillageId || undefined,
      latestLimit: 10
    })
    setDailyData(data)
    setHistory(data.latest_detections || [])
  } catch (error) {
    console.error(error)
  } finally {
    setIsLoadingStats(false)
    setIsLoadingHistory(false)
  }
}, [user, selectedVillageId])

useEffect(() => {
  fetchDashboard()
}, [fetchDashboard])
  // bump รถที่ตรวจจับล่าสุดขึ้นบนสุดตาราง แบบ real-time ผ่าน SSE
  useEffect(() => {
    if (!latestDetection) return

    // superadmin scope global ได้ทุกหมู่บ้าน — ถ้ากำลังเลือกดูหมู่บ้านเดียวอยู่ ให้กรองให้ตรง
    if (selectedVillageId && latestDetection.camera?.village_id
        && latestDetection.camera.village_id !== selectedVillageId) {
      return
    }

    setHistory((prev) => {
  if (prev.some((item) => item.id === latestDetection.detection_id)) return prev
  const newItem = {
    id: latestDetection.detection_id,
    time_detect: latestDetection.time_detect,
    license_plate: latestDetection.license_plate,
    province: latestDetection.province,
    color: latestDetection.color
  }
  return [newItem, ...prev].slice(0, 10) // 👈 เดิมใช้ RECENT_HISTORY_LIMIT ตอนนี้ hardcode ให้ตรงกับ latestLimit ที่ยิงไป
})
  }, [latestDetection, selectedVillageId])

  // ---------- Modal ดูรายละเอียด/รูปภาพ (pattern เดียวกับ History.jsx) ----------
  const [selectedItem, setSelectedItem] = useState(null)
  const [modalImages, setModalImages] = useState({ crop: null, full: null })
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState(null)

  useEffect(() => {
    if (!selectedItem) {
      setModalImages({ crop: null, full: null })
      return
    }

    let isCancelled = false
    setIsLoadingImages(true)

    async function loadImages() {
      try {
        const [cropURL, fullURL] = await Promise.all([
          selectedItem.image_crop ? getAuthedImageURL(selectedItem.image_crop) : null,
          selectedItem.image_full ? getAuthedImageURL(selectedItem.image_full) : null
        ])
        if (!isCancelled) {
          setModalImages({ crop: cropURL, full: fullURL })
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!isCancelled) setIsLoadingImages(false)
      }
    }

    loadImages()

    return () => {
      isCancelled = true
    }
  }, [selectedItem])

  function closeModal() {
    // คืนหน่วยความจำ blob URL ทิ้งตอนปิด modal กัน memory leak
    if (modalImages.crop) URL.revokeObjectURL(modalImages.crop)
    if (modalImages.full) URL.revokeObjectURL(modalImages.full)
    setSelectedItem(null)
  }

  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div className="stat-card">
            <p className="stat-label">จำนวนรถที่เข้าวันนี้</p>
            <h2 className="stat-val blue">
              {isLoadingStats ? '—' : (dailyData?.entry_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">จำนวนรถที่ออกวันนี้</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.exit_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Whitelist Today</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.whitelist_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Blacklist Today</p>
            <h2 className="stat-val red">
              {isLoadingStats ? '—' : (dailyData?.blacklist_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
        </div>

        {/* แถวล่าง */}
        <div className="bottom-row">
          <div className="content-card">
            <h3 className="card-title">LPR Camera Map</h3>
            {isLoadingCameras ? (
              <div className="video-skeleton" style={{ height: '100%', minHeight: '300px', borderRadius: '16px' }}>
                <Spinner text="กำลังโหลดตำแหน่งกล้อง..." />
              </div>
            ) : (
              <MapView cameras={cameras} />
            )}
          </div>

          <div className="content-card">
            <h3 className="card-title">Recent History</h3>
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>License Plate</th>
                    <th>Province</th>
                    <th>Color</th>
                    <th>Camera</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingHistory ? (
                    <tr>
                      <td colSpan="8">
                        <Spinner text="กำลังโหลด..." />
                      </td>
                    </tr>
                  ) : history.length > 0 ? (
                    history.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>{formatDate(item.time_detect)}</td>
                        <td>{formatTime(item.time_detect)}</td>
                        <td className="plate-text">{item.license_plate}</td>
                        <td>{item.province}</td>
                        <td>{item.color}</td>
                        <td>{getCameraName(item.camera_id)}</td>
                        <td>
                          <button className="btn-view" onClick={() => setSelectedItem(item)}>
                            <FaEye /> View
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8">
                        <EmptyState icon={<FaCar />} title="No data available" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* Modal รายละเอียด — เหมือนหน้า History.jsx ทุกประการ */}
      {selectedItem && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Vehicle Detail</h3>
              <button className="modal-close" onClick={closeModal}>
                <FaXmark />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-img-section">
                <div className="modal-img-placeholder">
                  {isLoadingImages ? (
                    <Spinner text="กำลังโหลดรูป..." />
                  ) : modalImages.full ? (
                    <img
                      src={modalImages.full}
                      alt="Full capture"
                      onClick={() => setFullscreenImage(modalImages.full)}
                      style={{ cursor: 'zoom-in' }}
                    />
                  ) : (
                    <p>ไม่มีรูปภาพ</p>
                  )}
                </div>
                <div className="modal-img-placeholder small">
                  {isLoadingImages ? (
                    <Spinner text="" />
                  ) : modalImages.crop ? (
                    <img
                      src={modalImages.crop}
                      alt="Plate crop"
                      onClick={() => setFullscreenImage(modalImages.crop)}
                      style={{ cursor: 'zoom-in' }}
                    />
                  ) : (
                    <p>ไม่มีรูปป้าย</p>
                  )}
                </div>
              </div>
              <div className="modal-info">
                <div className="modal-info-row">
                  <span className="info-label">License Plate</span>
                  <span className="plate-text">{selectedItem.license_plate}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Province</span>
                  <span>{selectedItem.province}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Time</span>
                  <span>{formatDate(selectedItem.time_detect)} {formatTime(selectedItem.time_detect)}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Camera</span>
                  <span>{getCameraName(selectedItem.camera_id)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* รูปเต็มจอ — คลิกรูปใน modal แล้วมาโผล่ตรงนี้ */}
      {fullscreenImage && (
        <div className="image-fullscreen-overlay" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="Full size" />
        </div>
      )}
    </Layout>
  )
}

export default Dashboard