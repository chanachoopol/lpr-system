import { useState, useEffect, useMemo } from 'react'
import { FaVideo, FaThLarge, FaSearch, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa'
import { FaXmark } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import '../styles/Monitor.css'
import { getCamerasAPI, getDetectionsAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import { useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import CameraGridTile from '../components/CameraGridTile'
import useCameraStream from '../hooks/useCameraStream'

const GRID_VIEW_VALUE = 'all' // 👈 ค่าพิเศษของ selectedCamera สำหรับโหมด Grid View

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

function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getDynamicMonitorLimit() {
  if (typeof window === 'undefined') return 5
  // คำนวณความสูงตารางที่เหลือ: หน้าจอรวม หักลบ Padding Layout (40), Navbar (72), Layout gap (20), Camera Bar (52), Monitor gap (12), Card Padding (32), Title (38), Plate Showcase (100), Table Header (38) = รวม ~384px เผื่อระยะขอบล่างเป็น 430px
  const availableTableHeight = window.innerHeight - 430
  const rowHeight = 40
  const rows = Math.floor(availableTableHeight / rowHeight)
  return Math.max(2, rows)
}

function Monitor() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const latestDetection = useNotificationStore((state) => state.latestDetection)
  const [cameras, setCameras] = useState([])
  const [isLoadingCameras, setIsLoadingCameras] = useState(true)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [searchParams] = useSearchParams()

  const [recentLimit, setRecentLimit] = useState(getDynamicMonitorLimit)
  const [latestCaptures, setLatestCaptures] = useState([])
  const [isLoadingDetections, setIsLoadingDetections] = useState(true)

  // Search & Sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState('time')
  const [sortOrder, setSortOrder] = useState('desc')

  function handleSort(key) {
    if (sortKey === key) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else if (sortOrder === 'desc') {
        // 3-state: กลับสู่ default (time desc)
        setSortKey('time')
        setSortOrder('desc')
      }
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  function renderSortIcon(key) {
    if (sortKey !== key) {
      return <FaSort className="sort-icon-inactive" />
    }
    if (sortOrder === 'asc') {
      return <FaSortUp className="sort-icon-active" />
    }
    return <FaSortDown className="sort-icon-active" />
  }

  const processedCaptures = useMemo(() => {
    let list = [...latestCaptures]

    // 1. กรองคำค้นหา (ป้ายทะเบียน หรือ จังหวัด) แบบ real-time
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((item) => {
        const plate = String(item.license_plate || '').toLowerCase()
        const province = String(item.province || '').toLowerCase()
        return plate.includes(q) || province.includes(q)
      })
    }

    // 2. จัดเรียงข้อมูลตามคอลัมน์ (Time, License Plate, Province)
    if (sortKey) {
      list.sort((a, b) => {
        let result = 0
        if (sortKey === 'time') {
          const tA = new Date(a.time_detect || 0).getTime()
          const tB = new Date(b.time_detect || 0).getTime()
          result = tA - tB
        } else if (sortKey === 'plate') {
          const pA = String(a.license_plate || '')
          const pB = String(b.license_plate || '')
          result = pA.localeCompare(pB, 'th', { numeric: true })
        } else if (sortKey === 'province') {
          const prA = String(a.province || '')
          const prB = String(b.province || '')
          result = prA.localeCompare(prB, 'th')
        }
        return sortOrder === 'asc' ? result : -result
      })
    }

    return list
  }, [latestCaptures, searchQuery, sortKey, sortOrder])

  // คำนวณจำนวนแถวที่พอดีกับหน้าจอเมื่อมีการปรับขนาดหน้าต่าง (Resize)
  useEffect(() => {
    function handleResize() {
      setRecentLimit(getDynamicMonitorLimit())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 👇 Grid View — true เมื่อเลือก "ทุกกล้อง"
  const isGridMode = selectedCamera === GRID_VIEW_VALUE

  // 👇 ดึง stream token + วน refresh JWT ก่อนหมดอายุ ผ่าน endpoint ใหม่จาก backend
  // (GET /api/cameras/{id}/stream-token) แทนของเดิมที่ refetch รายการกล้องทั้งหมดทุก 3 นาที
  // ปิดการทำงานตอนอยู่ Grid Mode ด้วยการส่ง cameraId เป็น null (ไม่ mount video เดี่ยวฝั่งซ้ายแล้ว)
  const {
    videoRef,
    isVideoLoading,
    hasStreamError,
    isDisabled: isCameraDisabled
  } = useCameraStream(isGridMode ? null : selectedCamera)

  useEffect(() => {
    async function fetchCameras() {
      if (!user) return

      setIsLoadingCameras(true)

      try {
        const data = await getCamerasAPI(selectedVillageId)
        setCameras(data)
        saveHistoricalCameras(data)

        const cameraFromURL = searchParams.get('camera')
        if (cameraFromURL && data.some((cam) => String(cam.id) === String(cameraFromURL))) {
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
  }, [user, selectedVillageId, searchParams])

  // ดึง latest detection ตาม recentLimit ตอนเลือกกล้องหรือเมื่อขยาย/ย่อหน้าจอ
  useEffect(() => {
    if (!selectedCamera || isGridMode) return

    let isCancelled = false

    async function fetchLive() {
      try {
        const data = await getDetectionsAPI({
          camera_id: selectedCamera,
          page: 1,
          page_size: recentLimit
        })
        if (!isCancelled) {
          const rawCaptures = Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.latest_captures)
            ? data.latest_captures
            : []
          setLatestCaptures(
            rawCaptures.slice(0, recentLimit).map((c) => ({
              id: c.id || c.detection_id,
              time_detect: c.time_detect,
              license_plate: c.license_plate,
              province: c.province || '-',
              color: c.color || '-',
              is_blacklist: Boolean(c.is_blacklist || c.is_blacklisted || c.category === 'blacklist' || c.type === 'blacklist')
            }))
          )
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!isCancelled) setIsLoadingDetections(false)
      }
    }

    setIsLoadingDetections(true)
    fetchLive()

    return () => {
      isCancelled = true
    }
  }, [selectedCamera, isGridMode, recentLimit])

  // อัปเดตรายการตรวจจับแบบ real-time ผ่าน SSE (Push จาก Backend ทันทีเมื่อตรวจจับได้ โดยไม่ยิง API ซ้ำ)
  useEffect(() => {
    if (isGridMode || !latestDetection) return
    const matchesCamera =
      String(latestDetection.camera?.id) === String(selectedCamera) ||
      String(latestDetection.camera_id) === String(selectedCamera)

    if (!matchesCamera) return

    setLatestCaptures((prev) => {
      if (prev.some((item) => item.id === latestDetection.detection_id)) return prev
      const isBlacklist = Boolean(latestDetection.is_blacklist)
      const newItem = {
        id: latestDetection.detection_id,
        time_detect: latestDetection.time_detect,
        license_plate: latestDetection.license_plate,
        province: latestDetection.province,
        color: latestDetection.color,
        is_blacklist: isBlacklist
      }
      return [newItem, ...prev].slice(0, recentLimit)
    })
  }, [latestDetection, selectedCamera, isGridMode, recentLimit])

  const latestCapture = latestCaptures[0] || null

  return (
    <Layout title="Monitor">
      <div className={`monitor-wrapper ${isGridMode ? 'grid-view' : 'single-view'}`}>

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
          /* ---------- Single Camera View ---------- */
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
                ) : isCameraDisabled ? (
                  <div className="video-skeleton">
                    <EmptyState
                      icon={<FaVideo />}
                      title="กล้องนี้ถูกปิดใช้งาน"
                      description="กล้องนี้ถูกปิดใช้งานอยู่ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ"
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
              <div className="monitor-table-header">
                <h3 className="card-title" style={{ margin: 0 }}>Latest Capture</h3>
                <div className="monitor-search-wrap">
                  <FaSearch className="monitor-search-icon" />
                  <input
                    type="text"
                    placeholder="ค้นหาป้ายทะเบียน / จังหวัด..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="monitor-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="monitor-search-clear"
                      onClick={() => setSearchQuery('')}
                      title="ล้างคำค้นหา"
                    >
                      <FaXmark />
                    </button>
                  )}
                </div>
              </div>

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
                      <th className="sortable-th" onClick={() => handleSort('time')} title="คลิกเพื่อเรียงลำดับตามเวลา">
                        <div className="th-content">
                          <span>Time</span>
                          {renderSortIcon('time')}
                        </div>
                      </th>
                      <th className="sortable-th" onClick={() => handleSort('plate')} title="คลิกเพื่อเรียงลำดับตามป้ายทะเบียน">
                        <div className="th-content">
                          <span>License Plate</span>
                          {renderSortIcon('plate')}
                        </div>
                      </th>
                      <th className="sortable-th" onClick={() => handleSort('province')} title="คลิกเพื่อเรียงลำดับตามจังหวัด">
                        <div className="th-content">
                          <span>Province</span>
                          {renderSortIcon('province')}
                        </div>
                      </th>
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
                    ) : processedCaptures.length > 0 ? (
                      processedCaptures.map((item) => {
                        const isBlacklist = Boolean(item.is_blacklist)
                        return (
                          <tr key={item.id} className={isBlacklist ? 'history-row-blacklist' : ''}>
                            <td>{formatTime(item.time_detect)}</td>
                            <td className={`bold-plate ${isBlacklist ? 'plate-text' : ''}`}>
                              {item.license_plate}
                            </td>
                            <td>{item.province}</td>
                            <td>{item.color}</td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan="4">
                          <EmptyState
                            title={searchQuery ? "ไม่พบข้อมูลที่ค้นหา" : "No capture yet"}
                            description={searchQuery ? "ลองเปลี่ยนคำค้นหาป้ายทะเบียนหรือจังหวัด" : "Waiting for vehicle detection..."}
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