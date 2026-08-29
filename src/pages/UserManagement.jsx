import { useState, useEffect, useCallback, useMemo } from 'react'
import { FaUsers, FaUserPlus, FaUserShield, FaSearch, FaIdCard } from 'react-icons/fa'
import { FaUserCheck, FaTrashCan, FaKey, FaXmark, FaCity, FaToggleOn, FaToggleOff, FaPaperPlane, FaCircleCheck, FaCircleXmark, FaPen, FaLockOpen, FaLock } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import usePresenceStore from '../store/presenceStore'
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
import ActionMenu from '../components/ActionMenu'
import { filterVisibleUsers } from '../utils/Permissions'
import { isEmailValid, isPasswordValid } from '../utils/passwordPolicy'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400
const MIN_PASSWORD_LENGTH = 8

const CAN_ADD_ADMIN_ROLES = ['superadmin']
const CAN_ADD_VILLAGE_ROLES = ['superadmin']

const EMPTY_FORM = { username: '', fullname: '', email: '', phone: '', villageId: '' }
const EMPTY_VILLAGE_FORM = { name: '', address: '' }
const EMPTY_RESET_FORM = { newPassword: '', confirmPassword: '' }

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

  // สถานะ Online/Offline — แยกจาก is_active (Active/Inactive) โดยสิ้นเชิง
  // is_active มาจาก DB (ปิด/เปิดใช้งานบัญชีผ่านปุ่ม toggle) ส่วน online มาจาก SSE presence stream แบบ real-time
  // เปิด connection เฉพาะตอนอยู่หน้านี้เท่านั้น (ดู useEffect ด้านล่าง) ไม่ผูกกับ login/logout เหมือน alert SSE
  const { onlineUserIds } = usePresenceStore()

  const isSuperadmin = currentUser?.role === 'superadmin'
  const isAdmin = currentUser?.role === 'admin'

  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // all | active | inactive

  // Add User modal
  const [showFormModal, setShowFormModal] = useState(false)
  const [addRole, setAddRole] = useState('user')
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Add/Edit Village modal — null = โหมดเพิ่ม, มีค่า = โหมดแก้ไข
  const [showVillageModal, setShowVillageModal] = useState(false)
  const [editingVillage, setEditingVillage] = useState(null)
  const [villageFormData, setVillageFormData] = useState(EMPTY_VILLAGE_FORM)
  const [isSubmittingVillage, setIsSubmittingVillage] = useState(false)

  // รายการหมู่บ้านทั้งหมด (ไม่กรอง active) สำหรับตารางจัดการ — เฉพาะ superadmin
  const [villagesList, setVillagesList] = useState([])
  const [isLoadingVillagesList, setIsLoadingVillagesList] = useState(true)

  // Reset Password modal — API ต้องการ new_password + confirm ตรงๆ ไม่ auto-generate
  const [resetTargetUser, setResetTargetUser] = useState(null)
  const [resetForm, setResetForm] = useState(EMPTY_RESET_FORM)
  const [isResetting, setIsResetting] = useState(false)

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
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const fetchUsers = useCallback(async () => {
    if (!currentUser) return
    setIsLoading(true)
    try {
      const data = await getUsersAPI({
        villageId: selectedVillageId || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
        search: debouncedSearch || undefined,
        page: 1,
        pageSize: PAGE_SIZE
      })
      // filterVisibleUsers เป็นแค่เกราะกันชั้นสอง — ตัวกรองหลักคือ selectedVillageId
      // ที่ส่งไปกับ request แล้ว (ผูกกับหมู่บ้านของ admin อัตโนมัติ)
      // เผื่อ backend มี edge case ที่ยัง enforce ไม่ครบ (known issue ที่คุยกันไว้)
      console.log('[DEBUG] raw data.items[0]:', data.items[0])
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
  }, [currentUser, selectedVillageId, roleFilter, statusFilter, debouncedSearch])

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
      setLockedAccounts(data)
    } catch (error) {
      console.error(error)
      // ไม่ต้อง alert แจ้งเตือน กันรบกวน — ถ้าพลาดแค่ badge/ปุ่มปลดล็อคจะไม่โชว์ ไม่กระทบการทำงานหลักของหน้า
    } finally {
      setIsLoadingLocked(false)
    }
  }, [currentUser])

  useEffect(() => {
    fetchLockedAccounts()
  }, [fetchLockedAccounts])

  // map user_id -> unlocked_at (เวลาที่จะปลดล็อคอัตโนมัติ) เพื่อ lookup เร็วๆ ตอน render ตาราง
  const lockedMap = useMemo(() => {
    const map = new Map()
    lockedAccounts.forEach((entry) => map.set(entry.user_id, entry.unlocked_at))
    return map
  }, [lockedAccounts])

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
    setShowFormModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    if (name === 'phone') {
      setFormData((prev) => ({ ...prev, phone: formatPhoneInput(value) }))
      return
    }
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleFormSubmit(e) {
    e.preventDefault()

    const trimmedUser = formData.username.trim()
    const trimmedName = formData.fullname.trim()
    const trimmedEmail = formData.email.trim()
    const trimmedPhone = formData.phone.trim()

    if (!trimmedUser) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอก Username',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (trimmedUser.length < 4 || trimmedUser.length > 36) {
      Swal.fire({
        icon: 'warning',
        title: 'Username ไม่ถูกต้อง',
        text: 'Username ต้องมีความยาวระหว่าง 4 - 36 ตัวอักษร',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!trimmedName) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกชื่อ-นามสกุล',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!trimmedEmail) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกอีเมล',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!isEmailValid(trimmedEmail)) {
      Swal.fire({
        icon: 'warning',
        title: 'รูปแบบอีเมลไม่ถูกต้อง',
        text: 'กรุณากรอกอีเมลให้ถูกต้อง เช่น user@example.com',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!trimmedPhone) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกเบอร์โทรศัพท์',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const digitsOnly = trimmedPhone.replace(/\D/g, '')
    if (digitsOnly.length !== 10) {
      Swal.fire({
        icon: 'warning',
        title: 'เบอร์โทรศัพท์ไม่ถูกต้อง',
        text: 'กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก (เช่น 089-123-4567)',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (!formData.villageId) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกหมู่บ้าน',
        text: 'ต้องระบุหมู่บ้านให้ผู้ใช้ก่อนสร้างบัญชี',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

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

  function openAddVillageModal() {
    setEditingVillage(null)
    setVillageFormData(EMPTY_VILLAGE_FORM)
    setShowVillageModal(true)
  }

  function openEditVillageModal(village) {
    setEditingVillage(village)
    setVillageFormData({ name: village.name || '', address: village.address || '' })
    setShowVillageModal(true)
  }

  function handleVillageFormChange(e) {
    const { name, value } = e.target
    setVillageFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleVillageFormSubmit(e) {
    e.preventDefault()
    const villageName = villageFormData.name.trim()
    const villageAddress = villageFormData.address.trim()

    if (!villageName) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อหมู่บ้าน', confirmButtonColor: 'var(--sidebar-bg)' })
      return
    }
    if (villageName.length > 36) {
      Swal.fire({
        icon: 'warning',
        title: 'ชื่อหมู่บ้านยาวเกินไป',
        text: 'ชื่อหมู่บ้านต้องมีความยาวไม่เกิน 36 ตัวอักษร',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }
    if (!villageAddress) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกที่อยู่ของหมู่บ้าน', confirmButtonColor: 'var(--sidebar-bg)' })
      return
    }

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
      title: 'ยืนยันการลบหมู่บ้าน',
      html: `ต้องการลบหมู่บ้าน <strong>${village.name}</strong> ใช่หรือไม่?<br/>การลบไม่สามารถย้อนกลับได้`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (!result.isConfirmed) return

    try {
      await deleteVillageAPI(village.id)
      Swal.fire({
        icon: 'success',
        title: 'ลบหมู่บ้านแล้ว',
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
              <h2 className="um-kpi-val">{onlineUserIds.size.toLocaleString()}</h2>
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
              <button
                className="btn-add-village"
                disabled={!CAN_ADD_VILLAGE_ROLES.includes(currentUser?.role)}
                onClick={() => CAN_ADD_VILLAGE_ROLES.includes(currentUser?.role) && openAddVillageModal()}
                title={!CAN_ADD_VILLAGE_ROLES.includes(currentUser?.role) ? 'เฉพาะ Superadmin เท่านั้นที่เพิ่มหมู่บ้านได้' : undefined}
              >
                <FaCity /> Add Village
              </button>
              <button className="btn-add-user" onClick={() => openAddModal('user')}>
                <FaUserPlus /> Add User
              </button>
              <button
                className="btn-add-admin"
                disabled={!CAN_ADD_ADMIN_ROLES.includes(currentUser?.role)}
                onClick={() => CAN_ADD_ADMIN_ROLES.includes(currentUser?.role) && openAddModal('admin')}
                title={!CAN_ADD_ADMIN_ROLES.includes(currentUser?.role) ? 'เฉพาะ Superadmin เท่านั้นที่เพิ่มบัญชี Admin ได้' : undefined}
              >
                <FaUserShield /> Add Admin
              </button>
            </div>
          </div>

          <div className="um-filters">
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
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="table-responsive">
            <table className="um-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Online</th>
                  <th>Verified</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7}><Spinner text="Loading users..." /></td></tr>
                ) : users.length > 0 ? (
                  users.map((u) => {
                    const isSelf = u.id === currentUser?.id
                    const isAdminTargetingSuperadmin = !isSuperadmin && u.role === 'superadmin'

                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="um-user-cell">
                            <div className="um-mini-avatar">{u.username.charAt(0).toUpperCase()}</div>
                            <div className="um-username">{u.username}</div>
                          </div>
                        </td>
                        <td><span className={`um-badge um-badge-${u.role}`}>{u.role}</span></td>
                        <td>
                          <span className={`um-status-dot ${u.is_active ? 'active' : 'inactive'}`}></span>
                          {u.is_active ? 'Active' : 'Inactive'}
                          {lockedMap.has(u.id) && (
                            <span
                              className="um-locked-badge"
                              title={
                                lockedMap.get(u.id)
                                  ? `ปลดล็อคอัตโนมัติ: ${new Date(lockedMap.get(u.id)).toLocaleTimeString('th-TH')}`
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
                                disabled: isSelf || isAdminTargetingSuperadmin,
                                title: isSelf
                                  ? 'ไม่สามารถปิดใช้งานบัญชีของตนเองได้'
                                  : isAdminTargetingSuperadmin
                                  ? 'ไม่มีสิทธิ์ปิด/เปิดใช้งานบัญชี Superadmin'
                                  : undefined,
                                onClick: () => handleToggleActive(u)
                              },
                              {
                                key: 'unlock',
                                label: 'ปลดล็อคบัญชี',
                                icon: <FaLockOpen />,
                                hidden: !lockedMap.has(u.id),
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
                                disabled: isSelf || isAdminTargetingSuperadmin,
                                title: isSelf
                                  ? 'ไม่สามารถลบบัญชีของตนเองได้'
                                  : isAdminTargetingSuperadmin
                                  ? 'ไม่มีสิทธิ์ลบบัญชี Superadmin'
                                  : undefined,
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
                    <td colSpan={7}>
                      <EmptyState icon={<FaUsers />} title="No users found" description="Try changing the filter or search keyword" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="um-total-count">Showing {users.length} of {total.toLocaleString()} users</p>
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
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingVillagesList ? (
                    <tr><td colSpan={4}><Spinner text="Loading villages..." /></td></tr>
                  ) : villagesList.length > 0 ? (
                    villagesList.map((v) => (
                      <tr key={v.id}>
                        <td className="um-username">{v.name}</td>
                        <td>
                          <span className={`um-status-dot ${v.is_active ? 'active' : 'inactive'}`}></span>
                          {v.is_active ? 'Active' : 'Suspended'}
                        </td>
                        <td>{formatDate(v.created_at)}</td>
                        <td>
                          <div className="um-actions">
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
                      <td colSpan={4}>
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
            <form className="um-form" onSubmit={handleFormSubmit}>
              <div className="um-form-field">
                <label>Username</label>
                <input type="text" name="username" placeholder="กรอก Username เช่น somchaik (4-36 ตัวอักษร)" maxLength={50} value={formData.username} onChange={handleFormChange} />
              </div>
              <div className="um-form-field">
                <label>ชื่อ-นามสกุล</label>
                <input type="text" name="fullname" placeholder="กรอกชื่อ-นามสกุลจริง เช่น สมชาย กิจเจริญ" value={formData.fullname} onChange={handleFormChange} />
              </div>
              <div className="um-form-field">
                <label>อีเมล</label>
                <input type="email" name="email" placeholder="กรอกอีเมล เช่น user@example.com" value={formData.email} onChange={handleFormChange} />
                <p className="um-role-hint">ระบบจะส่งคำเชิญให้ตั้งรหัสผ่านไปที่อีเมลนี้</p>
              </div>
              <div className="um-form-field">
                <label>เบอร์โทรศัพท์ (10 หลัก)</label>
                <input type="tel" name="phone" placeholder="เช่น 089-123-4567" maxLength={12} value={formData.phone} onChange={handleFormChange} />
              </div>

              <div className="um-form-field">
                <label>หมู่บ้าน</label>
                {isAdmin ? (
                  <input type="text" value={getVillageName(currentUser?.village_id)} disabled />
                ) : (
                  <select name="villageId" value={formData.villageId} onChange={handleFormChange}>
                    <option value="">-- เลือกหมู่บ้าน --</option>
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                )}
                <p className="um-role-hint">
                  {isAdmin
                    ? 'ล็อกไว้ที่หมู่บ้านของคุณ เนื่องจาก Admin สร้างผู้ใช้ได้เฉพาะหมู่บ้านตัวเอง'
                    : 'Superadmin ต้องเลือกหมู่บ้านให้ผู้ใช้ใหม่ก่อนบันทึก'}
                </p>
              </div>

              <div className="um-form-field">
                <label>Role</label>
                <input type="text" value={capitalize(addRole)} disabled />
              </div>

              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setShowFormModal(false)} disabled={isSubmitting}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-um" disabled={isSubmitting}>
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
            <form className="um-form" onSubmit={handleResetSubmit}>
              <div className="um-form-field">
                <label>รหัสผ่านใหม่</label>
                <input
                  type="password" name="newPassword" placeholder="กรอกรหัสผ่านใหม่ (เช่น Abcd1234!)"
                  value={resetForm.newPassword} onChange={handleResetFormChange} autoComplete="new-password"
                />
              </div>
              <div className="um-form-field">
                <label>ยืนยันรหัสผ่านใหม่</label>
                <input
                  type="password" name="confirmPassword" placeholder="พิมพ์รหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                  value={resetForm.confirmPassword} onChange={handleResetFormChange} autoComplete="new-password"
                />
              </div>
              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setResetTargetUser(null)} disabled={isResetting}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-um" disabled={isResetting}>
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
            <form className="um-form" onSubmit={handleVillageFormSubmit}>
              <div className="um-form-field">
                <label>ชื่อหมู่บ้าน</label>
                <input type="text" name="name" maxLength={36} placeholder="กรอกชื่อหมู่บ้าน (ไม่เกิน 36 ตัวอักษร)" value={villageFormData.name} onChange={handleVillageFormChange} />
              </div>
              <div className="um-form-field">
                <label>ที่อยู่หมู่บ้าน</label>
                <input type="text" name="address" placeholder="กรอกที่อยู่ของหมู่บ้าน เช่น ต.บางแค อ.บางแค กทม." value={villageFormData.address} onChange={handleVillageFormChange} />
              </div>
              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setShowVillageModal(false)} disabled={isSubmittingVillage}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-um" disabled={isSubmittingVillage}>
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
    </Layout>
  )
}

export default UserManagement