import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FaTriangleExclamation,
  FaTrashCan,
  FaXmark,
  FaPlus,
  FaArrowUpRightFromSquare,
  FaArrowDownWideShort,
  FaArrowUpWideShort,
  FaSort
} from 'react-icons/fa6'
import { FaCar, FaSearch, FaCheck, FaPen, FaEye, FaRoute, FaCalendarAlt, FaRedo } from 'react-icons/fa'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import { renderVillageDisplay } from '../components/VillageDisplay'
import useNotificationStore from '../store/notificationStore'
import { renderCustomDatePickerHeader } from '../components/CustomDatePickerHeader'
import {
  getBlacklistAPI,
  createBlacklistAPI,
  updateBlacklistAPI,
  deleteBlacklistAPI,
  getWhitelistAPI,
  createWhitelistAPI,
  updateWhitelistAPI,
  deleteWhitelistAPI,
  getDetectionsAPI,
  getCamerasAPI,
  getAuthedImageURL
} from '../data/api'
import '../styles/Blacklist.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import ProvinceAutocomplete from '../components/ProvinceAutocomplete'
import { isValidThaiProvince } from '../data/thaiProvinces'
import { isThaiEnglishNameValid, filterThaiEnglishName, stripEmoji } from '../utils/passwordPolicy'

// Regex สำหรับป้ายทะเบียนไทย (รองรับป้ายปกติ, ป้ายมอเตอร์ไซค์, ป้ายประมูล/สระวรรณยุกต์, ตัวเลข และขีด)
export const THAI_LICENSE_PLATE_REGEX = /^[0-9\u0E01-\u0E3A\u0E40-\u0E4E\s-]+$/

export function isThaiLicensePlateValid(plate) {
  if (!plate || typeof plate !== 'string') return false
  const trimmed = plate.trim()
  if (trimmed.length < 2 || trimmed.length > 15) return false
  return THAI_LICENSE_PLATE_REGEX.test(trimmed)
}

const MANAGE_ROLES = ['user', 'admin', 'superadmin']
const SEARCH_DEBOUNCE_MS = 350
const DEFAULT_ROWS_PER_PAGE = 8
const REGISTERED_PAGE_SIZE = 8
const TODAY_PAGE_SIZE = 8
const MAX_VISIBLE_PAGES = 4
const JOIN_PAGE_SIZE = 100
const JOIN_MAX_PAGES = 10

const EMPTY_BLACKLIST_FORM = { plate: '', province: '', reason: '' }
const EMPTY_WHITELIST_FORM = { name: '', plate: '', province: '', note: '' }

function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH')
}

function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function dateKeyOf(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizePlate(plate) {
  return (plate || '').replace(/\s+/g, '')
}

function getVisiblePageNumbers(currentPage, totalPages, maxVisible) {
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

function Blacklist() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { villages, selectedVillageId, getVillageName } = useVillageStore()
  const renderVillage = (id, directName) => renderVillageDisplay(id, directName, villages)
  const latestDetection = useNotificationStore((state) => state.latestDetection)
  const isSuperAdmin = user?.role === 'superadmin'
  const canManage = MANAGE_ROLES.includes(user?.role)

  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'whitelist' ? 'whitelist' : 'blacklist')
  const isBlacklistTab = activeTab === 'blacklist'

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'whitelist' || tab === 'blacklist') {
      setActiveTab(tab)
    }
  }, [searchParams])

  // ---------- ข้อมูลรายชื่อที่ลงทะเบียนไว้ในระบบ (Registered Vehicles) ----------
  const [registeredList, setRegisteredList] = useState([])
  const [registeredTotal, setRegisteredTotal] = useState(0)
  const [isLoadingRegistered, setIsLoadingRegistered] = useState(true)
  const [registeredSearch, setRegisteredSearch] = useState('')
  const [registeredSortOrder, setRegisteredSortOrder] = useState('desc') // 'desc' = ล่าสุด, 'asc' = เก่าสุด
  const [registeredPage, setRegisteredPage] = useState(1)
  const [showRegisteredModal, setShowRegisteredModal] = useState(false)

  // ---------- ฟอร์มเพิ่ม / แก้ไข (Add / Edit Form Modal) ----------
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [formData, setFormData] = useState(EMPTY_BLACKLIST_FORM)
  const [formVillageId, setFormVillageId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formTouched, setFormTouched] = useState({})
  const [hasSubmittedForm, setHasSubmittedForm] = useState(false)

  // ---------- ตารางประวัติการตรวจจับที่ตรงกับ Blacklist/Whitelist (Detection Records) ----------
  const [matchingDetections, setMatchingDetections] = useState([])
  const [isLoadingDetections, setIsLoadingDetections] = useState(true)
  const [detectionSearch, setDetectionSearch] = useState('')
  const [debouncedDetectionSearch, setDebouncedDetectionSearch] = useState('')
  const [startDate, setStartDate] = useState(null)
  const [endDate, setEndDate] = useState(null)
  const [sortOrder, setSortOrder] = useState('desc') // 'desc' = ล่าสุด, 'asc' = เก่าสุด
  const [currentPage, setCurrentPage] = useState(1)
  const [dynamicRowsPerPage, setDynamicRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE)
  const [cameras, setCameras] = useState([])
  const tableContainerRef = useRef(null)

  // ---------- Modal รายการตรวจจับวันนี้ (Detected Today Modal) ----------
  const [showTodayModal, setShowTodayModal] = useState(false)
  const [todaySearchQuery, setTodaySearchQuery] = useState('')
  const [todaySortOrder, setTodaySortOrder] = useState('desc')
  const [todayPage, setTodayPage] = useState(1)

  // คำนวณจำนวนแถวที่พอดีกับขนาดหน้าจอจริงอัตโนมัติ (Dynamic Rows per Page)
  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return

    const calculateRows = () => {
      const height = el.clientHeight
      if (!height) return
      const headerHeight = 40
      const rowHeight = 49
      const available = height - headerHeight
      if (available > 0) {
        const calculated = Math.max(4, Math.floor(available / rowHeight))
        setDynamicRowsPerPage(calculated)
      }
    }

    calculateRows()
    const observer = new ResizeObserver(calculateRows)
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  // ---------- Modal ดูรูปรายละเอียดรถ (Image Modal) ----------
  const [selectedItem, setSelectedItem] = useState(null)
  const [modalImages, setModalImages] = useState({ crop: null, full: null })
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState(null)

  // Debounce search ของตาราง Detection
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDetectionSearch(detectionSearch)
      setCurrentPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [detectionSearch])

  // ดึงรายชื่อกล้อง
  useEffect(() => {
    async function fetchCameras() {
      if (!user) return
      try {
        const data = await getCamerasAPI(selectedVillageId)
        setCameras(data || [])
        saveHistoricalCameras(data)
      } catch (error) {
        console.error('โหลดกล้องไม่สำเร็จ:', error)
      }
    }
    fetchCameras()
  }, [user, selectedVillageId])

  // หาชื่อกล้องจาก camera_id + แสดงหมายเหตุหากกล้องถูกลบออกจากระบบไปแล้ว
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

  // ดึงรายการที่ลงทะเบียนทั้งหมด (Registered Blacklist/Whitelist)
  const fetchRegistered = useCallback(async () => {
    if (!user) return
    setIsLoadingRegistered(true)
    try {
      const data = isBlacklistTab
        ? await getBlacklistAPI({ villageId: selectedVillageId || undefined, pageSize: 100 })
        : await getWhitelistAPI({ villageId: selectedVillageId || undefined, pageSize: 100 })

      const items = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.whitelist)
        ? data.whitelist
        : Array.isArray(data?.blacklist)
        ? data.blacklist
        : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.records)
        ? data.records
        : Array.isArray(data)
        ? data
        : []

      // ซิงค์จำนวนทั้งหมดให้ตรงกับ items ที่มีจริง
      // หาก items ว่าง ให้ totalCount เป็น 0 เสมอ เพื่อไม่ให้แสดงเลข 1 หลอกตอนไม่มีรายการจริง
      const totalCount = items.length === 0
        ? 0
        : typeof data?.total === 'number'
        ? Math.max(items.length, data.total)
        : typeof data?.total_items === 'number'
        ? Math.max(items.length, data.total_items)
        : typeof data?.total_count === 'number'
        ? Math.max(items.length, data.total_count)
        : typeof data?.count === 'number'
        ? Math.max(items.length, data.count)
        : items.length

      setRegisteredList(items)
      setRegisteredTotal(totalCount)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingRegistered(false)
    }
  }, [user, isBlacklistTab, selectedVillageId])

  useEffect(() => {
    fetchRegistered()
  }, [fetchRegistered])

