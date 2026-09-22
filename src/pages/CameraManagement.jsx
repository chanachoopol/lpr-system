import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FaVideo, FaSearch, FaEye, FaEyeSlash } from 'react-icons/fa'
import { FaCirclePlus, FaPlus, FaMagnifyingGlass, FaPen, FaTrashCan, FaXmark, FaRotate, FaTriangleExclamation, FaPowerOff } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import ActionMenu from '../components/ActionMenu'
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
// delay = เว้นระยะเวลาตรวจจับซ้ำ (1 - 300 วินาที)
const EMPTY_FORM = { name: '', lat: '', long: '', streamAi: '', direction: 'entry', delay: 1, isActive: true, villageId: '' }
const DIRECTION_LABELS = {
  entry: 'ขาเข้า (Entry)',
  exit: 'ขาออก (Exit)',
  internal: 'ภายใน (Internal)'
}

function getDirectionLabel(dir) {
  if (!dir) return '-'
  const lower = String(dir).toLowerCase().trim()
  if (lower === 'entry' || lower === 'in') return 'ขาเข้า (Entry)'
  if (lower === 'exit' || lower === 'out') return 'ขาออก (Exit)'
  if (lower === 'internal') return 'ภายใน (Internal)'
  return DIRECTION_LABELS[dir] || dir
}

function formatCoordinate(lat, long) {
  if (lat == null || long == null || lat === '' || long === '') return null
  const numLat = Number(lat)
  const numLong = Number(long)
  if (isNaN(numLat) || isNaN(numLong)) return null
  return `${numLat.toFixed(6)}, ${numLong.toFixed(6)}`
}

// ฟอร์ม ONVIF — เป็นแค่ตัวช่วยหา RTSP URI ไม่ใช่ field ที่ backend เก็บถาวร (session state เท่านั้น)
const EMPTY_ONVIF_FORM = { host: '', port: 80, username: '', password: '' }

// แปลงข้อความ Technical Error จาก Backend ให้เป็นภาษาไทยที่สุภาพและเข้าใจง่าย
function formatCameraErrorDetail(rawDetail) {
  if (!rawDetail) return ''
  let text = ''
  if (typeof rawDetail === 'string') {
    text = rawDetail
  } else if (typeof rawDetail === 'object') {
    text = rawDetail.detail || rawDetail.message || rawDetail.note || JSON.stringify(rawDetail)
  }
  const lower = text.toLowerCase()

  // 1. ตรวจจับกรณีข้อความรวม (Multiple status combined) เช่น:
  // "Stream is offline, Camera is not active, Verification status is 'failed'"
  // "Camera is offline, Verification status is 'pending'"
  if (
    (lower.includes('offline') || lower.includes('stream')) &&
    (lower.includes('failed') || lower.includes('not active'))
  ) {
    return 'ไม่สามารถเชื่อมต่อสัญญาณกล้องได้ (สัญญาณออฟไลน์ หรือลิงก์ RTSP ไม่ถูกต้อง)'
  }

  if (lower.includes('offline') && lower.includes('pending')) {
    return 'สัญญาณกล้องออฟไลน์ (ไม่พบการตอบสนองจากลิงก์ RTSP ที่ระบุ)'
  }

  if (
    lower.includes('stream is offline') ||
    lower.includes('stream offline') ||
    lower.includes('stream is not online') ||
    lower.includes('camera is offline')
  ) {
    return 'ไม่พบสัญญาณสตรีมของกล้อง กรุณาตรวจสอบลิงก์ RTSP หรือสถานะการเปิดของกล้อง'
  }

  if (
    lower.includes("verification status is 'failed'") ||
    lower.includes('verification status is failed') ||
    lower.includes('verification failed') ||
    lower.includes('verify failed')
  ) {
    return 'การยืนยันสัญญาณกล้องไม่สำเร็จ (ไม่สามารถดึงภาพวิดีโอจากลิงก์ได้)'
  }

  if (lower.includes("verification status is 'pending'") || lower.includes('verification status is pending')) {
    return 'อยู่ระหว่างรอการยืนยันสัญญาณจากกล้อง'
  }

  if (
    lower.includes('cannot connect') ||
    lower.includes('connection refused') ||
    lower.includes('failed to connect') ||
    lower.includes('could not connect')
  ) {
    return 'ไม่สามารถเชื่อมต่อสัญญาณกล้องได้ กรุณาตรวจสอบ IP หรือเครือข่าย'
  }

  if (lower.includes('camera is not active') || lower.includes('camera inactive')) {
    return 'กล้องถูกปิดการใช้งาน'
  }

  if (lower.includes('ai vision') || lower.includes('ai_vision')) {
    return 'ไม่สามารถเชื่อมต่อระบบ AI Vision กับกล้องตัวนี้ได้'
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'หมดเวลาการเชื่อมต่อสัญญาณกล้อง (กล้องไม่ตอบสนอง)'
  }

  // หากเป็นภาษาไทยอยู่แล้ว หรือข้อความอื่นๆ ให้คืนค่าเดิม
  return text
}

