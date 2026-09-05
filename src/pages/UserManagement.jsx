import { useState, useEffect, useCallback, useMemo } from 'react'
import { FaUsers, FaUserPlus, FaUserShield, FaSearch, FaIdCard, FaEye } from 'react-icons/fa'
import { FaUserCheck, FaTrashCan, FaKey, FaXmark, FaCity, FaToggleOn, FaToggleOff, FaPaperPlane, FaCircleCheck, FaCircleXmark, FaPen, FaLockOpen, FaLock } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import { renderVillageDisplay } from '../components/VillageDisplay'
import usePresenceStore from '../store/presenceStore'
import useNotificationStore from '../store/notificationStore'
import {
  getUsersAPI,
  createUserAPI,
  updateUserStatusAPI,
  deleteUserAPI,
  resetUserPasswordAPI,
  resendInviteAPI,
  getLockedAccountsAPI,
  unlockUserAccountAPI,
  createContactAPI,
  createVillageAPI,
  getVillagesAPI,
  updateVillageAPI,
  deleteVillageAPI
} from '../data/api'
import '../styles/UserManagement.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import UserProfileModal from '../components/UserProfileModal'
import VillageDetailModal from '../components/VillageDetailModal'
import ActionMenu from '../components/ActionMenu'
import { filterVisibleUsers } from '../utils/Permissions'
import { isEmailValid, isPasswordValid, isThaiEnglishNameValid, filterThaiEnglishName, stripEmoji, hasEmoji } from '../utils/passwordPolicy'

const PAGE_SIZE = 10
const MAX_VISIBLE_PAGES = 4
const SEARCH_DEBOUNCE_MS = 400
const MIN_PASSWORD_LENGTH = 8

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

const CAN_ADD_ADMIN_ROLES = ['superadmin']
const CAN_ADD_VILLAGE_ROLES = ['superadmin']

const EMPTY_FORM = { username: '', fullname: '', email: '', phone: '', villageId: '' }
const EMPTY_VILLAGE_FORM = { name: '', address: '' }
const EMPTY_RESET_FORM = { newPassword: '', confirmPassword: '' }

function validateUserForm(data, isCurrentUserAdmin) {
  const errors = {}

  const u = (data.username || '').trim()
  if (!u) {
    errors.username = 'กรุณากรอก Username'
  } else if (u.length < 4) {
    errors.username = 'Username ต้องมีอย่างน้อย 4 ตัวอักษร'
  } else if (u.length > 36) {
    errors.username = 'Username ต้องไม่เกิน 36 ตัวอักษร'
  } else if (!/^[a-zA-Z0-9@._-]+$/.test(u)) {
    errors.username = 'Username ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ @, -, _ เท่านั้น'
  }

  const fn = stripEmoji(data.fullname || '').trim()
  if (!fn) {
    errors.fullname = 'กรุณากรอกชื่อ-นามสกุล'
  } else if (fn.length < 2) {
    errors.fullname = 'ชื่อ-นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร'
  } else if (fn.length > 50) {
    errors.fullname = 'ชื่อ-นามสกุลต้องไม่เกิน 50 ตัวอักษร'
  } else if (!isThaiEnglishNameValid(fn)) {
    errors.fullname = 'ชื่อ-นามสกุลต้องเป็นภาษาไทยหรือภาษาอังกฤษเท่านั้น'
  }

  const em = (data.email || '').trim()
  if (!em) {
    errors.email = 'กรุณากรอกอีเมล'
  } else if (!isEmailValid(em)) {
    errors.email = 'รูปแบบอีเมลไม่ถูกต้อง เช่น user@example.com'
  }

  const ph = (data.phone || '').trim()
  const digits = ph.replace(/\D/g, '')
  if (!ph) {
    errors.phone = 'กรุณากรอกเบอร์โทรศัพท์'
  } else if (digits.length !== 10) {
    errors.phone = 'เบอร์โทรศัพท์ต้องครบ 10 หลัก (เช่น 089-123-4567)'
  }

  if (!isCurrentUserAdmin && !data.villageId) {
    errors.villageId = 'กรุณาเลือกหมู่บ้าน'
  }

  return errors
}

function validateVillageForm(data) {
  const errors = {}
  const rawName = data.name || ''
  const n = rawName.trim()
  if (hasEmoji(rawName)) {
    errors.name = 'ขออภัย ไม่อนุญาตให้ใช้อีโมจิในชื่อหมู่บ้าน'
  } else if (!n) {
    errors.name = 'กรุณากรอกชื่อหมู่บ้าน'
  } else if (n.length < 2) {
    errors.name = 'ชื่อหมู่บ้านต้องมีอย่างน้อย 2 ตัวอักษร'
  } else if (n.length > 36) {
    errors.name = 'ชื่อหมู่บ้านต้องไม่เกิน 36 ตัวอักษร'
  }

  const rawAddr = data.address || ''
  const addr = rawAddr.trim()
  if (hasEmoji(rawAddr)) {
    errors.address = 'ขออภัย ไม่อนุญาตให้ใช้อีโมจิในที่อยู่หมู่บ้าน'
  } else if (!addr) {
    errors.address = 'กรุณากรอกที่อยู่ของหมู่บ้าน'
  } else if (addr.length < 5) {
    errors.address = 'ที่อยู่ของหมู่บ้านต้องมีอย่างน้อย 5 ตัวอักษร'
  }

  return errors
}

function formatPhoneInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  const part1 = digits.slice(0, 3)
  const part2 = digits.slice(3, 6)
  const part3 = digits.slice(6, 10)
  return [part1, part2, part3].filter(Boolean).join('-')
}

