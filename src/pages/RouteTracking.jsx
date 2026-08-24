import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FaSearch, FaCalendarAlt, FaArrowLeft } from 'react-icons/fa'
import { FaCar, FaRoute, FaMapLocationDot, FaVideo } from 'react-icons/fa6'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import RouteMap from '../components/RouteMap'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { getDetectionsAPI, getCamerasAPI, getAuthedImageURL } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import '../styles/RouteTracking.css'
import { mockRouteCameras, mockRouteDetections } from '../data/mockData'

// ⚠️ MOCK MODE — เปิดไว้ชั่วคราวเพราะยังไม่มี API จริงสำหรับหน้านี้
// พอ backend พร้อมแล้ว ให้เปลี่ยนเป็น false บรรทัดเดียว ไม่ต้องแก้ logic ที่อื่น
const USE_MOCK_DATA = true

const MAX_ROUTE_POINTS = 50 // จำกัดจุดสูงสุดที่วาด/แสดง กันรกและกัน performance ตก
const DETECTIONS_PAGE_SIZE = 200
const SEARCH_DELAY_MS = 300 // แค่จำลอง latency ให้เห็น spinner เฉยๆ ตอน mock

// ตัดช่องว่างก่อนเทียบ (pattern เดียวกับ Blacklist.jsx)
function normalizePlate(text) {
  return (text || '').replace(/\s+/g, '').toLowerCase()
}

// match ได้ทั้งจากป้ายทะเบียน (บางส่วนก็เจอ) และชื่อจังหวัด (บางส่วนก็เจอ)
function matchesQuery(item, query) {
  const q = normalizePlate(query)
  if (!q) return true
  const plate = normalizePlate(item.license_plate)
  const province = normalizePlate(item.province)
  return plate.includes(q) || province.includes(q)
}

function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH')
}
function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function formatDateTime(isoString) {
  if (!isoString) return '-'
  return `${formatDate(isoString)} ${formatTime(isoString)}`
}