// รวมสถานะกล้อง (Power, AI Vision, Streaming / MediaMTX) ให้เป็น Camera Status เดียวที่เข้าใจง่าย
function getUnifiedCameraStatusBadge(camera, isChecking = false) {
  if (!camera) {
    return { label: 'ไม่ทราบสถานะ', tone: 'starting', description: 'ไม่มีข้อมูลสถานะกล้อง' }
  }

  // 1. ปิดใช้งานกล้อง (ผู้ใช้สั่งปิดการทำงานเอง — is_active: false)
  // ต้องตรวจเช็คตรงนี้ก่อนเป็นลำดับแรกสุด เพราะเมื่อสั่งปิด Backend จะตัดสตรีม (status: false, stream_online: false)
  // ซึ่งไม่ใช่ข้อผิดพลาดของกล้อง แต่เกิดจากความตั้งใจของผู้ใช้เอง
  if (!camera.is_active) {
    return { label: 'ปิดใช้งาน', tone: 'disabled', description: 'ผู้ใช้ปิดการทำงานกล้อง' }
  }

  // 2. กำลังโหลด/ตรวจสอบเฉพาะกล้องตัวนี้
  if (isChecking) {
    return { label: 'กำลังตรวจสอบสัญญาณ...', tone: 'starting', description: 'กำลังส่งคำขอตรวจสอบไปยังระบบ' }
  }

  // 3. อยู่ระหว่างรอยืนยันสัญญาณ / กำลังเริ่มระบบ (Pending / Connecting / Starting)
  // ตรวจสอบตรงนี้ก่อน เพื่อไม่ให้กล้องที่เพิ่งเพิ่มใหม่ (verification_status = pending) หลุดไปเป็น "ขัดข้อง"
  const isPending =
    camera.verification_status === 'pending' ||
    camera.verification_status === 'connecting' ||
    camera.is_starting === true

  if (isPending && camera.verification_status !== 'failed' && camera.status !== false) {
    return {
      label: 'รอยืนยันสัญญาณ...',
      tone: 'starting',
      description: 'กำลังตรวจสอบการเชื่อมต่อกับกล้อง (กรุณารอสักครู่)'
    }
  }

  // 4. ขัดข้อง / เชื่อมต่อไม่สำเร็จ (เมื่อยืนยันว่าล้มเหลวจริง ในขณะที่กล้องยังเปิดใช้งานอยู่)
  const hasFailureSignals =
    camera.verification_status === 'failed' ||
    (camera.status === false && camera.verification_status !== 'pending') ||
    (camera.verification_status === 'verified' && camera.stream_online === false) ||
    (camera.detail &&
      camera.verification_status !== 'pending' &&
      !camera.detail.includes('ถี่เกินไป') &&
      !camera.detail.toLowerCase().includes('rate limit') &&
      (
        camera.detail.toLowerCase().includes('offline') ||
        camera.detail.toLowerCase().includes('failed') ||
        camera.detail.toLowerCase().includes('refused') ||
        camera.detail.toLowerCase().includes('ขัดข้อง') ||
        camera.detail.toLowerCase().includes('ไม่สำเร็จ')
      ))

  // กล้องที่ใส่ลิงก์ปลอม หรือสัญญาณหลุด หรือ verify ไม่ผ่าน ต้องขึ้น "ขัดข้อง" เสมอ ไม่ใช่ "ปิดใช้งาน"
  if (hasFailureSignals) {
    let errDetail = formatCameraErrorDetail(camera.detail)
    if (!errDetail) {
      if (camera.verification_status === 'failed') {
        errDetail = 'การยืนยันกล้องไม่สำเร็จ (ไม่พบสัญญาณ)'
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

  // 5. พร้อมใช้งาน (เมื่อ backend status === true หรือผ่านเงื่อนไข verified & stream_online)
  const isReady = camera.status === true || (camera.verification_status === 'verified' && camera.stream_online === true)
  if (isReady) {
    return { label: 'พร้อมใช้งาน', tone: 'ready', description: 'กล้องพร้อมตรวจจับ' }
  }

  // 6. ถ้ายังไม่มี status ชัดเจน แต่ยังไม่ล้มเหลว
  if (
    (camera.status === undefined && camera.stream_online === undefined) ||
    (camera.status === undefined && camera.stream_online === false)
  ) {
    return { label: 'รอยืนยันสัญญาณ...', tone: 'starting', description: 'กำลังเชื่อมต่อสัญญาณกล้อง' }
  }

  // Fallback
  return {
    label: camera.verification_status || 'รอยืนยันสัญญาณ...',
    tone: 'starting',
    description: 'กำลังเชื่อมต่อสัญญาณกล้อง'
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
  const [kpiModalType, setKpiModalType] = useState(null) // 'total' | 'ready' | 'issues' | null
  const [kpiModalPage, setKpiModalPage] = useState(1)

  // ---------- ONVIF Probe (ตัวช่วยหา RTSP) — ใช้ได้เฉพาะตอนเพิ่มกล้องใหม่ ----------
  const [showOnvifPanel, setShowOnvifPanel] = useState(false)
  const [showOnvifPassword, setShowOnvifPassword] = useState(false)
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

    setCameras((prev) =>
      prev.map((c) => {
        if (String(c.id) !== String(camera_id)) return c

        if (type === 'verified') {
          return {
            ...c,
            verification_status: 'verified',
            stream_online: latestCameraEvent.stream_online ?? true,
            status: latestCameraEvent.status ?? true,
            is_starting: false,
            is_active: latestCameraEvent.is_active ?? c.is_active,
            detail: null,
            syncWarning: null
          }
        }
        if (type === 'verification_failed') {
          // backend ปิดกล้องอัตโนมัติตอน verify failed → ต้อง sync is_active ด้วย ไม่ใช่แค่ badge
          return {
            ...c,
            verification_status: 'failed',
            stream_online: latestCameraEvent.stream_online ?? false,
            status: latestCameraEvent.status ?? false,
            is_starting: false,
            is_active: latestCameraEvent.is_active ?? false,
            detail: formatCameraErrorDetail(latestCameraEvent.detail) || 'การยืนยันกล้องไม่สำเร็จ (ไม่พบสัญญาณภาพ)',
            syncWarning: null
          }
        }
        if (type === 'sync_failed') {
          return {
            ...c,
            status: false,
            stream_online: false,
            is_starting: false,
            verification_status: 'failed',
            detail: 'ซิงค์ระบบกับกล้องไม่สำเร็จ (ไม่สามารถเชื่อมต่อสัญญาณได้)',
            syncWarning: { failedServices: latestCameraEvent.failed_services, at: new Date() }
          }
        }
        return c
      })
    )
  }, [latestCameraEvent])

  // ดึงรายการกล้องจาก backend จริง — ยึดตาม selectedVillageId (หมู่บ้านที่กำลังดูอยู่)
  // superadmin เลือก "ทุกหมู่บ้าน" (null) → ไม่ส่ง village_id ได้ทุกหมู่บ้าน
  // showFullLoading: true เฉพาะตอนสลับหมู่บ้านหรือโหลดครั้งแรก (ไม่กะพริบทั้งตารางตอนกด Save)
  const fetchCameras = useCallback(async (showFullLoading = true) => {
    if (showFullLoading) setIsLoading(true)
    try {
      const data = await getCameraListAPI({
        villageId: selectedVillageId || undefined,
        page: 1,
        pageSize: 100
      })
      const cameraItems = data.items || []
      setCameras((prev) => {
        if (!showFullLoading && prev.length > 0) {
          const prevMap = new Map(prev.map((item) => [String(item.id), item]))
          return cameraItems.map((item) => {
            const existing = prevMap.get(String(item.id))
            return existing
              ? {
                  ...item,
                  ...existing,
                  name: item.name,
                  village_id: item.village_id,
                  lat: item.lat,
                  long: item.long,
                  direction: item.direction,
                  delay: item.delay
                }
              : item
          })
        }
        return cameraItems
      })
      setTotal(data.total || cameraItems.length)
      if (showFullLoading) setIsLoading(false)

      // ดึงสถานะกล้อง (status, stream_online, verification_status, is_starting, detail) จาก GET /api/cameras/{id}/status แบบคู่ขนาน
      const statusResults = await Promise.allSettled(
        cameraItems.map((c) => getCameraStatusAPI(c.id))
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
      if (showFullLoading) {
        Swal.fire({
          icon: 'error',
          title: 'โหลดข้อมูลกล้องไม่สำเร็จ',
          text: 'กรุณาลองรีเฟรชหน้าใหม่อีกครั้ง',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }
    } finally {
      if (showFullLoading) setIsLoading(false)
    }
  }, [selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // รีเซ็ตหน้ากลับเป็นหน้า 1 เมื่อค้นหาหรือเปลี่ยนหมู่บ้าน
  useEffect(() => {
    setCurrentPage(1)
  }, [searchInput, selectedVillageId])

  const readyCount = useMemo(() => {
    return cameras.filter((c) => getUnifiedCameraStatusBadge(c).tone === 'ready').length
  }, [cameras])

  const issueCount = useMemo(() => {
    return cameras.filter((c) => getUnifiedCameraStatusBadge(c).tone === 'error').length
  }, [cameras])

  const KPI_PAGE_SIZE = 5

  const kpiModalCameras = useMemo(() => {
    if (!kpiModalType) return []
    if (kpiModalType === 'total') return cameras
    if (kpiModalType === 'ready') return cameras.filter((c) => getUnifiedCameraStatusBadge(c).tone === 'ready')
    if (kpiModalType === 'issues') return cameras.filter((c) => getUnifiedCameraStatusBadge(c).tone === 'error')
    return []
  }, [kpiModalType, cameras])

  const kpiModalTotalPages = Math.max(1, Math.ceil(kpiModalCameras.length / KPI_PAGE_SIZE))
  const kpiModalVisiblePages = getVisiblePageNumbers(kpiModalPage, kpiModalTotalPages, MAX_VISIBLE_PAGES)

  const paginatedKpiCameras = useMemo(() => {
    const start = (kpiModalPage - 1) * KPI_PAGE_SIZE
    return kpiModalCameras.slice(start, start + KPI_PAGE_SIZE)
  }, [kpiModalCameras, kpiModalPage])

  function openKpiModal(type) {
    setKpiModalType(type)
    setKpiModalPage(1)
  }

  function closeKpiModal() {
    setKpiModalType(null)
  }

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
    setShowOnvifPassword(false)
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
      delay: camera.delay ?? 1,
      villageId: camera.village_id || ''
    })
    setFormTouched({})
    setHasSubmittedForm(false)
    resetOnvifPanel()
    setShowFormModal(true)
  }

  function closeFormModal() {
    setShowFormModal(false)
    setEditingCamera(null)
    setFormData(EMPTY_FORM)
    setFormTouched({})
    setHasSubmittedForm(false)
    resetOnvifPanel()
  }

  function checkIsCameraFormDirty() {
    if (editingCamera) {
      return (
        (formData.name || '').trim() !== (editingCamera.name || '').trim() ||
        String(formData.lat || '').trim() !== String(editingCamera.lat ?? '').trim() ||
        String(formData.long || '').trim() !== String(editingCamera.long ?? '').trim() ||
        (formData.streamAi || '').trim() !== (editingCamera.stream_ai || '').trim() ||
        (formData.direction || 'entry') !== (editingCamera.direction || 'entry') ||
        Number(formData.delay ?? 1) !== Number(editingCamera.delay ?? 1) ||
        String(formData.villageId || '') !== String(editingCamera.village_id || '')
      )
    }
    const initialVillageId = user?.role === 'admin' ? user.village_id : (selectedVillageId || '')
    return Boolean(
      (formData.name || '').trim() ||
      String(formData.lat || '').trim() ||
      String(formData.long || '').trim() ||
      (formData.streamAi || '').trim() ||
      (formData.direction && formData.direction !== 'entry') ||
      (formData.villageId && formData.villageId !== initialVillageId) ||
      (onvifForm.host && onvifForm.host.trim()) ||
      (onvifForm.username && onvifForm.username.trim()) ||
      (onvifForm.password && onvifForm.password.trim())
    )
  }

  async function handleAttemptCloseCameraModal() {
    if (isSubmitting) return
    if (checkIsCameraFormDirty()) {
      const res = await Swal.fire({
        title: 'คุณมีข้อมูลที่ยังไม่ได้บันทึก',
        text: 'ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ละทิ้งข้อมูล',
        cancelButtonText: 'แก้ไขต่อ',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: 'var(--sidebar-bg)'
      })
      if (!res.isConfirmed) return
    }
    closeFormModal()
  }

  const latestCameraModalStateRef = useRef({})
  latestCameraModalStateRef.current = {
    showFormModal,
    handleAttemptCloseCameraModal,
    kpiModalType,
    closeKpiModal
  }

  // ปิด modal เมื่อกดปุ่ม Escape (มี Dirty check สดใหม่เสมอผ่าน Ref)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (Swal.isVisible()) return
        const state = latestCameraModalStateRef.current
        if (state.kpiModalType) {
          state.closeKpiModal()
          return
        }
        if (state.showFormModal) {
          state.handleAttemptCloseCameraModal()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

    const delayNum = parseInt(formData.delay ?? 1, 10)
    if (isNaN(delayNum) || delayNum < 1 || delayNum > 300) {
      Swal.fire({
        icon: 'warning',
        title: 'ค่า Delay ไม่ถูกต้อง',
        text: 'Delay ต้องเป็นตัวเลขจำนวนเต็มระหว่าง 1 ถึง 300 วินาที',
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
          delay: delayNum
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
          formData.direction,
          delayNum
        )
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มกล้องใหม่แล้ว',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }

      closeFormModal()
      fetchCameras(false)
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      const displayMessage = formatCameraErrorDetail(backendMessage) || 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      Swal.fire({
        icon: 'error',
        title: 'บันทึกไม่สำเร็จ',
        text: displayMessage,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleCameraActive(camera) {
    const isCurrentlyActive = Boolean(camera.is_active)
    const actionLabel = isCurrentlyActive ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'
    const result = await Swal.fire({
      icon: 'warning',
      title: `ยืนยันการ${actionLabel}กล้อง`,
      text: `ต้องการ${actionLabel} "${camera.name}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: actionLabel,
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: isCurrentlyActive ? 'rgb(220, 38, 38)' : 'var(--sidebar-bg)',
      cancelButtonColor: 'var(--text-secondary)'
    })

    if (!result.isConfirmed) return

    try {
      await updateCameraAPI(camera.id, {
        is_active: !isCurrentlyActive
      })
      setCameras((prev) =>
        prev.map((c) =>
          String(c.id) === String(camera.id)
            ? {
                ...c,
                is_active: !isCurrentlyActive,
                is_starting: !isCurrentlyActive,
                status: !isCurrentlyActive ? null : false,
                verification_status: !isCurrentlyActive ? 'pending' : c.verification_status,
                detail: !isCurrentlyActive ? null : c.detail
              }
            : c
        )
      )
      Swal.fire({
        icon: 'success',
        title: `${actionLabel}กล้องแล้ว`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })

      // หากเป็นการ "เปิดใช้งาน" ให้สั่งตรวจสอบสัญญาณและยืนยันการเชื่อมต่อให้อัตโนมัติในพื้นหลัง
      if (!isCurrentlyActive) {
        try {
          await checkCameraVerificationAPI(camera.id)
        } catch (verifyErr) {
          console.warn('Auto verification check warning:', verifyErr)
        }
      }

      // Refresh status in background
      try {
        const statusRes = await getCameraStatusAPI(camera.id)
        setCameras((prev) =>
          prev.map((c) => {
            if (String(c.id) !== String(camera.id)) return c
            if (!isCurrentlyActive) {
              // กรณีเปิดใช้งาน: นำสถานะจริงหลังการเชื่อมต่อมาใช้
              const isReady =
                statusRes.status === true ||
                (statusRes.verification_status === 'verified' && statusRes.stream_online === true)
              const isFailed =
                statusRes.status === false ||
                statusRes.verification_status === 'failed'

              return {
                ...c,
                is_active: true,
                stream_online: statusRes.stream_online,
                verification_status: statusRes.verification_status ?? (isReady ? 'verified' : c.verification_status),
                is_starting: (isReady || isFailed) ? false : (statusRes.is_starting ?? true),
                status: isReady ? true : (isFailed ? false : statusRes.status),
                detail: statusRes.detail || (isFailed ? 'การยืนยันกล้องไม่สำเร็จ' : null)
              }
            } else {
              // กรณีระงับการใช้งาน
              return {
                ...c,
                is_active: false,
                stream_online: false,
                is_starting: false,
                status: false,
                detail: statusRes.detail || c.detail
              }
            }
          })
        )
      } catch (err) {
        console.error('Failed to fetch updated camera status:', err)
      }
    } catch (error) {
      console.error(error)
      const isRateLimit =
        error.response?.status === 429 ||
        String(error.response?.data?.detail).toLowerCase().includes('rate limit') ||
        String(error.response?.data?.detail).includes('ถี่เกินไป')

      if (isRateLimit) {
        Swal.fire({
          icon: 'warning',
          title: 'มีการเรียกใช้งานถี่เกินไป',
          text: 'กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
        return
      }

      const backendMessage = error.response?.data?.detail
      const displayMessage = formatCameraErrorDetail(backendMessage) || 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      Swal.fire({
        icon: 'error',
        title: `${actionLabel}ไม่สำเร็จ`,
        text: displayMessage,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
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
        title: 'สั่งดึงสัญญาณกล้องใหม่ทั้งหมดแล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      fetchCameras()
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ดึงสัญญาณไม่สำเร็จ',
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
      let statusRes = null
      try {
        statusRes = await getCameraStatusAPI(camId)
        setCameras((prev) =>
          prev.map((c) =>
            String(c.id) === String(camId)
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

      // ประเมินผลลัพธ์จริงเพื่อแสดงข้อความแจ้งเตือนที่ไม่ขัดแย้งกับสถานะในตาราง
      const isFailed =
        statusRes?.status === false ||
        statusRes?.verification_status === 'failed' ||
        (statusRes?.status === undefined && statusRes?.stream_online === false)
      const isReady =
        statusRes?.status === true ||
        (statusRes?.verification_status === 'verified' && statusRes?.stream_online === true)

      if (isFailed) {
        const rawErr = statusRes?.detail || res?.note || 'ไม่สามารถติดต่อ AI Vision Service หรือเชื่อมต่อสัญญาณกล้องได้'
        const errorDetail = formatCameraErrorDetail(rawErr)
        setCameras((prev) =>
          prev.map((c) =>
            String(c.id) === String(camId)
              ? {
                  ...c,
                  status: false,
                  verification_status: 'failed',
                  stream_online: false,
                  is_starting: false,
                  detail: errorDetail
                }
              : c
          )
        )
        Swal.fire({
          icon: 'error',
          title: `การเชื่อมต่อ ${camera.name} ขัดข้อง`,
          text: errorDetail,
          confirmButtonText: 'รับทราบ',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } else if (isReady) {
        Swal.fire({
          icon: 'success',
          title: `ตรวจสอบสัญญาณ ${camera.name} สำเร็จ`,
          text: 'สัญญาณกล้องเชื่อมต่อและพร้อมใช้งานแล้ว',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } else {
        Swal.fire({
          icon: 'info',
          title: `กำลังเริ่มระบบ ${camera.name}`,
          text: formatCameraErrorDetail(res?.note) || 'ระบบกำลังเชื่อมต่อสัญญาณกล้องใหม่อีกครั้ง กรุณารอสักครู่',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }
    } catch (error) {
      console.error(error)
      const isRateLimit =
        error.response?.status === 429 ||
        String(error.response?.data?.detail).toLowerCase().includes('rate limit') ||
        String(error.response?.data?.detail).includes('ถี่เกินไป')

      if (isRateLimit) {
        Swal.fire({
          icon: 'warning',
          title: 'มีการเรียกใช้งานถี่เกินไป',
          text: 'กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
        return
      }

      const rawError = error.response?.data?.detail
      const displayError = formatCameraErrorDetail(rawError) || 'เกิดข้อผิดพลาดในการส่งคำขอ กรุณาลองใหม่'
      setCameras((prev) =>
        prev.map((c) =>
          String(c.id) === String(camId)
            ? {
                ...c,
                status: false,
                verification_status: 'failed',
                stream_online: false,
                is_starting: false,
                detail: displayError
              }
            : c
        )
      )
      Swal.fire({
        icon: 'error',
        title: 'ตรวจสอบไม่สำเร็จ',
        text: displayError,
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
          <div
            className="cm-kpi-card interactive"
            onClick={() => openKpiModal('total')}
            role="button"
            tabIndex={0}
            title="คลิกเพื่อดูรายการกล้องทั้งหมด"
          >
            <div className="cm-kpi-icon blue">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">กล้องทั้งหมด</p>
              <h2 className="cm-kpi-val">{total}</h2>
            </div>
          </div>

          <div
            className="cm-kpi-card interactive"
            onClick={() => openKpiModal('ready')}
            role="button"
            tabIndex={0}
            title="คลิกเพื่อดูรายการกล้องที่พร้อมใช้งาน"
          >
            <div className="cm-kpi-icon green">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">พร้อมใช้งาน</p>
              <h2 className="cm-kpi-val">{readyCount}</h2>
            </div>
          </div>

          <div
            className="cm-kpi-card interactive"
            onClick={() => openKpiModal('issues')}
            role="button"
            tabIndex={0}
            title="คลิกเพื่อดูรายการกล้องที่ขัดข้อง"
          >
            <div className="cm-kpi-icon red">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">ขัดข้อง</p>
              <h2 className={`cm-kpi-val ${issueCount > 0 ? 'red' : ''}`}>{issueCount}</h2>
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
              {/* ปุ่มดึงสัญญาณกล้องทั้งหมดใหม่กับ Streaming — เฉพาะ Superadmin/Admin */}
              <button
                className="btn-resync-all"
                onClick={handleResyncAll}
                disabled={isResyncingAll || cameras.length === 0}
                title="ดึงสัญญาณกล้องทุกตัวใหม่พร้อมกัน (ใช้เมื่อกล้องขัดข้องหรือสัญญาณหลุดหลายตัว)"
              >
                <FaRotate className={isResyncingAll ? 'cm-spin' : ''} />
                <span>{isResyncingAll ? 'กำลังดึงสัญญาณใหม่ทั้งหมด...' : 'ดึงสัญญาณใหม่ทั้งหมด'}</span>
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
                  <th>Delay</th>
                  <th>Camera Status</th>
                  <th style={{ width: 70 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={showVillageColumn ? 7 : 6}>
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
                          {formatCoordinate(c.lat, c.long) ? (
                            <span>{formatCoordinate(c.lat, c.long)}</span>
                          ) : (
                            <span className="cm-location-empty">ยังไม่ได้ระบุ</span>
                          )}
                        </td>
                        <td className="cm-direction-text">
                          {getDirectionLabel(c.direction)}
                        </td>
                        <td className="cm-direction-text">
                          {c.delay != null ? `${c.delay} วินาที` : '1 วินาที'}
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
                              <p className={`cm-status-hint ${badge.tone}`} title={badge.description}>
                                {badge.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <ActionMenu
                            items={[
                              {
                                key: 'verify-camera',
                                label: 'ตรวจสอบสัญญาณ',
                                icon: <FaRotate className={isChecking ? 'cm-spin' : ''} />,
                                disabled: isChecking,
                                onClick: () => handleVerificationCheck(c)
                              },
                              {
                                key: 'edit-camera',
                                label: 'แก้ไขข้อมูลกล้อง',
                                icon: <FaPen />,
                                onClick: () => openEditModal(c)
                              },
                              {
                                key: 'toggle-camera-active',
                                label: c.is_active ? 'ระงับการใช้งาน' : 'เปิดใช้งาน',
                                icon: <FaPowerOff />,
                                danger: Boolean(c.is_active),
                                success: !c.is_active,
                                disabled: isChecking,
                                onClick: () => handleToggleCameraActive(c)
                              },
                              {
                                key: 'delete-camera',
                                label: 'ลบกล้อง',
                                icon: <FaTrashCan />,
                                danger: true,
                                onClick: () => handleDelete(c)
                              }
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={showVillageColumn ? 7 : 6}>
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
                <span className="pagination-info">Page {currentPage} of {totalPages}</span>
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
        <div className="modal-overlay" onClick={handleAttemptCloseCameraModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCamera ? 'Edit Camera' : 'Add New Camera'}</h3>
              <button className="modal-close" onClick={handleAttemptCloseCameraModal} disabled={isSubmitting}>
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
                          <div className="cm-password-input-wrap">
                            <input
                              type={showOnvifPassword ? 'text' : 'password'}
                              name="password"
                              placeholder="กรอกรหัสผ่านกล้อง"
                              value={onvifForm.password}
                              onChange={handleOnvifFormChange}
                            />
                            <button
                              type="button"
                              className="cm-password-toggle-btn"
                              onClick={() => setShowOnvifPassword(!showOnvifPassword)}
                              title={showOnvifPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                            >
                              {showOnvifPassword ? <FaEye /> : <FaEyeSlash />}
                            </button>
                          </div>
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

              <div className="cm-form-row">
                <div className="cm-form-field">
                  <label>Direction (ทิศทาง)</label>
                  <select name="direction" value={formData.direction} onChange={handleFormChange}>
                    <option value="entry">ขาเข้า (Entry)</option>
                    <option value="exit">ขาออก (Exit)</option>
                    <option value="internal">ภายใน (Internal)</option>
                  </select>
                </div>
                <div className="cm-form-field">
                  <label>
                    Delay ตรวจจับซ้ำ <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    name="delay"
                    min="1"
                    max="300"
                    placeholder="1 - 300 วินาที"
                    value={formData.delay}
                    onChange={handleFormChange}
                    onBlur={() => handleFieldBlur('delay')}
                    style={
                      (formTouched.delay || hasSubmittedForm) &&
                      (formData.delay === '' || isNaN(parseInt(formData.delay, 10)) || parseInt(formData.delay, 10) < 1 || parseInt(formData.delay, 10) > 300)
                        ? { borderColor: '#dc2626' }
                        : {}
                    }
                  />
                  {(formTouched.delay || hasSubmittedForm) &&
                    (formData.delay === '' || isNaN(parseInt(formData.delay, 10)) || parseInt(formData.delay, 10) < 1 || parseInt(formData.delay, 10) > 300) && (
                      <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        Delay ต้องเป็นตัวเลข 1 - 300 วินาที
                      </span>
                    )}
                </div>
              </div>
              <p className="cm-description" style={{ margin: '-6px 0 12px' }}>
                เว้นระยะเวลาก่อนยอมให้ตรวจจับป้ายทะเบียนเดิมซ้ำ (1 - 300 วินาที หรือสูงสุด 5 นาที) ช่วยแก้ปัญหาตรวจจับป้ายซ้ำขณะรถติด
              </p>
              <div className="cm-form-actions">
                <button
                  type="button"
                  className="btn-cancel-cm"
                  onClick={handleAttemptCloseCameraModal}
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
      {/* Modal KPI Popup */}
      {kpiModalType && (
        <div className="modal-overlay" onClick={closeKpiModal}>
          <div className="modal-content cm-kpi-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="cm-kpi-modal-title-wrap">
                <div className={`cm-kpi-icon ${kpiModalType === 'total' ? 'blue' : kpiModalType === 'ready' ? 'green' : 'red'}`}>
                  <FaVideo />
                </div>
                <h3 className="cm-kpi-modal-title">
                  {kpiModalType === 'total' && 'รายการกล้องทั้งหมด'}
                  {kpiModalType === 'ready' && 'รายการกล้องที่พร้อมใช้งาน'}
                  {kpiModalType === 'issues' && 'รายการกล้องที่ขัดข้อง'}
                  <span className="cm-kpi-title-count">({kpiModalCameras.length} ตัว)</span>
                </h3>
              </div>
              <button className="modal-close" onClick={closeKpiModal} title="ปิดหน้าต่าง (Esc)">
                <FaXmark />
              </button>
            </div>

            <div className="cm-kpi-modal-body">
              {paginatedKpiCameras.length > 0 ? (
                <div className="cm-kpi-table-wrap">
                  <table className="cm-table cm-kpi-popup-table">
                    <thead>
                      <tr>
                        <th>ชื่อกล้อง</th>
                        {showVillageColumn && <th>หมู่บ้าน</th>}
                        <th>ทิศทาง</th>
                        <th>Delay</th>
                        <th>พิกัด (Lat, Long)</th>
                        <th>สถานะการทำงาน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedKpiCameras.map((c) => {
                        const isChecking = checkingCameraIds.has(c.id)
                        const badge = getUnifiedCameraStatusBadge(c, isChecking)
                        const formattedCoord = formatCoordinate(c.lat, c.long)

                        return (
                          <tr key={c.id}>
                            <td className="cm-camera-name" style={{ fontWeight: 600 }}>{c.name}</td>
                            {showVillageColumn && <td>{getVillageName(c.village_id) || '-'}</td>}
                            <td className="cm-direction-text">
                              {getDirectionLabel(c.direction)}
                            </td>
                            <td className="cm-direction-text">
                              {c.delay != null ? `${c.delay} วินาที` : '1 วินาที'}
                            </td>
                            <td className="cm-location">
                              {formattedCoord ? (
                                <span>{formattedCoord}</span>
                              ) : (
                                <span className="cm-location-empty">ยังไม่ได้ระบุ</span>
                              )}
                            </td>
                            <td className="cm-status-cell">
                              <div className="cm-status-unified-wrapper">
                                <span className={`cm-status-badge ${badge.tone}`}>
                                  <span className={`cm-status-dot ${badge.tone}`}></span>
                                  {badge.label}
                                </span>
                                {badge.description && (
                                  <p className="cm-status-hint">{badge.description}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="cm-kpi-empty-state">
                  <EmptyState
                    icon={<FaVideo />}
                    title={kpiModalType === 'issues' ? 'ไม่พบกล้องที่ขัดข้อง' : 'ไม่มีข้อมูลกล้อง'}
                    description={kpiModalType === 'issues' ? 'กล้องทุกตัวในระบบเชื่อมต่อและทำงานได้เป็นปกติ' : 'ยังไม่มีกล้องในหมวดหมู่นี้'}
                  />
                </div>
              )}
            </div>

            {kpiModalTotalPages > 1 && (
              <div className="cm-kpi-modal-footer">
                <p className="cm-total-count" style={{ margin: 0 }}>
                  แสดง {paginatedKpiCameras.length} จากทั้งหมด {kpiModalCameras.length.toLocaleString()} รายการ
                </p>
                <div className="pagination">
                  <span className="pagination-info">Page {kpiModalPage} of {kpiModalTotalPages}</span>
                  <button
                    className="page-btn"
                    disabled={kpiModalPage === 1}
                    onClick={() => setKpiModalPage((p) => Math.max(1, p - 1))}
                    title="หน้าก่อนหน้า"
                  >
                    &lt;
                  </button>
                  {kpiModalVisiblePages.map((page) => (
                    <button
                      key={page}
                      className={`page-btn ${page === kpiModalPage ? 'active' : ''}`}
                      onClick={() => setKpiModalPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    className="page-btn"
                    disabled={kpiModalPage === kpiModalTotalPages}
                    onClick={() => setKpiModalPage((p) => Math.min(kpiModalTotalPages, p + 1))}
                    title="หน้าถัดไป"
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}

export default CameraManagement