function capitalize(text) {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

function UserManagement() {
  const { user: currentUser } = useAuthStore()
  const { villages, selectedVillageId, fetchVillages, getVillageName } = useVillageStore()
  const renderVillage = (id, directName) => {
    const allVillages = villagesList && villagesList.length > 0 ? villagesList : villages
    return renderVillageDisplay(id, directName, allVillages)
  }

  // สถานะ Online/Offline — แยกจาก is_active (Active/Inactive) โดยสิ้นเชิง
  // is_active มาจาก DB (ปิด/เปิดใช้งานบัญชีผ่านปุ่ม toggle) ส่วน online มาจาก SSE presence stream แบบ real-time
  // เปิด connection เฉพาะตอนอยู่หน้านี้เท่านั้น (ดู useEffect ด้านล่าง) ไม่ผูกกับ login/logout เหมือน alert SSE
  const { onlineUserIds } = usePresenceStore()
  const latestNotification = useNotificationStore((state) => state.latestNotification)
  const latestSecurityAlert = useNotificationStore((state) => state.latestSecurityAlert)

  const isSuperadmin = currentUser?.role === 'superadmin'
  const isAdmin = currentUser?.role === 'admin'

  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [villageFilter, setVillageFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | inactive
  const [currentPage, setCurrentPage] = useState(1)

  // Add User modal
  const [showFormModal, setShowFormModal] = useState(false)
  const [addRole, setAddRole] = useState('user')
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [touchedFields, setTouchedFields] = useState({})
  const [hasSubmittedUserForm, setHasSubmittedUserForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Add/Edit Village modal — null = โหมดเพิ่ม, มีค่า = โหมดแก้ไข
  const [showVillageModal, setShowVillageModal] = useState(false)
  const [editingVillage, setEditingVillage] = useState(null)
  const [selectedVillageForDetail, setSelectedVillageForDetail] = useState(null)
  const [villageFormData, setVillageFormData] = useState(EMPTY_VILLAGE_FORM)
  const [villageTouchedFields, setVillageTouchedFields] = useState({})
  const [hasSubmittedVillageForm, setHasSubmittedVillageForm] = useState(false)
  const [isSubmittingVillage, setIsSubmittingVillage] = useState(false)

  // รายการหมู่บ้านทั้งหมด (ไม่กรอง active) สำหรับตารางจัดการ — เฉพาะ superadmin
  const [villagesList, setVillagesList] = useState([])
  const [isLoadingVillagesList, setIsLoadingVillagesList] = useState(true)

  // Reset Password modal — API ต้องการ new_password + confirm ตรงๆ ไม่ auto-generate
  const [resetTargetUser, setResetTargetUser] = useState(null)
  const [resetForm, setResetForm] = useState(EMPTY_RESET_FORM)
  const [isResetting, setIsResetting] = useState(false)

  // Real-time validations
  const userFormErrors = useMemo(() => validateUserForm(formData, isAdmin), [formData, isAdmin])
  const isUserFormValid = Object.keys(userFormErrors).length === 0

  const villageFormErrors = useMemo(() => validateVillageForm(villageFormData), [villageFormData])
  const isVillageFormValid = Object.keys(villageFormErrors).length === 0

  const isResetPasswordValid = useMemo(() => {
    const p = resetForm.newPassword
    const cp = resetForm.confirmPassword
    return isPasswordValid(p) && cp.length > 0 && p === cp
  }, [resetForm])

  // View Profile modal — โชว์ข้อมูลติดต่อ (เบอร์โทร/อีเมล) ของ user ที่กด
  const [profileUser, setProfileUser] = useState(null)

  // KPI
  const [kpiLoading, setKpiLoading] = useState(true)
  const [totalUsers, setTotalUsers] = useState(0)
  const [activeUsers, setActiveUsers] = useState(0)

  // บัญชีที่กำลังโดน rate-limit ล็อคอยู่ตอนนี้ — ดึงแยก endpoint แล้ว cross-reference กับตาราง user หลักด้วย user_id
  // backend กรองตาม village ให้แล้ว (admin เห็นเฉพาะหมู่บ้านตัวเอง, superadmin เห็นทุกหมู่บ้าน)
  const [lockedAccounts, setLockedAccounts] = useState([])
  const [isLoadingLocked, setIsLoadingLocked] = useState(true)

  useEffect(() => {
    if (!currentUser) return
    fetchVillages()
  }, [currentUser, fetchVillages])

  // เปิด presence connection ตอนเข้าหน้านี้ ปิดทันทีตอนออกจากหน้า
  // (ต่างจาก alert SSE ที่เปิดค้างทั้งแอปตอน login — presence ใช้เฉพาะหน้านี้ ไม่กินคอนเนกชันฟรีๆ ตอนอยู่หน้าอื่น)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setCurrentPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [villageFilter, roleFilter, statusFilter])

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return
    setIsLoading(true)
    try {
      const targetVillageId = isSuperadmin
        ? (villageFilter !== 'all' ? villageFilter : selectedVillageId || undefined)
        : (selectedVillageId || undefined)

      const data = await getUsersAPI({
        villageId: targetVillageId,
        role: roleFilter === 'all' ? undefined : roleFilter,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
        search: debouncedSearch || undefined,
        page: currentPage,
        pageSize: PAGE_SIZE
      })
      setUsers(filterVisibleUsers(currentUser, data.items))
      setTotal(data.total)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูลผู้ใช้ได้ กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentUser, isSuperadmin, villageFilter, selectedVillageId, roleFilter, statusFilter, debouncedSearch, currentPage])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    async function fetchKpis() {
      if (!currentUser) return
      setKpiLoading(true)
      try {
        const [all, active] = await Promise.all([
          getUsersAPI({ villageId: selectedVillageId || undefined, page: 1, pageSize: 1 }),
          getUsersAPI({ villageId: selectedVillageId || undefined, isActive: true, page: 1, pageSize: 1 })
        ])
        setTotalUsers(all.total)
        setActiveUsers(active.total)
      } catch (error) {
        console.error(error)
      } finally {
        setKpiLoading(false)
      }
    }
    fetchKpis()
  }, [currentUser, selectedVillageId])

  // ดึงรายชื่อบัญชีที่กำลังโดนล็อคอยู่ — backend scope ตาม village ให้แล้ว ไม่ต้อง filter ซ้ำฝั่งนี้
  const fetchLockedAccounts = useCallback(async () => {
    if (!currentUser) return
    setIsLoadingLocked(true)
    try {
      const data = await getLockedAccountsAPI()
      const items = Array.isArray(data) ? data : []
      setLockedAccounts((prev) => {
        const now = Date.now()
        const backendUserIds = new Set(items.map((b) => b.user_id))
        const activeLocal = prev.filter(
          (p) => !backendUserIds.has(p.user_id) && p.unlocked_at && new Date(p.unlocked_at).getTime() > now
        )
        return [...items, ...activeLocal]
      })
    } catch (error) {
      console.error('fetchLockedAccounts error:', error)
    } finally {
      setIsLoadingLocked(false)
    }
  }, [currentUser])

  useEffect(() => {
    fetchLockedAccounts()
  }, [fetchLockedAccounts, latestNotification])

  // Real-time Countdown: เคลียร์บัญชีที่ครบกำหนดเวลาปลดล็อคอัตโนมัติทุก 1 วินาที
  useEffect(() => {
    const ticker = setInterval(() => {
      const now = Date.now()
      setLockedAccounts((prev) => {
        const hasExpired = prev.some((p) => p.unlocked_at && new Date(p.unlocked_at).getTime() <= now)
        if (hasExpired) {
          return prev.filter((p) => !p.unlocked_at || new Date(p.unlocked_at).getTime() > now)
        }
        return prev
      })
    }, 1000)
    return () => clearInterval(ticker)
  }, [])

  // เมื่อได้รับ Security Alert (Brute-force lockout) ผ่าน SSE Real-time:
  // Inject เข้า lockedAccounts ทันที เพื่อให้ไอคอนแม่กุญแจ <FaLock /> Locked เด้งขึ้นมาแบบ 0 วินาที
  useEffect(() => {
    if (!latestSecurityAlert) return
    console.log('[UserManagement] Real-time Security Alert triggered:', latestSecurityAlert)
    const { user_id, username, locked_for_seconds, village_id } = latestSecurityAlert
    const resolvedUserId = user_id || users.find((u) => u.username === username)?.id
    const unlockedAt = new Date(Date.now() + (Number(locked_for_seconds) || 10) * 1000).toISOString()

    setLockedAccounts((prev) => {
      const next = prev.filter((entry) => {
        if (resolvedUserId && String(entry.user_id) === String(resolvedUserId)) return false
        if (username && entry.username === username) return false
        return true
      })
      return [
        ...next,
        {
          user_id: resolvedUserId || user_id,
          username: username || (resolvedUserId ? users.find((u) => u.id === resolvedUserId)?.username : undefined),
          unlocked_at: unlockedAt,
          village_id
        }
      ]
    })

    const timer = setTimeout(() => {
      fetchLockedAccounts()
    }, 400)
    return () => clearTimeout(timer)
  }, [latestSecurityAlert, fetchLockedAccounts, users])

  // คำนวณจำนวน Online Now: Superadmin เห็นทุกคนทั่วระบบ / Admin เห็นเฉพาะ User และ Admin ในหมู่บ้านตนเอง
  const onlineCount = useMemo(() => {
    if (isSuperadmin) {
      return onlineUserIds.size
    }
    return users.filter((u) => u.role !== 'superadmin' && onlineUserIds.has(u.id)).length
  }, [isSuperadmin, onlineUserIds, users])

  // map user_id & username -> unlocked_at (เวลาที่จะปลดล็อคอัตโนมัติ) เพื่อ lookup เร็วๆ ตอน render ตาราง
  const lockedMap = useMemo(() => {
    const map = new Map()
    const now = Date.now()
    lockedAccounts.forEach((entry) => {
      if (!isSuperadmin && entry.role === 'superadmin') return
      if (entry.unlocked_at && new Date(entry.unlocked_at).getTime() <= now) return
      if (entry.user_id) {
        map.set(String(entry.user_id), entry.unlocked_at)
      }
      if (entry.username) {
        map.set(`user:${entry.username}`, entry.unlocked_at)
      }
    })
    return map
  }, [lockedAccounts, isSuperadmin])

  // ดึงหมู่บ้านทั้งหมด (รวม inactive) — เฉพาะ superadmin เท่านั้นที่เห็นตารางนี้
  // แยกจาก useVillageStore เพราะ store นั้นดึงมาแค่ active สำหรับ dropdown เลือกหมู่บ้าน
  const fetchVillagesList = useCallback(async () => {
    if (!isSuperadmin) return
    setIsLoadingVillagesList(true)
    try {
      const data = await getVillagesAPI({ page: 1, pageSize: 100 }) // ไม่ส่ง isActive = ได้ทั้งหมด
      setVillagesList(data.items)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลหมู่บ้านไม่สำเร็จ',
        text: 'กรุณาลองรีเฟรชหน้าใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsLoadingVillagesList(false)
    }
  }, [isSuperadmin])

  useEffect(() => {
    fetchVillagesList()
  }, [fetchVillagesList])

  function openAddModal(role) {
    setAddRole(role)
    setFormData({
      ...EMPTY_FORM,
      // admin สร้าง user ได้แค่ในหมู่บ้านตัวเองเท่านั้น
      villageId: currentUser?.role === 'admin' ? currentUser.village_id : ''
    })
    setTouchedFields({})
    setHasSubmittedUserForm(false)
    setShowFormModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setTouchedFields((prev) => ({ ...prev, [name]: true }))
    if (name === 'fullname') {
      setFormData((prev) => ({ ...prev, fullname: filterThaiEnglishName(value) }))
      return
    }
    if (name === 'phone') {
      setFormData((prev) => ({ ...prev, phone: formatPhoneInput(value) }))
      return
    }
    setFormData((prev) => ({ ...prev, [name]: stripEmoji(value) }))
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    setHasSubmittedUserForm(true)

    if (!isUserFormValid) {
      const firstError = Object.values(userFormErrors)[0]
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: firstError || 'กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const trimmedUser = formData.username.trim()
    const trimmedName = formData.fullname.trim()
    const trimmedEmail = formData.email.trim()
    const trimmedPhone = formData.phone.trim()

    setIsSubmitting(true)
    try {
      const newUser = await createUserAPI({
        username: trimmedUser,
        fullname: trimmedName,
        email: trimmedEmail,
        role: addRole,
        villageId: formData.villageId
      })

      if (trimmedPhone) {
        try {
          await createContactAPI({
            userId: newUser.id,
            contentType: 'phone',
            value: trimmedPhone
          })
        } catch (contactError) {
          console.error(contactError)
          // สร้าง user สำเร็จแล้ว แค่เบอร์โทรพลาด ไม่ต้อง rollback user แค่แจ้งเตือนแยก
          Swal.fire({
            icon: 'warning',
            title: 'สร้างผู้ใช้สำเร็จ แต่บันทึกเบอร์โทรไม่สำเร็จ',
            text: 'กรุณาเพิ่มเบอร์โทรภายหลังผ่านหน้ารายละเอียดผู้ใช้',
            confirmButtonColor: 'var(--sidebar-bg)'
          })
          setShowFormModal(false)
          fetchUsers()
          return
        }
      }

      Swal.fire({
        icon: 'success',
        title: addRole === 'admin' ? 'เพิ่มบัญชี Admin แล้ว' : 'เพิ่มผู้ใช้ใหม่แล้ว',
        text: 'ระบบได้ส่งคำเชิญไปที่อีเมลของผู้ใช้แล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      setShowFormModal(false)
      fetchUsers()
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'สร้างผู้ใช้ไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle เปิด/ปิดบัญชี — แทนที่ปุ่ม Edit เดิม เพราะ API แก้ได้แค่ is_active
  async function handleToggleActive(targetUser) {
    if (targetUser.id === currentUser?.id) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่สามารถทำรายการได้',
        text: 'ไม่สามารถปิดการใช้งานบัญชีของตนเองได้',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }
    if (!isSuperadmin && targetUser.role === 'superadmin') {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีสิทธิ์ทำรายการ',
        text: 'Admin ไม่มีสิทธิ์เปลี่ยนสถานะของ Superadmin',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const willActivate = !targetUser.is_active
    const result = await Swal.fire({
      icon: 'question',
      title: willActivate ? 'เปิดใช้งานบัญชีนี้?' : 'ปิดใช้งานบัญชีนี้?',
      text: `บัญชี "${targetUser.username}" จะถูก${willActivate ? 'เปิด' : 'ปิด'}การใช้งาน`,
      showCancelButton: true,
      confirmButtonText: willActivate ? 'เปิดใช้งาน' : 'ปิดใช้งาน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: willActivate ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })
    if (!result.isConfirmed) return

    try {
      await updateUserStatusAPI(targetUser.id, willActivate)
      Swal.fire({
        icon: 'success',
        title: willActivate ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว',
        showConfirmButton: false,
        timer: 1200
      })
      fetchUsers()
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ทำรายการไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  async function handleDelete(targetUser) {
    if (targetUser.id === currentUser?.id) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่สามารถลบได้',
        text: 'ไม่สามารถลบบัญชีของตนเองได้',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }
    if (!isSuperadmin && targetUser.role === 'superadmin') {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีสิทธิ์ทำรายการ',
        text: 'Admin ไม่มีสิทธิ์ลบบัญชีของ Superadmin',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบผู้ใช้',
      text: `ต้องการลบบัญชี "${targetUser.username}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })
    if (!result.isConfirmed) return

    try {
      await deleteUserAPI(targetUser.id)
      Swal.fire({ icon: 'success', title: 'ลบผู้ใช้แล้ว', confirmButtonColor: 'var(--sidebar-bg)' })
      fetchUsers()
    } catch (error) {
      const status = error.response?.status
      const detail = error.response?.data?.detail

      // 409 = มีข้อมูลผูกกับ user นี้อยู่ ลบตรง ๆ ไม่ได้
      if (status === 409) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถลบได้',
          text: typeof detail === 'string'
            ? detail
            : 'ผู้ใช้นี้ยังมีข้อมูลผูกอยู่ในระบบ ไม่สามารถลบได้',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } else {
        Swal.fire({
          icon: 'error',
          title: 'ลบไม่สำเร็จ',
          text: typeof detail === 'string' ? detail : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }
    }
  }

  function openResetModal(targetUser) {
    if (!isSuperadmin && targetUser.role === 'superadmin') {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีสิทธิ์ทำรายการ',
        text: 'Admin ไม่มีสิทธิ์รีเซ็ตรหัสผ่านของ Superadmin',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }
    setResetTargetUser(targetUser)
    setResetForm(EMPTY_RESET_FORM)
  }

  function handleResetFormChange(e) {
    const { name, value } = e.target
    setResetForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleResetSubmit(e) {
    e.preventDefault()

    const newPass = resetForm.newPassword
    const confPass = resetForm.confirmPassword

    if (!newPass) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกรหัสผ่านใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!isPasswordValid(newPass)) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านใหม่ยังไม่ตรงตามเงื่อนไข',
        text: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวอักษร ตัวเลข และอักขระพิเศษ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!confPass) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณายืนยันรหัสผ่านใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (newPass !== confPass) {
      Swal.fire({
        icon: 'warning',
        title: 'รหัสผ่านไม่ตรงกัน',
        text: 'กรุณากรอกรหัสผ่านยืนยันให้ตรงกับรหัสผ่านใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsResetting(true)
    try {
      await resetUserPasswordAPI(resetTargetUser.id, newPass, confPass)
      Swal.fire({
        icon: 'success',
        title: 'รีเซ็ตรหัสผ่านสำเร็จ',
        text: `ตั้งรหัสผ่านใหม่ให้ "${resetTargetUser.username}" แล้ว`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      setResetTargetUser(null)
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'รีเซ็ตรหัสผ่านไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsResetting(false)
    }
  }

  // ส่งอีเมลคำเชิญตั้งรหัสผ่านให้ผู้ใช้อีกครั้ง
  async function handleResendInvite(user) {
    const result = await Swal.fire({
      icon: 'question',
      title: 'ส่งคำเชิญอีกครั้ง?',
      html: `ต้องการส่งอีเมลคำเชิญเพื่อตั้งรหัสผ่านให้ <strong>${user.username}</strong>${user.email ? ` (${user.email})` : ''} อีกครั้งใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ส่งคำเชิญ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(37, 99, 235)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (!result.isConfirmed) return

    try {
      await resendInviteAPI(user.id)
      Swal.fire({
        icon: 'success',
        title: 'ส่งคำเชิญสำเร็จ',
        text: `ระบบได้ส่งลิงก์ตั้งรหัสผ่านไปยังอีเมลของ "${user.username}" เรียบร้อยแล้ว`,
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'ส่งคำเชิญไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาดในการส่งคำเชิญ กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  // ปลดล็อคบัญชีผู้ใช้ที่ถูกระงับชั่วคราวจากการพิมพ์รหัสผ่านผิด
  async function handleUnlockAccount(targetUser) {
    if (!targetUser) return
    const result = await Swal.fire({
      title: `ปลดล็อคบัญชี ${targetUser.username}?`,
      text: 'บัญชีนี้จะสามารถเข้าสู่ระบบได้ทันที และรีเซ็ตจำนวนครั้งที่ล็อกอินผิดกลับเป็นค่าเริ่มต้น',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: 'var(--sidebar-bg, #1b2a47)',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'ยืนยันปลดล็อค',
      cancelButtonText: 'ยกเลิก'
    })

    if (!result.isConfirmed) return

    try {
      await unlockUserAccountAPI(targetUser.id)
      // อัปเดต state ทันทีแบบ Real-time โดยไม่ต้องรีเฟรชหน้า
      setLockedAccounts((prev) =>
        prev.filter((entry) => String(entry.user_id) !== String(targetUser.id) && entry.username !== targetUser.username)
      )
      Swal.fire({
        icon: 'success',
        title: 'ปลดล็อคสำเร็จ',
        text: `ปลดล็อคบัญชี "${targetUser.username}" เรียบร้อยแล้ว`,
        confirmButtonColor: 'var(--sidebar-bg, #1b2a47)',
        timer: 1500
      })
    } catch (error) {
      console.error('Unlock account error:', error)
      const errorMsg = error?.response?.data?.detail || 'เกิดข้อผิดพลาดในการปลดล็อคบัญชี กรุณาลองใหม่อีกครั้ง'
      Swal.fire({
        icon: 'error',
        title: 'ปลดล็อคไม่สำเร็จ',
        text: typeof errorMsg === 'string' ? errorMsg : 'เกิดข้อผิดพลาดในการปลดล็อคบัญชี',
        confirmButtonColor: 'var(--sidebar-bg, #1b2a47)'
      })
    }
  }

  function openAddVillageModal() {
    setEditingVillage(null)
    setVillageFormData(EMPTY_VILLAGE_FORM)
    setVillageTouchedFields({})
    setHasSubmittedVillageForm(false)
    setShowVillageModal(true)
  }

  function openEditVillageModal(village) {
    setEditingVillage(village)
    setVillageFormData({ name: village.name || '', address: village.address || '' })
    setVillageTouchedFields({})
    setHasSubmittedVillageForm(false)
    setShowVillageModal(true)
  }

  function handleVillageFormChange(e) {
    const { name, value } = e.target
    setVillageTouchedFields((prev) => ({ ...prev, [name]: true }))
    setVillageFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleVillageFormSubmit(e) {
    e.preventDefault()
    setHasSubmittedVillageForm(true)

    if (!isVillageFormValid) {
      const firstError = Object.values(villageFormErrors)[0]
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ถูกต้อง',
        text: firstError || 'กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const villageName = villageFormData.name.trim()
    const villageAddress = villageFormData.address.trim()

    setIsSubmittingVillage(true)
    try {
      if (editingVillage) {
        await updateVillageAPI(editingVillage.id, { name: villageName, address: villageAddress })
        Swal.fire({ icon: 'success', title: 'แก้ไขข้อมูลหมู่บ้านแล้ว', confirmButtonColor: 'var(--sidebar-bg)' })
      } else {
        await createVillageAPI(villageName, villageAddress)
        Swal.fire({ icon: 'success', title: 'เพิ่มหมู่บ้านแล้ว', confirmButtonColor: 'var(--sidebar-bg)' })
      }

      setShowVillageModal(false)
      setVillageFormData(EMPTY_VILLAGE_FORM)
      setEditingVillage(null)
      fetchVillagesList()
      useVillageStore.getState().fetchVillages(true) // force refresh dropdown บน Navbar ด้วย
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: editingVillage ? 'แก้ไขไม่สำเร็จ' : 'เพิ่มหมู่บ้านไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsSubmittingVillage(false)
    }
  }

  // ปิด modal ต่าง ๆ เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (profileUser) {
          setProfileUser(null)
        } else if (showFormModal && !isSubmitting) {
          setShowFormModal(false)
        } else if (resetTargetUser && !isResetting) {
          setResetTargetUser(null)
        } else if (showVillageModal && !isSubmittingVillage) {
          setShowVillageModal(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [profileUser, showFormModal, isSubmitting, resetTargetUser, isResetting, showVillageModal, isSubmittingVillage])

  // Suspend / Activate พร้อมข้อความเตือนชัดเจน
  async function handleToggleVillageActive(village) {
    const willActivate = !village.is_active

    const result = await Swal.fire({
      icon: 'warning',
      title: willActivate ? 'เปิดใช้งานหมู่บ้านนี้?' : 'ระงับการใช้งานหมู่บ้านนี้?',
      html: willActivate
        ? `หมู่บ้าน <strong>${village.name}</strong> จะกลับมาใช้งานได้ตามปกติ`
        : `หมู่บ้าน <strong>${village.name}</strong> จะถูกระงับการใช้งาน<br/>ผู้ใช้และกล้องในหมู่บ้านนี้จะไม่สามารถใช้งานได้จนกว่าจะเปิดใช้งานอีกครั้ง`,
      showCancelButton: true,
      confirmButtonText: willActivate ? 'เปิดใช้งาน' : 'ยืนยันระงับ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: willActivate ? 'rgb(22, 163, 74)' : 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (!result.isConfirmed) return

    try {
      await updateVillageAPI(village.id, { isActive: willActivate })
      Swal.fire({
        icon: 'success',
        title: willActivate ? 'เปิดใช้งานแล้ว' : 'ระงับการใช้งานแล้ว',
        showConfirmButton: false,
        timer: 1200
      })
      fetchVillagesList()
      useVillageStore.getState().fetchVillages(true) // force refresh dropdown บน Navbar ด้วย
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: 'ทำรายการไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  // ลบหมู่บ้านถาวร — ต่างจาก Suspend (handleToggleVillageActive) ที่แค่ปิดการใช้งานชั่วคราว
  // ถ้าหมู่บ้านนี้ยังมี user/กล้องผูกอยู่ backend มักตอบ 409 กลับมา (เหมือน pattern handleDelete ของ user)
  async function handleDeleteVillage(village) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบโครงการหมู่บ้าน',
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: var(--text-main, #334155);">
          <p style="margin-bottom: 8px;">คุณต้องการลบโครงการ <strong>${village.name}</strong> ใช่หรือไม่?</p>
          <p style="margin-bottom: 14px; color: #64748b; font-size: 13px;">
            หากท่านยืนยันที่จะลบ กรุณาทำเครื่องหมายถูกในช่องสี่เหลี่ยมด้านล่าง ไม่เช่นนั้นจะไม่สามารถทำการลบได้
          </p>
          <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; user-select: none; font-size: 14px; font-weight: 500; padding: 10px 14px; background: rgba(27, 42, 71, 0.04); border: 1px solid rgba(27, 42, 71, 0.15); border-radius: 8px;">
            <input type="checkbox" id="swal-confirm-delete-village" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--sidebar-bg, #1b2a47);" />
            <span style="color: var(--text-main, #1b2a47);">ยืนยันที่จะลบ</span>
          </label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg, #64748b)',
      focusCancel: true,
      didOpen: () => {
        const confirmBtn = Swal.getConfirmButton()
        const checkbox = document.getElementById('swal-confirm-delete-village')
        if (confirmBtn && checkbox) {
          confirmBtn.disabled = true
          confirmBtn.style.opacity = '0.5'
          confirmBtn.style.cursor = 'not-allowed'
          checkbox.addEventListener('change', (e) => {
            confirmBtn.disabled = !e.target.checked
            confirmBtn.style.opacity = e.target.checked ? '1' : '0.5'
            confirmBtn.style.cursor = e.target.checked ? 'pointer' : 'not-allowed'
          })
        }
      },
      preConfirm: () => {
        const checkbox = document.getElementById('swal-confirm-delete-village')
        if (!checkbox || !checkbox.checked) {
          Swal.showValidationMessage('กรุณาทำเครื่องหมายถูกเพื่อยืนยันการลบ')
          return false
        }
        return true
      }
    })

    if (!result.isConfirmed) return

    try {
      await deleteVillageAPI(village.id, true)
      Swal.fire({
        icon: 'success',
        title: 'ลบโครงการหมู่บ้านแล้ว',
        showConfirmButton: false,
        timer: 1500
      })
      fetchVillagesList()
      useVillageStore.getState().fetchVillages(true) // force refresh dropdown บน Navbar ด้วย
    } catch (error) {
      console.error(error)
      const status = error.response?.status
      const backendMessage = error.response?.data?.detail

      // 409 = ยังมีข้อมูล (user/กล้อง) ผูกกับหมู่บ้านนี้อยู่ ลบตรงๆ ไม่ได้
      if (status === 409) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถลบได้',
          text: typeof backendMessage === 'string'
            ? backendMessage
            : 'หมู่บ้านนี้ยังมีผู้ใช้หรือกล้องผูกอยู่ในระบบ กรุณาย้ายหรือลบข้อมูลเหล่านั้นก่อน',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } else {
        Swal.fire({
          icon: 'error',
          title: 'ลบไม่สำเร็จ',
          text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const visiblePages = getVisiblePageNumbers(currentPage, totalPages, MAX_VISIBLE_PAGES)

  return (
    <Layout title="User Management">
      <div className="um-wrapper">

        {/* KPI Cards */}
        <div className="um-kpi-row">
          <div className="um-kpi-card">
            <div className="um-kpi-icon blue"><FaUsers /></div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">Total Users</p>
              <h2 className="um-kpi-val">{kpiLoading ? '—' : totalUsers.toLocaleString()}</h2>
            </div>
          </div>
          <div className="um-kpi-card">
            <div className="um-kpi-icon green"><FaUserCheck /></div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">Active</p>
              <h2 className="um-kpi-val">{kpiLoading ? '—' : activeUsers.toLocaleString()}</h2>
            </div>
          </div>
          {/* KPI ใหม่ — จำนวนคนออนไลน์อยู่ตอนนี้ ดึงจาก presence stream (SSE) ไม่ได้ยิง API เพิ่ม */}
          <div className="um-kpi-card">
            <div className="um-kpi-icon green"><FaCircleCheck /></div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">Online Now</p>
              <h2 className="um-kpi-val">{onlineCount.toLocaleString()}</h2>
            </div>
          </div>
          <div className="um-kpi-card">
            <div className="um-kpi-icon orange"><FaCity /></div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">Village Scope</p>
              <h2 className="um-kpi-val" style={{ fontSize: 18 }}>
                {isSuperadmin
                  ? (selectedVillageId ? getVillageName(selectedVillageId) : 'ทุกหมู่บ้าน')
                  : getVillageName(currentUser?.village_id)}
              </h2>
            </div>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="um-table-header">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>User List</h3>
              <p className="um-description">
                รายชื่อผู้ใช้งานทั้งหมดในระบบ — สร้างบัญชีใหม่จะส่งคำเชิญไปทางอีเมลอัตโนมัติ
              </p>
            </div>
            <div className="um-header-actions">
              {CAN_ADD_VILLAGE_ROLES.includes(currentUser?.role) && (
                <button className="btn-add-village" onClick={openAddVillageModal}>
                  <FaCity /> Add Village
                </button>
              )}
              <button className="btn-add-user" onClick={() => openAddModal('user')}>
                <FaUserPlus /> Add User
              </button>
              {CAN_ADD_ADMIN_ROLES.includes(currentUser?.role) && (
                <button className="btn-add-admin" onClick={() => openAddModal('admin')}>
                  <FaUserShield /> Add Admin
                </button>
              )}
            </div>
          </div>

          <div className="um-filters">
            {isSuperadmin && (
              <select value={villageFilter} onChange={(e) => setVillageFilter(e.target.value)}>
                <option value="all">All Villages</option>
                {villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              {isSuperadmin && <option value="superadmin">Superadmin</option>}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="um-search-wrap">
              <FaSearch className="um-search-icon" />
              <input
                type="text"
                placeholder="ค้นหา username..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="um-search-input"
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="um-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  {isSuperadmin && <th>Village</th>}
                  <th>Status</th>
                  <th>Online</th>
                  <th>Verified</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={isSuperadmin ? 8 : 7}><Spinner text="Loading users..." /></td></tr>
                ) : users.length > 0 ? (
                  users.map((u) => {
                    const isSelf = u.id === currentUser?.id
                    const isAdminTargetingSuperadmin = !isSuperadmin && u.role === 'superadmin'
                    const isUserLocked = lockedMap.has(String(u.id)) || lockedMap.has(`user:${u.username}`)
                    const lockExpiry = lockedMap.get(String(u.id)) || lockedMap.get(`user:${u.username}`)

                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="um-user-cell">
                            <div className="um-mini-avatar">{u.username.charAt(0).toUpperCase()}</div>
                            <div className="um-username">{u.username}</div>
                          </div>
                        </td>
                        <td><span className={`um-badge um-badge-${u.role}`}>{u.role}</span></td>
                        {isSuperadmin && (
                          <td>
                            {u.role === 'superadmin' ? (
                              <span style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>Global</span>
                            ) : (() => {
                              const vId = u.village_id ?? u.villageId ?? u.village?.id
                              const vName = u.village_name ?? u.villageName ?? u.village?.name ?? (vId ? getVillageName(vId) : null)
                              return renderVillage(vId, vName && vName !== '-' ? vName : undefined)
                            })()}
                          </td>
                        )}
                        <td>
                          <span className={`um-status-dot ${u.is_active ? 'active' : 'inactive'}`}></span>
                          {u.is_active ? 'Active' : 'Inactive'}
                          {isUserLocked && (
                            <span
                              className="um-locked-badge"
                              title={
                                lockExpiry
                                  ? `ปลดล็อคอัตโนมัติ: ${new Date(lockExpiry).toLocaleTimeString('th-TH')}`
                                  : undefined
                              }
                            >
                              <FaLock /> Locked
                            </span>
                          )}
                        </td>
                        <td>
                          {/* สถานะ Online/Offline — แยกจากคอลัมน์ Status ข้างบนโดยสิ้นเชิง มาจาก presence SSE แบบ real-time
                              ไม่เกี่ยวกับ is_active เลย: ปิดบัญชี (Inactive) แต่ยังเปิดแท็บค้างอยู่ก็ยังโชว์ Online ได้ */}
                          <span className={`um-status-dot ${onlineUserIds.has(u.id) ? 'active' : 'inactive'}`}></span>
                          {onlineUserIds.has(u.id) ? 'Online' : 'Offline'}
                        </td>
                        <td>
                          {u.is_verify
                            ? <FaCircleCheck style={{ color: 'rgb(22,163,74)' }} title="Verified" />
                            : <FaCircleXmark style={{ color: 'rgb(148,163,184)' }} title="Not verified" />}
                        </td>
                        <td>{formatDate(u.created_at)}</td>
                        <td>
                          <ActionMenu
                            items={[
                              {
                                key: 'view-profile',
                                label: 'ดูโปรไฟล์',
                                icon: <FaIdCard />,
                                onClick: () => setProfileUser(u)
                              },
                              {
                                key: 'toggle-active',
                                label: u.is_active ? 'ปิดใช้งานบัญชี' : 'เปิดใช้งานบัญชี',
                                icon: u.is_active ? <FaToggleOff /> : <FaToggleOn />,
                                hidden: isSelf || isAdminTargetingSuperadmin,
                                onClick: () => handleToggleActive(u)
                              },
                              {
                                key: 'unlock',
                                label: 'ปลดล็อคบัญชี',
                                icon: <FaLockOpen />,
                                hidden: !isUserLocked,
                                disabled: isAdminTargetingSuperadmin,
                                title: isAdminTargetingSuperadmin
                                  ? 'ไม่มีสิทธิ์ปลดล็อคบัญชี Superadmin'
                                  : undefined,
                                onClick: () => handleUnlockAccount(u)
                              },
                              {
                                key: 'resend-invite',
                                label: 'ส่งคำเชิญอีกครั้ง',
                                icon: <FaPaperPlane />,
                                hidden: u.is_verify,
                                disabled: isAdminTargetingSuperadmin,
                                title: isAdminTargetingSuperadmin
                                  ? 'ไม่มีสิทธิ์ส่งคำเชิญให้ Superadmin'
                                  : undefined,
                                onClick: () => handleResendInvite(u)
                              },
                              {
                                key: 'reset-password',
                                label: 'Reset Password',
                                icon: <FaKey />,
                                hidden: u.role === 'superadmin' || !u.is_verify,
                                disabled: isAdminTargetingSuperadmin,
                                title: isAdminTargetingSuperadmin
                                  ? 'ไม่มีสิทธิ์รีเซ็ตรหัสผ่าน Superadmin'
                                  : undefined,
                                onClick: () => openResetModal(u)
                              },
                              {
                                key: 'delete',
                                label: 'ลบผู้ใช้',
                                icon: <FaTrashCan />,
                                danger: true,
                                hidden: isSelf || isAdminTargetingSuperadmin,
                                onClick: () => handleDelete(u)
                              }
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={isSuperadmin ? 8 : 7}>
                      <EmptyState icon={<FaUsers />} title="No users found" description="Try changing the filter or search keyword" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="um-table-footer">
            <p className="um-total-count">Showing {users.length} of {total.toLocaleString()} users</p>
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

        {/* Village Management — เฉพาะ Superadmin */}
        {isSuperadmin && (
          <div className="content-card">
            <div className="um-table-header">
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>Village Management</h3>
                <p className="um-description">
                  จัดการหมู่บ้านทั้งหมดในระบบ — เพิ่มหมู่บ้านใหม่ หรือระงับการใช้งานหมู่บ้านที่ไม่ใช้แล้ว
                </p>
              </div>
              <button className="btn-add-village" onClick={openAddVillageModal}>
                <FaCity /> Add Village
              </button>
            </div>

            <div className="table-responsive">
              <table className="um-table">
                <thead>
                  <tr>
                    <th>Village Name</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingVillagesList ? (
                    <tr><td colSpan={5}><Spinner text="Loading villages..." /></td></tr>
                  ) : villagesList.length > 0 ? (
                    villagesList.map((v) => (
                      <tr key={v.id}>
                        <td className="um-username">
                          <span style={{ fontWeight: 600 }}>{v.name}</span>
                        </td>
                        <td style={{ color: v.address && v.address !== '-' ? 'var(--text-primary)' : 'var(--text-secondary, #94a3b8)', fontSize: '13px', maxWidth: '260px' }}>
                          {v.address && v.address !== '-' ? v.address : '-'}
                        </td>
                        <td>
                          <span className={`um-status-dot ${v.is_active ? 'active' : 'inactive'}`}></span>
                          {v.is_active ? 'Active' : 'Suspended'}
                        </td>
                        <td>{formatDate(v.created_at)}</td>
                        <td>
                          <div className="um-actions">
                            <button className="um-icon-btn edit" onClick={() => setSelectedVillageForDetail(v)} title="ดูรายละเอียดหมู่บ้าน">
                              <FaEye />
                            </button>
                            <button className="um-icon-btn edit" onClick={() => openEditVillageModal(v)} title="แก้ไขชื่อหมู่บ้าน">
                              <FaPen />
                            </button>
                            <button
                              className={v.is_active ? 'um-icon-btn delete' : 'um-icon-btn reset'}
                              onClick={() => handleToggleVillageActive(v)}
                              title={v.is_active ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
                            >
                              {v.is_active ? <FaToggleOn /> : <FaToggleOff />}
                            </button>
                            <button
                              className="um-icon-btn delete"
                              onClick={() => handleDeleteVillage(v)}
                              title="ลบหมู่บ้าน"
                            >
                              <FaTrashCan />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState icon={<FaCity />} title="No villages found" description="ยังไม่มีหมู่บ้านในระบบ" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Add User */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{addRole === 'admin' ? 'Add New Admin' : 'Add New User'}</h3>
              <button className="modal-close" onClick={() => setShowFormModal(false)}><FaXmark /></button>
            </div>
            <form className="um-form" onSubmit={handleFormSubmit} noValidate>
              <div className="um-form-field">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  placeholder="เช่น user_01, admin-polo, john@polo (4-36 ตัวอักษร)"
                  maxLength={36}
                  value={formData.username}
                  onChange={handleFormChange}
                  className={(touchedFields.username || hasSubmittedUserForm) && userFormErrors.username ? 'um-input-error' : ''}
                />
                {(touchedFields.username || hasSubmittedUserForm) && userFormErrors.username ? (
                  <p className="um-field-error">{userFormErrors.username}</p>
                ) : (
                  <p className="um-role-hint">อนุญาตเฉพาะตัวอักษรภาษาอังกฤษ, ตัวเลข, @, - และ _</p>
                )}
              </div>

              <div className="um-form-field">
                <label>ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  name="fullname"
                  placeholder="กรอกชื่อ-นามสกุลจริง เช่น สมชาย กิจเจริญ (2-50 ตัวอักษร)"
                  maxLength={50}
                  value={formData.fullname}
                  onChange={handleFormChange}
                  className={(touchedFields.fullname || hasSubmittedUserForm) && userFormErrors.fullname ? 'um-input-error' : ''}
                />
                {(touchedFields.fullname || hasSubmittedUserForm) && userFormErrors.fullname && (
                  <p className="um-field-error">{userFormErrors.fullname}</p>
                )}
              </div>

              <div className="um-form-field">
                <label>อีเมล</label>
                <input
                  type="email"
                  name="email"
                  placeholder="กรอกอีเมล เช่น user@example.com"
                  value={formData.email}
                  onChange={handleFormChange}
                  className={(touchedFields.email || hasSubmittedUserForm) && userFormErrors.email ? 'um-input-error' : ''}
                />
                {(touchedFields.email || hasSubmittedUserForm) && userFormErrors.email ? (
                  <p className="um-field-error">{userFormErrors.email}</p>
                ) : (
                  <p className="um-role-hint">ระบบจะส่งคำเชิญให้ตั้งรหัสผ่านไปที่อีเมลนี้</p>
                )}
              </div>

              <div className="um-form-field">
                <label>เบอร์โทรศัพท์ (10 หลัก)</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="เช่น 089-123-4567"
                  maxLength={12}
                  value={formData.phone}
                  onChange={handleFormChange}
                  className={(touchedFields.phone || hasSubmittedUserForm) && userFormErrors.phone ? 'um-input-error' : ''}
                />
                {(touchedFields.phone || hasSubmittedUserForm) && userFormErrors.phone && (
                  <p className="um-field-error">{userFormErrors.phone}</p>
                )}
              </div>

              <div className="um-form-field">
                <label>หมู่บ้าน</label>
                {isAdmin ? (
                  <input type="text" value={getVillageName(currentUser?.village_id)} disabled />
                ) : (
                  <select
                    name="villageId"
                    value={formData.villageId}
                    onChange={handleFormChange}
                    className={(touchedFields.villageId || hasSubmittedUserForm) && userFormErrors.villageId ? 'um-input-error' : ''}
                  >
                    <option value="">-- เลือกหมู่บ้าน --</option>
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                )}
                {(touchedFields.villageId || hasSubmittedUserForm) && userFormErrors.villageId ? (
                  <p className="um-field-error">{userFormErrors.villageId}</p>
                ) : (
                  <p className="um-role-hint">
                    {isAdmin
                      ? 'ล็อกไว้ที่หมู่บ้านของคุณ เนื่องจาก Admin สร้างผู้ใช้ได้เฉพาะหมู่บ้านตัวเอง'
                      : 'Superadmin ต้องเลือกหมู่บ้านให้ผู้ใช้ใหม่ก่อนบันทึก'}
                  </p>
                )}
              </div>

              <div className="um-form-field">
                <label>Role</label>
                <input type="text" value={capitalize(addRole)} disabled />
              </div>

              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setShowFormModal(false)} disabled={isSubmitting}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-um" disabled={isSubmitting || (hasSubmittedUserForm && !isUserFormValid)}>
                  {isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {resetTargetUser && (
        <div className="modal-overlay" onClick={() => !isResetting && setResetTargetUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reset Password — {resetTargetUser.username}</h3>
              <button className="modal-close" onClick={() => setResetTargetUser(null)}><FaXmark /></button>
            </div>
            <form className="um-form" onSubmit={handleResetSubmit} noValidate>
              <div className="um-form-field">
                <label>รหัสผ่านใหม่</label>
                <input
                  type="password"
                  name="newPassword"
                  placeholder="กรอกรหัสผ่านใหม่ (เช่น Abcd1234!)"
                  value={resetForm.newPassword}
                  onChange={handleResetFormChange}
                  autoComplete="new-password"
                  className={resetForm.newPassword && !isPasswordValid(resetForm.newPassword) ? 'um-input-error' : ''}
                />
                <PasswordStrengthMeter password={resetForm.newPassword} />
              </div>

              <div className="um-form-field">
                <label>ยืนยันรหัสผ่านใหม่</label>
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="พิมพ์รหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                  value={resetForm.confirmPassword}
                  onChange={handleResetFormChange}
                  autoComplete="new-password"
                  className={
                    resetForm.confirmPassword && resetForm.newPassword !== resetForm.confirmPassword
                      ? 'um-input-error'
                      : ''
                  }
                />
                {resetForm.confirmPassword.length > 0 && (
                  resetForm.newPassword === resetForm.confirmPassword ? (
                    <p className="um-match-success"><FaCircleCheck /> รหัสผ่านตรงกัน</p>
                  ) : (
                    <p className="um-match-error"><FaCircleXmark /> รหัสผ่านไม่ตรงกัน</p>
                  )
                )}
              </div>

              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setResetTargetUser(null)} disabled={isResetting}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-um" disabled={isResetting || !isResetPasswordValid}>
                  {isResetting ? 'กำลังบันทึก...' : 'ยืนยันรีเซ็ต'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add/Edit Village */}
      {showVillageModal && (
        <div className="modal-overlay" onClick={() => !isSubmittingVillage && setShowVillageModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingVillage ? 'Edit Village' : 'Add Village'}</h3>
              <button className="modal-close" onClick={() => setShowVillageModal(false)}><FaXmark /></button>
            </div>
            <form className="um-form" onSubmit={handleVillageFormSubmit} noValidate>
              <div className="um-form-field">
                <label>ชื่อหมู่บ้าน</label>
                <input
                  type="text"
                  name="name"
                  maxLength={36}
                  placeholder="กรอกชื่อหมู่บ้าน (2-36 ตัวอักษร)"
                  value={villageFormData.name}
                  onChange={handleVillageFormChange}
                  className={(villageTouchedFields.name || hasSubmittedVillageForm) && villageFormErrors.name ? 'um-input-error' : ''}
                />
                {(villageTouchedFields.name || hasSubmittedVillageForm) && villageFormErrors.name && (
                  <p className="um-field-error">{villageFormErrors.name}</p>
                )}
              </div>

              <div className="um-form-field">
                <label>ที่อยู่หมู่บ้าน</label>
                <input
                  type="text"
                  name="address"
                  placeholder="กรอกที่อยู่ของหมู่บ้าน เช่น ต.บางแค อ.บางแค กทม. (อย่างน้อย 5 ตัวอักษร)"
                  value={villageFormData.address}
                  onChange={handleVillageFormChange}
                  className={(villageTouchedFields.address || hasSubmittedVillageForm) && villageFormErrors.address ? 'um-input-error' : ''}
                />
                {(villageTouchedFields.address || hasSubmittedVillageForm) && villageFormErrors.address && (
                  <p className="um-field-error">{villageFormErrors.address}</p>
                )}
              </div>

              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setShowVillageModal(false)} disabled={isSubmittingVillage}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-um" disabled={isSubmittingVillage || (hasSubmittedVillageForm && !isVillageFormValid)}>
                  {isSubmittingVillage ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal View Profile */}
      {profileUser && (
        <UserProfileModal user={profileUser} onClose={() => setProfileUser(null)} />
      )}
      {/* Modal View Village Detail */}
      {selectedVillageForDetail && (
        <VillageDetailModal
          village={selectedVillageForDetail}
          onClose={() => setSelectedVillageForDetail(null)}
        />
      )}
    </Layout>
  )
}

export default UserManagement