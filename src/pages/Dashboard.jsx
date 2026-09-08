import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import MapView from '../components/Map'
import { getTodayDashboardAPI, getCameraListAPI, getAuthedImageURL, getDetectionsAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import { renderVillageDisplay } from '../components/VillageDisplay'
import useNotificationStore from '../store/notificationStore'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { FaCar, FaEye, FaRoute, FaSearch } from 'react-icons/fa'
import { FaXmark, FaArrowDownWideShort, FaArrowUpWideShort } from 'react-icons/fa6'
import '../styles/Dashboard.css'
import '../styles/History.css' // 👈 ใช้ style ของ modal ดูรูป (modal-img-section, image-fullscreen-overlay ฯลฯ) ร่วมกับหน้า History
import '../styles/Blacklist.css' // 👈 ใช้ style ของตารางและ modal แบบเดียวกับ Blacklist Detection Records

const DASHBOARD_RECENT_LIMIT = 20


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

function formatDirection(dir, cameraDir) {
  const d = String(dir || cameraDir || '').toLowerCase().trim()
  if (d === 'in' || d === 'entry' || d === 'เข้า' || d === 'ขาเข้า') return 'ขาเข้า (Entry)'
  if (d === 'out' || d === 'exit' || d === 'ออก' || d === 'ขาออก') return 'ขาออก (Exit)'
  return dir || cameraDir || '-'
}

function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { selectedVillageId, villages } = useVillageStore()
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
  const processedDetectionsRef = useRef(new Set())

  const fetchDashboard = useCallback(async (isSilent = false) => {
    if (!user) return
    if (!isSilent) {
      setIsLoadingStats(true)
      setIsLoadingHistory(true)
    }
    try {
      const data = await getTodayDashboardAPI({
        villageId: selectedVillageId || undefined,
        latestLimit: DASHBOARD_RECENT_LIMIT
      })
      setDailyData(data)
      setHistory((data.latest_detections || []).slice(0, DASHBOARD_RECENT_LIMIT))
    } catch (error) {
      console.error(error)
    } finally {
      if (!isSilent) {
        setIsLoadingStats(false)
        setIsLoadingHistory(false)
      }
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Real-time: อัปเดตตัวเลข KPI Cards (+1 ทันที 0 วินาที) และ bump รถที่ตรวจจับล่าสุดขึ้นบนสุดตาราง
  useEffect(() => {
    if (!latestDetection) return

    const detVillageId = latestDetection.camera?.village_id || latestDetection.village_id
    // superadmin scope global ได้ทุกหมู่บ้าน — ถ้ากำลังเลือกดูหมู่บ้านเดียวอยู่ ให้กรองให้ตรง
    if (selectedVillageId && detVillageId && String(detVillageId) !== String(selectedVillageId)) {
      return
    }

    // ป้องกันการนับเบิ้ล (+2 แล้วลด 1) กรณี Backend ส่ง event ซ้ำสำหรับรถคันเดียวกัน (เช่น detection_created + whitelist_alert)
    const detKey = latestDetection.detection_id || `${latestDetection.license_plate}-${latestDetection.time_detect}`
    if (processedDetectionsRef.current.has(detKey)) {
      return
    }
    processedDetectionsRef.current.add(detKey)
    if (processedDetectionsRef.current.size > 100) {
      const firstKey = processedDetectionsRef.current.values().next().value
      processedDetectionsRef.current.delete(firstKey)
    }

    const isEntry = latestDetection.direction === 'in'
    const isExit = latestDetection.direction === 'out'
    const isBlacklist = Boolean(latestDetection.is_blacklist)
    const isWhitelist = Boolean(latestDetection.is_whitelist)

    // 1. Optimistic Update ตัวเลข KPI Cards ทันที 0 วินาที (ไม่ติด Spinner ไม่กระพริบ และนับครั้งเดียวแม่นยำ)
    setDailyData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        entry_detections_today: (prev.entry_detections_today || 0) + (isEntry ? 1 : 0),
        exit_detections_today: (prev.exit_detections_today || 0) + (isExit ? 1 : 0),
        whitelist_detections_today: (prev.whitelist_detections_today || 0) + (isWhitelist ? 1 : 0),
        blacklist_detections_today: (prev.blacklist_detections_today || 0) + (isBlacklist ? 1 : 0),
        total_detections_today: (prev.total_detections_today || 0) + 1
      }
    })

    // 2. อัปเดตตาราง Recent History ทันที
    const detId = latestDetection.detection_id || `det-${Date.now()}`

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
        time_detect: latestDetection.time_detect || new Date().toISOString(),
        license_plate: latestDetection.license_plate,
        province: latestDetection.province,
        color: latestDetection.color,
        direction: latestDetection.direction || (isEntry ? 'in' : isExit ? 'out' : null),
        is_blacklist: isBlacklist,
        is_whitelist: isWhitelist,
        image_full: latestDetection.image_full,
        image_crop: latestDetection.image_crop,
        camera_id: latestDetection.camera?.id,
        camera: latestDetection.camera
      }
      return [newItem, ...prev].slice(0, DASHBOARD_RECENT_LIMIT)
    })

    // 3. Silent Re-sync สถิติที่ถูกต้องสมบูรณ์จาก Backend ในพื้นหลังแบบเนียนตา (ไม่มี Spinner)
    const timer = setTimeout(() => {
      fetchDashboard(true)
    }, 600)
    return () => clearTimeout(timer)
  }, [latestDetection, selectedVillageId, fetchDashboard])

  // ---------- ค้นหาและเรียงลำดับตารางประวัติการตรวจจับ (วันนี้) ----------
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('desc') // default time desc (ล่าสุดก่อน)

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
  }

  const processedHistory = useMemo(() => {
    let list = [...history]

    // 1. กรองคำค้นหา (ป้ายทะเบียน, จังหวัด, สี หรือชื่อกล้อง) แบบ real-time
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((item) => {
        const plate = String(item.license_plate || '').toLowerCase()
        const province = String(item.province || '').toLowerCase()
        const color = String(item.color || '').toLowerCase()
        const cam = String(
          getCameraNameOnly(item.camera_id, item.camera_name || item.camera?.name) || ''
        ).toLowerCase()
        return plate.includes(q) || province.includes(q) || color.includes(q) || cam.includes(q)
      })
    }

    // 2. จัดเรียงข้อมูลตามเวลา (ใหม่ไปเก่า / เก่าไปใหม่)
    list.sort((a, b) => {
      const tA = new Date(a.time_detect || 0).getTime()
      const tB = new Date(b.time_detect || 0).getTime()
      return sortOrder === 'asc' ? tA - tB : tB - tA
    })

    return list
  }, [history, searchQuery, sortOrder, cameras])

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

  // ---------- Modal รายการรถขาเข้า / ขาออก วันนี้ ----------
  const [directionModal, setDirectionModal] = useState(null) // { direction: 'entry' | 'exit', title: string } | null
  const [directionList, setDirectionList] = useState([])
  const [directionPage, setDirectionPage] = useState(1)
  const [isLoadingDirection, setIsLoadingDirection] = useState(false)
  const [directionSearchQuery, setDirectionSearchQuery] = useState('')
  const [directionSortOrder, setDirectionSortOrder] = useState('desc')

  const DIRECTION_PAGE_SIZE = 10

  const fetchDirectionDetections = useCallback(async (dir, isInitial = false) => {
    if (!dir) return
    if (isInitial) {
      setIsLoadingDirection(true)
    }
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

      const params = {
        direction: dir,
        time_detect_from: startOfDay.toISOString(),
        time_detect_to: endOfDay.toISOString(),
        page: 1,
        page_size: 100
      }
      if (selectedVillageId) {
        params.village_id = selectedVillageId
      }

      const res = await getDetectionsAPI(params)
      const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []
      setDirectionList(items)
    } catch (err) {
      console.error('โหลดรายการรถตามทิศทางไม่สำเร็จ:', err)
    } finally {
      setIsLoadingDirection(false)
    }
  }, [selectedVillageId])

  function openDirectionModal(dir, title) {
    setDirectionModal({ direction: dir, title })
    setDirectionList([])
    setDirectionSearchQuery('')
    setDirectionSortOrder('desc')
    setDirectionPage(1)
    fetchDirectionDetections(dir, true)
  }

  function closeDirectionModal() {
    setDirectionModal(null)
    setDirectionList([])
    setDirectionSearchQuery('')
    setDirectionSortOrder('desc')
    setDirectionPage(1)
  }

  function toggleDirectionSortOrder() {
    setDirectionSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
  }

  const processedDirectionList = useMemo(() => {
    let list = [...directionList]

    // 1. กรองคำค้นหา (ป้ายทะเบียน, จังหวัด, สี หรือชื่อกล้อง) แบบ real-time
    if (directionSearchQuery.trim()) {
      const q = directionSearchQuery.trim().toLowerCase()
      list = list.filter((item) => {
        const plate = String(item.license_plate || '').toLowerCase()
        const province = String(item.province || '').toLowerCase()
        const color = String(item.color || '').toLowerCase()
        const camName = String(
          getCameraNameOnly(item.camera_id, item.camera_name || item.camera?.name) || ''
        ).toLowerCase()
        return plate.includes(q) || province.includes(q) || color.includes(q) || camName.includes(q)
      })
    }

    // 2. จัดเรียงข้อมูลตามเวลา (ใหม่ไปเก่า / เก่าไปใหม่)
    list.sort((a, b) => {
      const tA = new Date(a.time_detect || 0).getTime()
      const tB = new Date(b.time_detect || 0).getTime()
      return directionSortOrder === 'asc' ? tA - tB : tB - tA
    })

    return list
  }, [directionList, directionSearchQuery, directionSortOrder, cameras])

  const totalDirectionPages = Math.ceil(processedDirectionList.length / DIRECTION_PAGE_SIZE) || 1
  const displayedDirectionItems = useMemo(() => {
    const start = (directionPage - 1) * DIRECTION_PAGE_SIZE
    return processedDirectionList.slice(start, start + DIRECTION_PAGE_SIZE)
  }, [processedDirectionList, directionPage])


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
    setModalImages({ crop: null, full: null })
    setSelectedItem(null)
  }

  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div
            className="stat-card stat-card-clickable"
            onClick={() => openDirectionModal('entry', 'รายการรถเข้าวันนี้')}
            title="คลิกเพื่อดูรายละเอียดรถเข้าวันนี้"
          >
            <p className="stat-label">จำนวนรถเข้าวันนี้</p>
            <h2 className="stat-val blue">
              {isLoadingStats ? '—' : (dailyData?.entry_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div
            className="stat-card stat-card-clickable"
            onClick={() => openDirectionModal('exit', 'รายการรถออกวันนี้')}
            title="คลิกเพื่อดูรายละเอียดรถออกวันนี้"
          >
            <p className="stat-label">จำนวนรถออกวันนี้</p>
            <h2 className="stat-val blue">
              {isLoadingStats ? '—' : (dailyData?.exit_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div
            className="stat-card stat-card-clickable"
            onClick={() => navigate('/blacklist?tab=whitelist')}
            title="คลิกเพื่อดูรายการ Whitelist"
          >
            <p className="stat-label">ไวท์ลิสต์วันนี้</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.whitelist_detections_today ?? 0).toLocaleString()}
            </h2>
          </div>
          <div
            className="stat-card stat-card-clickable"
            onClick={() => navigate('/blacklist?tab=blacklist')}
            title="คลิกเพื่อดูรายการ Blacklist"
          >
            <p className="stat-label">แบล็คลิสต์วันนี้</p>
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

          <div className="content-card table-section">
            <div className="dash-table-header">
              <h3 className="card-title" style={{ margin: 0 }}>ประวัติการตรวจจับ (วันนี้)</h3>
              <div className="dash-table-header-right">
                <div className="dash-search-wrap">
                  <FaSearch className="dash-search-icon" />
                  <input
                    type="text"
                    placeholder="ค้นหาป้ายทะเบียน / จังหวัด..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="dash-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="dash-search-clear"
                      onClick={() => setSearchQuery('')}
                      title="ล้างคำค้นหา"
                    >
                      <FaXmark />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-sort-icon-toggle"
                  onClick={toggleSortOrder}
                  title={sortOrder === 'desc' ? 'เรียงลำดับ: ใหม่ไปเก่า (คลิกเพื่อสลับเป็น เก่าไปใหม่)' : 'เรียงลำดับ: เก่าไปใหม่ (คลิกเพื่อสลับเป็น ใหม่ไปเก่า)'}
                >
                  {sortOrder === 'desc' ? (
                    <FaArrowDownWideShort className="sort-btn-icon" />
                  ) : (
                    <FaArrowUpWideShort className="sort-btn-icon" />
                  )}
                </button>
              </div>
            </div>
            <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
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
                      <td colSpan="5">
                        <Spinner text="กำลังโหลด..." />
                      </td>
                    </tr>
                  ) : processedHistory.length > 0 ? (
                    processedHistory.map((item) => {
                      const isBlacklist = Boolean(
                        item.is_blacklist ||
                        item.is_blacklisted ||
                        item.category === 'blacklist' ||
                        item.type === 'blacklist'
                      )
                      return (
                        <tr key={item.id} className={isBlacklist ? 'history-row-blacklist' : ''}>
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
                      <td colSpan="5">
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

      {/* Modal รายละเอียด หรือ Modal รถเข้า-ออก (Single-Focus Modal: ไม่ซ้อนกัน) */}
      {selectedItem ? (
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
                  <span>{selectedItem.province || '-'}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Direction</span>
                  <span>{formatDirection(selectedItem.direction, selectedItem.camera?.direction)}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Color</span>
                  <span>{selectedItem.color || '-'}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Village</span>
                  <span>
                    {renderVillageDisplay(
                      selectedItem.village_id ||
                        selectedItem.camera?.village_id ||
                        cameras.find((c) => String(c.id) === String(selectedItem.camera_id))?.village_id,
                      selectedItem.village_name || selectedItem.village?.name,
                      villages
                    )}
                  </span>
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
      ) : directionModal ? (
        <div className="modal-overlay" onClick={closeDirectionModal}>
          <div className="modal-content modal-large bl-direction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>
                  {directionModal.title}{' '}
                  <span className="modal-header-count">({processedDirectionList.length.toLocaleString()})</span>
                </h3>
              </div>
              <div className="modal-header-right">
                <div className="dash-search-wrap">
                  <FaSearch className="dash-search-icon" />
                  <input
                    type="text"
                    placeholder="ค้นหาป้ายทะเบียน / จังหวัด..."
                    value={directionSearchQuery}
                    onChange={(e) => {
                      setDirectionSearchQuery(e.target.value)
                      setDirectionPage(1)
                    }}
                    className="dash-search-input"
                  />
                  {directionSearchQuery && (
                    <button
                      type="button"
                      className="dash-search-clear"
                      onClick={() => {
                        setDirectionSearchQuery('')
                        setDirectionPage(1)
                      }}
                      title="ล้างคำค้นหา"
                    >
                      <FaXmark />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-sort-icon-toggle"
                  onClick={toggleDirectionSortOrder}
                  title={
                    directionSortOrder === 'desc'
                      ? 'เรียงลำดับ: ใหม่ไปเก่า (คลิกเพื่อสลับเป็น เก่าไปใหม่)'
                      : 'เรียงลำดับ: เก่าไปใหม่ (คลิกเพื่อสลับเป็น ใหม่ไปเก่า)'
                  }
                >
                  {directionSortOrder === 'desc' ? (
                    <FaArrowDownWideShort className="sort-btn-icon" />
                  ) : (
                    <FaArrowUpWideShort className="sort-btn-icon" />
                  )}
                </button>

                <button className="modal-close" onClick={closeDirectionModal}>
                  <FaXmark />
                </button>
              </div>
            </div>

            <div className="modal-registered-body" style={{ padding: '20px 24px' }}>
              <div className="table-responsive">
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
                    {isLoadingDirection && directionList.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <Spinner text="กำลังโหลดข้อมูล..." />
                        </td>
                      </tr>
                    ) : displayedDirectionItems.length > 0 ? (
                      displayedDirectionItems.map((item, index) => {
                        const isBlacklist = Boolean(
                          item.is_blacklist ||
                          item.is_blacklisted ||
                          item.category === 'blacklist' ||
                          item.type === 'blacklist'
                        )
                        return (
                          <tr key={item.id || index} className={isBlacklist ? 'history-row-blacklist' : ''}>
                            <td>{(directionPage - 1) * DIRECTION_PAGE_SIZE + index + 1}</td>
                            <td>{formatDate(item.time_detect)}</td>
                            <td>{formatTime(item.time_detect)}</td>
                            <td className="bold-plate" style={{ fontWeight: 600 }}>
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
                          <EmptyState
                            icon={<FaCar />}
                            title={directionSearchQuery ? 'ไม่พบข้อมูลที่ค้นหา' : 'ไม่มีข้อมูลรถในช่วงเวลานี้'}
                            description={directionSearchQuery ? 'ลองเปลี่ยนคำค้นหาป้ายทะเบียน จังหวัด สี หรือกล้อง' : undefined}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination (สไตล์ Blacklist) */}
              {totalDirectionPages > 1 && (
                <div className="pagination" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="page-btn"
                    disabled={directionPage === 1 || isLoadingDirection}
                    onClick={() => setDirectionPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>

                  {getVisiblePageNumbers(directionPage, totalDirectionPages, 4).map((page) => (
                    <button
                      key={page}
                      className={`page-btn ${directionPage === page ? 'active' : ''}`}
                      disabled={isLoadingDirection}
                      onClick={() => setDirectionPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="page-btn"
                    disabled={directionPage >= totalDirectionPages || isLoadingDirection}
                    onClick={() => setDirectionPage((p) => Math.min(totalDirectionPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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