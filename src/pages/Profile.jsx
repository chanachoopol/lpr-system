import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaShieldAlt, FaCalendarAlt,
  FaFacebook, FaInstagram, FaGlobe, FaCamera, FaEye
} from 'react-icons/fa'
import { FaCircleCheck, FaCircleXmark, FaPlus, FaPen, FaTrashCan, FaXmark, FaCheck, FaEllipsisVertical } from 'react-icons/fa6'
import { SiLine } from 'react-icons/si'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import useAuthStore from '../store/authStore'
import {
  getMyProfileAPI, createContactAPI, updateContactAPI, deleteContactAPI,
  uploadUserAvatarAPI, deleteUserAvatarAPI, getUserAvatarBlobURL,
  updateUserFullnameAPI, requestEmailChangeAPI
} from '../data/api'
import { getEmailErrorMessage as validateEmailFormat, getNameErrorMessage, filterThaiEnglishName, stripEmoji } from '../utils/passwordPolicy'
import useVillageStore from '../store/villageStore'
import '../styles/Profile.css'

const CONTACT_TYPES = [
  { value: 'phone', label: 'เบอร์โทร', icon: null },
  { value: 'line', label: 'Line ID', icon: null },
  { value: 'facebook', label: 'Facebook', icon: null },
  { value: 'instagram', label: 'Instagram', icon: null },
  { value: 'other', label: 'อื่นๆ', icon: null }
]
const EMPTY_FORM = { contentType: 'phone', value: '', customLabel: '' }
const FIXED_LIMIT_ONE_TYPES = ['phone', 'line', 'facebook', 'instagram']
const MAX_CONTACTS = 5
const MIN_GENERIC_CONTACT_LENGTH = 4
const PHONE_REGEX = /^\d{3}-\d{3}-\d{4}$/

function getContactMeta(contentType) {
  const meta = { phone: 'เบอร์โทร', line: 'Line ID', facebook: 'Facebook', instagram: 'Instagram', other: 'อื่นๆ' }
  return { label: meta[contentType] || 'อื่นๆ' }
}
function getContactIcon(contentType) {
  if (contentType === 'phone') return <FaPhone />
  if (contentType === 'line') return <SiLine />
  if (contentType === 'facebook') return <FaFacebook />
  if (contentType === 'instagram') return <FaInstagram />
  return <FaGlobe />
}
function formatContactLabel(contact) {
  if (contact.content_type === 'other' && contact.custom_label) return contact.custom_label
  return getContactMeta(contact.content_type).label
}
function formatDateThai(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}
function roleLabel(role) {
  const map = { user: 'User', admin: 'Admin', superadmin: 'Superadmin' }
  return map[role] || role
}
function formatPhoneInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  return [digits.slice(0,3), digits.slice(3,6), digits.slice(6,10)].filter(Boolean).join('-')
}
function getContactValueError(contentType, value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return 'กรุณากรอกข้อมูล'
  if (contentType === 'phone') {
    if (!PHONE_REGEX.test(trimmed)) return 'รูปแบบเบอร์โทรไม่ถูกต้อง (ต้องเป็น 067-578-4512)'
    return ''
  }
  if (trimmed.length < MIN_GENERIC_CONTACT_LENGTH) return `ต้องมีอย่างน้อย ${MIN_GENERIC_CONTACT_LENGTH} ตัวอักษร`
  return ''
}
function isDuplicateContact(contentType, customLabel, contacts, excludeId) {
  const others = (contacts || []).filter((c) => c.id !== excludeId)
  if (FIXED_LIMIT_ONE_TYPES.includes(contentType)) return others.some((c) => c.content_type === contentType)
  if (contentType === 'other') {
    const n = (customLabel || '').trim().toLowerCase()
    return others.some((c) => c.content_type === 'other' && (c.custom_label || '').trim().toLowerCase() === n)
  }
  return false
}
function getAvailableContactTypes(contacts, currentType) {
  const used = new Set((contacts || []).filter((c) => FIXED_LIMIT_ONE_TYPES.includes(c.content_type)).map((c) => c.content_type))
  return CONTACT_TYPES.filter((t) => t.value === currentType || !used.has(t.value))
}

