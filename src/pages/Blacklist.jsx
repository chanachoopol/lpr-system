import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaTriangleExclamation,
  FaTrashCan,
  FaXmark,
  FaPlus,
  FaArrowUpRightFromSquare
} from 'react-icons/fa6'
import { FaCar, FaSearch, FaCheck, FaPen, FaEye, FaRoute } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
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
const ROWS_PER_PAGE = 10
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
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const canManage = MANAGE_ROLES.includes(user?.role)

  const [activeTab, setActiveTab] = useState('blacklist')
  const isBlacklistTab = activeTab === 'blacklist'

  // ---------- ข้อมูลรายชื่อที่ลงทะเบียนไว้ในระบบ (Registered Vehicles) ----------
  const [registeredList, setRegisteredList] = useState([])
  const [registeredTotal, setRegisteredTotal] = useState(0)
  const [isLoadingRegistered, setIsLoadingRegistered] = useState(true)
  const [registeredSearch, setRegisteredSearch] = useState('')
  const [showRegisteredModal, setShowRegisteredModal] = useState(false)

  // ---------- ฟอร์มเพิ่ม / แก้ไข (Add / Edit Form Modal) ----------
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [formData, setFormData] = useState(EMPTY_BLACKLIST_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ---------- ตารางประวัติการตรวจจับที่ตรงกับ Blacklist/Whitelist (Detection Records) ----------
  const [matchingDetections, setMatchingDetections] = useState([])
  const [isLoadingDetections, setIsLoadingDetections] = useState(true)
  const [detectionSearch, setDetectionSearch] = useState('')
  const [debouncedDetectionSearch, setDebouncedDetectionSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [cameras, setCameras] = useState([])

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
      } catch (error) {
        console.error('โหลดกล้องไม่สำเร็จ:', error)
      }
    }
    fetchCameras()
  }, [user, selectedVillageId])

  function getCameraName(cameraId) {
    const cam = cameras.find((c) => c.id === cameraId)
    return cam ? cam.name : '-'
  }

  // ดึงรายการที่ลงทะเบียนทั้งหมด (Registered Blacklist/Whitelist)
  const fetchRegistered = useCallback(async () => {
    if (!user) return
    setIsLoadingRegistered(true)
    try {
      const data = isBlacklistTab
        ? await getBlacklistAPI({ villageId: selectedVillageId || undefined, pageSize: 100 })
        : await getWhitelistAPI({ villageId: selectedVillageId || undefined, pageSize: 100 })

      setRegisteredList(data?.items || [])
      setRegisteredTotal(data?.total || (data?.items || []).length)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingRegistered(false)
    }
  }, [user, isBlacklistTab, selectedVillageId])

  useEffect(() => {
    fetchRegistered()
  }, [fetchRegistered])

  // ดึง Detections ทั้งหมด และ Match กับรายการ Registered
  const fetchDetectionsAndMatch = useCallback(async () => {
    if (!user) return
    setIsLoadingDetections(true)
    try {
      // 1. ดึงรายการ blacklist หรือ whitelist ทั้งหมดในระบบ
      let regItems = []
      let page = 1
      while (page <= JOIN_MAX_PAGES) {
        const data = isBlacklistTab
          ? await getBlacklistAPI({ villageId: selectedVillageId || undefined, page, pageSize: JOIN_PAGE_SIZE })
          : await getWhitelistAPI({ villageId: selectedVillageId || undefined, page, pageSize: JOIN_PAGE_SIZE })
        const pageItems = Array.isArray(data?.items) ? data.items : []
        regItems = regItems.concat(pageItems)
        const total = data?.total ?? 0
        if (regItems.length >= total || pageItems.length === 0) break
        page += 1
      }

      // สร้าง Map สำหรับ Lookup ทะเบียนรถ + ข้อมูลเพิ่มเติม (เหตุผล หรือชื่อลูกบ้าน)
      const regMapWithProv = new Map()
      const regMapAnyProv = new Map()

      regItems.forEach((item) => {
        const plate = normalizePlate(item.license_plate)
        if (!plate) return
        const prov = (item.province || '').trim()
        if (prov) {
          regMapWithProv.set(`${plate}|${prov}`, item)
        } else {
          regMapAnyProv.set(plate, item)
        }
      })

      // 2. ดึง detections ทั้งหมด (ย้อนหลังและวันนี้)
      let allDetections = []
      let detPage = 1
      while (detPage <= JOIN_MAX_PAGES) {
        const data = await getDetectionsAPI({
          village_id: selectedVillageId || undefined,
          page: detPage,
          page_size: JOIN_PAGE_SIZE
        })
        const pageItems = Array.isArray(data?.items) ? data.items : []
        allDetections = allDetections.concat(pageItems)
        const total = data?.total ?? 0
        if (allDetections.length >= total || pageItems.length === 0) break
        detPage += 1
      }

      // 3. กรองและเชื่อมโยงข้อมูล (Join)
      const matched = []
      allDetections.forEach((d) => {
        const plate = normalizePlate(d.license_plate)
        if (!plate) return
        const prov = (d.province || '').trim()

        const regEntry = regMapWithProv.get(`${plate}|${prov}`) || regMapAnyProv.get(plate)
        if (regEntry) {
          matched.push({
            ...d,
            matchedReason: regEntry.reason || '-',
            matchedName: regEntry.name || '-',
            matchedNote: regEntry.note || '-'
          })
        }
      })

      // เรียงลำดับจากใหม่สุดไปเก่าสุด
      matched.sort((a, b) => new Date(b.time_detect) - new Date(a.time_detect))
      setMatchingDetections(matched)
    } catch (error) {
      console.error('ดึงข้อมูลการตรวจจับไม่สำเร็จ:', error)
    } finally {
      setIsLoadingDetections(false)
    }
  }, [user, isBlacklistTab, selectedVillageId])

  useEffect(() => {
    fetchDetectionsAndMatch()
  }, [fetchDetectionsAndMatch])

  // คำนวณยอดที่ตรวจจับได้ "วันนี้"
  const foundTodayCount = useMemo(() => {
    const todayStr = dateKeyOf(new Date().toISOString())
    return matchingDetections.filter((d) => dateKeyOf(d.time_detect) === todayStr).length
  }, [matchingDetections])

  // กรองตาราง Detections ด้วย Search
  const filteredDetections = useMemo(() => {
    if (!debouncedDetectionSearch.trim()) return matchingDetections
    const q = debouncedDetectionSearch.trim().toLowerCase()
    return matchingDetections.filter(
      (d) =>
        (d.license_plate || '').toLowerCase().includes(q) ||
        (d.province || '').toLowerCase().includes(q) ||
        (d.matchedReason || '').toLowerCase().includes(q) ||
        (d.matchedName || '').toLowerCase().includes(q)
    )
  }, [matchingDetections, debouncedDetectionSearch])

  // Pagination สำหรับตาราง Detections
  const totalPages = Math.max(1, Math.ceil(filteredDetections.length / ROWS_PER_PAGE))
  const paginatedDetections = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE
    return filteredDetections.slice(start, start + ROWS_PER_PAGE)
  }, [filteredDetections, currentPage])

  const visiblePages = getVisiblePageNumbers(currentPage, totalPages, MAX_VISIBLE_PAGES)

  // กรองตารางใน Modal Registered
  const filteredRegisteredList = useMemo(() => {
    if (!registeredSearch.trim()) return registeredList
    const q = registeredSearch.trim().toLowerCase()
    return registeredList.filter(
      (item) =>
        (item.license_plate || '').toLowerCase().includes(q) ||
        (item.province || '').toLowerCase().includes(q) ||
        (item.reason || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q)
    )
  }, [registeredList, registeredSearch])

  // สลับแท็บ
  function handleTabChange(tab) {
    setActiveTab(tab)
    setRegisteredSearch('')
    setDetectionSearch('')
    setDebouncedDetectionSearch('')
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
    setShowFormModal(true)
  }

  // เปิด Modal แก้ไข
  function openEditModal(entry) {
    setEditingEntry(entry)
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
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // ตรวจสอบความถูกต้องสำหรับฟอร์ม Blacklist
  const isBlacklistFormValid = useMemo(() => {
    if (!isBlacklistTab) return true
    const plateOk = isThaiLicensePlateValid(formData?.plate)
    const provOk = isValidThaiProvince(formData?.province || '')
    const reasonOk = (formData?.reason || '').trim().length > 0
    return plateOk && provOk && reasonOk
  }, [formData, isBlacklistTab])

  // ตรวจสอบความถูกต้องสำหรับฟอร์ม Whitelist
  const isWhitelistFormValid = useMemo(() => {
    if (isBlacklistTab) return true
    const nameOk = (formData?.name || '').trim().length > 0
    const plateOk = isThaiLicensePlateValid(formData?.plate)
    const provOk = isValidThaiProvince(formData?.province || '')
    return nameOk && plateOk && provOk
  }, [formData, isBlacklistTab])

  // บันทึกฟอร์ม เพิ่ม / แก้ไข
  async function handleFormSubmit(e) {
    e.preventDefault()

    const trimmedPlate = (formData?.plate || '').trim()
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
      if (!formData.name.trim()) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อเจ้าของรถ / บ้านเลขที่', confirmButtonColor: 'var(--sidebar-bg)' })
        return
      }
    }

    if (!editingEntry && !selectedVillageId) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกหมู่บ้าน',
        text: `โปรดเลือกหมู่บ้านจากเมนูด้านบนก่อนเพิ่มรายการ ${isBlacklistTab ? 'Blacklist' : 'Whitelist'}`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
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
          const newEntry = await createBlacklistAPI(selectedVillageId, trimmedPlate, trimmedProvince, formData.reason.trim())
          setRegisteredList((prev) => [newEntry, ...prev])
        } else {
          const newEntry = await createWhitelistAPI(
            selectedVillageId,
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
        const [crop, full] = await Promise.all([
          selectedItem.crop_url ? getAuthedImageURL(selectedItem.crop_url) : Promise.resolve(null),
          selectedItem.image_url ? getAuthedImageURL(selectedItem.image_url) : Promise.resolve(null)
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

  // Cleanup Blob URL เมื่อเปลี่ยนรูปหรือ unmount
  useEffect(() => {
    return () => {
      if (modalImages.crop) URL.revokeObjectURL(modalImages.crop)
      if (modalImages.full) URL.revokeObjectURL(modalImages.full)
    }
  }, [modalImages])

  function closeModal() {
    if (modalImages.crop) URL.revokeObjectURL(modalImages.crop)
    if (modalImages.full) URL.revokeObjectURL(modalImages.full)
    setSelectedItem(null)
  }

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
          <div className="bl-kpi-card">
            <div className="bl-kpi-icon orange">
              <FaCar />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Detected Today</p>
              <h2 className="bl-kpi-val">{isLoadingDetections ? '—' : foundTodayCount}</h2>
            </div>
          </div>
        </div>

        {/* ตารางหลัก: แสดงรายการ Blacklist/Whitelist ที่ตรวจจับได้ทั้งหมด (Detection Records) */}
        <div className="content-card">
          <div className="bl-table-header">
            <div className="bl-table-title">
              {isBlacklistTab ? (
                <FaTriangleExclamation className="bl-title-icon" />
              ) : (
                <FaCheck className="bl-title-icon whitelist" />
              )}
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  {isBlacklistTab ? 'Blacklist Detection Records' : 'Whitelist Detection Records'}
                </h3>
                <p className="bl-description">
                  {isBlacklistTab
                    ? 'ประวัติยานพาหนะติดบัญชีดำที่กล้องตรวจจับได้ทั้งหมด เรียงตามวันที่ล่าสุด'
                    : 'ประวัติยานพาหนะลูกบ้าน/ได้รับอนุญาตที่กล้องตรวจจับได้ทั้งหมด เรียงตามวันที่ล่าสุด'}
                </p>
              </div>
            </div>

            <div className="bl-table-header-actions">
              <div className="bl-search-wrap">
                <FaSearch className="bl-search-icon" />
                <input
                  type="text"
                  placeholder="ค้นหาป้ายทะเบียน..."
                  value={detectionSearch}
                  onChange={(e) => setDetectionSearch(e.target.value)}
                  className="bl-search-input"
                />
              </div>
            </div>
          </div>

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
                  <th>{isBlacklistTab ? 'Reason' : 'Resident Name'}</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingDetections ? (
                  <tr>
                    <td colSpan={9}>
                      <Spinner text="กำลังโหลดประวัติการตรวจจับ..." />
                    </td>
                  </tr>
                ) : paginatedDetections.length > 0 ? (
                  paginatedDetections.map((item, index) => (
                    <tr key={item.id || index}>
                      <td>{(currentPage - 1) * ROWS_PER_PAGE + index + 1}</td>
                      <td>{formatDate(item.time_detect)}</td>
                      <td>{formatTime(item.time_detect)}</td>
                      <td>
                        <span className={`bl-plate-badge ${!isBlacklistTab ? 'whitelist' : ''}`}>
                          {item.license_plate}
                        </span>
                      </td>
                      <td>{item.province || '-'}</td>
                      <td>{item.color || '-'}</td>
                      <td>{getCameraName(item.camera_id)}</td>
                      <td>
                        {isBlacklistTab ? (
                          <span className="bl-reason-badge">{item.matchedReason}</span>
                        ) : (
                          <span>{item.matchedName}</span>
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
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

          {/* Pagination */}
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

      {/* Modal 1: แสดงรายการรถที่ลงทะเบียนไว้ทั้งหมดในระบบ (Registered Vehicles Management) */}
      {showRegisteredModal && (
        <div className="modal-overlay" onClick={() => setShowRegisteredModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>
                  {isBlacklistTab ? 'Registered Blacklist' : 'Registered Whitelist'} (
                  {filteredRegisteredList.length})
                </h3>
              </div>
              <div className="modal-header-right">
                {canManage && (
                  <button className="btn-add-blacklist" onClick={openAddModal}>
                    <FaPlus /> เพิ่ม {isBlacklistTab ? 'Blacklist' : 'Whitelist'}
                  </button>
                )}
                <button className="modal-close" onClick={() => setShowRegisteredModal(false)}>
                  <FaXmark />
                </button>
              </div>
            </div>

            <div className="modal-registered-body">
              <div className="bl-search-wrap" style={{ marginBottom: 16 }}>
                <FaSearch className="bl-search-icon" />
                <input
                  type="text"
                  placeholder="ค้นหาป้ายทะเบียนในระบบ..."
                  value={registeredSearch}
                  onChange={(e) => setRegisteredSearch(e.target.value)}
                  className="bl-search-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="table-responsive" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table className="bl-table">
                  <thead>
                    {isBlacklistTab ? (
                      <tr>
                        <th>License Plate</th>
                        <th>Province</th>
                        <th>Reason</th>
                        <th>Date Added</th>
                        {canManage && <th>Action</th>}
                      </tr>
                    ) : (
                      <tr>
                        <th>License Plate</th>
                        <th>Province</th>
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
                        <td colSpan={canManage ? 5 : 4}>
                          <Spinner text="กำลังโหลดรายชื่อ..." />
                        </td>
                      </tr>
                    ) : filteredRegisteredList.length > 0 ? (
                      filteredRegisteredList.map((item) =>
                        isBlacklistTab ? (
                          <tr key={item.id}>
                            <td>
                              <span className="bl-plate-badge">{item.license_plate}</span>
                            </td>
                            <td>{item.province || '-'}</td>
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
                            <td>
                              <span className="bl-plate-badge whitelist">{item.license_plate}</span>
                            </td>
                            <td>{item.province || '-'}</td>
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
                        <td colSpan={canManage ? 5 : 4}>
                          <EmptyState
                            icon={isBlacklistTab ? <FaTriangleExclamation /> : <FaCheck />}
                            title={`ไม่มีข้อมูล ${isBlacklistTab ? 'Blacklist' : 'Whitelist'} ในระบบ`}
                            description="กดปุ่มเพิ่มเพื่อบันทึกยานพาหนะเข้าระบบ"
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
      )}

      {/* Modal 2: เพิ่ม / แก้ไข Blacklist & Whitelist Form */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingEntry ? 'แก้ไข' : 'เพิ่ม'} {isBlacklistTab ? 'Blacklist' : 'Whitelist'}
              </h3>
              <button
                className="modal-close"
                onClick={() => setShowFormModal(false)}
                disabled={isSubmitting}
              >
                <FaXmark />
              </button>
            </div>
            <form className="bl-add-form" onSubmit={handleFormSubmit}>
              {!isBlacklistTab && (
                <div className="bl-add-field">
                  <label>ชื่อเจ้าของรถ / ผู้พักอาศัย</label>
                  <input
                    type="text"
                    name="name"
                    placeholder="กรอกชื่อเจ้าของรถ เช่น สมชาย (บ้าน 99/1)"
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                </div>
              )}

              <div className="bl-add-field">
                <label>ป้ายทะเบียน (2 - 15 ตัวอักษร)</label>
                <input
                  type="text"
                  name="plate"
                  placeholder="เช่น 1กก1234, กข1234 หรือ โชคดี9999"
                  maxLength={15}
                  value={formData.plate}
                  onChange={handleFormChange}
                />
                {formData.plate && !isThaiLicensePlateValid(formData.plate) && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    รูปแบบป้ายทะเบียนไม่ถูกต้อง (อนุญาตเฉพาะตัวอักษรไทย ตัวเลข สระ และขีด)
                  </span>
                )}
              </div>

              <div className="bl-add-field">
                <label>จังหวัด</label>
                <ProvinceAutocomplete
                  name="province"
                  value={formData.province}
                  onChange={(value) => setFormData((prev) => ({ ...prev, province: value }))}
                  placeholder="เลือกหรือพิมพ์ค้นหา เช่น กรุงเทพมหานคร, เบตง"
                />
              </div>

              {isBlacklistTab ? (
                <div className="bl-add-field">
                  <label>เหตุผลที่ขึ้นบัญชีดำ</label>
                  <input
                    type="text"
                    name="reason"
                    placeholder="เช่น ขโมยของ, บุคคลต้องสงสัย, ก่อความไม่สงบ"
                    value={formData.reason}
                    onChange={handleFormChange}
                  />
                </div>
              ) : (
                <div className="bl-add-field">
                  <label>หมายเหตุเพิ่มเติม (ไม่บังคับ)</label>
                  <input
                    type="text"
                    name="note"
                    placeholder="หมายเหตุ เช่น สมาชิกครอบครัว, พนักงานส่งของประจำ"
                    value={formData.note}
                    onChange={handleFormChange}
                  />
                </div>
              )}

              <div className="bl-add-actions">
                <button
                  type="button"
                  className="btn-cancel-add"
                  onClick={() => setShowFormModal(false)}
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
      )}

      {/* Modal 3: ดูรายละเอียดภาพถ่ายและข้อมูล (History Style) */}
      {selectedItem && (
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
                  <span>{getCameraName(selectedItem.camera_id)}</span>
                </div>
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
      )}

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