// key วันที่แบบ local (ไม่ผูกกับ locale string) ใช้แบ่งรายการทีละวันตอน group
function dateKeyOf(isoString) {
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function RouteTracking() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const [searchParams] = useSearchParams()

  const today = new Date()
  const [queryInput, setQueryInput] = useState('')

  // จากวันที่ / ถึงวันที่ — default = null ทั้งคู่ (ไม่กำหนด = ดึงข้อมูลทั้งหมด ไม่กรองวันที่เลย)
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)
  const [cameraFilter, setCameraFilter] = useState('') // '' = ทุกกล้อง

  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [vehicleGroups, setVehicleGroups] = useState([]) // [{ plate, province, items }] — รายชื่อรถที่พบทั้งหมด
  const [selectedVehicle, setSelectedVehicle] = useState(null) // { plate, province } ที่ผู้ใช้กดเลือกจากตาราง

  const [cameras, setCameras] = useState([])

  // ดึงรายชื่อกล้อง (join camera_id -> lat/long/name) — ยึดตาม selectedVillageId (null = ทุกหมู่บ้าน สำหรับ superadmin)
  const fetchCameras = useCallback(async () => {
    if (!user) return
    try {
      const data = USE_MOCK_DATA ? mockRouteCameras : await getCamerasAPI(selectedVillageId)
      setCameras(data)
    } catch (error) {
      console.error(error)
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // ค้นหาแบบ partial — พิมพ์บางส่วนของป้ายทะเบียน หรือชื่อจังหวัด ก็เจอได้ทั้งหมด
  // ผลลัพธ์จะถูก group เป็น "รายชื่อรถที่พบ" (ป้าย+จังหวัด) ให้ผู้ใช้กดเลือกดูเส้นทางเชิงลึกทีหลัง
  const runSearch = useCallback((queryValue, rangeFrom, rangeTo) => {
    const query = (queryValue ?? queryInput).trim()

    if (!query) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาพิมพ์คำค้นหา',
        text: 'พิมพ์ป้ายทะเบียน (บางส่วนก็ได้) หรือชื่อจังหวัด',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    setSelectedVehicle(null)

    // rangeFrom/rangeTo === undefined -> ใช้ state ปัจจุบัน, === null (จาก Reset) -> ไม่กรองวันที่เลย
    const from = rangeFrom !== undefined ? rangeFrom : dateFrom
    const to = rangeTo !== undefined ? rangeTo : dateTo

    const startOfDay = from ? new Date(from) : null
    if (startOfDay) startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = to ? new Date(to) : null
    if (endOfDay) endOfDay.setHours(23, 59, 59, 999)

    // จำลอง latency เล็กน้อยให้เห็น spinner (ตอนต่อ API จริงจะเป็น await ปกติ)
    setTimeout(async () => {
      try {
        let matched
        const camera = cameraFilter

        if (USE_MOCK_DATA) {
          matched = mockRouteDetections.filter((item) => {
            const inQuery = matchesQuery(item, query)
            const inCamera = !camera || String(item.camera_id) === String(camera)
            const t = new Date(item.time_detect)
            const inRange = (!startOfDay || t >= startOfDay) && (!endOfDay || t <= endOfDay)
            return inQuery && inCamera && inRange
          })
        } else {
          // ⚠️ ASSUMPTION: ยิง getDetectionsAPI ด้วย license_plate ก่อน (backend รองรับ partial match อยู่แล้ว)
          // แล้วกรองซ้ำฝั่งนี้ด้วย matchesQuery เผื่อ query เป็นชื่อจังหวัดซึ่ง backend อาจไม่รองรับ param นี้ตรงๆ
          // TODO: คุยกับทีม backend ว่ามี endpoint ค้นหาด้วยจังหวัดโดยตรงไหม ถ้ามีจะตัดการกรองซ้ำฝั่งนี้ออกได้
          const data = await getDetectionsAPI({
            license_plate: query,
            village_id: selectedVillageId || undefined,
            camera_id: camera || undefined,
            time_detect_from: startOfDay ? startOfDay.toISOString() : undefined,
            time_detect_to: endOfDay ? endOfDay.toISOString() : undefined,
            page: 1,
            page_size: DETECTIONS_PAGE_SIZE
          })
          matched = data.items
            .filter((item) => matchesQuery(item, query))
            .filter((item) => !camera || String(item.camera_id) === String(camera))
        }

        // group เป็น "รถ 1 คัน ใน 1 วัน" — ป้ายเดียวกันแต่คนละจังหวัด หรือคนละวัน ถือเป็นคนละรายการ
        // เช่น รถทะเบียนเดียวกันเข้าหมู่บ้าน 3 วัน -> ค้นหาแล้วจะเห็น 3 แถวแยกตามวัน
        const groupMap = new Map()
        matched.forEach((item) => {
          const day = dateKeyOf(item.time_detect)
          const key = `${item.license_plate}|${item.province}|${day}`
          if (!groupMap.has(key)) {
            groupMap.set(key, { plate: item.license_plate, province: item.province, date: day, items: [] })
          }
          groupMap.get(key).items.push(item)
        })

        const groups = Array.from(groupMap.values())
          .map((g) => ({
            ...g,
            items: g.items.sort((a, b) => new Date(a.time_detect) - new Date(b.time_detect))
          }))
          .sort((a, b) => {
            const lastA = a.items[a.items.length - 1].time_detect
            const lastB = b.items[b.items.length - 1].time_detect
            return new Date(lastB) - new Date(lastA) // พบล่าสุดขึ้นก่อน
          })

        setVehicleGroups(groups)
      } catch (error) {
        console.error(error)
        Swal.fire({
          icon: 'error',
          title: 'ค้นหาไม่สำเร็จ',
          text: 'ไม่สามารถดึงข้อมูลเส้นทางได้ กรุณาลองใหม่',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } finally {
        setIsSearching(false)
      }
    }, SEARCH_DELAY_MS)
  }, [queryInput, dateFrom, dateTo, cameraFilter, selectedVillageId])

  // รับ ?plate=... จาก URL แล้ว auto-search ทันที (เผื่อลิงก์มาจากหน้าอื่นในอนาคต)
  useEffect(() => {
    const queryFromURL = searchParams.get('plate')
    if (queryFromURL) {
      setQueryInput(queryFromURL)
      runSearch(queryFromURL, null, null) // ไม่กำหนดวัน = ค้นหาทั้งหมด
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getCameraName(cameraId) {
    const cam = cameras.find((c) => c.id === cameraId)
    return cam ? cam.name : '-'
  }

  const selectedGroup = useMemo(
    () => vehicleGroups.find((g) =>
      g.plate === selectedVehicle?.plate &&
      g.province === selectedVehicle?.province &&
      g.date === selectedVehicle?.date
    ),
    [vehicleGroups, selectedVehicle]
  )
  const allItems = selectedGroup?.items || [] // เรียงเก่า -> ใหม่แล้ว

  // dedupe จุดที่ติดกันในกล้องเดียวกัน (กันเส้น/หมุดซ้อนทับที่จุดเดิม)
  const dedupedItems = useMemo(() => {
    const result = []
    allItems.forEach((item) => {
      const last = result[result.length - 1]
      if (!last || last.camera_id !== item.camera_id) result.push(item)
    })
    return result
  }, [allItems])

  const isTruncated = dedupedItems.length > MAX_ROUTE_POINTS
  const mapItems = dedupedItems.slice(-MAX_ROUTE_POINTS)

  const routePoints = useMemo(() => (
    mapItems
      .map((item, index) => {
        const cam = cameras.find((c) => c.id === item.camera_id)
        if (!cam || !Number.isFinite(Number(cam.lat)) || !Number.isFinite(Number(cam.long))) return null
        return {
          id: item.id,
          lat: Number(cam.lat),
          long: Number(cam.long),
          name: cam.name,
          order: index + 1,
          time: item.time_detect
        }
      })
      .filter(Boolean)
  ), [mapItems, cameras])

  // สรุปเส้นทางกล้องแบบข้อความ: "กล้อง A --> กล้อง B --> กล้อง C" เรียงตามลำดับเวลาที่ผ่านจริง
  const gateSummary = dedupedItems.map((item) => getCameraName(item.camera_id)).join('  -->  ')

  // โหลดรูปของทุกจุดในเส้นทาง (ไม่ใช่แค่รูปล่าสุด) เพื่อโชว์ใน timeline
  const [routeImages, setRouteImages] = useState({}) // { [detectionId]: url }
  const [isLoadingRouteImages, setIsLoadingRouteImages] = useState(false)
  const [hoveredImageId, setHoveredImageId] = useState(null) // จุดที่เมาส์ชี้อยู่ -> โชว์รูปเต็ม
  const [hoverPos, setHoverPos] = useState(null) // { top, left } ตำแหน่งลอยของพรีวิว คำนวณจากตำแหน่งรูปที่ hover
  const mapItemsKey = mapItems.map((item) => item.id).join('|')

  useEffect(() => {
    if (mapItems.length === 0) {
      setRouteImages({})
      return
    }

    if (USE_MOCK_DATA) {
      // mock: ใช้ URL ตรงๆ ไม่ต้องยิง authenticated fetch
      const map = {}
      mapItems.forEach((item) => { map[item.id] = item.image_full || item.image_crop || null })
      setRouteImages(map)
      return
    }

    let isCancelled = false
    const createdUrls = []
    setIsLoadingRouteImages(true)

    Promise.allSettled(
      mapItems.map(async (item) => {
        const src = item.image_full || item.image_crop
        if (!src) return [item.id, null]
        const url = await getAuthedImageURL(src)
        createdUrls.push(url)
        return [item.id, url]
      })
    ).then((results) => {
      if (isCancelled) return
      const map = {}
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          const [id, url] = r.value
          map[id] = url
        }
      })
      setRouteImages(map)
    }).finally(() => {
      if (!isCancelled) setIsLoadingRouteImages(false)
    })

    return () => {
      isCancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapItemsKey])

  function handleThumbHover(e, itemId) {
    if (!routeImages[itemId]) return
    const rect = e.currentTarget.getBoundingClientRect()
    const PREVIEW_W = 300
    const PREVIEW_H = 380
    const GAP = 14

    // ปกติโชว์ทางขวาของรูปที่ hover, ถ้าจะล้นขอบขวาจอก็สลับไปโชว์ทางซ้ายแทน
    let left = rect.right + GAP
    if (left + PREVIEW_W > window.innerWidth - 12) {
      left = rect.left - PREVIEW_W - GAP
    }
    if (left < 12) left = 12

    // จัดแนวตั้งให้อยู่กึ่งกลางรูปที่ hover แล้วกันไม่ให้ล้นขอบบน/ล่างจอ
    let top = rect.top + rect.height / 2 - PREVIEW_H / 2
    if (top + PREVIEW_H > window.innerHeight - 12) top = window.innerHeight - PREVIEW_H - 12
    if (top < 12) top = 12

    setHoveredImageId(itemId)
    setHoverPos({ top, left })
  }

  function handleSelectVehicle(group) {
    setSelectedVehicle({ plate: group.plate, province: group.province, date: group.date })
  }

  function handleBackToList() {
    setSelectedVehicle(null)
  }

  return (
    <Layout title="Route Tracking">
      <div className="rt-wrapper">

        {/* ฟอร์มค้นหา */}
        <div className="content-card rt-search-card">
          <h3 className="card-title" style={{ margin: 0 }}>ค้นหาเส้นทางการเคลื่อนที่</h3>
          <p className="rt-description">
            พิมพ์ป้ายทะเบียนหรือจังหวัด (ไม่ต้องพิมพ์ครบก็ได้) — ถ้าไม่กำหนดช่วงวันที่ ระบบจะดึงข้อมูลทั้งหมดมาให้
          </p>

          <div className="rt-search-row">
            <div className="rt-search-field rt-search-field-plate">
              <label>ป้ายทะเบียน / จังหวัด</label>
              <div className="rt-input-wrap">
                <FaSearch className="rt-input-icon" />
                <input
                  type="text"
                  placeholder="เช่น 25, กค, ปทุมธานี"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                />
              </div>
            </div>

            <div className="rt-search-field">
              <label>จากวันที่</label>
              <div className="rt-input-wrap">
                <FaCalendarAlt className="rt-input-icon" />
                <DatePicker
                  selected={dateFrom}
                  onChange={(date) => setDateFrom(date)}
                  dateFormat="dd/MM/yyyy"
                  maxDate={dateTo || today}
                  placeholderText="ทั้งหมด"
                  isClearable
                  className="datepicker-rt"
                />
              </div>
            </div>

            <div className="rt-search-field">
              <label>ถึงวันที่</label>
              <div className="rt-input-wrap">
                <FaCalendarAlt className="rt-input-icon" />
                <DatePicker
                  selected={dateTo}
                  onChange={(date) => setDateTo(date)}
                  dateFormat="dd/MM/yyyy"
                  minDate={dateFrom}
                  maxDate={today}
                  placeholderText="ทั้งหมด"
                  isClearable
                  className="datepicker-rt"
                />
              </div>
            </div>

            <div className="rt-search-field">
              <label>กล้อง</label>
              <div className="rt-input-wrap">
                <FaVideo className="rt-input-icon" />
                <select
                  value={cameraFilter}
                  onChange={(e) => setCameraFilter(e.target.value)}
                  className="rt-select-camera"
                >
                  <option value="">ทุกกล้อง</option>
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>{cam.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rt-search-buttons">
              <button className="btn-rt-search" onClick={() => runSearch()} disabled={isSearching}>
                <FaSearch /> {isSearching ? 'กำลังค้นหา...' : 'ค้นหา'}
              </button>
            </div>
          </div>
        </div>

        {isSearching ? (
          <div className="content-card"><Spinner text="กำลังค้นหาเส้นทาง..." /></div>

        ) : !hasSearched ? (
          <div className="content-card">
            <EmptyState
              icon={<FaSearch />}
              title="ยังไม่มีข้อมูล"
              description="พิมพ์ป้ายทะเบียนหรือจังหวัดด้านบน แล้วกดค้นหา เพื่อดูเส้นทางการเคลื่อนที่"
            />
          </div>
        )

        : !selectedVehicle ? (
          /* ---------- ขั้นที่ 1: ตารางรายชื่อรถทั้งหมดที่พบ ---------- */
          <div className="content-card">
            <div className="rt-table-header">
              <h3 className="card-title" style={{ margin: 0 }}>ผลการค้นหา</h3>
              <p className="rt-description" style={{ margin: 0 }}>
                พบ <strong>{vehicleGroups.length}</strong> รายการ (แยกทีละวัน) — คลิกแถวเพื่อดูเส้นทางเชิงลึกของวันนั้น
              </p>
            </div>

            {vehicleGroups.length === 0 ? (
              <EmptyState icon={<FaCar />} title="ไม่พบข้อมูล" description="ไม่พบป้ายทะเบียนหรือจังหวัดนี้ในช่วงเวลาที่เลือก" />
            ) : (
              <div className="table-responsive">
                <table className="rt-table">
                  <thead>
                    <tr>
                      <th>ทะเบียน</th>
                      <th>จังหวัด</th>
                      <th>วันที่</th>
                      <th>สี</th>
                      <th>จำนวนครั้งที่พบ</th>
                      <th>พบล่าสุด</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleGroups.map((g) => (
                      <tr
                        key={`${g.plate}|${g.province}|${g.date}`}
                        className="rt-row-clickable"
                        onClick={() => handleSelectVehicle(g)}
                      >
                        <td className="plate-text">{g.plate}</td>
                        <td>{g.province}</td>
                        <td>{formatDate(g.items[0]?.time_detect)}</td>
                        <td>{g.items[g.items.length - 1]?.color || '-'}</td>
                        <td>{g.items.length} ครั้ง</td>
                        <td>{formatDateTime(g.items[g.items.length - 1].time_detect)}</td>
                        <td>
                          <button
                            className="btn-view-route"
                            onClick={(e) => { e.stopPropagation(); handleSelectVehicle(g) }}
                          >
                            <FaMapLocationDot /> ดูเส้นทาง
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        ) : (
          /* ---------- ขั้นที่ 2: เส้นทางเชิงลึกของรถคันที่เลือก ---------- */
          <>
            <button className="rt-back-btn" onClick={handleBackToList}>
              <FaArrowLeft /> กลับไปยังรายการที่พบ
            </button>

            <div className="rt-result-row">
              <div className="content-card rt-map-card">
                <h3 className="card-title" style={{ margin: 0 }}>เส้นทางการเดินรถ</h3>
                <p className="rt-description">หมุดเรียงลำดับตามเวลาที่ผ่านแต่ละกล้องตรวจจับ</p>
                <div className="rt-map-wrap">
                  {routePoints.length > 0 ? (
                    <RouteMap routePoints={routePoints} />
                  ) : (
                    <EmptyState icon={<FaRoute />} title="ไม่มีข้อมูลตำแหน่งกล้อง" description="กล้องที่จับภาพยังไม่มีพิกัดในระบบ" />
                  )}
                </div>
                {isTruncated && (
                  <p className="rt-truncate-note">
                    แสดงเฉพาะ {MAX_ROUTE_POINTS} จุดล่าสุด จากทั้งหมด {dedupedItems.length} จุด
                  </p>
                )}
              </div>

              <div className="content-card rt-info-card">
                <h3 className="card-title" style={{ margin: 0 }}>ข้อมูลรถ</h3>
                <div className="rt-info-rows">
                  <div className="rt-info-row">
                    <span className="info-label">ทะเบียน</span>
                    <span className="rt-plate-text">{selectedVehicle.plate} ({selectedVehicle.province})</span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">สี</span>
                    <span>{allItems[allItems.length - 1]?.color || '-'}</span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">จำนวนครั้ง</span>
                    <span>{allItems.length} ครั้ง</span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">ช่วงเวลาที่พบ</span>
                    <span>{formatDateTime(allItems[0]?.time_detect)} — {formatDateTime(allItems[allItems.length - 1]?.time_detect)}</span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">กล้องที่ผ่าน</span>
                    <span>{gateSummary || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline พร้อมรูปที่จับได้ของแต่ละจุด เรียงตามลำดับการเดินทาง */}
            <div className="content-card">
              <h3 className="card-title" style={{ margin: 0 }}>รายละเอียดแต่ละจุด</h3>
              <p className="rt-description">ภาพที่กล้องจับได้ ณ จุดตรวจแต่ละจุด เรียงตามลำดับเวลา</p>

              {isLoadingRouteImages ? (
                <Spinner text="กำลังโหลดรูปภาพ..." />
              ) : (
                <div className="rt-timeline">
                  {mapItems.map((item, index) => (
                    <div key={item.id} className="rt-timeline-item">
                      <div className="rt-timeline-marker">{index + 1}</div>
                      <div
                        className={`rt-timeline-thumb${routeImages[item.id] ? ' rt-timeline-thumb-hoverable' : ''}`}
                        onMouseEnter={(e) => handleThumbHover(e, item.id)}
                        onMouseLeave={() => { setHoveredImageId(null); setHoverPos(null) }}
                      >
                        {routeImages[item.id] ? (
                          <img src={routeImages[item.id]} alt={`จุดที่ ${index + 1}`} />
                        ) : (
                          <div className="rt-timeline-noimg">ไม่มีรูปภาพ</div>
                        )}
                      </div>
                      <div className="rt-timeline-body">
                        <p className="rt-timeline-camera">{getCameraName(item.camera_id)}</p>
                        <p className="rt-timeline-time">{formatDateTime(item.time_detect)}</p>
                        <p className="rt-timeline-plate">{item.license_plate} • {item.color}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* พรีวิวรูปเต็มลอยตอนเอาเมาส์ไป hover ที่รูปในไทม์ไลน์ */}
      {hoveredImageId && hoverPos && routeImages[hoveredImageId] && (() => {
        const hoveredItem = mapItems.find((i) => i.id === hoveredImageId)
        const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768
        return (
          <div
            className="rt-hover-preview"
            style={isDesktop ? { top: `${hoverPos.top}px`, left: `${hoverPos.left}px` } : undefined}
          >
            <img
              src={routeImages[hoveredImageId]}
              alt="ภาพเต็มจากกล้อง"
              className="rt-hover-preview-img"
            />
            {hoveredItem && (
              <div className="rt-hover-preview-body">
                <p className="rt-hover-preview-camera">{getCameraName(hoveredItem.camera_id)}</p>
                <p className="rt-hover-preview-time">{formatDateTime(hoveredItem.time_detect)}</p>
              </div>
            )}
          </div>
        )
      })()}
    </Layout>
  )
}

export default RouteTracking