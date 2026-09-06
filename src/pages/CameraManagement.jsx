import { useState, useEffect, useCallback, useMemo } from 'react'
import { FaVideo, FaSearch } from 'react-icons/fa'
import { FaCirclePlus, FaPlus, FaMagnifyingGlass, FaPen, FaTrashCan, FaXmark, FaRotate, FaTriangleExclamation } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import '../styles/CameraManagement.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import {
  getCameraListAPI,
  createCameraAPI,
  updateCameraAPI,
  deleteCameraAPI,
  resyncAllCamerasAPI,
  resyncCameraAiVisionAPI,
  checkCameraVerificationAPI,
  getCameraStatusAPI,
  probeOnvifCameraAPI
} from '../data/api'
import { hasEmoji } from '../utils/passwordPolicy'

const PAGE_SIZE = 5
const MAX_VISIBLE_PAGES = 4

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

// หมายเหตุ field ของ backend: lat/long (ไม่ใช่ lon), ไม่มี status online/offline
// มีแค่ is_active (เปิด/ปิดใช้งานกล้อง)
// stream_ai = แหล่งสตรีมที่ป้อนเข้า (RTSP) — ส่วน stream_url เป็นค่าที่ backend generate ให้เอง ห้ามส่งตอน create/update
// direction = ทิศทางกล้อง (enum "entry" | "exit" | "internal")
const EMPTY_FORM = { name: '', lat: '', long: '', streamAi: '', direction: 'entry', isActive: true, villageId: '' }
const DIRECTION_LABELS = {
  entry: 'entry',
  exit: 'exit',
  internal: 'internal'
}

// ฟอร์ม ONVIF — เป็นแค่ตัวช่วยหา RTSP URI ไม่ใช่ field ที่ backend เก็บถาวร (session state เท่านั้น)
const EMPTY_ONVIF_FORM = { host: '', port: 80, username: '', password: '' }

// รวม 3 สถานะ (Power, AI Vision, Streaming) ให้เป็น Camera Status เดียวที่เข้าใจง่ายสำหรับผู้ใช้
function getUnifiedCameraStatusBadge(camera, isChecking = false) {
  // 1. กำลังโหลด/ตรวจสอบเฉพาะกล้องตัวนี้
  if (isChecking) {
    return { label: 'กำลังตรวจสอบสัญญาณ...', tone: 'starting', description: 'กำลังส่งคำขอตรวจสอบไปยังระบบ' }
  }

  // 2. กำลังโหลดสถานะ
  if (camera.stream_online === undefined && camera.status === undefined && camera.is_starting === undefined) {
    return { label: 'กำลังตรวจสอบ...', tone: 'checking', description: '' }
  }

  // 3. ปิดใช้งานกล้อง
  if (!camera.is_active) {
    return { label: 'ปิดใช้งาน', tone: 'disabled', description: 'ปิดการทำงานกล้อง' }
  }

  // 4. กำลังเริ่มระบบ (เชื่อมต่อสัญญาณ / สตรีม)
  if (camera.is_starting || camera.verification_status === 'pending') {
    return { label: 'กำลังเริ่มระบบ...', tone: 'starting', description: 'กำลังเชื่อมต่อสัญญาณกล้อง' }
  }

  // 5. พร้อมใช้งาน (ผ่านครบทั้ง 3 เงื่อนไข: is_active, verified, stream_online)
  const isReady = camera.status === true || (camera.verification_status === 'verified' && camera.stream_online === true)
  if (isReady) {
    return { label: 'พร้อมใช้งาน', tone: 'ready', description: 'กล้องพร้อมตรวจจับ' }
  }

  // 6. ขัดข้อง (เปิดกล้องอยู่แต่สัญญาณดับ / ยืนยันไม่ผ่าน)
  let errDetail = camera.detail
  if (!errDetail) {
    if (camera.verification_status === 'failed') {
      errDetail = 'การยืนยันกล้องไม่สำเร็จ'
    } else if (camera.stream_online === false) {
      errDetail = 'สัญญาณสตรีมมิ่งออฟไลน์'
    } else {
      errDetail = 'ไม่สามารถเชื่อมต่อสัญญาณได้'
    }
  }

  return {
    label: 'ขัดข้อง',
    tone: 'error',
    description: errDetail,
    canRetry: true
  }
}

