import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { FaSearch, FaEye, FaRedo } from 'react-icons/fa'
import { FaXmark, FaPalette, FaRoute } from 'react-icons/fa6'
import Layout from '../components/Layout'
import { getDetectionsAPI, getCamerasAPI, getAuthedImageURL } from '../data/api'
import useAuthStore from '../store/authStore'
import '../styles/History.css'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { FaCalendarAlt } from 'react-icons/fa'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import useVillageStore from '../store/villageStore'

const ROWS_PER_PAGE = 10
const SEARCH_DEBOUNCE_MS = 400
const MAX_VISIBLE_PAGES = 4 // จำนวนปุ่มเลขหน้าสูงสุดที่โชว์พร้อมกัน

// แปลง ISO timestamp เป็นวันที่ + เวลาแบบไทย
function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH')
}
function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}
// แปลง Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่น (ไม่ใช้ toISOString เพราะจะเพี้ยน timezone — pattern เดียวกับ Dashboard.jsx/Report.jsx)
function toDateParam(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const STORAGE_KEY_BLACKLIST_HISTORY = 'lpr_historical_blacklist_plates'

function getHistoricalBlacklistPlates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BLACKLIST_HISTORY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

// คำนวณว่าจะโชว์เลขหน้าไหนบ้าง (จำกัดไม่ให้ยาวเกินไปเวลามีหลายสิบหน้า)
// เช่น อยู่หน้า 8 จาก 27 หน้า จะโชว์ [7, 8, 9, 10] แทนที่จะโชว์ 1-27 ทั้งหมด
function getVisiblePageNumbers(current, total, maxVisible) {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  let start = Math.max(1, current - Math.floor(maxVisible / 2))
  let end = start + maxVisible - 1
  if (end > total) {
    end = total
    start = end - maxVisible + 1
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function History() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore() // 👈 หมู่บ้านที่กำลังดูอยู่ (null = ทุกหมู่บ้าน, เฉพาะ superadmin)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [cameras, setCameras] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [colorInput, setColorInput] = useState('') // 👈 ช่องค้นหาด้วยสีรถ — backend รองรับ query param "color" ตรงๆ (ยืนยันจาก Swagger แล้ว)
  const [debouncedColor, setDebouncedColor] = useState('')
  const [selectedDirection, setSelectedDirection] = useState('all')
  const [selectedCamera, setSelectedCamera] = useState('all')
  const [selectedDate, setSelectedDate] = useState(null)

  const [historyData, setHistoryData] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const [selectedItem, setSelectedItem] = useState(null)
  const [modalImages, setModalImages] = useState({ crop: null, full: null })
  const [isLoadingImages, setIsLoadingImages] = useState(false)

  // รูปที่กำลังดูแบบเต็มจอ (คลิกจากรูปใน modal)
  const [fullscreenImage, setFullscreenImage] = useState(null)

  // Debounce ช่อง search 400ms ก่อนยิง API (ลดจำนวน request ตอนพิมพ์รัว)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Debounce ช่องค้นหาสี — ใช้ delay เดียวกับช่องค้นหาป้ายทะเบียน
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedColor(colorInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [colorInput])

  // รับค่า search จาก URL (มาจาก Navbar search) ตอนเปิดหน้าครั้งแรก
  useEffect(() => {
    const searchFromURL = searchParams.get('search')
    if (searchFromURL) {
      setSearchInput(searchFromURL)
    }
  }, [searchParams])

  // ดึงรายการกล้อง (สำหรับ dropdown filter + แปลง camera_id เป็นชื่อ)
  // ยึดตาม selectedVillageId (หมู่บ้านที่กำลังดูอยู่) ไม่ใช่ user.village_id ตรงๆ
  // เพราะ superadmin สลับหมู่บ้านผ่าน dropdown ใน Navbar ได้
  useEffect(() => {
    async function fetchCameras() {
      if (!user) return
      try {
        const data = await getCamerasAPI(selectedVillageId)
        setCameras(data)
      } catch (error) {
        console.error(error)
      }
    }
    fetchCameras()
  }, [user, selectedVillageId])

  // กรองรายการกล้องตามทิศทางที่เลือกแบบ Real-time
  const availableCameras = useMemo(() => {
    if (selectedDirection === 'all') return cameras
    return cameras.filter((cam) => cam.direction === selectedDirection)
  }, [cameras, selectedDirection])

  // หากกล้องที่เคยเลือกไว้ ไม่อยู่ในทิศทางใหม่ที่เลือก ให้รีเซ็ตกลับเป็น 'all'
  useEffect(() => {
    if (selectedCamera !== 'all' && !availableCameras.some((c) => String(c.id) === String(selectedCamera))) {
      setSelectedCamera('all')
    }
  }, [availableCameras, selectedCamera])

  // ดึงประวัติจาก backend ทุกครั้งที่ filter หรือหน้าเปลี่ยน
  useEffect(() => {
    async function fetchHistory() {
      if (!user) return

      setIsLoading(true)
      try {
        const params = {
          page: currentPage,
          page_size: ROWS_PER_PAGE
        }

        if (selectedVillageId) params.village_id = selectedVillageId
        if (debouncedSearch) params.license_plate = debouncedSearch
        if (debouncedColor) params.color = debouncedColor
        if (selectedDirection !== 'all') params.direction = selectedDirection
        if (selectedCamera !== 'all') params.camera_id = selectedCamera

        if (selectedDate) {
          const startOfDay = new Date(selectedDate)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(selectedDate)
          endOfDay.setHours(23, 59, 59, 999)
          params.time_detect_from = startOfDay.toISOString()
          params.time_detect_to = endOfDay.toISOString()
        }

        const data = await getDetectionsAPI(params)
        setHistoryData(data.items)
        setTotalItems(data.total)
      } catch (error) {
        console.error(error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [user, debouncedSearch, debouncedColor, selectedDirection, selectedCamera, selectedDate, currentPage, selectedVillageId])

  // Reset กลับหน้า 1 ทุกครั้งที่เปลี่ยน filter (ไม่ใช่ตอนเปลี่ยนหน้าเอง)
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, debouncedColor, selectedDirection, selectedCamera, selectedDate])

  function handleReset() {
    setSearchInput('')
    setColorInput('')
    setSelectedDirection('all')
    setSelectedCamera('all')
    setSelectedDate(null)
  }

  // หาชื่อกล้องจาก camera_id (backend ส่งมาแค่ id ไม่ส่งชื่อมาด้วย)
  function getCameraName(cameraId) {
    const cam = cameras.find((c) => c.id === cameraId)
    return cam ? cam.name : '-'
  }

  // โหลดรูปภาพ (แบบแนบ auth token) ทุกครั้งที่เปิด modal ดูรายละเอียด
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

  const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE)
  const visiblePages = getVisiblePageNumbers(currentPage, totalPages, MAX_VISIBLE_PAGES)

  function closeModal() {
    if (modalImages.crop) URL.revokeObjectURL(modalImages.crop)
    if (modalImages.full) URL.revokeObjectURL(modalImages.full)
    setSelectedItem(null)
  }

  // ปิด modal / fullscreen เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (fullscreenImage) {
          setFullscreenImage(null)
        } else if (selectedItem) {
          closeModal()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullscreenImage, selectedItem, modalImages])

  function handleGoToRouteTracking(item) {
    if (!item) return
    const params = new URLSearchParams({
      plate: item.license_plate || '',
      province: item.province || '',
      date: toDateParam(new Date(item.time_detect))
    })
    navigate(`/route-tracking?${params.toString()}`)
  }

  return (
    <Layout title="History">
      <div className="history-wrapper">

        {/* ส่วนค้นหา */}
        <div className="content-card history-filter">
          <div className="filter-group">
            <label>Search License Plate</label>
            <div className="filter-input-wrap">
              <FaSearch className="filter-icon" />
              <input
                type="text"
                placeholder="Type to search..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Search Color</label>
            <div className="filter-input-wrap">
              <FaPalette className="filter-icon" />
              <input
                type="text"
                placeholder="เช่น White, Black..."
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Direction</label>
            <select
              value={selectedDirection}
              onChange={(e) => setSelectedDirection(e.target.value)}
            >
              <option value="all">All Directions</option>
              <option value="entry">entry</option>
              <option value="exit">exit</option>
              <option value="internal">internal</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Camera</label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
            >
              <option value="all">All Cameras</option>
              {availableCameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Date</label>
            <div className="filter-input-wrap">
              <FaCalendarAlt className="filter-icon" />
              <DatePicker
                selected={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                dateFormat="dd/MM/yyyy"
                maxDate={new Date()}
                className="datepicker-history"
                placeholderText="All dates"
                isClearable
              />
            </div>
          </div>

          <div className="filter-buttons">
            <button className="btn-reset" onClick={handleReset}>
              <FaRedo /> Reset
            </button>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="history-table-header">
            <h3 className="card-title" style={{ margin: 0 }}>Vehicle History</h3>
            <p className="history-total">
              Found <strong>{totalItems}</strong> records
            </p>
          </div>

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
                  <th>Direction</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="9">
                      <Spinner text="Loading history..." />
                    </td>
                  </tr>
                ) : historyData.length > 0 ? (
                  historyData.map((item, index) => {
                    const histMap = getHistoricalBlacklistPlates()
                    const cleanPlate = (item.license_plate || '').replace(/\s+/g, '')
                    const cleanProv = (item.province || '').trim()
                    const isBlacklist = Boolean(
                      item.is_blacklist ||
                      item.is_blacklisted ||
                      item.category === 'blacklist' ||
                      item.type === 'blacklist' ||
                      histMap[`${cleanPlate}|${cleanProv}`] ||
                      histMap[cleanPlate]
                    )
                    return (
                      <tr key={item.id} className={isBlacklist ? 'history-row-blacklist' : ''}>
                        <td>{(currentPage - 1) * ROWS_PER_PAGE + index + 1}</td>
                        <td>{formatDate(item.time_detect)}</td>
                        <td>{formatTime(item.time_detect)}</td>
                        <td className="plate-text">{item.license_plate}</td>
                        <td>{item.province}</td>
                        <td>{item.color}</td>
                        <td>{getCameraName(item.camera_id)}</td>
                        <td>
                          {item.direction ? (
                            <span className={`history-direction-badge ${item.direction}`}>
                              {item.direction}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
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
                    <td colSpan="9">
                      <EmptyState
                        icon={<FaSearch />}
                        title="No records found"
                        description="Try changing the filter or search keyword"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination — จำกัดแค่ 4 ปุ่มพร้อมกัน ไม่ยาวเป็นพรืด */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                ‹
              </button>

              {visiblePages.map((page) => (
                <button
                  key={page}
                  className={`page-btn ${currentPage === page ? 'active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}

              <button
                className="page-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                ›
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal รายละเอียด */}
      {selectedItem && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* ใหม่ */}
          <div className="modal-header">
            <div className="modal-header-left">
              <h3>Vehicle Detail</h3>
              <button
                type="button"
                className="btn-route-tracking"
                onClick={() => handleGoToRouteTracking(selectedItem)}
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
                  <span className="info-label">Time</span>
                  <span>{formatDate(selectedItem.time_detect)} {formatTime(selectedItem.time_detect)}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Camera</span>
                  <span>{getCameraName(selectedItem.camera_id)}</span>
                </div>
                {selectedItem.direction && (
                  <div className="modal-info-row">
                    <span className="info-label">Direction</span>
                    <span className={`history-direction-badge ${selectedItem.direction}`}>
                      {selectedItem.direction}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* รูปเต็มจอ — คลิกรูปใน modal แล้วมาโผล่ตรงนี้ ไม่มีตกแต่งอะไรเลย */}
      {fullscreenImage && (
        <div className="image-fullscreen-overlay" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="Full size" />
        </div>
      )}

    </Layout>
  )
}

export default History