const STORAGE_KEY_BLACKLIST_HISTORY = 'lpr_historical_blacklist_plates'
const STORAGE_KEY_WHITELIST_HISTORY = 'lpr_historical_whitelist_plates'
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

function getHistoricalBlacklistPlates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BLACKLIST_HISTORY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function saveHistoricalBlacklistPlates(map) {
  try {
    localStorage.setItem(STORAGE_KEY_BLACKLIST_HISTORY, JSON.stringify(map))
  } catch (e) {}
}

function getHistoricalWhitelistPlates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WHITELIST_HISTORY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function saveHistoricalWhitelistPlates(map) {
  try {
    localStorage.setItem(STORAGE_KEY_WHITELIST_HISTORY, JSON.stringify(map))
  } catch (e) {}
}

  // ดึง Detections ทั้งหมด และ Match กับรายการ Registered (คงประวัติป้ายที่เคยลงทะเบียนแม้จะลบออกไปแล้ว)
  const fetchDetectionsAndMatch = useCallback(async (isSilent = false) => {
    if (!user) return
    if (!isSilent) setIsLoadingDetections(true)
    try {
      // 1. ดึงรายการ blacklist หรือ whitelist ทั้งหมดในระบบ
      let regItems = []
      let page = 1
      while (page <= JOIN_MAX_PAGES) {
        const data = isBlacklistTab
          ? await getBlacklistAPI({ villageId: selectedVillageId || undefined, page, pageSize: JOIN_PAGE_SIZE })
          : await getWhitelistAPI({ villageId: selectedVillageId || undefined, page, pageSize: JOIN_PAGE_SIZE })
        const pageItems = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.whitelist)
          ? data.whitelist
          : Array.isArray(data?.blacklist)
          ? data.blacklist
          : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.records)
          ? data.records
          : Array.isArray(data)
          ? data
          : []
        regItems = regItems.concat(pageItems)
        const total = data?.total ?? 0
        if (regItems.length >= total || pageItems.length === 0) break
        page += 1
      }

      // สร้าง Map สำหรับ Lookup ทะเบียนรถ + ข้อมูลเพิ่มเติม (เหตุผล หรือชื่อลูกบ้าน)
      const regMapWithProv = new Map()
      const regMapAnyProv = new Map()

      // เก็บแคชประวัติป้ายที่เคยลงทะเบียนย้อนหลัง เพื่อไม่ให้ประวัติการตรวจจับหายเมื่อแก้ไข/ลบป้ายออก
      const histMap = isBlacklistTab
        ? getHistoricalBlacklistPlates()
        : getHistoricalWhitelistPlates()

      regItems.forEach((item) => {
        const plate = normalizePlate(item.license_plate)
        if (!plate) return
        const prov = (item.province || '').trim()
        if (prov) {
          regMapWithProv.set(`${plate}|${prov}`, item)
        } else {
          regMapAnyProv.set(plate, item)
        }

        const key = prov ? `${plate}|${prov}` : plate
        histMap[key] = {
          plate: item.license_plate,
          province: item.province,
          reason: item.reason || '-',
          name: item.name || '-',
          note: item.note || '-'
        }
      })

      if (isBlacklistTab) {
        saveHistoricalBlacklistPlates(histMap)
      } else {
        saveHistoricalWhitelistPlates(histMap)
      }

      // 2. ดึง detections ที่ถูกตรวจจับว่าเป็น Blacklist/Whitelist จาก Backend โดยตรง
      let allDetections = []
      let detPage = 1
      while (detPage <= JOIN_MAX_PAGES) {
        const data = await getDetectionsAPI({
          village_id: selectedVillageId || undefined,
          is_blacklist: isBlacklistTab ? true : undefined,
          is_whitelist: !isBlacklistTab ? true : undefined,
          page: detPage,
          page_size: JOIN_PAGE_SIZE
        })
        const pageItems = Array.isArray(data?.items) ? data.items : []
        allDetections = allDetections.concat(pageItems)
        const total = data?.total ?? 0
        if (allDetections.length >= total || pageItems.length === 0) break
        detPage += 1
      }

      // 3. กรองและเชื่อมโยงข้อมูล (Join ข้อมูลปัจจุบัน หรือประวัติหมายเหตุ)
      const matched = []
      allDetections.forEach((d) => {
        const isDetTarget = isBlacklistTab
          ? Boolean(d.is_blacklist || d.is_blacklisted)
          : Boolean(d.is_whitelist || d.is_whitelisted)
        if (!isDetTarget) return

        const plate = normalizePlate(d.license_plate)
        if (!plate) return
        const prov = (d.province || '').trim()

        const regEntry = regMapWithProv.get(`${plate}|${prov}`) || regMapAnyProv.get(plate)
        if (regEntry) {
          matched.push({
            ...d,
            matchedReason: regEntry.reason || '-',
            matchedName: regEntry.name || '-',
            matchedNote: regEntry.note || '-',
            isDeletedFromSystem: false
          })
        } else {
          // รถคันนี้ถูกตรวจจับตอนเป็น Blacklist/Whitelist ในอดีต แต่ปัจจุบันถูกลบออกจากทะเบียนแล้ว
          const histEntry = histMap[`${plate}|${prov}`] || histMap[plate]
          matched.push({
            ...d,
            matchedReason: histEntry?.reason || d.reason || '-',
            matchedName: histEntry?.name || '-',
            matchedNote: histEntry?.note || '-',
            isDeletedFromSystem: true
          })
        }
      })

      // เรียงลำดับจากใหม่สุดไปเก่าสุด
      matched.sort((a, b) => new Date(b.time_detect) - new Date(a.time_detect))
      setMatchingDetections(matched)
    } catch (error) {
      console.error('ดึงข้อมูลการตรวจจับไม่สำเร็จ:', error)
    } finally {
      if (!isSilent) setIsLoadingDetections(false)
    }
  }, [user, isBlacklistTab, selectedVillageId])

  useEffect(() => {
    fetchDetectionsAndMatch()
  }, [fetchDetectionsAndMatch])

  // ---------- Real-time SSE Merge เข้าตาราง Detection Records ----------
  useEffect(() => {
    if (!latestDetection) return

    const detVillageId = latestDetection.village_id || latestDetection.camera?.village_id
    if (selectedVillageId && detVillageId && String(detVillageId) !== String(selectedVillageId)) {
      return
    }

    const rawPlate = latestDetection.license_plate || ''
    const plateNorm = normalizePlate(rawPlate)
    if (!plateNorm) return

    const prov = (latestDetection.province || '').trim()
    const isBlacklistEvent = Boolean(
      latestDetection.is_blacklist ||
      latestDetection.is_black_list ||
      latestDetection.is_blacklisted ||
      latestDetection.category === 'blacklist' ||
      latestDetection.type === 'blacklist' ||
      latestDetection.blacklist
    )
    const isWhitelistEvent = Boolean(
      latestDetection.is_whitelist ||
      latestDetection.is_white_list ||
      latestDetection.is_whitelisted ||
      latestDetection.category === 'whitelist' ||
      latestDetection.type === 'whitelist' ||
      latestDetection.whitelist
    )

    const isMatchForThisTab = isBlacklistTab ? isBlacklistEvent : isWhitelistEvent
    if (!isMatchForThisTab) return

    // Match กับรายชื่อที่ลงทะเบียนไว้ในปัจจุบัน
    const matchedReg = registeredList.find((r) => {
      const rPlate = normalizePlate(r.license_plate)
      if (rPlate !== plateNorm) return false
      const rProv = (r.province || '').trim()
      return !rProv || !prov || rProv === prov
    })

    const detId = latestDetection.detection_id || latestDetection.id || `det-${Date.now()}`

    setMatchingDetections((prev) => {
      const exists = prev.some(
        (item) =>
          item.id === detId ||
          (normalizePlate(item.license_plate) === plateNorm &&
            item.time_detect === latestDetection.time_detect)
      )
      if (exists) return prev

      const newRecord = {
        id: detId,
        time_detect: latestDetection.time_detect || latestDetection.created_at || new Date().toISOString(),
        license_plate: rawPlate,
        province: latestDetection.province || '-',
        color: latestDetection.color || '-',
        camera_id: latestDetection.camera_id || latestDetection.camera?.id,
        camera_name: latestDetection.camera_name || latestDetection.camera?.name,
        camera: latestDetection.camera,
        village_id: detVillageId,
        image_full: latestDetection.image_full || latestDetection.image_url,
        image_crop: latestDetection.image_crop || latestDetection.image_crop_url || latestDetection.crop_url,
        matchedReason: matchedReg?.reason || latestDetection.reason || (isBlacklistTab ? 'ตรวจพบบัญชีดำ' : '-'),
        matchedName: matchedReg?.name || latestDetection.name || (isBlacklistTab ? '-' : 'ยานพาหนะลูกบ้าน'),
        matchedNote: matchedReg?.note || latestDetection.note || '-',
        isDeletedFromSystem: !matchedReg
      }

      return [newRecord, ...prev]
    })
  }, [latestDetection, isBlacklistTab, selectedVillageId, registeredList])

  // คำนวณยอดที่ตรวจจับได้ "วันนี้"
  const foundTodayCount = useMemo(() => {
    const todayStr = dateKeyOf(new Date().toISOString())
    return matchingDetections.filter((d) => dateKeyOf(d.time_detect) === todayStr).length
  }, [matchingDetections])

  // กรองตาราง Detections ด้วย Search และ ช่วงวันที่ (Date Range)
  const filteredDetections = useMemo(() => {
    let list = matchingDetections

    // ลอจิกวันที่: ถ้าเลือกแค่วันแรก = หาวันนั้นทั้งวัน, ถ้าเลือก 2 วัน = หาช่วงวันที่
    if (startDate && !endDate) {
      const startOfDay = new Date(startDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(startDate)
      endOfDay.setHours(23, 59, 59, 999)
      list = list.filter((d) => {
        const time = new Date(d.time_detect)
        return time >= startOfDay && time <= endOfDay
      })
    } else {
      if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        list = list.filter((d) => new Date(d.time_detect) >= start)
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        list = list.filter((d) => new Date(d.time_detect) <= end)
      }
    }

    // กรองคำค้นหา
    if (debouncedDetectionSearch.trim()) {
      const q = debouncedDetectionSearch.trim().toLowerCase()
      list = list.filter(
        (d) =>
          (d.license_plate || '').toLowerCase().includes(q) ||
          (d.province || '').toLowerCase().includes(q) ||
          (d.matchedReason || '').toLowerCase().includes(q) ||
          (d.matchedName || '').toLowerCase().includes(q)
      )
    }

    // เรียงลำดับข้อมูลตามวันที่ตรวจจับ (ล่าสุด / เก่าสุด)
    return [...list].sort((a, b) => {
      const timeA = new Date(a.time_detect).getTime() || 0
      const timeB = new Date(b.time_detect).getTime() || 0
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [matchingDetections, debouncedDetectionSearch, startDate, endDate, sortOrder])

  // Pagination สำหรับตาราง Detections
  const totalPages = Math.max(1, Math.ceil(filteredDetections.length / dynamicRowsPerPage))

  // ปรับ currentPage หากเกิน totalPages เมื่อ dynamicRowsPerPage เปลี่ยน
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedDetections = useMemo(() => {
    const start = (currentPage - 1) * dynamicRowsPerPage
    return filteredDetections.slice(start, start + dynamicRowsPerPage)
  }, [filteredDetections, currentPage, dynamicRowsPerPage])

  const visiblePages = getVisiblePageNumbers(currentPage, totalPages, MAX_VISIBLE_PAGES)

  const toggleRegisteredSortOrder = () => {
    setRegisteredSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
  }

  // กรองและเรียงลำดับตารางใน Modal Registered
  const filteredRegisteredList = useMemo(() => {
    let list = registeredList
    if (registeredSearch.trim()) {
      const q = registeredSearch.trim().toLowerCase()
      list = list.filter(
        (item) =>
          (item.license_plate || '').toLowerCase().includes(q) ||
          (item.province || '').toLowerCase().includes(q) ||
          (item.reason || '').toLowerCase().includes(q) ||
          (item.name || '').toLowerCase().includes(q) ||
          (item.note || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || a.id || 0
      const timeB = new Date(b.created_at).getTime() || b.id || 0
      return registeredSortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [registeredList, registeredSearch, registeredSortOrder])

  const totalRegisteredPages = Math.max(1, Math.ceil(filteredRegisteredList.length / REGISTERED_PAGE_SIZE))

  // ปรับ registeredPage หากเกิน totalRegisteredPages เมื่อค้นหาหรือลบข้อมูล
  useEffect(() => {
    if (registeredPage > totalRegisteredPages) {
      setRegisteredPage(totalRegisteredPages)
    }
  }, [registeredPage, totalRegisteredPages])

  const displayedRegisteredItems = useMemo(() => {
    const start = (registeredPage - 1) * REGISTERED_PAGE_SIZE
    return filteredRegisteredList.slice(start, start + REGISTERED_PAGE_SIZE)
  }, [filteredRegisteredList, registeredPage])

  const visibleRegisteredPages = getVisiblePageNumbers(registeredPage, totalRegisteredPages, MAX_VISIBLE_PAGES)

  // ---------- ข้อมูลและการคำนวณสำหรับ Today Modal ----------
  const toggleTodaySortOrder = () => {
    setTodaySortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
  }

  const todayDetectionsList = useMemo(() => {
    const todayStr = dateKeyOf(new Date().toISOString())
    return matchingDetections.filter((d) => dateKeyOf(d.time_detect) === todayStr)
  }, [matchingDetections])

  const filteredTodayDetections = useMemo(() => {
    let list = todayDetectionsList
    if (todaySearchQuery.trim()) {
      const q = todaySearchQuery.trim().toLowerCase()
      list = list.filter(
        (d) =>
          (d.license_plate || '').toLowerCase().includes(q) ||
          (d.province || '').toLowerCase().includes(q) ||
          (d.color || '').toLowerCase().includes(q) ||
          (d.camera_name || d.camera?.name || '').toLowerCase().includes(q) ||
          (d.matchedReason || '').toLowerCase().includes(q) ||
          (d.matchedName || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const timeA = new Date(a.time_detect).getTime() || 0
      const timeB = new Date(b.time_detect).getTime() || 0
      return todaySortOrder === 'desc' ? timeB - timeA : timeA - timeB
    })
  }, [todayDetectionsList, todaySearchQuery, todaySortOrder])

  const totalTodayPages = Math.max(1, Math.ceil(filteredTodayDetections.length / TODAY_PAGE_SIZE))

  useEffect(() => {
    if (todayPage > totalTodayPages) {
      setTodayPage(totalTodayPages)
    }
  }, [todayPage, totalTodayPages])

  const displayedTodayItems = useMemo(() => {
    const start = (todayPage - 1) * TODAY_PAGE_SIZE
    return filteredTodayDetections.slice(start, start + TODAY_PAGE_SIZE)
  }, [filteredTodayDetections, todayPage])

  const visibleTodayPages = getVisiblePageNumbers(todayPage, totalTodayPages, MAX_VISIBLE_PAGES)

  // สลับแท็บ
  function handleTabChange(tab) {
    if (tab === activeTab) return
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
    setRegisteredList([])
    setRegisteredTotal(0)
    setRegisteredSearch('')
    setRegisteredSortOrder('desc')
    setRegisteredPage(1)
    setTodaySearchQuery('')
    setTodaySortOrder('desc')
    setTodayPage(1)
    setDetectionSearch('')
    setDebouncedDetectionSearch('')
    setStartDate(null)
    setEndDate(null)
    setSortOrder('desc')
    setCurrentPage(1)
  }

  // รีเซ็ตตัวกรองตารางประวัติ
  function handleResetDetectionFilter() {
    setDetectionSearch('')
    setDebouncedDetectionSearch('')
    setStartDate(null)
    setEndDate(null)
    setSortOrder('desc')
    setCurrentPage(1)
  }

  // ลบรายการที่ลงทะเบียน
  function handleDelete(id, plate) {
    const deleteFn = isBlacklistTab ? deleteBlacklistAPI : deleteWhitelistAPI
    Swal.fire({
      title: `ลบ ${plate} ออกจาก ${isBlacklistTab ? 'Blacklist' : 'Whitelist'}?`,
      text: 'ข้อมูลยานพาหนะนี้จะถูกลบออกจากบัญชี',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'ยืนยันลบ',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (!result.isConfirmed) return
      try {
        await deleteFn(id)
        setRegisteredList((prev) => prev.filter((item) => item.id !== id))
        setRegisteredTotal((prev) => Math.max(0, prev - 1))
        fetchDetectionsAndMatch()
        Swal.fire({ icon: 'success', title: 'ลบเรียบร้อย', text: `นำ ${plate} ออกแล้ว`, showConfirmButton: false, timer: 1500 })
      } catch (error) {
        console.error(error)
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' })
      }
    })
  }

  // เปิด Modal เพิ่ม
  function openAddModal() {
    setEditingEntry(null)
    setFormData(isBlacklistTab ? EMPTY_BLACKLIST_FORM : EMPTY_WHITELIST_FORM)
    setFormVillageId(selectedVillageId || (villages.length > 0 ? villages[0].id : ''))
    setFormTouched({})
    setHasSubmittedForm(false)
    setShowFormModal(true)
  }

  // เปิด Modal แก้ไข
  function openEditModal(entry) {
    setEditingEntry(entry)
    setFormVillageId(entry.village_id || selectedVillageId || '')
    setFormTouched({})
    setHasSubmittedForm(false)
    if (isBlacklistTab) {
      setFormData({ plate: entry.license_plate || '', province: entry.province || '', reason: entry.reason || '' })
    } else {
      setFormData({
        name: entry.name || '',
        plate: entry.license_plate || '',
        province: entry.province || '',
        note: entry.note || ''
      })
    }
    setShowFormModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormTouched((prev) => ({ ...prev, [name]: true }))
    if (name === 'name') {
      setFormData((prev) => ({ ...prev, name: filterThaiEnglishName(value) }))
      return
    }
    setFormData((prev) => ({ ...prev, [name]: stripEmoji(value) }))
  }

  function handleFieldBlur(name) {
    setFormTouched((prev) => ({ ...prev, [name]: true }))
  }

  // ตรวจสอบความถูกต้องสำหรับฟอร์ม Blacklist
  const isBlacklistFormValid = useMemo(() => {
    if (!isBlacklistTab) return true
    const villageOk = !isSuperAdmin || Boolean(formVillageId)
    const plateOk = isThaiLicensePlateValid(formData?.plate)
    const provOk = isValidThaiProvince(formData?.province || '')
    const reasonOk = (formData?.reason || '').trim().length > 0
    return villageOk && plateOk && provOk && reasonOk
  }, [formData, isBlacklistTab, isSuperAdmin, formVillageId])

  // ตรวจสอบความถูกต้องสำหรับฟอร์ม Whitelist
  const isWhitelistFormValid = useMemo(() => {
    if (isBlacklistTab) return true
    const villageOk = !isSuperAdmin || Boolean(formVillageId)
    const nameOk = isThaiEnglishNameValid(formData?.name)
    const plateOk = isThaiLicensePlateValid(formData?.plate)
    const provOk = isValidThaiProvince(formData?.province || '')
    return villageOk && nameOk && plateOk && provOk
  }, [formData, isBlacklistTab, isSuperAdmin, formVillageId])

  // ตรวจสอบว่ามีการเปลี่ยนแปลงข้อมูลในฟอร์มหรือไม่ (Dirty check)
  const checkIsFormDirty = useCallback(() => {
    if (editingEntry) {
      if (isBlacklistTab) {
        return (
          (formData.plate || '').trim() !== (editingEntry.license_plate || '').trim() ||
          (formData.province || '').trim() !== (editingEntry.province || '').trim() ||
          (formData.reason || '').trim() !== (editingEntry.reason || '').trim() ||
          (isSuperAdmin && String(formVillageId || '') !== String(editingEntry.village_id || ''))
        )
      } else {
        return (
          (formData.name || '').trim() !== (editingEntry.name || '').trim() ||
          (formData.plate || '').trim() !== (editingEntry.license_plate || '').trim() ||
          (formData.province || '').trim() !== (editingEntry.province || '').trim() ||
          (formData.note || '').trim() !== (editingEntry.note || '').trim() ||
          (isSuperAdmin && String(formVillageId || '') !== String(editingEntry.village_id || ''))
        )
      }
    } else {
      if (isBlacklistTab) {
        return Boolean((formData.plate || '').trim() || (formData.province || '').trim() || (formData.reason || '').trim())
      } else {
        return Boolean(
          (formData.name || '').trim() ||
          (formData.plate || '').trim() ||
          (formData.province || '').trim() ||
          (formData.note || '').trim()
        )
      }
    }
  }, [formData, editingEntry, isBlacklistTab, isSuperAdmin, formVillageId])

  // ปิด Modal ฟอร์ม พร้อม SweetAlert เตือนหากมีการแก้ไขค้างไว้
  const handleAttemptCloseFormModal = useCallback(() => {
    if (isSubmitting) return
    if (checkIsFormDirty()) {
      Swal.fire({
        icon: 'warning',
        title: 'คุณมีการแก้ไขที่ยังไม่ได้บันทึก',
        text: 'คุณต้องการยกเลิกการแก้ไขใช่หรือไม่? ข้อมูลที่คุณแก้ไขจะไม่ถูกบันทึก',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ไม่บันทึก',
        cancelButtonText: 'แก้ไขต่อ',
        reverseButtons: true
      }).then((result) => {
        if (result.isConfirmed) {
          setShowFormModal(false)
          setEditingEntry(null)
          setFormData(isBlacklistTab ? EMPTY_BLACKLIST_FORM : EMPTY_WHITELIST_FORM)
          setFormTouched({})
          setHasSubmittedForm(false)
        }
      })
    } else {
      setShowFormModal(false)
      setEditingEntry(null)
      setFormData(isBlacklistTab ? EMPTY_BLACKLIST_FORM : EMPTY_WHITELIST_FORM)
      setFormTouched({})
      setHasSubmittedForm(false)
    }
  }, [isSubmitting, checkIsFormDirty, isBlacklistTab])

  // บันทึกฟอร์ม เพิ่ม / แก้ไข
  async function handleFormSubmit(e) {
    e.preventDefault()
    setHasSubmittedForm(true)

    const targetVillageId = isSuperAdmin ? formVillageId : (selectedVillageId || user?.village_id)

    if (!editingEntry && !targetVillageId) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกหมู่บ้าน',
        text: `โปรดเลือกหมู่บ้านก่อนเพิ่มรายการ ${isBlacklistTab ? 'Blacklist' : 'Whitelist'}`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const trimmedPlate = stripEmoji(formData?.plate || '').trim()
    const trimmedProvince = (formData?.province || '').trim()

    if (!trimmedPlate) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกป้ายทะเบียน', confirmButtonColor: 'var(--sidebar-bg)' })
      return
    }
    if (trimmedPlate.length < 2) {
      Swal.fire({ icon: 'warning', title: 'ป้ายทะเบียนสั้นเกินไป', text: 'ป้ายทะเบียนต้องมีอย่างน้อย 2 ตัวอักษร', confirmButtonColor: 'var(--sidebar-bg)' })
      return
    }
    if (!isThaiLicensePlateValid(trimmedPlate)) {
      Swal.fire({
        icon: 'warning',
        title: 'รูปแบบป้ายทะเบียนไม่ถูกต้อง',
        text: 'ป้ายทะเบียนต้องประกอบด้วยตัวอักษรภาษาไทยหรือตัวเลขเท่านั้น (ห้ามมีอักขระพิเศษ)',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!trimmedProvince || !isValidThaiProvince(trimmedProvince)) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกจังหวัด',
        text: 'โปรดเลือกจังหวัดจากรายการที่มีให้เท่านั้น',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (isBlacklistTab) {
      if (!formData.reason.trim()) {
        Swal.fire({ icon: 'warning', title: 'กรุณาระบุเหตุผล', text: 'ต้องระบุเหตุผลที่ขึ้นบัญชีดำ', confirmButtonColor: 'var(--sidebar-bg)' })
        return
      }
    } else {
      const trimmedName = stripEmoji(formData.name || '').trim()
      if (!trimmedName) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อเจ้าของรถ', confirmButtonColor: 'var(--sidebar-bg)' })
        return
      }
      if (!isThaiEnglishNameValid(trimmedName)) {
        Swal.fire({
          icon: 'warning',
          title: 'รูปแบบชื่อไม่ถูกต้อง',
          text: 'ชื่อเจ้าของรถต้องเป็นภาษาไทยหรือภาษาอังกฤษเท่านั้น (2-50 ตัวอักษร)',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
        return
      }
    }

    setIsSubmitting(true)
    try {
      if (editingEntry) {
        if (isBlacklistTab) {
          const updated = await updateBlacklistAPI(editingEntry.id, {
            licensePlate: trimmedPlate,
            province: trimmedProvince,
            reason: formData.reason.trim()
          })
          setRegisteredList((prev) => prev.map((item) => (item.id === editingEntry.id ? updated : item)))
        } else {
          const updated = await updateWhitelistAPI(editingEntry.id, {
            category: 'ลูกบ้าน',
            name: formData.name.trim(),
            licensePlate: trimmedPlate,
            province: trimmedProvince,
            note: (formData.note || '').trim()
          })
          setRegisteredList((prev) => prev.map((item) => (item.id === editingEntry.id ? updated : item)))
        }
        Swal.fire({ icon: 'success', title: 'แก้ไขข้อมูลสำเร็จ', showConfirmButton: false, timer: 1500 })
      } else {
        if (isBlacklistTab) {
          const newEntry = await createBlacklistAPI(targetVillageId, trimmedPlate, trimmedProvince, formData.reason.trim())
          setRegisteredList((prev) => [newEntry, ...prev])
        } else {
          const newEntry = await createWhitelistAPI(
            targetVillageId,
            'ลูกบ้าน',
            formData.name.trim(),
            trimmedPlate,
            trimmedProvince,
            (formData.note || '').trim()
          )
          setRegisteredList((prev) => [newEntry, ...prev])
        }
        setRegisteredTotal((prev) => prev + 1)
        Swal.fire({ icon: 'success', title: 'เพิ่มข้อมูลสำเร็จ', showConfirmButton: false, timer: 1500 })
      }

      setShowFormModal(false)
      setEditingEntry(null)
      setFormData(isBlacklistTab ? EMPTY_BLACKLIST_FORM : EMPTY_WHITELIST_FORM)
      fetchDetectionsAndMatch()
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: editingEntry ? 'แก้ไขไม่สำเร็จ' : 'เพิ่มข้อมูลไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---------- โหลดภาพใน Modal รายละเอียด ----------
  useEffect(() => {
    if (!selectedItem) {
      setModalImages({ crop: null, full: null })
      return
    }

    let isCancelled = false
    setIsLoadingImages(true)

    async function loadImages() {
      try {
        const cropSource = selectedItem.image_crop || selectedItem.crop_url
        const fullSource = selectedItem.image_full || selectedItem.image_url

        const [crop, full] = await Promise.all([
          cropSource ? getAuthedImageURL(cropSource) : Promise.resolve(null),
          fullSource ? getAuthedImageURL(fullSource) : Promise.resolve(null)
        ])
        if (!isCancelled) {
          setModalImages({ crop, full })
        }
      } catch (err) {
        console.error('โหลดรูปไม่สำเร็จ:', err)
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
    setModalImages({ crop: null, full: null })
    setSelectedItem(null)
  }

  const latestBlacklistModalsStateRef = useRef({})
  latestBlacklistModalsStateRef.current = {
    fullscreenImage,
    showFormModal,
    handleAttemptCloseFormModal,
    selectedItem,
    showTodayModal,
    showRegisteredModal
  }

  // ปิด modal / fullscreen / form เมื่อกดปุ่ม Escape (มี Dirty check สดใหม่เสมอผ่าน Ref)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (Swal.isVisible()) return
        const state = latestBlacklistModalsStateRef.current
        if (state.fullscreenImage) {
          setFullscreenImage(null)
        } else if (state.showFormModal) {
          state.handleAttemptCloseFormModal()
        } else if (state.selectedItem) {
          closeModal()
        } else if (state.showTodayModal) {
          setShowTodayModal(false)
        } else if (state.showRegisteredModal) {
          setShowRegisteredModal(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleGoToRouteTracking(item) {
    if (!item) return
    const params = new URLSearchParams({
      plate: item.license_plate || '',
      province: item.province || '',
      date: dateKeyOf(item.time_detect)
    })
    navigate(`/route-tracking?${params.toString()}`)
  }

  return (
    <Layout title="Blacklist & Whitelist">
      <div className="blacklist-wrapper">

        {/* Tab Switcher */}
        <div className="bl-tab-row">
          <button
            className={`bl-tab-btn ${isBlacklistTab ? 'active' : ''}`}
            onClick={() => handleTabChange('blacklist')}
          >
            <FaTriangleExclamation /> Blacklist
          </button>
          <button
            className={`bl-tab-btn whitelist ${!isBlacklistTab ? 'active' : ''}`}
            onClick={() => handleTabChange('whitelist')}
          >
            <FaCheck /> Whitelist
          </button>
        </div>

        {/* KPI Cards แถวบน */}
        <div className="bl-kpi-row">
          {/* การ์ด 1: แสดงจำนวนที่ลงทะเบียนไว้ทั้งหมด พร้อมสัญลักษณ์ External Vector เพื่อเปิด Modal จัดการ */}
          <div
            className="bl-kpi-card clickable"
            onClick={() => setShowRegisteredModal(true)}
            title={`คลิกเพื่อดูและจัดการรายชื่อ ${isBlacklistTab ? 'Blacklist' : 'Whitelist'} ทั้งหมด`}
          >
            <div className={`bl-kpi-icon ${isBlacklistTab ? 'red' : 'green'}`}>
              {isBlacklistTab ? <FaTriangleExclamation /> : <FaCheck />}
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Total Registered {isBlacklistTab ? 'Blacklist' : 'Whitelist'}</p>
              <h2 className="bl-kpi-val">{isLoadingRegistered ? '—' : registeredTotal}</h2>
            </div>
            <div className="bl-kpi-external">
              <FaArrowUpRightFromSquare className="bl-external-icon" />
              <span className="bl-external-text">จัดการรายชื่อ</span>
            </div>
          </div>

          {/* การ์ด 2: แสดงจำนวนตรวจจับได้วันนี้ */}
          <div
            className="bl-kpi-card clickable"
            onClick={() => setShowTodayModal(true)}
            title={`คลิกเพื่อดูรายการที่ตรวจจับได้วันนี้ (${isBlacklistTab ? 'Blacklist' : 'Whitelist'})`}
          >
            <div className="bl-kpi-icon orange">
              <FaCar />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Detected Today</p>
              <h2 className="bl-kpi-val">{isLoadingDetections ? '—' : foundTodayCount}</h2>
            </div>
            <div className="bl-kpi-external">
              <FaArrowUpRightFromSquare className="bl-external-icon" />
              <span className="bl-external-text">ดูรายการวันนี้</span>
            </div>
          </div>
        </div>

        {/* ตารางหลัก: แสดงรายการ Blacklist/Whitelist ที่ตรวจจับได้ทั้งหมด (Detection Records) */}
        <div className="content-card">
          <div className="bl-table-header">
            <div className="bl-table-title">
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  {isBlacklistTab ? 'Blacklist Detection Records' : 'Whitelist Detection Records'}
                </h3>
                <p className="bl-description">
                  {isBlacklistTab
                    ? 'ประวัติป้ายทะเบียนต้องสงสัยที่กล้องตรวจจับได้ทั้งหมด'
                    : 'ประวัติยานพาหนะลูกบ้าน/ได้รับอนุญาตที่กล้องตรวจจับได้ทั้งหมด'}
                </p>
              </div>
            </div>

            <div className="bl-table-header-actions">
              <div className="bl-date-filter-group">
                <div className="bl-datepicker-wrap">
                  <FaCalendarAlt className="bl-datepicker-icon" />
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => {
                      setStartDate(date)
                      setCurrentPage(1)
                    }}
                    maxDate={endDate || new Date()}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="จากวันที่"
                    className="bl-datepicker-input"
                    isClearable
                    showPopperArrow={false}
                    renderCustomHeader={renderCustomDatePickerHeader}
                  />
                </div>
                <span className="bl-date-separator">-</span>
                <div className="bl-datepicker-wrap">
                  <FaCalendarAlt className="bl-datepicker-icon" />
                  <DatePicker
                    selected={endDate}
                    onChange={(date) => {
                      setEndDate(date)
                      setCurrentPage(1)
                    }}
                    minDate={startDate}
                    maxDate={new Date()}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="ถึงวันที่"
                    className="bl-datepicker-input"
                    isClearable
                    showPopperArrow={false}
                    renderCustomHeader={renderCustomDatePickerHeader}
                  />
                </div>
              </div>

              <div className="bl-search-wrap">
                <FaSearch className="bl-search-icon" />
                <input
                  type="text"
                  placeholder="ค้นหาป้ายทะเบียน/เหตุผล..."
                  value={detectionSearch}
                  onChange={(e) => setDetectionSearch(e.target.value)}
                  className="bl-search-input"
                />
              </div>

              {/* ปุ่ม Reset ตัวกรองทั้งหมด */}
              <button
                type="button"
                className="btn-reset bl-btn-reset"
                onClick={handleResetDetectionFilter}
                title="ล้างตัวกรองทั้งหมด"
              >
                <FaRedo /> Reset
              </button>

              {/* ปุ่ม Sort เรียงลำดับวันที่ ล่าสุด / เก่าสุด */}
              <button
                type="button"
                className="btn-sort-icon-toggle"
                onClick={() => {
                  setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                  setCurrentPage(1)
                }}
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

          <div className="table-responsive" ref={tableContainerRef}>
            <table className="bl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th
                    className="bl-sortable-th"
                    onClick={() => {
                      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                      setCurrentPage(1)
                    }}
                    title="คลิกเพื่อเรียงลำดับตามวันที่"
                  >
                    <div className="bl-th-sort-inner">
                      <span>Date</span>
                      {sortOrder === 'desc' ? (
                        <FaArrowDownWideShort className="bl-th-sort-icon" />
                      ) : (
                        <FaArrowUpWideShort className="bl-th-sort-icon asc" />
                      )}
                    </div>
                  </th>
                  <th>Time</th>
                  <th>License Plate</th>
                  <th>Province</th>
                  <th>Color</th>
                  {isSuperAdmin && <th>Village</th>}
                  <th>Camera</th>
                  <th>{isBlacklistTab ? 'Reason' : 'Resident Name'}</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingDetections ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 10 : 9}>
                      <Spinner text="กำลังโหลดประวัติการตรวจจับ..." />
                    </td>
                  </tr>
                ) : paginatedDetections.length > 0 ? (
                  paginatedDetections.map((item, index) => {
                    return (
                      <tr key={item.id || index}>
                      <td>{(currentPage - 1) * dynamicRowsPerPage + index + 1}</td>
                      <td>{formatDate(item.time_detect)}</td>
                      <td>{formatTime(item.time_detect)}</td>
                      <td>
                        <span className={`bl-plate-badge ${!isBlacklistTab ? 'whitelist' : ''}`}>
                          {item.license_plate}
                        </span>
                      </td>
                      <td>{item.province || '-'}</td>
                      <td>{item.color || '-'}</td>
                      {isSuperAdmin && (
                        <td>
                          {renderVillage(
                            item.village_id || cameras.find((c) => String(c.id) === String(item.camera_id))?.village_id,
                            item.village_name || item.village?.name
                          )}
                        </td>
                      )}
                      <td>{renderCameraDisplay(item.camera_id, item.camera_name || item.camera?.name)}</td>
                      <td>
                        {isBlacklistTab ? (
                          <div>
                            <span className="bl-reason-badge">{item.matchedReason}</span>
                            {item.isDeletedFromSystem && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: '#94a3b8',
                                  display: 'block',
                                  marginTop: 3,
                                  fontWeight: 500
                                }}
                              >
                                (ป้ายนี้ถูกลบออกจากระบบแล้ว)
                              </span>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span>{item.matchedName}</span>
                            {item.isDeletedFromSystem && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: '#94a3b8',
                                  display: 'block',
                                  marginTop: 3,
                                  fontWeight: 500
                                }}
                              >
                                (ป้ายนี้ถูกลบออกจากระบบแล้ว)
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="bl-action-row">
                          <button className="btn-bl-view" onClick={() => setSelectedItem(item)}>
                            <FaEye /> View
                          </button>
                          <button
                            className="btn-bl-route"
                            onClick={() => handleGoToRouteTracking(item)}
                            title="ดูเส้นทาง"
                          >
                            <FaRoute /> Route
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                  <tr>
                    <td colSpan={isSuperAdmin ? 10 : 9}>
                      <EmptyState
                        icon={isBlacklistTab ? <FaTriangleExclamation /> : <FaCheck />}
                        title={`ไม่พบประวัติการตรวจจับ ${isBlacklistTab ? 'Blacklist' : 'Whitelist'}`}
                        description="ยังไม่มีข้อมูลการตรวจจับยานพาหนะที่ตรงกับบัญชีนี้"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Total Count and Pagination */}
          <div className="bl-table-footer">
            <p className="bl-total-count">
              Showing {paginatedDetections.length} of {filteredDetections.length.toLocaleString()} records
            </p>
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

      </div>

      {/* Modal Priority Tree (Single-Focus Modal: แสดงทีละหน้าต่าง ไม่ซ้อนทับกัน) */}
      {showFormModal ? (
        /* Modal 2: เพิ่ม / แก้ไข Blacklist & Whitelist Form */
        <div className="modal-overlay" onClick={handleAttemptCloseFormModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingEntry ? 'แก้ไข' : 'เพิ่ม'} {isBlacklistTab ? 'Blacklist' : 'Whitelist'}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={handleAttemptCloseFormModal}
                disabled={isSubmitting}
              >
                <FaXmark />
              </button>
            </div>
            <form className="bl-add-form" onSubmit={handleFormSubmit}>
              {isSuperAdmin && (
                <div className="bl-add-field">
                  <label>
                    หมู่บ้าน <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={formVillageId}
                    onChange={(e) => {
                      setFormVillageId(e.target.value)
                      setFormTouched((prev) => ({ ...prev, villageId: true }))
                    }}
                    onBlur={() => handleFieldBlur('villageId')}
                    disabled={Boolean(editingEntry)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: (formTouched.villageId || hasSubmittedForm) && !formVillageId
                        ? '1px solid #dc2626'
                        : '1px solid rgba(27, 42, 71, 0.15)',
                      background: editingEntry ? '#f1f5f9' : '#ffffff',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '14px',
                      color: '#1b2a47',
                      outline: 'none',
                      cursor: editingEntry ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <option value="">-- กรุณาเลือกหมู่บ้าน --</option>
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  {(formTouched.villageId || hasSubmittedForm) && !formVillageId && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      กรุณาเลือกหมู่บ้าน
                    </span>
                  )}
                </div>
              )}

              {!isBlacklistTab && (
                <div className="bl-add-field">
                  <label>
                    ชื่อเจ้าของรถ / ผู้พักอาศัย <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="กรอกชื่อเจ้าของรถ เช่น สมชาย (บ้าน 99/1)"
                    value={formData.name}
                    onChange={handleFormChange}
                    onBlur={() => handleFieldBlur('name')}
                    style={
                      (formTouched.name || hasSubmittedForm) && !isThaiEnglishNameValid(formData.name)
                        ? { borderColor: '#dc2626' }
                        : {}
                    }
                  />
                  {(formTouched.name || hasSubmittedForm) && !isThaiEnglishNameValid(formData.name) && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      กรุณากรอกชื่อเจ้าของรถ (2-50 ตัวอักษร เฉพาะภาษาไทย/อังกฤษ)
                    </span>
                  )}
                </div>
              )}

              <div className="bl-add-field">
                <label>
                  ป้ายทะเบียน <span style={{ color: '#ef4444' }}>*</span> (2 - 15 ตัวอักษร)
                </label>
                <input
                  type="text"
                  name="plate"
                  placeholder="เช่น 1กก1234, กข1234 หรือ โชคดี9999"
                  maxLength={15}
                  value={formData.plate}
                  onChange={handleFormChange}
                  onBlur={() => handleFieldBlur('plate')}
                  style={
                    (formTouched.plate || hasSubmittedForm) && (!formData.plate || !isThaiLicensePlateValid(formData.plate))
                      ? { borderColor: '#dc2626' }
                      : {}
                  }
                />
                {(formTouched.plate || hasSubmittedForm) && !formData.plate.trim() && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    กรุณากรอกป้ายทะเบียน
                  </span>
                )}
                {formData.plate && !isThaiLicensePlateValid(formData.plate) && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    รูปแบบป้ายทะเบียนไม่ถูกต้อง (อนุญาตเฉพาะตัวอักษรไทย ตัวเลข สระ และขีด)
                  </span>
                )}
              </div>

              <div className="bl-add-field">
                <label>
                  จังหวัด <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <ProvinceAutocomplete
                  name="province"
                  value={formData.province}
                  onChange={(value) => {
                    setFormData((prev) => ({ ...prev, province: value }))
                    setFormTouched((prev) => ({ ...prev, province: true }))
                  }}
                  placeholder="เลือกหรือพิมพ์ค้นหา เช่น กรุงเทพมหานคร, เบตง"
                />
                {(formTouched.province || hasSubmittedForm) && (!formData.province || !isValidThaiProvince(formData.province)) && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    กรุณาเลือกจังหวัดที่ถูกต้องจากตัวเลือก
                  </span>
                )}
              </div>

              {isBlacklistTab ? (
                <div className="bl-add-field">
                  <label>
                    เหตุผลที่ขึ้นบัญชีดำ <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="reason"
                    placeholder="เช่น ขโมยของ, บุคคลต้องสงสัย, ก่อความไม่สงบ"
                    value={formData.reason}
                    onChange={handleFormChange}
                    onBlur={() => handleFieldBlur('reason')}
                    style={
                      (formTouched.reason || hasSubmittedForm) && !formData.reason.trim()
                        ? { borderColor: '#dc2626' }
                        : {}
                    }
                  />
                  {(formTouched.reason || hasSubmittedForm) && !formData.reason.trim() && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      กรุณาระบุเหตุผลที่ขึ้นบัญชีดำ
                    </span>
                  )}
                </div>
              ) : (
                <div className="bl-add-field">
                  <label>หมายเหตุเพิ่มเติม (ไม่บังคับ)</label>
                  <input
                    type="text"
                    name="note"
                    placeholder="หมายเหตุ เช่น สมาชิกครอบครัว, ผู้ที่พักอาศัยในโครงการ"
                    value={formData.note}
                    onChange={handleFormChange}
                  />
                </div>
              )}

              <div className="bl-add-actions">
                <button
                  type="button"
                  className="btn-cancel-add"
                  onClick={handleAttemptCloseFormModal}
                  disabled={isSubmitting}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn-confirm-add"
                  disabled={
                    isSubmitting ||
                    (isBlacklistTab ? !isBlacklistFormValid : !isWhitelistFormValid)
                  }
                  style={
                    (isBlacklistTab ? !isBlacklistFormValid : !isWhitelistFormValid)
                      ? { opacity: 0.5, cursor: 'not-allowed' }
                      : {}
                  }
                >
                  {isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : selectedItem ? (
        /* Modal 3: ดูรายละเอียดภาพถ่ายและข้อมูล (History Style / Single-Focus) */
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content modal-detail" onClick={(e) => e.stopPropagation()}>
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
                  <span>{selectedItem.province || '-'}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Time</span>
                  <span>
                    {formatDate(selectedItem.time_detect)} {formatTime(selectedItem.time_detect)}
                  </span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Camera</span>
                  <span>{renderCameraDisplay(selectedItem.camera_id, selectedItem.camera_name || selectedItem.camera?.name)}</span>
                </div>
                {isSuperAdmin && (
                  <div className="modal-info-row">
                    <span className="info-label">Village</span>
                    <span>
                      {renderVillage(
                        selectedItem.village_id || cameras.find((c) => String(c.id) === String(selectedItem.camera_id))?.village_id,
                        selectedItem.village_name || selectedItem.village?.name
                      )}
                    </span>
                  </div>
                )}
                <div className="modal-info-row">
                  <span className="info-label">
                    {isBlacklistTab ? 'Blacklist Reason' : 'Resident Name'}
                  </span>
                  <span>
                    {isBlacklistTab ? selectedItem.matchedReason : selectedItem.matchedName}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : showTodayModal ? (
        /* Modal 2: แสดงรายการรถที่ตรวจจับได้วันนี้ (Detected Today Modal) */
        <div className="modal-overlay" onClick={() => setShowTodayModal(false)}>
          <div className="modal-content modal-large bl-direction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>
                  {isBlacklistTab ? 'Blacklist Detected Today' : 'Whitelist Detected Today'}{' '}
                  <span className="modal-header-count">({filteredTodayDetections.length})</span>
                </h3>
              </div>
              <div className="modal-header-right">
                <div className="dash-search-wrap">
                  <FaSearch className="dash-search-icon" />
                  <input
                    type="text"
                    placeholder="ค้นหาป้ายทะเบียน / จังหวัด..."
                    value={todaySearchQuery}
                    onChange={(e) => {
                      setTodaySearchQuery(e.target.value)
                      setTodayPage(1)
                    }}
                    className="dash-search-input"
                  />
                  {todaySearchQuery && (
                    <button
                      type="button"
                      className="dash-search-clear"
                      onClick={() => {
                        setTodaySearchQuery('')
                        setTodayPage(1)
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
                  onClick={toggleTodaySortOrder}
                  title={
                    todaySortOrder === 'desc'
                      ? 'เรียงลำดับ: ใหม่ไปเก่า (คลิกเพื่อสลับเป็น เก่าไปใหม่)'
                      : 'เรียงลำดับ: เก่าไปใหม่ (คลิกเพื่อสลับเป็น ใหม่ไปเก่า)'
                  }
                >
                  {todaySortOrder === 'desc' ? (
                    <FaArrowDownWideShort className="sort-btn-icon" />
                  ) : (
                    <FaArrowUpWideShort className="sort-btn-icon" />
                  )}
                </button>

                <button className="modal-close" onClick={() => setShowTodayModal(false)}>
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
                      {isSuperAdmin && <th>Village</th>}
                      <th>Camera</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingDetections && matchingDetections.length === 0 ? (
                      <tr>
                        <td colSpan={isSuperAdmin ? 9 : 8}>
                          <Spinner text="กำลังโหลดข้อมูล..." />
                        </td>
                      </tr>
                    ) : displayedTodayItems.length > 0 ? (
                      displayedTodayItems.map((item, index) => (
                        <tr key={item.id || index}>
                          <td>{(todayPage - 1) * TODAY_PAGE_SIZE + index + 1}</td>
                          <td>{formatDate(item.time_detect)}</td>
                          <td>{formatTime(item.time_detect)}</td>
                          <td className="bold-plate" style={{ fontWeight: 700, color: '#ef4444' }}>
                            {item.license_plate}
                          </td>
                          <td>{item.province || '-'}</td>
                          <td>{item.color || '-'}</td>
                          {isSuperAdmin && (
                            <td>{renderVillage(item.village_id || item.camera?.village_id, item.village_name || item.camera?.village?.name)}</td>
                          )}
                          <td>{renderCameraDisplay(item.camera_id, item.camera_name || item.camera?.name)}</td>
                          <td>
                            <button className="btn-bl-view" onClick={() => setSelectedItem(item)}>
                              <FaEye /> View
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={isSuperAdmin ? 9 : 8}>
                          <EmptyState
                            icon={<FaCar />}
                            title={todaySearchQuery ? 'ไม่พบข้อมูลที่ค้นหา' : `ไม่มีรายการตรวจจับ ${isBlacklistTab ? 'Blacklist' : 'Whitelist'} วันนี้`}
                            description={todaySearchQuery ? 'ลองเปลี่ยนคำค้นหาป้ายทะเบียน จังหวัด หรือสี' : undefined}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalTodayPages > 1 && (
                <div className="pagination" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="page-btn"
                    disabled={todayPage <= 1}
                    onClick={() => setTodayPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>

                  {visibleTodayPages.map((page) => (
                    <button
                      key={page}
                      className={`page-btn ${todayPage === page ? 'active' : ''}`}
                      onClick={() => setTodayPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="page-btn"
                    disabled={todayPage >= totalTodayPages}
                    onClick={() => setTodayPage((p) => Math.min(totalTodayPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : showRegisteredModal ? (
        /* Modal 1: แสดงรายการรถที่ลงทะเบียนไว้ทั้งหมดในระบบ (Registered Vehicles Management) */
        <div className="modal-overlay" onClick={() => setShowRegisteredModal(false)}>
          <div className="modal-content modal-large bl-direction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>
                  {isBlacklistTab ? 'Registered Blacklist' : 'Registered Whitelist'}{' '}
                  <span className="modal-header-count">({filteredRegisteredList.length})</span>
                </h3>
              </div>
              <div className="modal-header-right">
                {canManage && (
                  <button className="btn-add-blacklist" onClick={openAddModal}>
                    <FaPlus /> เพิ่ม {isBlacklistTab ? 'Blacklist' : 'Whitelist'}
                  </button>
                )}

                <div className="dash-search-wrap">
                  <FaSearch className="dash-search-icon" />
                  <input
                    type="text"
                    placeholder="ค้นหาป้ายทะเบียน / จังหวัด..."
                    value={registeredSearch}
                    onChange={(e) => {
                      setRegisteredSearch(e.target.value)
                      setRegisteredPage(1)
                    }}
                    className="dash-search-input"
                  />
                  {registeredSearch && (
                    <button
                      type="button"
                      className="dash-search-clear"
                      onClick={() => {
                        setRegisteredSearch('')
                        setRegisteredPage(1)
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
                  onClick={toggleRegisteredSortOrder}
                  title={
                    registeredSortOrder === 'desc'
                      ? 'เรียงลำดับ: ใหม่ไปเก่า (คลิกเพื่อสลับเป็น เก่าไปใหม่)'
                      : 'เรียงลำดับ: เก่าไปใหม่ (คลิกเพื่อสลับเป็น ใหม่ไปเก่า)'
                  }
                >
                  {registeredSortOrder === 'desc' ? (
                    <FaArrowDownWideShort className="sort-btn-icon" />
                  ) : (
                    <FaArrowUpWideShort className="sort-btn-icon" />
                  )}
                </button>

                <button className="modal-close" onClick={() => setShowRegisteredModal(false)}>
                  <FaXmark />
                </button>
              </div>
            </div>

            <div className="modal-registered-body">
              <div className="table-responsive">
                <table className="bl-table">
                  <thead>
                    {isBlacklistTab ? (
                      <tr>
                        <th>#</th>
                        <th>License Plate</th>
                        <th>Province</th>
                        {isSuperAdmin && <th>Village</th>}
                        <th>Reason</th>
                        <th>Date Added</th>
                        {canManage && <th>Action</th>}
                      </tr>
                    ) : (
                      <tr>
                        <th>#</th>
                        <th>License Plate</th>
                        <th>Province</th>
                        {isSuperAdmin && <th>Village</th>}
                        <th>Name</th>
                        <th>Note</th>
                        <th>Date Added</th>
                        {canManage && <th>Action</th>}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {isLoadingRegistered ? (
                      <tr>
                        <td colSpan={(isBlacklistTab ? 5 : 6) + (canManage ? 1 : 0) + (isSuperAdmin ? 1 : 0)}>
                          <Spinner text="กำลังโหลดรายชื่อ..." />
                        </td>
                      </tr>
                    ) : displayedRegisteredItems.length > 0 ? (
                      displayedRegisteredItems.map((item, index) =>
                        isBlacklistTab ? (
                          <tr key={item.id}>
                            <td>{(registeredPage - 1) * REGISTERED_PAGE_SIZE + index + 1}</td>
                            <td className="bold-plate" style={{ fontWeight: 700, color: '#ef4444' }}>
                              {item.license_plate}
                            </td>
                            <td>{item.province || '-'}</td>
                            {isSuperAdmin && (
                              <td>{renderVillage(item.village_id || item.villageId, item.village_name || item.villageName)}</td>
                            )}
                            <td>
                              <span className="bl-reason-badge">{item.reason}</span>
                            </td>
                            <td>{formatDate(item.created_at)}</td>
                            {canManage && (
                              <td>
                                <div className="bl-action-group">
                                  <button
                                    className="btn-edit"
                                    onClick={() => openEditModal(item)}
                                    title="แก้ไข"
                                  >
                                    <FaPen />
                                  </button>
                                  <button
                                    className="btn-delete"
                                    onClick={() => handleDelete(item.id, item.license_plate)}
                                    title="ลบ"
                                  >
                                    <FaTrashCan />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ) : (
                          <tr key={item.id}>
                            <td>{(registeredPage - 1) * REGISTERED_PAGE_SIZE + index + 1}</td>
                            <td className="bold-plate" style={{ fontWeight: 700 }}>
                              {item.license_plate}
                            </td>
                            <td>{item.province || '-'}</td>
                            {isSuperAdmin && (
                              <td>{renderVillage(item.village_id || item.villageId, item.village_name || item.villageName)}</td>
                            )}
                            <td>{item.name || '-'}</td>
                            <td>{item.note || '-'}</td>
                            <td>{formatDate(item.created_at)}</td>
                            {canManage && (
                              <td>
                                <div className="bl-action-group">
                                  <button
                                    className="btn-edit"
                                    onClick={() => openEditModal(item)}
                                    title="แก้ไข"
                                  >
                                    <FaPen />
                                  </button>
                                  <button
                                    className="btn-delete"
                                    onClick={() => handleDelete(item.id, item.license_plate)}
                                    title="ลบ"
                                  >
                                    <FaTrashCan />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      )
                    ) : (
                      <tr>
                        <td colSpan={(isBlacklistTab ? 5 : 6) + (canManage ? 1 : 0) + (isSuperAdmin ? 1 : 0)}>
                          <EmptyState
                            icon={isBlacklistTab ? <FaTriangleExclamation /> : <FaCheck />}
                            title={`ไม่มีข้อมูล ${isBlacklistTab ? 'Blacklist' : 'Whitelist'} ในระบบ`}
                            description={registeredSearch ? 'ไม่พบข้อมูลที่ตรงกับคำค้นหา' : 'กดปุ่มเพิ่มเพื่อบันทึกยานพาหนะเข้าระบบ'}
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalRegisteredPages > 1 && (
                <div className="pagination" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="page-btn"
                    disabled={registeredPage <= 1}
                    onClick={() => setRegisteredPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>

                  {visibleRegisteredPages.map((page) => (
                    <button
                      key={page}
                      className={`page-btn ${registeredPage === page ? 'active' : ''}`}
                      onClick={() => setRegisteredPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="page-btn"
                    disabled={registeredPage >= totalRegisteredPages}
                    onClick={() => setRegisteredPage((p) => Math.min(totalRegisteredPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal 4: ดูภาพแบบ Fullscreen */}
      {fullscreenImage && (
        <div className="image-fullscreen-overlay" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="Full size" />
        </div>
      )}

    </Layout>
  )
}

export default Blacklist