function CameraManagement() {
  const { user } = useAuthStore()
  const { selectedVillageId, getVillageName, villages } = useVillageStore()

  const [cameras, setCameras] = useState([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingCamera, setEditingCamera] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResyncingAll, setIsResyncingAll] = useState(false)
  const [checkingCameraIds, setCheckingCameraIds] = useState(new Set())
  const [formTouched, setFormTouched] = useState({})
  const [hasSubmittedForm, setHasSubmittedForm] = useState(false)

  // ---------- ONVIF Probe (ตัวช่วยหา RTSP) — ใช้ได้เฉพาะตอนเพิ่มกล้องใหม่ ----------
  const [showOnvifPanel, setShowOnvifPanel] = useState(false)
  const [onvifForm, setOnvifForm] = useState(EMPTY_ONVIF_FORM)
  const [isProbing, setIsProbing] = useState(false)
  const [onvifProfiles, setOnvifProfiles] = useState([])
  const [onvifDeviceInfo, setOnvifDeviceInfo] = useState(null)
  const [selectedProfileToken, setSelectedProfileToken] = useState('')

  const latestCameraEvent = useNotificationStore((state) => state.latestCameraEvent)

  // merge SSE event เข้า state คล้าย pattern latestDetection ใน Dashboard.jsx
  // syncWarning เป็น session-only field ไม่มีใน API — หายไปเมื่อ refresh หน้า (ตามที่ตกลงไว้)
  useEffect(() => {
    if (!latestCameraEvent) return
    const { type, camera_id } = latestCameraEvent

    setCameras((prev) => prev.map((c) => {
      if (c.id !== camera_id) return c

      if (type === 'verified') {
        return {
          ...c,
          verification_status: 'verified',
          is_active: latestCameraEvent.is_active ?? c.is_active,
          syncWarning: null
        }
      }
      if (type === 'verification_failed') {
        // backend ปิดกล้องอัตโนมัติตอน verify failed → ต้อง sync is_active ด้วย ไม่ใช่แค่ badge
        return {
          ...c,
          verification_status: 'failed',
          is_active: latestCameraEvent.is_active ?? false,
          syncWarning: null
        }
      }
      if (type === 'sync_failed') {
        // ไม่แตะ verification_status/is_active เลย เป็นแค่ warning ซ้อน
        return {
          ...c,
          syncWarning: { failedServices: latestCameraEvent.failed_services, at: new Date() }
        }
      }
      return c
    }))
  }, [latestCameraEvent])

  // ดึงรายการกล้องจาก backend จริง — ยึดตาม selectedVillageId (หมู่บ้านที่กำลังดูอยู่)
  // superadmin เลือก "ทุกหมู่บ้าน" (null) → ไม่ส่ง village_id ได้ทุกหมู่บ้าน
  const fetchCameras = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getCameraListAPI({
        villageId: selectedVillageId || undefined,
        page: 1,
        pageSize: 100
      })
      setCameras(data.items)
      setTotal(data.total)
      setIsLoading(false)

      // ดึงสถานะกล้อง (stream_online, verification_status, is_starting, status, detail) ของแต่ละกล้องแบบขนาน
      // ไม่บล็อกการแสดงตารางหลัก ถ้ากล้องไหน error ก็ไม่ล้มทั้งหน้า แค่ badge กล้องนั้นจะโชว์ "กำลังตรวจสอบ..."
      const statusResults = await Promise.allSettled(
        data.items.map((c) => getCameraStatusAPI(c.id))
      )

      setCameras((prev) =>
        prev.map((c, index) => {
          const result = statusResults[index]
          if (result?.status === 'fulfilled') {
            return {
              ...c,
              stream_online: result.value.stream_online,
              verification_status: result.value.verification_status ?? c.verification_status,
              is_starting: result.value.is_starting,
              status: result.value.status,
              detail: result.value.detail
            }
          }
          return c
        })
      )
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลกล้องไม่สำเร็จ',
        text: 'กรุณาลองรีเฟรชหน้าใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      setIsLoading(false)
    }
  }, [selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // รีเซ็ตหน้ากลับเป็นหน้า 1 เมื่อค้นหาหรือเปลี่ยนหมู่บ้าน
  useEffect(() => {
    setCurrentPage(1)
  }, [searchInput, selectedVillageId])

  const activeCount = cameras.filter((c) => c.is_active).length
  const inactiveCount = cameras.filter((c) => !c.is_active).length

  const filteredCameras = useMemo(() => {
    const keyword = searchInput.toLowerCase().trim()
    return keyword === '' ? cameras : cameras.filter((c) => c.name.toLowerCase().includes(keyword))
  }, [cameras, searchInput])

  const totalPages = Math.max(1, Math.ceil(filteredCameras.length / PAGE_SIZE))
  const visiblePages = getVisiblePageNumbers(currentPage, totalPages, MAX_VISIBLE_PAGES)

  const paginatedCameras = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredCameras.slice(start, start + PAGE_SIZE)
  }, [filteredCameras, currentPage])

  // ---------- ONVIF Panel Helpers ----------
  function resetOnvifPanel() {
    setShowOnvifPanel(false)
    setOnvifForm(EMPTY_ONVIF_FORM)
    setOnvifProfiles([])
    setOnvifDeviceInfo(null)
    setSelectedProfileToken('')
    setIsProbing(false)
  }

  function toggleOnvifPanel() {
    if (showOnvifPanel) {
      resetOnvifPanel()
    } else {
      setShowOnvifPanel(true)
    }
  }

  function handleOnvifFormChange(e) {
    const { name, value } = e.target
    setOnvifForm((prev) => ({ ...prev, [name]: name === 'port' ? value.replace(/\D/g, '') : value }))
  }

  async function handleProbeOnvif() {
    if (!onvifForm.host.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอก Host / IP',
        text: 'ต้องระบุ IP หรือ Host ของกล้องก่อนค้นหา',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsProbing(true)
    setOnvifProfiles([])
    setOnvifDeviceInfo(null)
    setSelectedProfileToken('')

    try {
      const data = await probeOnvifCameraAPI({
        host: onvifForm.host.trim(),
        port: onvifForm.port ? parseInt(onvifForm.port, 10) : 80,
        username: onvifForm.username.trim(),
        password: onvifForm.password
      })
      setOnvifDeviceInfo({
        manufacturer: data.device_manufacturer,
        model: data.device_model
      })
      setOnvifProfiles(data.profiles || [])

      if (!data.profiles || data.profiles.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'เชื่อมต่อสำเร็จ แต่ไม่พบ Stream Profile',
          text: 'กล้องนี้ไม่มี profile ที่ใช้งานได้ กรุณากรอก RTSP เองแทน',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'เชื่อมต่อ ONVIF ไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'กล้องนี้ไม่รองรับ ONVIF หรือมีปัญหาในการเชื่อมต่อ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsProbing(false)
    }
  }

  // เลือก profile → เอา rtsp_uri มาใส่ในช่อง Stream Source หลักทันที (มีผลเฉพาะตอนเพิ่มกล้องใหม่ เพราะตอน Edit ช่องนี้ถูก disable)
  function handleSelectOnvifProfile(profile) {
    setSelectedProfileToken(profile.profile_token)
    setFormData((prev) => ({ ...prev, streamAi: profile.rtsp_uri }))
  }

  function openAddModal() {
    setEditingCamera(null)
    setFormData({
      ...EMPTY_FORM,
      // admin ล็อกไว้ที่หมู่บ้านตัวเอง, superadmin default ตามหมู่บ้านที่กำลังดูอยู่ (เลือกใหม่ได้)
      villageId: user?.role === 'admin' ? user.village_id : (selectedVillageId || '')
    })
    setFormTouched({})
    setHasSubmittedForm(false)
    resetOnvifPanel()
    setShowFormModal(true)
  }

  function openEditModal(camera) {
    setEditingCamera(camera)
    setFormData({
      name: camera.name,
      lat: String(camera.lat ?? ''),
      long: String(camera.long ?? ''),
      streamAi: camera.stream_ai || '',
      direction: camera.direction || 'entry', // fallback 'entry' เผื่อกล้องเก่าไม่มี field นี้
      isActive: camera.is_active,
      villageId: camera.village_id || ''
    })
    setFormTouched({})
    setHasSubmittedForm(false)
    resetOnvifPanel()
    setShowFormModal(true)
  }

  function closeFormModal() {
    setShowFormModal(false)
    setFormTouched({})
    setHasSubmittedForm(false)
    resetOnvifPanel()
  }

  // ปิด form modal เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (showFormModal && !isSubmitting) {
          closeFormModal()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFormModal, isSubmitting])

  function sanitizeCoord(val) {
    if (!val) return ''
    let sanitized = String(val).trim().replace(/[^0-9.-]/g, '')
    if (sanitized.indexOf('-') > 0) {
      sanitized = sanitized.replace(/(?!^)-/g, '')
    }
    const parts = sanitized.split('.')
    if (parts.length > 2) {
      sanitized = parts[0] + '.' + parts.slice(1).join('')
    }
    return sanitized
  }

  function handlePasteCoordinate(e) {
    const pastedText = e.clipboardData?.getData('text') || ''
    if (pastedText.includes(',')) {
      e.preventDefault()
      const parts = pastedText.split(',')
      if (parts.length >= 2) {
        const latPart = sanitizeCoord(parts[0])
        const longPart = sanitizeCoord(parts[1])
        setFormData((prev) => ({
          ...prev,
          lat: latPart,
          long: longPart
        }))
        setFormTouched((prev) => ({ ...prev, lat: true, long: true }))
      }
    }
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target
    setFormTouched((prev) => ({ ...prev, [name]: true }))

    if (name === 'lat' || name === 'long') {
      // ตรวจจับกรณี copy พิกัดมาวางแบบมีลูกน้ำคั่น เช่น "13.844849, 100.632904"
      if (value.includes(',')) {
        const parts = value.split(',')
        if (parts.length >= 2) {
          const latPart = sanitizeCoord(parts[0])
          const longPart = sanitizeCoord(parts[1])
          setFormData((prev) => ({
            ...prev,
            lat: latPart,
            long: longPart
          }))
          setFormTouched((prev) => ({ ...prev, lat: true, long: true }))
          return
        }
      }

      // อนุญาตเฉพาะตัวเลข เครื่องหมายลบ (-) ที่ตัวแรก และจุดทศนิยม (.) ไม่เกิน 1 จุด
      const sanitized = sanitizeCoord(value)
      setFormData((prev) => ({ ...prev, [name]: sanitized }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function handleFieldBlur(name) {
    setFormTouched((prev) => ({ ...prev, [name]: true }))
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    setHasSubmittedForm(true)

    const trimmedName = formData.name.trim()
    const trimmedStreamAi = formData.streamAi.trim()

    if (hasEmoji(formData.name)) {
      Swal.fire({
        icon: 'warning',
        title: 'ชื่อกล้องไม่ถูกต้อง',
        text: 'ขออภัย ไม่อนุญาตให้ใช้อีโมจิในชื่อกล้อง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!trimmedName) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกชื่อกล้อง',
        text: 'ห้ามเว้นว่างชื่อกล้อง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (formData.lat === '' || formData.lat === undefined) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอก Latitude',
        text: 'ห้ามเว้นว่างพิกัด Latitude',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const latNum = parseFloat(formData.lat)
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      Swal.fire({
        icon: 'warning',
        title: 'พิกัด Latitude ไม่ถูกต้อง',
        text: 'Latitude ต้องเป็นตัวเลขระหว่าง -90 ถึง 90',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (formData.long === '' || formData.long === undefined) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอก Longitude',
        text: 'ห้ามเว้นว่างพิกัด Longitude',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const longNum = parseFloat(formData.long)
    if (isNaN(longNum) || longNum < -180 || longNum > 180) {
      Swal.fire({
        icon: 'warning',
        title: 'พิกัด Longitude ไม่ถูกต้อง',
        text: 'Longitude ต้องเป็นตัวเลขระหว่าง -180 ถึง 180',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (hasEmoji(formData.streamAi)) {
      Swal.fire({
        icon: 'warning',
        title: 'Stream Source ไม่ถูกต้อง',
        text: 'ขออภัย ไม่อนุญาตให้ใช้อีโมจิในช่อง Stream Source',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!trimmedStreamAi) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอก Stream Source',
        text: 'ห้ามเว้นว่างลิงก์ RTSP Stream ของกล้อง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingCamera) {
        await updateCameraAPI(editingCamera.id, {
          name: trimmedName,
          lat: latNum,
          long: longNum,
          stream_ai: trimmedStreamAi,
          direction: formData.direction,
          is_active: formData.isActive
        })
        Swal.fire({
          icon: 'success',
          title: 'บันทึกการแก้ไขกล้องแล้ว',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } else {
        // ใช้หมู่บ้านจากฟอร์ม (superadmin เลือกเอง / admin ถูกล็อกไว้แล้วตอน openAddModal)
        if (!formData.villageId) {
          Swal.fire({
            icon: 'warning',
            title: 'กรุณาเลือกหมู่บ้าน',
            text: 'โปรดเลือกหมู่บ้านที่ต้องการเพิ่มกล้องก่อนบันทึก',
            confirmButtonColor: 'var(--sidebar-bg)'
          })
          setIsSubmitting(false)
          return
        }
        await createCameraAPI(
          formData.villageId,
          trimmedName,
          latNum,
          longNum,
          trimmedStreamAi,
          formData.direction
        )
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มกล้องใหม่แล้ว',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }

      closeFormModal()
      fetchCameras()
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'บันทึกไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(camera) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบกล้อง',
      text: `ต้องการลบ "${camera.name}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (!result.isConfirmed) return

    try {
      await deleteCameraAPI(camera.id)
      setCameras((prev) => prev.filter((c) => c.id !== camera.id))
      setTotal((prev) => prev - 1)
      Swal.fire({
        icon: 'success',
        title: 'ลบกล้องแล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ลบไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  async function handleResyncAll() {
    setIsResyncingAll(true)
    try {
      await resyncAllCamerasAPI()
      Swal.fire({
        icon: 'success',
        title: 'สั่งซิงค์กล้องทั้งหมดกับ Streaming แล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      fetchCameras()
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ซิงค์ไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsResyncingAll(false)
    }
  }

  async function handleResyncOne(camera) {
    try {
      await resyncCameraAiVisionAPI(camera.id)
      Swal.fire({
        icon: 'success',
        title: `ซิงค์ ${camera.name} แล้ว`,
        confirmButtonText: 'ตกลง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      fetchCameras()
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ซิงค์ไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  async function handleVerificationCheck(camera) {
    const camId = camera.id
    if (checkingCameraIds.has(camId)) return

    setCheckingCameraIds((prev) => new Set(prev).add(camId))
    try {
      const res = await checkCameraVerificationAPI(camId)
      // ดึงสถานะล่าสุดเฉพาะกล้องตัวนี้มาอัปเดต state แบบเฉพาะแถว
      try {
        const statusRes = await getCameraStatusAPI(camId)
        setCameras((prev) =>
          prev.map((c) =>
            c.id === camId
              ? {
                  ...c,
                  stream_online: statusRes.stream_online,
                  verification_status: statusRes.verification_status ?? c.verification_status,
                  is_starting: statusRes.is_starting,
                  status: statusRes.status,
                  detail: statusRes.detail
                }
              : c
          )
        )
      } catch (err) {
        console.error('Failed to fetch updated camera status:', err)
      }

      Swal.fire({
        icon: 'success',
        title: `ส่งคำขอตรวจสอบ ${camera.name} แล้ว`,
        text: res.note || 'ระบบกำลังตรวจสอบสัญญาณกล้องใหม่อีกครั้ง',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ตรวจสอบไม่สำเร็จ',
        text: error.response?.data?.detail || 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setCheckingCameraIds((prev) => {
        const next = new Set(prev)
        next.delete(camId)
        return next
      })
    }
  }

  const showVillageColumn = user?.role === 'superadmin'

  return (
    <Layout title="Camera Management">
      <div className="cm-wrapper">

        {/* KPI Cards */}
        <div className="cm-kpi-row">
          <div className="cm-kpi-card">
            <div className="cm-kpi-icon blue">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Total Cameras</p>
              <h2 className="cm-kpi-val">{total}</h2>
            </div>
          </div>

          <div className="cm-kpi-card">
            <div className="cm-kpi-icon green">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Active</p>
              <h2 className="cm-kpi-val green">{activeCount}</h2>
            </div>
          </div>

          <div className="cm-kpi-card">
            <div className="cm-kpi-icon red">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Inactive</p>
              <h2 className="cm-kpi-val red">{inactiveCount}</h2>
            </div>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="cm-table-header">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Camera List</h3>
              <p className="cm-description">
                รายการกล้อง LPR ทั้งหมดในระบบ — ใช้ร่วมกับหน้า Monitor และ Dashboard
              </p>
            </div>
            <div className="cm-header-actions">
              <div className="cm-search-wrap">
                <FaMagnifyingGlass className="cm-search-icon" />
                <input
                  type="text"
                  className="cm-search-input"
                  placeholder="ค้นหาตามชื่อกล้อง..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              {/* ปุ่ม Resync All กล้องทั้งหมดกับ Streaming — เฉพาะ Superadmin/Admin */}
              <button
                className="btn-resync-all"
                onClick={handleResyncAll}
                disabled={isResyncingAll || cameras.length === 0}
                title="สั่งระบบ Streaming ดึงและเชื่อมต่อกล้องทั้งหมดใหม่อีกครั้ง"
              >
                <FaRotate className={isResyncingAll ? 'cm-spin' : ''} />
                <span>{isResyncingAll ? 'กำลังซิงค์ทั้งหมด...' : 'Resync All'}</span>
              </button>
              <button className="btn-add-camera" onClick={openAddModal}>
                <FaPlus />
                <span>Add Camera</span>
              </button>
            </div>
          </div>

          <div className="cm-table-responsive">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Camera Name</th>
                  {showVillageColumn && <th>Village</th>}
                  <th>Location (Lat, Long)</th>
                  <th>Direction</th>
                  <th>Camera Status</th>
                  <th style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={showVillageColumn ? 6 : 5}>
                      <Spinner text="Loading cameras..." />
                    </td>
                  </tr>
                ) : paginatedCameras.length > 0 ? (
                  paginatedCameras.map((c) => {
                    const isChecking = checkingCameraIds.has(c.id)
                    const badge = getUnifiedCameraStatusBadge(c, isChecking)
                    return (
                      <tr key={c.id}>
                        <td className="cm-camera-name">{c.name}</td>
                        {showVillageColumn && <td>{getVillageName(c.village_id)}</td>}
                        <td className="cm-location">
                          {Number(c.lat).toFixed(6)}, {Number(c.long).toFixed(6)}
                        </td>
                        <td>
                          <span className={`cm-direction-badge ${c.direction || 'entry'}`}>
                            {DIRECTION_LABELS[c.direction] || '-'}
                          </span>
                        </td>
                        <td className="cm-status-cell">
                          <div className="cm-status-unified-wrapper">
                            <span
                              className={`cm-status-badge ${badge.tone}`}
                              onClick={badge.canRetry && !isChecking ? () => handleVerificationCheck(c) : undefined}
                              style={badge.canRetry && !isChecking ? { cursor: 'pointer' } : undefined}
                              title={badge.canRetry && !isChecking ? 'คลิกเพื่อตรวจสอบการเชื่อมต่อใหม่' : undefined}
                            >
                              <span className={`cm-status-dot ${badge.tone}`}></span>
                              {badge.label}
                            </span>
                            {badge.description && (
                              <p className="cm-status-hint">{badge.description}</p>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="cm-actions">
                            <button
                              className="cm-icon-btn reset"
                              disabled={isChecking}
                              onClick={() => !isChecking && handleVerificationCheck(c)}
                              title={isChecking ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะกล้องใหม่'}
                            >
                              <FaRotate className={isChecking ? 'cm-spin' : ''} />
                            </button>
                            <button className="cm-icon-btn edit" onClick={() => openEditModal(c)} title="แก้ไขกล้อง">
                              <FaPen />
                            </button>
                            <button className="cm-icon-btn delete" onClick={() => handleDelete(c)} title="ลบกล้อง">
                              <FaTrashCan />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={showVillageColumn ? 6 : 5}>
                      <EmptyState
                        icon={<FaVideo />}
                        title="No cameras found"
                        description="Try a different search keyword"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="cm-table-footer">
            <p className="cm-total-count">
              Showing {paginatedCameras.length} of {filteredCameras.length.toLocaleString()} cameras
            </p>
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="หน้าก่อนหน้า"
                >
                  &lt;
                </button>
                {visiblePages.map((page) => (
                  <button
                    key={page}
                    className={`page-btn ${page === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="หน้าถัดไป"
                >
                  &gt;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Add/Edit Camera */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && closeFormModal()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCamera ? 'Edit Camera' : 'Add New Camera'}</h3>
              <button className="modal-close" onClick={closeFormModal} disabled={isSubmitting}>
                <FaXmark />
              </button>
            </div>
            <form className="cm-form" onSubmit={handleFormSubmit}>
              {!editingCamera && (
                <div className="cm-form-field">
                  <label>
                    หมู่บ้าน <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {user?.role === 'superadmin' ? (
                    <select
                      name="villageId"
                      value={formData.villageId}
                      onChange={handleFormChange}
                      onBlur={() => handleFieldBlur('villageId')}
                      style={
                        (formTouched.villageId || hasSubmittedForm) && !formData.villageId
                          ? { borderColor: '#dc2626' }
                          : {}
                      }
                    >
                      <option value="">-- เลือกหมู่บ้าน --</option>
                      {villages.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={getVillageName(user?.village_id)} disabled />
                  )}
                  {(formTouched.villageId || hasSubmittedForm) && user?.role === 'superadmin' && !formData.villageId ? (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      กรุณาเลือกหมู่บ้านที่ต้องการเพิ่มกล้อง
                    </span>
                  ) : (
                    <p className="cm-description" style={{ margin: '4px 0 0' }}>
                      {user?.role === 'superadmin'
                        ? 'เลือกหมู่บ้านที่ต้องการเพิ่มกล้องเข้าไป'
                        : 'ล็อกไว้ที่หมู่บ้านของคุณ เนื่องจาก Admin เพิ่มกล้องได้เฉพาะหมู่บ้านตัวเอง'}
                    </p>
                  )}
                </div>
              )}

              <div className="cm-form-field">
                <label>
                  Camera Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="เช่น ป้อมยามหน้าโครงการ (ขาเข้า)"
                  value={formData.name}
                  onChange={handleFormChange}
                  onBlur={() => handleFieldBlur('name')}
                  style={
                    (formTouched.name || hasSubmittedForm) && (!formData.name.trim() || hasEmoji(formData.name))
                      ? { borderColor: '#dc2626' }
                      : {}
                  }
                />
                {(formTouched.name || hasSubmittedForm) && !formData.name.trim() && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    กรุณากรอกชื่อกล้อง
                  </span>
                )}
                {hasEmoji(formData.name) && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    ขออภัย ไม่อนุญาตให้ใช้อีโมจิในชื่อกล้อง
                  </span>
                )}
              </div>
              <div className="cm-form-row">
                <div className="cm-form-field">
                  <label>
                    Latitude <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="lat"
                    placeholder="เช่น 13.844849"
                    value={formData.lat}
                    onChange={handleFormChange}
                    onPaste={handlePasteCoordinate}
                    onBlur={() => handleFieldBlur('lat')}
                    style={
                      (formTouched.lat || hasSubmittedForm) && (formData.lat === '' || isNaN(parseFloat(formData.lat)) || parseFloat(formData.lat) < -90 || parseFloat(formData.lat) > 90)
                        ? { borderColor: '#dc2626' }
                        : {}
                    }
                  />
                  {(formTouched.lat || hasSubmittedForm) && formData.lat === '' && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      กรุณากรอก Latitude
                    </span>
                  )}
                  {(formTouched.lat || hasSubmittedForm) && formData.lat !== '' && (isNaN(parseFloat(formData.lat)) || parseFloat(formData.lat) < -90 || parseFloat(formData.lat) > 90) && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Latitude ต้องเป็นตัวเลขระหว่าง -90 ถึง 90
                    </span>
                  )}
                </div>
                <div className="cm-form-field">
                  <label>
                    Longitude <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="long"
                    placeholder="เช่น 100.632904"
                    value={formData.long}
                    onChange={handleFormChange}
                    onPaste={handlePasteCoordinate}
                    onBlur={() => handleFieldBlur('long')}
                    style={
                      (formTouched.long || hasSubmittedForm) && (formData.long === '' || isNaN(parseFloat(formData.long)) || parseFloat(formData.long) < -180 || parseFloat(formData.long) > 180)
                        ? { borderColor: '#dc2626' }
                        : {}
                    }
                  />
                  {(formTouched.long || hasSubmittedForm) && formData.long === '' && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      กรุณากรอก Longitude
                    </span>
                  )}
                  {(formTouched.long || hasSubmittedForm) && formData.long !== '' && (isNaN(parseFloat(formData.long)) || parseFloat(formData.long) < -180 || parseFloat(formData.long) > 180) && (
                    <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Longitude ต้องเป็นตัวเลขระหว่าง -180 ถึง 180
                    </span>
                  )}
                </div>
              </div>

              <div className="cm-form-field">
                <label>
                  Stream Source (RTSP / AI Input) {!editingCamera && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <input
                  type="text"
                  name="streamAi"
                  placeholder="เช่น rtsp://admin:pass@192.168.1.100:554/live"
                  value={formData.streamAi}
                  onChange={handleFormChange}
                  onBlur={() => handleFieldBlur('streamAi')}
                  disabled={!!editingCamera}
                  style={
                    !editingCamera && (formTouched.streamAi || hasSubmittedForm) && (!formData.streamAi.trim() || hasEmoji(formData.streamAi))
                      ? { borderColor: '#dc2626' }
                      : {}
                  }
                />
                {!editingCamera && (formTouched.streamAi || hasSubmittedForm) && !formData.streamAi.trim() && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    กรุณากรอกลิงก์ Stream Source (RTSP) หรือใช้ตัวช่วยค้นหาด้านล่าง
                  </span>
                )}
                {hasEmoji(formData.streamAi) && (
                  <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    ขออภัย ไม่อนุญาตให้ใช้อีโมจิในช่อง Stream Source
                  </span>
                )}
                {editingCamera ? (
                  <p className="cm-description" style={{ margin: '4px 0 0' }}>
                    ไม่สามารถแก้ไขลิงก์สตรีมของกล้องที่เพิ่มไว้แล้วได้ หากต้องการเปลี่ยนแหล่งสตรีม กรุณาลบกล้องนี้แล้วเพิ่มใหม่
                  </p>
                ) : (
                  <p className="cm-description" style={{ margin: '4px 0 0' }}>
                    ถ้ามีลิงก์ RTSP ของกล้องอยู่แล้ว กรอกตรงนี้ได้เลย หรือใช้ตัวช่วยค้นหาด้านล่างถ้าไม่ทราบลิงก์
                  </p>
                )}
              </div>

              {/* ---------- ตัวช่วย ONVIF — ค้นหา RTSP ให้อัตโนมัติ (แสดงเฉพาะตอนเพิ่มกล้องใหม่) ---------- */}
              {!editingCamera && (
                <>
                  <p className="cm-onvif-link-wrap">
                    ไม่ทราบลิงก์ RTSP ของกล้อง?{' '}
                    <span
                      className="cm-onvif-link"
                      onClick={toggleOnvifPanel}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && toggleOnvifPanel()}
                    >
                      {showOnvifPanel ? 'ซ่อนตัวช่วยค้นหา ONVIF' : 'ค้นหา RTSP ด้วย ONVIF'}
                    </span>
                  </p>

                  {showOnvifPanel && (
                    <div className="cm-onvif-panel">
                      <p className="cm-onvif-hint">
                        กรอกข้อมูลเข้าสู่ระบบของกล้อง (ONVIF) เพื่อให้ระบบดึงลิงก์ RTSP ให้อัตโนมัติ
                      </p>

                      <div className="cm-form-row">
                        <div className="cm-form-field">
                          <label>Host / IP กล้อง</label>
                          <input
                            type="text"
                            name="host"
                            placeholder="เช่น 192.168.1.64"
                            value={onvifForm.host}
                            onChange={handleOnvifFormChange}
                          />
                        </div>
                        <div className="cm-form-field">
                          <label>Port</label>
                          <input
                            type="text"
                            name="port"
                            placeholder="เช่น 80 หรือ 554"
                            value={onvifForm.port}
                            onChange={handleOnvifFormChange}
                          />
                        </div>
                      </div>

                      <div className="cm-form-row">
                        <div className="cm-form-field">
                          <label>Username</label>
                          <input
                            type="text"
                            name="username"
                            placeholder="เช่น admin"
                            value={onvifForm.username}
                            onChange={handleOnvifFormChange}
                          />
                        </div>
                        <div className="cm-form-field">
                          <label>Password</label>
                          <input
                            type="password"
                            name="password"
                            placeholder="กรอกรหัสผ่านกล้อง"
                            value={onvifForm.password}
                            onChange={handleOnvifFormChange}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-onvif-probe"
                        onClick={handleProbeOnvif}
                        disabled={isProbing}
                      >
                        {isProbing ? 'กำลังค้นหากล้อง...' : 'ทดสอบเชื่อมต่อ / ค้นหากล้อง'}
                      </button>

                      {onvifDeviceInfo && (
                        <p className="cm-onvif-device-info">
                          พบกล้อง: {onvifDeviceInfo.manufacturer || 'ไม่ทราบยี่ห้อ'} {onvifDeviceInfo.model || ''}
                        </p>
                      )}

                      {onvifProfiles.length > 0 && (
                        <div className="cm-onvif-profile-list">
                          <p className="cm-onvif-hint" style={{ marginBottom: 8 }}>
                            เลือก Stream Profile ที่ต้องการใช้:
                          </p>
                          {onvifProfiles.map((profile) => (
                            <label key={profile.profile_token} className="cm-onvif-profile-item">
                              <input
                                type="radio"
                                name="onvifProfile"
                                checked={selectedProfileToken === profile.profile_token}
                                onChange={() => handleSelectOnvifProfile(profile)}
                              />
                              <div>
                                <span className="cm-onvif-profile-name">{profile.name || profile.profile_token}</span>
                                <span className="cm-onvif-profile-meta">
                                  {profile.width}×{profile.height} · {profile.encoding}
                                </span>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="cm-form-field">
                <label>Direction (ทิศทาง)</label>
                <select name="direction" value={formData.direction} onChange={handleFormChange}>
                  <option value="entry">entry</option>
                  <option value="exit">exit</option>
                  <option value="internal">internal</option>
                </select>
              </div>
              {editingCamera && (
                <div className="cm-form-field">
                  <label>สถานะ</label>
                  <select
                    name="isActive"
                    value={formData.isActive ? 'active' : 'inactive'}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, isActive: e.target.value === 'active' }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
              <div className="cm-form-actions">
                <button
                  type="button"
                  className="btn-cancel-cm"
                  onClick={closeFormModal}
                  disabled={isSubmitting}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-cm" disabled={isSubmitting}>
                  {isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default CameraManagement