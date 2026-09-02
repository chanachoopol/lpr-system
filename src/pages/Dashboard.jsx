import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import MapView from '../components/Map'
import { getTodayDashboardAPI, getCameraListAPI, getAuthedImageURL, getDetectionsAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { FaCar, FaEye, FaRoute } from 'react-icons/fa'
import { FaXmark } from 'react-icons/fa6'
import '../styles/Dashboard.css'
import '../styles/History.css' // 👈 ใช้ style ของ modal ดูรูป (modal-img-section, image-fullscreen-overlay ฯลฯ) ร่วมกับหน้า History
import '../styles/Blacklist.css' // 👈 ใช้ style ของตารางและ modal แบบเดียวกับ Blacklist Detection Records

const RECENT_HISTORY_LIMIT = 5
const DASHBOARD_POLL_INTERVAL_MS = 15000

const STORAGE_KEY_CAMERAS_HISTORY = 'lpr_historical_cameras'

function getHistoricalCameras() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAMERAS_HISTORY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function saveHistoricalCameras(camerasList) {
  try {
    if (!Array.isArray(camerasList)) return
    const existing = getHistoricalCameras()
    let changed = false
    camerasList.forEach((c) => {
      if (c && c.id && c.name) {
        if (existing[c.id] !== c.name) {
          existing[c.id] = c.name
          changed = true
        }
      }
    })
    if (changed) {
      localStorage.setItem(STORAGE_KEY_CAMERAS_HISTORY, JSON.stringify(existing))
    }
  } catch (e) {}
}

function toDateParam(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dateKeyOf(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getVisiblePageNumbers(currentPage, totalPages, maxVisible = 4) {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
  let end = start + maxVisible - 1
  if (end > totalPages) {
    end = totalPages
    start = end - maxVisible + 1
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
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
  const navigate = useNavigate()
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
      saveHistoricalCameras(data.items)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingCameras(false)
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // คืนเฉพาะชื่อกล้องสำหรับแสดงในตาราง
  function getCameraNameOnly(cameraId, directName) {
    const currentCam = cameras.find((c) => String(c.id) === String(cameraId))
    if (currentCam) return currentCam.name
    const hist = getHistoricalCameras()
    return directName || (cameraId ? hist[cameraId] : null) || 'กล้องที่ไม่ทราบชื่อ'
  }

  // หาชื่อกล้องจาก camera_id + แสดงหมายเหตุหากกล้องถูกลบออกจากระบบไปแล้ว (ใช้ในหน้าต่าง View รายละเอียด)
  function renderCameraDisplay(cameraId, directName) {
    const currentCam = cameras.find((c) => String(c.id) === String(cameraId))
    if (currentCam) {
      return <span>{currentCam.name}</span>
    }
    const hist = getHistoricalCameras()
    const name = directName || (cameraId ? hist[cameraId] : null) || 'กล้องที่ไม่ทราบชื่อ'
    return (
      <div>
        <span>{name}</span>
        <span
          style={{
            fontSize: 11,
            color: '#94a3b8',
            display: 'block',
            marginTop: 2,
            fontWeight: 500
          }}
        >
          (กล้องนี้ถูกลบออกจากระบบแล้ว)
        </span>
      </div>
    )
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
      latestLimit: RECENT_HISTORY_LIMIT
    })
    setDailyData(data)
    setHistory((data.latest_detections || []).slice(0, RECENT_HISTORY_LIMIT))
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

    const detVillageId = latestDetection.village_id || latestDetection.camera?.village_id
    // superadmin scope global ได้ทุกหมู่บ้าน — ถ้ากำลังเลือกดูหมู่บ้านเดียวอยู่ ให้กรองให้ตรง
    if (selectedVillageId && detVillageId && detVillageId !== selectedVillageId) {
      return
    }

    const detId = latestDetection.detection_id || latestDetection.id || `det-${Date.now()}`

    setHistory((prev) => {
      if (
        prev.some(
          (item) =>
            item.id === detId ||
            (item.license_plate === latestDetection.license_plate &&
              item.time_detect === latestDetection.time_detect)
        )
      ) {
        return prev
      }
      const newItem = {
        id: detId,
        time_detect: latestDetection.time_detect || latestDetection.created_at || new Date().toISOString(),
        license_plate: latestDetection.license_plate,
        province: latestDetection.province,
        color: latestDetection.color,
        is_blacklist: latestDetection.is_blacklist || latestDetection.is_black_list || latestDetection.blacklist,
        is_whitelist: latestDetection.is_whitelist || latestDetection.is_white_list || latestDetection.whitelist,
        image_full: latestDetection.image_full || latestDetection.image_url,
        image_crop: latestDetection.image_crop || latestDetection.crop_url,
        camera_id: latestDetection.camera_id,
        camera: latestDetection.camera
      }
      return [newItem, ...prev].slice(0, RECENT_HISTORY_LIMIT)
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

  // คืนหน่วยความจำ blob URL ทิ้งเมื่อ modalImages เปลี่ยนหรือ unmount กัน memory leak
  useEffect(() => {
    return () => {
      if (modalImages.crop) URL.revokeObjectURL(modalImages.crop)
      if (modalImages.full) URL.revokeObjectURL(modalImages.full)
    }
  }, [modalImages])

  // ---------- Modal รายการรถขาเข้า / ขาออก วันนี้ ----------
  const [directionModal, setDirectionModal] = useState(null) // { direction: 'entry' | 'exit', title: string } | null
  const [directionList, setDirectionList] = useState([])
  const [directionTotal, setDirectionTotal] = useState(0)
  const [directionPage, setDirectionPage] = useState(1)
  const [isLoadingDirection, setIsLoadingDirection] = useState(false)

  const fetchDirectionDetections = useCallback(async (dir, page = 1) => {
    if (!dir) return
    setIsLoadingDirection(true)
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

      const params = {
        direction: dir,
        time_detect_from: startOfDay.toISOString(),
        time_detect_to: endOfDay.toISOString(),
        page: page,
        page_size: 10
      }
      if (selectedVillageId) {
        params.village_id = selectedVillageId
      }

      const res = await getDetectionsAPI(params)
      setDirectionList(res.items || [])
      setDirectionTotal(res.total || 0)
      setDirectionPage(page)
    } catch (err) {
      console.error('โหลดรายการรถตามทิศทางไม่สำเร็จ:', err)
    } finally {
      setIsLoadingDirection(false)
    }
  }, [selectedVillageId])

  function openDirectionModal(dir, title) {
    setDirectionModal({ direction: dir, title })
    fetchDirectionDetections(dir, 1)
  }

  function closeDirectionModal() {
    setDirectionModal(null)
    setDirectionList([])
    setDirectionTotal(0)
    setDirectionPage(1)
  }

  // ปิด modal / fullscreen เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (fullscreenImage) {
          setFullscreenImage(null)
        } else if (selectedItem) {
          closeModal()
        } else if (directionModal) {
          closeDirectionModal()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreenImage, selectedItem, directionModal])

  function handleGoToRouteTracking(item) {
    if (!item) return
    const params = new URLSearchParams({
      plate: item.license_plate || '',
      province: item.province || '',
      date: dateKeyOf(item.time_detect)
    })
    navigate(`/route-tracking?${params.toString()}`)
  }

  function closeModal() {
    if (modalImages.crop) URL.revokeObjectURL(modalImages.crop)
    if (modalImages.full) URL.revokeObjectURL(modalImages.full)
    setSelectedItem(null)
  }

  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div
            className="stat-card stat-card-clickable"
            onClick={() => openDirectionModal('entry', 'รายการรถผ่านจุดตรวจขาเข้า (วันนี้)')}
            title="คลิกเพื่อดูรายละเอียดรถขาเข้าวันนี้"
          >
            <p className="stat-label">รถผ่านจุดตรวจขาเข้า (วันนี้)</p>
            <h2 className="stat-val blue">
              {isLoadingStats ? '—' : (dailyData?.entry_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div
            className="stat-card stat-card-clickable"
            onClick={() => openDirectionModal('exit', 'รายการรถผ่านจุดตรวจขาออก (วันนี้)')}
            title="คลิกเพื่อดูรายละเอียดรถขาออกวันนี้"
          >
            <p className="stat-label">รถผ่านจุดตรวจขาออก (วันนี้)</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.exit_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div
            className="stat-card stat-card-clickable"
            onClick={() => navigate('/blacklist?tab=whitelist')}
            title="คลิกเพื่อดูรายการ Whitelist"
          >
            <p className="stat-label">จำนวนทะเบียนที่ได้รับอนุญาต (วันนี้)</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.whitelist_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div
            className="stat-card stat-card-clickable"
            onClick={() => navigate('/blacklist?tab=blacklist')}
            title="คลิกเพื่อดูรายการ Blacklist"
          >
            <p className="stat-label">จำนวนทะเบียนเฝ้าระวัง (วันนี้)</p>
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
              <div className="video-skeleton" style={{ flex: 1, minHeight: '540px', borderRadius: '16px' }}>
                <Spinner text="กำลังโหลดตำแหน่งกล้อง..." />
              </div>
            ) : (
              <div className="dashboard-map-container">
                <MapView cameras={cameras} />
              </div>
            )}
          </div>

          <div className="content-card">
            <h3 className="card-title">Recent History</h3>
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>License Plate</th>
                    <th>Province</th>
                    <th>Camera</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingHistory ? (
                    <tr>
                      <td colSpan="6">
                        <Spinner text="กำลังโหลด..." />
                      </td>
                    </tr>
                  ) : history.length > 0 ? (
                    history.map((item) => {
                      const isBlacklist = Boolean(
                        item.is_blacklist ||
                        item.is_blacklisted ||
                        item.category === 'blacklist' ||
                        item.type === 'blacklist'
                      )
                      return (
                        <tr key={item.id} className={isBlacklist ? 'history-row-blacklist' : ''}>
                          <td>{formatDate(item.time_detect)}</td>
                          <td>{formatTime(item.time_detect)}</td>
                          <td className="plate-text">{item.license_plate}</td>
                          <td>{item.province}</td>
                          <td>{getCameraNameOnly(item.camera_id, item.camera_name || item.camera?.name)}</td>
                          <td>
                            <button className="btn-view" onClick={() => setSelectedItem(item)}>
                              <FaEye /> View
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan="6">
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

      {/* Modal รายการรถขาเข้า / ขาออก วันนี้ (สไตล์เดียวกับ Blacklist Detection Records) */}
      {directionModal && (
        <div className="modal-overlay" onClick={closeDirectionModal}>
          <div className="modal-content modal-large bl-direction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>
                  {directionModal.title} ({directionTotal.toLocaleString()})
                </h3>
              </div>
              <div className="modal-header-right">
                <button className="modal-close" onClick={closeDirectionModal}>
                  <FaXmark />
                </button>
              </div>
            </div>

            <div className="modal-registered-body" style={{ padding: '20px 24px' }}>
              <div className="table-responsive" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="bl-table">
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
                    {isLoadingDirection ? (
                      <tr>
                        <td colSpan={8}>
                          <Spinner text="กำลังโหลดข้อมูล..." />
                        </td>
                      </tr>
                    ) : directionList.length > 0 ? (
                      directionList.map((item, index) => {
                        const isBlacklist = Boolean(
                          item.is_blacklist ||
                          item.is_blacklisted ||
                          item.category === 'blacklist' ||
                          item.type === 'blacklist'
                        )
                        return (
                          <tr key={item.id || index} className={isBlacklist ? 'history-row-blacklist' : ''}>
                            <td>{(directionPage - 1) * 10 + index + 1}</td>
                            <td>{formatDate(item.time_detect)}</td>
                            <td>{formatTime(item.time_detect)}</td>
                            <td className="bold-plate" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {item.license_plate}
                            </td>
                            <td>{item.province || '-'}</td>
                            <td>{item.color || '-'}</td>
                            <td>{getCameraNameOnly(item.camera_id, item.camera_name || item.camera?.name)}</td>
                            <td>
                              <button className="btn-bl-view" onClick={() => setSelectedItem(item)}>
                                <FaEye /> View
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState icon={<FaCar />} title="ไม่มีข้อมูลรถในช่วงเวลานี้" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination (สไตล์ Blacklist) */}
              {Math.ceil(directionTotal / 10) > 1 && (
                <div className="pagination" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="page-btn"
                    disabled={directionPage === 1 || isLoadingDirection}
                    onClick={() => fetchDirectionDetections(directionModal.direction, directionPage - 1)}
                  >
                    ‹
                  </button>

                  {getVisiblePageNumbers(directionPage, Math.ceil(directionTotal / 10), 4).map((page) => (
                    <button
                      key={page}
                      className={`page-btn ${directionPage === page ? 'active' : ''}`}
                      disabled={isLoadingDirection}
                      onClick={() => fetchDirectionDetections(directionModal.direction, page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="page-btn"
                    disabled={directionPage >= Math.ceil(directionTotal / 10) || isLoadingDirection}
                    onClick={() => fetchDirectionDetections(directionModal.direction, directionPage + 1)}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal รายละเอียด — เหมือนหน้า History.jsx ทุกประการ */}
      {selectedItem && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3>Vehicle Detail</h3>
                <button
                  type="button"
                  className="btn-route-tracking"
                  onClick={() => handleGoToRouteTracking(selectedItem)}
                  title="ดูเส้นทาง"
                >
                  <FaRoute /> Route Tracking
                </button>
              </div>
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
                  <span className="info-label">Color</span>
                  <span>{selectedItem.color || '-'}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Time</span>
                  <span>{formatDate(selectedItem.time_detect)} {formatTime(selectedItem.time_detect)}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Camera</span>
                  <span>{renderCameraDisplay(selectedItem.camera_id, selectedItem.camera_name || selectedItem.camera?.name)}</span>
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