function Profile() {
  const { user: currentUser } = useAuthStore()
  const { getVillageName, fetchVillages } = useVillageStore()
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [contactFormError, setContactFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef(null)
  const avatarUrl = useAuthStore((state) => state.avatarUrl)
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(!avatarUrl)
  const [avatarDraft, setAvatarDraft] = useState(null)
  const [avatarDraftFile, setAvatarDraftFile] = useState(null)
  const [showAvatarPreviewModal, setShowAvatarPreviewModal] = useState(false)
  const [showFullAvatarModal, setShowFullAvatarModal] = useState(false)
  const [isSavingAvatar, setIsSavingAvatar] = useState(false)
  const [isEditingFullname, setIsEditingFullname] = useState(false)
  const [fullnameDraft, setFullnameDraft] = useState('')
  const [fullnameError, setFullnameError] = useState('')
  const [isSavingFullname, setIsSavingFullname] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isSendingEmailLink, setIsSendingEmailLink] = useState(false)
  const [pendingNewEmail, setPendingNewEmail] = useState(null)

  // ---------- Action Menu (3-dots) ----------
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const fetchProfile = useCallback(async () => {
    setIsLoading(true)
    try { const data = await getMyProfileAPI(); setProfile(data) }
    catch (error) { console.error(error); Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้ กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' }) }
    finally { setIsLoading(false) }
  }, [])
  useEffect(() => { fetchProfile() }, [fetchProfile])
  useEffect(() => { fetchVillages() }, [fetchVillages])

  const loadAvatar = useCallback(async () => {
    if (!currentUser?.id) return
    setIsLoadingAvatar(true)
    try {
      const url = await getUserAvatarBlobURL(currentUser.id)
      useAuthStore.getState().setAvatarUrl(url)
    } catch (error) {
      console.error('โหลดรูปโปรไฟล์ไม่สำเร็จ:', error)
    } finally {
      setIsLoadingAvatar(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!avatarUrl) {
      loadAvatar()
    } else {
      setIsLoadingAvatar(false)
    }
  }, [loadAvatar, avatarUrl])

  const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg']
  const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg']

  function handleAvatarFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const isMimeValid = ALLOWED_IMAGE_MIME_TYPES.includes(file.type)
    const isExtValid = ALLOWED_IMAGE_EXTENSIONS.includes(ext)

    if (!isMimeValid || !isExtValid) {
      Swal.fire({
        icon: 'warning',
        title: 'ไฟล์ไม่ถูกต้อง',
        text: 'ระบบรองรับเฉพาะไฟล์รูปภาพนามสกุล .PNG และ .JPEG (.JPG) เท่านั้น',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({
        icon: 'warning',
        title: 'ไฟล์มีขนาดใหญ่เกินไป',
        text: 'กรุณาเลือกไฟล์รูปภาพขนาดไม่เกิน 5MB',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarDraft(reader.result)
      setAvatarDraftFile(file)
      setShowAvatarPreviewModal(true)
    }
    reader.onerror = () => {
      Swal.fire({
        icon: 'error',
        title: 'อ่านไฟล์ไม่สำเร็จ',
        text: 'กรุณาลองเลือกไฟล์ใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
    reader.readAsDataURL(file)
  }
  async function confirmAvatarChange() {
    if (!avatarDraftFile || !currentUser?.id) return
    setIsSavingAvatar(true)
    try {
      await uploadUserAvatarAPI(currentUser.id, avatarDraftFile)
      await loadAvatar()
      setAvatarDraft(null); setAvatarDraftFile(null); setShowAvatarPreviewModal(false)
      Swal.fire({ icon: 'success', title: 'อัปเดตรูปโปรไฟล์แล้ว', showConfirmButton: false, timer: 1200 })
    } catch (error) {
      console.error(error)
      const msg = error.response?.data?.detail
      Swal.fire({ icon: 'error', title: 'อัปโหลดรูปไม่สำเร็จ', text: typeof msg === 'string' ? msg : 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' })
    } finally { setIsSavingAvatar(false) }
  }
  function handleChangeAvatarAgain() { setShowAvatarPreviewModal(false); setAvatarDraft(null); setAvatarDraftFile(null); fileInputRef.current?.click() }
  function cancelAvatarPreview() { setShowAvatarPreviewModal(false); setAvatarDraft(null); setAvatarDraftFile(null) }
  async function handleDeleteAvatar() {
    const result = await Swal.fire({ icon: 'warning', title: 'ลบรูปโปรไฟล์?', text: 'รูปโปรไฟล์จะถูกลบและกลับไปใช้ไอคอนเริ่มต้น', showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: 'rgb(220, 38, 38)', cancelButtonColor: 'var(--sidebar-bg)' })
    if (!result.isConfirmed) return
    try {
      await deleteUserAvatarAPI(currentUser.id)
      useAuthStore.getState().setAvatarUrl(null)
      Swal.fire({ icon: 'success', title: 'ลบรูปโปรไฟล์แล้ว', showConfirmButton: false, timer: 1200 })
    } catch (error) { console.error(error); Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' }) }
  }

  function openFullnameEdit() { setFullnameDraft(profile.fullname || ''); setFullnameError(''); setIsEditingFullname(true) }
  function cancelFullnameEdit() { setIsEditingFullname(false); setFullnameError('') }
  function handleFullnameDraftChange(e) {
    const val = filterThaiEnglishName(e.target.value)
    setFullnameDraft(val)
    if (!val.trim()) setFullnameError('กรุณากรอกชื่อ-นามสกุล')
    else setFullnameError(getNameErrorMessage(val))
  }
  async function submitFullname() {
    const trimmed = fullnameDraft.trim()
    const errorMsg = getNameErrorMessage(trimmed)
    if (errorMsg) { setFullnameError(errorMsg); return }
    if (trimmed === profile.fullname) { setIsEditingFullname(false); return }
    setIsSavingFullname(true)
    try {
      await updateUserFullnameAPI(currentUser.id, trimmed)
      setProfile((prev) => ({ ...prev, fullname: trimmed }))
      useAuthStore.getState().updateUser({ fullname: trimmed, fullName: trimmed })
      setIsEditingFullname(false)
      Swal.fire({ icon: 'success', title: 'อัปเดตชื่อ-นามสกุลแล้ว', showConfirmButton: false, timer: 1200 })
    } catch (error) {
      console.error(error)
      const msg = error.response?.data?.detail
      Swal.fire({ icon: 'error', title: 'แก้ไขชื่อไม่สำเร็จ', text: typeof msg === 'string' ? msg : 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' })
    } finally { setIsSavingFullname(false) }
  }

  function openEmailModal() { setEmailDraft(''); setEmailError(''); setShowEmailModal(true) }

  // ปิด modal / popup ต่าง ๆ เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (showFullAvatarModal) {
          setShowFullAvatarModal(false)
        } else if (showAvatarPreviewModal && !isSavingAvatar) {
          cancelAvatarPreview()
        } else if (showContactModal && !isSubmitting) {
          setShowContactModal(false)
        } else if (showEmailModal && !isSendingEmailLink) {
          setShowEmailModal(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFullAvatarModal, showAvatarPreviewModal, isSavingAvatar, showContactModal, isSubmitting, showEmailModal, isSendingEmailLink])
  async function handleEmailSubmit(e) {
    e.preventDefault()
    const trimmed = stripEmoji(emailDraft).trim()
    const errorMsg = validateEmailFormat(trimmed)
    if (errorMsg) { setEmailError(errorMsg); return }
    if (trimmed.toLowerCase() === (profile.email || '').toLowerCase()) { setEmailError('อีเมลใหม่ต้องไม่ซ้ำกับอีเมลเดิม'); return }
    setIsSendingEmailLink(true)
    try {
      await requestEmailChangeAPI(currentUser.id, trimmed)
      setPendingNewEmail(trimmed)
      setShowEmailModal(false)
      setEmailDraft('')
      setEmailError('')
      Swal.fire({
        icon: 'success',
        title: 'ส่งลิงก์ยืนยันแล้ว',
        html: 'หากอีเมลถูกต้อง เราจะส่งลิงก์สำหรับทำการยืนยันเปลี่ยนอีเมลไปที่อีเมลนั้นโดยเร็วที่สุด<br/>หากคุณไม่ได้รับอีเมลกรุณาตรวจสอบกล่องจดหมายขยะ',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } catch (error) {
      console.error(error)
      const msg = error.response?.data?.detail
      Swal.fire({ icon: 'error', title: 'ส่งลิงก์ยืนยันไม่สำเร็จ', text: typeof msg === 'string' ? msg : 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' })
    } finally { setIsSendingEmailLink(false) }
  }

  function openAddModal() {
    if ((profile.contacts?.length || 0) >= MAX_CONTACTS) return
    const av = getAvailableContactTypes(profile.contacts, null)
    setEditingContact(null); setFormData({ ...EMPTY_FORM, contentType: av[0]?.value || 'other' }); setContactFormError(''); setShowContactModal(true)
  }
  function openEditModal(contact) {
    setEditingContact(contact); setFormData({ contentType: contact.content_type, value: contact.value, customLabel: contact.custom_label || '' }); setContactFormError(''); setShowContactModal(true)
  }
  function handleContactTypeChange(e) { setFormData((prev) => ({ ...prev, contentType: e.target.value, value: '', customLabel: '' })); setContactFormError('') }
  function handleFormChange(e) {
    const { name, value } = e.target
    if (name === 'value' && formData.contentType === 'phone') { setFormData((prev) => ({ ...prev, value: formatPhoneInput(value) })); if (contactFormError) setContactFormError(''); return }
    setFormData((prev) => ({ ...prev, [name]: value })); if (contactFormError) setContactFormError('')
  }
  async function handleContactSubmit(e) {
    e.preventDefault()
    if (formData.contentType === 'other' && !formData.customLabel.trim()) { setContactFormError('กรุณากรอกชื่อช่องทาง'); return }
    const verr = getContactValueError(formData.contentType, formData.value)
    if (verr) { setContactFormError(verr); return }
    if (!editingContact && (profile.contacts?.length || 0) >= MAX_CONTACTS) { Swal.fire({ icon: 'warning', title: 'ครบจำนวนสูงสุดแล้ว', text: `เพิ่มช่องทางติดต่อได้สูงสุด ${MAX_CONTACTS} ช่องทาง`, confirmButtonColor: 'var(--sidebar-bg)' }); return }
    if (isDuplicateContact(formData.contentType, formData.customLabel, profile.contacts, editingContact?.id)) {
      Swal.fire({ icon: 'warning', title: 'ช่องทางนี้มีอยู่แล้ว', text: formData.contentType === 'other' ? `คุณมีช่องทาง "${formData.customLabel.trim()}" อยู่แล้ว` : `เพิ่ม ${getContactMeta(formData.contentType).label} ได้แค่ 1 บัญชีต่อผู้ใช้`, confirmButtonColor: 'var(--sidebar-bg)' }); return
    }
    setIsSubmitting(true)
    try {
      if (editingContact) {
        await updateContactAPI(editingContact.id, { contentType: formData.contentType, value: formData.value.trim(), customLabel: formData.contentType === 'other' ? formData.customLabel.trim() : null })
        Swal.fire({ icon: 'success', title: 'แก้ไขช่องทางติดต่อแล้ว', showConfirmButton: false, timer: 1200 })
      } else {
        await createContactAPI({ userId: currentUser?.id, contentType: formData.contentType, value: formData.value.trim(), customLabel: formData.contentType === 'other' ? formData.customLabel.trim() : undefined })
        Swal.fire({ icon: 'success', title: 'เพิ่มช่องทางติดต่อแล้ว', showConfirmButton: false, timer: 1200 })
      }
      setShowContactModal(false); fetchProfile()
    } catch (error) {
      console.error(error)
      const msg = error.response?.data?.detail
      Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: typeof msg === 'string' ? msg : 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' })
    } finally { setIsSubmitting(false) }
  }
  async function handleDeleteContact(contact) {
    const result = await Swal.fire({ icon: 'warning', title: 'ยืนยันการลบ', text: `ต้องการลบ "${formatContactLabel(contact)}: ${contact.value}" ใช่หรือไม่?`, showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: 'rgb(220, 38, 38)', cancelButtonColor: 'var(--sidebar-bg)' })
    if (!result.isConfirmed) return
    try { await deleteContactAPI(contact.id); Swal.fire({ icon: 'success', title: 'ลบแล้ว', showConfirmButton: false, timer: 1200 }); fetchProfile() }
    catch (error) { console.error(error); Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: 'var(--sidebar-bg)' }) }
  }

  if (isLoading) return (<Layout title="My Profile"><div className="content-card"><Spinner text="กำลังโหลดข้อมูลโปรไฟล์..." /></div></Layout>)
  if (!profile) return (<Layout title="My Profile"><div className="content-card"><p className="pf-error-text">ไม่พบข้อมูลโปรไฟล์</p></div></Layout>)

  const villageName = profile.village_id ? getVillageName(profile.village_id) : null
  const contactCount = profile.contacts?.length || 0
  const isContactLimitReached = contactCount >= MAX_CONTACTS
  const availableTypesForForm = getAvailableContactTypes(profile.contacts, editingContact?.content_type ?? null)

  return (
    <Layout title="My Profile">
      <div className="pf-wrapper">

        <div className="content-card pf-header-card">
          {/* Action Menu (3 จุด) มุมขวาบน */}
          <div className="pf-menu-container" ref={menuRef}>
            <button
              type="button"
              className={`pf-menu-btn ${isMenuOpen ? 'active' : ''}`}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              title="ตัวเลือกโปรไฟล์"
              aria-label="ตัวเลือกโปรไฟล์"
            >
              <FaEllipsisVertical />
            </button>

            {isMenuOpen && (
              <div className="pf-dropdown-menu">
                <button
                  type="button"
                  className="pf-dropdown-item"
                  onClick={() => {
                    setIsMenuOpen(false)
                    openFullnameEdit()
                  }}
                >
                  <FaPen /> แก้ไขชื่อ-นามสกุล
                </button>

                {avatarUrl && !isLoadingAvatar && (
                  <button
                    type="button"
                    className="pf-dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setShowFullAvatarModal(true)
                    }}
                  >
                    <FaEye /> ดูรูปโปรไฟล์แบบเต็ม
                  </button>
                )}

                <button
                  type="button"
                  className="pf-dropdown-item"
                  onClick={() => {
                    setIsMenuOpen(false)
                    fileInputRef.current?.click()
                  }}
                >
                  <FaCamera /> {avatarUrl ? 'เปลี่ยนรูปโปรไฟล์' : 'เพิ่มรูปโปรไฟล์'}
                </button>

                {avatarUrl && !isLoadingAvatar && (
                  <button
                    type="button"
                    className="pf-dropdown-item danger"
                    onClick={() => {
                      setIsMenuOpen(false)
                      handleDeleteAvatar()
                    }}
                  >
                    <FaTrashCan /> ลบรูปโปรไฟล์
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pf-avatar-section">
            <div className="pf-avatar-lg">
              {isLoadingAvatar ? <Spinner text="" /> : avatarUrl ? <img src={avatarUrl} alt="Profile" className="pf-avatar-img" /> : <FaUser />}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".png, .jpg, .jpeg, image/png, image/jpeg"
              style={{ display: 'none' }}
              onChange={handleAvatarFileChange}
            />
          </div>

          <div className="pf-header-info">
            {isEditingFullname ? (
              <div className="pf-fullname-edit-wrap">
                <div className="pf-fullname-edit-row">
                  <input
                    type="text"
                    className={`pf-fullname-input ${fullnameError ? 'pf-input-error' : ''}`}
                    value={fullnameDraft}
                    onChange={handleFullnameDraftChange}
                    maxLength={50}
                    autoFocus
                    disabled={isSavingFullname}
                    placeholder="กรอกชื่อ-นามสกุล"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitFullname(); if (e.key === 'Escape') cancelFullnameEdit() }}
                  />
                  <button type="button" className="pf-icon-btn confirm small" onClick={submitFullname} disabled={isSavingFullname || !!fullnameError} title="บันทึก"><FaCheck /></button>
                  <button type="button" className="pf-icon-btn cancel small" onClick={cancelFullnameEdit} disabled={isSavingFullname} title="ยกเลิก"><FaXmark /></button>
                </div>
                {fullnameError && <p className="pf-error-text pf-error-text-left">{fullnameError}</p>}
              </div>
            ) : (
              <h2 className="pf-fullname">
                {profile.fullname || profile.username}
              </h2>
            )}

            <p className="pf-username">@{profile.username}</p>

            <div className="pf-badges">
              <span className={`pf-role-badge pf-role-${profile.role}`}><FaShieldAlt /> {roleLabel(profile.role)}</span>
              <span className={`pf-status-badge ${profile.is_active ? 'active' : 'inactive'}`}>
                {profile.is_active ? <FaCircleCheck /> : <FaCircleXmark />}
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
              {!profile.is_verify && <span className="pf-status-badge unverified">Unverified</span>}
            </div>
          </div>
        </div>

        <div className="content-card">
          <h3 className="card-title">Account Information</h3>
          <div className="pf-info-grid">
            <div className="pf-info-item">
              <span className="pf-info-icon"><FaEnvelope /></span>
              <div>
                <p className="pf-info-label">Email</p>
                <p className="pf-info-value">
                  {profile.email || '-'}
                  <button type="button" className="pf-icon-btn edit small" onClick={openEmailModal} title="เปลี่ยนอีเมล"><FaPen /></button>
                </p>
                {pendingNewEmail && <p className="pf-pending-email-note">รอการยืนยัน: {pendingNewEmail} (เช็คอีเมลแล้วกดลิงก์เพื่อยืนยัน)</p>}
              </div>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-icon"><FaMapMarkerAlt /></span>
              <div>
                <p className="pf-info-label">หมู่บ้าน</p>
                <p className="pf-info-value">{profile.village_id ? (villageName || 'กำลังโหลด...') : 'ทุกหมู่บ้าน (Superadmin)'}</p>
              </div>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-icon"><FaCalendarAlt /></span>
              <div>
                <p className="pf-info-label">สมัครสมาชิกเมื่อ</p>
                <p className="pf-info-value">{formatDateThai(profile.created_at)}</p>
              </div>
            </div>
            <div className="pf-info-item">
              <span className="pf-info-icon"><FaUser /></span>
              <div>
                <p className="pf-info-label">User ID</p>
                <p className="pf-info-value pf-mono">{profile.id}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="pf-contact-header">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Contact</h3>
              <p className="pf-contact-count">{contactCount}/{MAX_CONTACTS} ช่องทาง<span className="pf-contact-hint"> (เพิ่มได้แอปละ 1 บัญชีเท่านั้น เช่น Facebook 1 บัญชี, Line 1 บัญชี)</span></p>
            </div>
            <button className="btn-add-contact" onClick={openAddModal} disabled={isContactLimitReached} title={isContactLimitReached ? `เพิ่มได้สูงสุด ${MAX_CONTACTS} ช่องทาง` : undefined}>
              <FaPlus /> เพิ่มช่องทางติดต่อ
            </button>
          </div>
          {profile.contacts && profile.contacts.length > 0 ? (
            <div className="pf-contact-list">
              {profile.contacts.map((contact) => (
                <div key={contact.id} className="pf-contact-item">
                  <span className="pf-contact-icon">{getContactIcon(contact.content_type)}</span>
                  <div className="pf-contact-info">
                    <p className="pf-info-label">{formatContactLabel(contact)}</p>
                    <p className="pf-info-value">{contact.value}</p>
                  </div>
                  <div className="pf-contact-actions">
                    <button className="pf-icon-btn edit" onClick={() => openEditModal(contact)} title="แก้ไข"><FaPen /></button>
                    <button className="pf-icon-btn delete" onClick={() => handleDeleteContact(contact)} title="ลบ"><FaTrashCan /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="pf-empty-contact">ยังไม่มีช่องทางติดต่อเพิ่มเติม — กดปุ่มด้านบนเพื่อเพิ่ม</p>
          )}
        </div>

      </div>

      {showFullAvatarModal && avatarUrl && (
        <div className="modal-overlay" onClick={() => setShowFullAvatarModal(false)}>
          <div className="pf-full-avatar-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowFullAvatarModal(false)}><FaXmark /></button>
            <img src={avatarUrl} alt="Profile Full" className="pf-full-avatar-img" />
          </div>
        </div>
      )}

      {showAvatarPreviewModal && avatarDraft && (
        <div className="modal-overlay" onClick={() => !isSavingAvatar && cancelAvatarPreview()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>ตัวอย่างรูปโปรไฟล์</h3>
              <button className="modal-close" onClick={cancelAvatarPreview} disabled={isSavingAvatar}><FaXmark /></button>
            </div>
            <div className="pf-avatar-preview-body">
              <div className="pf-avatar-preview-circle"><img src={avatarDraft} alt="Preview" /></div>
              <div className="pf-avatar-preview-actions">
                <button type="button" className="btn-cancel-pf" onClick={handleChangeAvatarAgain} disabled={isSavingAvatar}>เลือกรูปใหม่</button>
                <button type="button" className="btn-confirm-pf" onClick={confirmAvatarChange} disabled={isSavingAvatar}>{isSavingAvatar ? 'กำลังอัปโหลด...' : 'ใช้รูปนี้'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showContactModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingContact ? 'แก้ไขช่องทางติดต่อ' : 'เพิ่มช่องทางติดต่อ'}</h3>
              <button className="modal-close" onClick={() => setShowContactModal(false)} disabled={isSubmitting}><FaXmark /></button>
            </div>
            <form className="pf-form" onSubmit={handleContactSubmit}>
              <div className="pf-form-field">
                <label>ประเภท</label>
                <select name="contentType" value={formData.contentType} onChange={handleContactTypeChange}>
                  {availableTypesForForm.map((type) => (<option key={type.value} value={type.value}>{type.label}</option>))}
                </select>
              </div>
              {formData.contentType === 'other' && (
                <div className="pf-form-field">
                  <label>ชื่อช่องทาง</label>
                  <input type="text" name="customLabel" placeholder="เช่น WhatsApp, Telegram" value={formData.customLabel} onChange={handleFormChange} />
                </div>
              )}
              <div className="pf-form-field">
                <label>ข้อมูลติดต่อ</label>
                <input type="text" name="value" placeholder={formData.contentType === 'phone' ? 'เช่น 067-578-4512' : 'กรอกข้อมูลติดต่อ'} value={formData.value} onChange={handleFormChange} inputMode={formData.contentType === 'phone' ? 'numeric' : 'text'} maxLength={formData.contentType === 'phone' ? 12 : undefined} />
                {contactFormError && <p className="pf-error-text">{contactFormError}</p>}
              </div>
              <div className="pf-form-actions">
                <button type="button" className="btn-cancel-pf" onClick={() => setShowContactModal(false)} disabled={isSubmitting}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-pf" disabled={isSubmitting}>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="modal-overlay" onClick={() => !isSendingEmailLink && setShowEmailModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>เปลี่ยนอีเมล</h3>
              <button className="modal-close" onClick={() => setShowEmailModal(false)} disabled={isSendingEmailLink}><FaXmark /></button>
            </div>
            <form className="pf-form" onSubmit={handleEmailSubmit}>
              <div className="pf-form-field">
                <label>อีเมลปัจจุบัน</label>
                <input type="email" value={profile.email || '-'} disabled />
              </div>
              <div className="pf-form-field">
                <label>อีเมลใหม่</label>
                <input type="email" value={emailDraft} onChange={(e) => { setEmailDraft(e.target.value); if (emailError) setEmailError('') }} placeholder="you@example.com" disabled={isSendingEmailLink} autoFocus />
                {emailError && <p className="pf-error-text">{emailError}</p>}
              </div>
              <p className="pf-email-hint">ระบบจะส่งลิงก์ยืนยันไปที่อีเมลใหม่ — อีเมลเดิมจะยังใช้งานได้จนกว่าจะกดยืนยันผ่านลิงก์</p>
              <div className="pf-form-actions">
                <button type="button" className="btn-cancel-pf" onClick={() => setShowEmailModal(false)} disabled={isSendingEmailLink}>ยกเลิก</button>
                <button type="submit" className="btn-confirm-pf" disabled={isSendingEmailLink}>{isSendingEmailLink ? 'กำลังส่ง...' : 'ส่งลิงก์ยืนยัน'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default Profile