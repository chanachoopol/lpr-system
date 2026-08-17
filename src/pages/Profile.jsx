import { useState, useEffect, useCallback } from 'react'
import {
  FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaShieldAlt, FaCalendarAlt,
  FaFacebook, FaInstagram, FaGlobe
} from 'react-icons/fa'
import { FaCircleCheck, FaCircleXmark, FaPlus, FaPen, FaTrashCan, FaXmark } from 'react-icons/fa6'
import { SiLine } from 'react-icons/si'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import useAuthStore from '../store/authStore'
import { getMyProfileAPI, createContactAPI, updateContactAPI, deleteContactAPI } from '../data/api'
import useVillageStore from '../store/villageStore'
import '../styles/Profile.css'

// รายการ content_type ที่ backend รองรับ (ยืนยันจาก schema ContactCreate)
const CONTACT_TYPES = [
  { value: 'phone', label: 'เบอร์โทร', icon: <FaPhone /> },
  { value: 'line', label: 'Line ID', icon: <SiLine /> },
  { value: 'facebook', label: 'Facebook', icon: <FaFacebook /> },
  { value: 'instagram', label: 'Instagram', icon: <FaInstagram /> },
  { value: 'email', label: 'อีเมลสำรอง', icon: <FaEnvelope /> },
  { value: 'other', label: 'อื่นๆ', icon: <FaGlobe /> }
]

const EMPTY_FORM = { contentType: 'phone', value: '', customLabel: '' }

function getContactMeta(contentType) {
  return CONTACT_TYPES.find((t) => t.value === contentType) || CONTACT_TYPES[CONTACT_TYPES.length - 1]
}

// custom_label ใช้แสดงผลแทน label เริ่มต้นได้เฉพาะตอน content_type === 'other'
// (ชนิดอื่นให้ยึดชื่อมาตรฐานเสมอ กันสับสนกับ label ที่ backend ใส่ไว้แต่ก่อน)
function formatContactLabel(contact) {
  if (contact.content_type === 'other' && contact.custom_label) return contact.custom_label
  return getContactMeta(contact.content_type).label
}

function formatDateThai(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function roleLabel(role) {
  const map = { user: 'User', admin: 'Admin', superadmin: 'Superadmin' }
  return map[role] || role
}

function Profile() {
  const { user: currentUser } = useAuthStore()
  const { getVillageName, fetchVillages } = useVillageStore()
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Modal เพิ่ม/แก้ไข contact — ใช้ modal เดียวกัน (editingContact = null คือโหมดเพิ่ม)
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchProfile = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getMyProfileAPI()
      setProfile(data)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้ กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // ต้องมีรายชื่อหมู่บ้านไว้ lookup ชื่อจาก village_id (เผื่อยังไม่เคยโหลดมาก่อนหน้านี้)
  useEffect(() => {
    fetchVillages()
  }, [fetchVillages])

  function openAddModal() {
    setEditingContact(null)
    setFormData(EMPTY_FORM)
    setShowContactModal(true)
  }

  function openEditModal(contact) {
    setEditingContact(contact)
    setFormData({
      contentType: contact.content_type,
      value: contact.value,
      customLabel: contact.custom_label || ''
    })
    setShowContactModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleContactSubmit(e) {
    e.preventDefault()

    if (!formData.value.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกเบอร์โทร/ไอดี/อีเมล ที่ต้องการเพิ่ม',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (formData.contentType === 'other' && !formData.customLabel.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาตั้งชื่อช่องทาง',
        text: 'เลือกประเภท "อื่นๆ" ต้องระบุชื่อช่องทางด้วย เช่น "WhatsApp"',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingContact) {
        await updateContactAPI(editingContact.id, {
          contentType: formData.contentType,
          value: formData.value.trim(),
          customLabel: formData.contentType === 'other' ? formData.customLabel.trim() : null
        })
        Swal.fire({
          icon: 'success',
          title: 'แก้ไขช่องทางติดต่อแล้ว',
          showConfirmButton: false,
          timer: 1200
        })
      } else {
        await createContactAPI({
          userId: currentUser?.id,
          contentType: formData.contentType,
          value: formData.value.trim(),
          customLabel: formData.contentType === 'other' ? formData.customLabel.trim() : undefined
        })
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มช่องทางติดต่อแล้ว',
          showConfirmButton: false,
          timer: 1200
        })
      }

      setShowContactModal(false)
      fetchProfile()
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

  async function handleDeleteContact(contact) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `ต้องการลบ "${formatContactLabel(contact)}: ${contact.value}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (!result.isConfirmed) return

    try {
      await deleteContactAPI(contact.id)
      Swal.fire({
        icon: 'success',
        title: 'ลบแล้ว',
        showConfirmButton: false,
        timer: 1200
      })
      fetchProfile()
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

  if (isLoading) {
    return (
      <Layout title="My Profile">
        <div className="content-card">
          <Spinner text="กำลังโหลดข้อมูลโปรไฟล์..." />
        </div>
      </Layout>
    )
  }

  if (!profile) {
    return (
      <Layout title="My Profile">
        <div className="content-card">
          <p className="pf-error-text">ไม่พบข้อมูลโปรไฟล์</p>
        </div>
      </Layout>
    )
  }

  const villageName = profile.village_id ? getVillageName(profile.village_id) : null

  return (
    <Layout title="My Profile">
      <div className="pf-wrapper">

        {/* Header การ์ด — avatar + ชื่อ + role badge */}
        <div className="content-card pf-header-card">
          <div className="pf-avatar-lg">
            <FaUser />
          </div>
          <div className="pf-header-info">
            <h2 className="pf-fullname">{profile.fullname || profile.username}</h2>
            <p className="pf-username">@{profile.username}</p>
            <div className="pf-badges">
              <span className={`pf-role-badge pf-role-${profile.role}`}>
                <FaShieldAlt /> {roleLabel(profile.role)}
              </span>
              <span className={`pf-status-badge ${profile.is_active ? 'active' : 'inactive'}`}>
                {profile.is_active ? <FaCircleCheck /> : <FaCircleXmark />}
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
              {!profile.is_verify && (
                <span className="pf-status-badge unverified">Unverified</span>
              )}
            </div>
          </div>
        </div>

        {/* ข้อมูลบัญชี */}
        <div className="content-card">
          <h3 className="card-title">Account Information</h3>
          <div className="pf-info-grid">
            <div className="pf-info-item">
              <span className="pf-info-icon"><FaEnvelope /></span>
              <div>
                <p className="pf-info-label">Email</p>
                <p className="pf-info-value">{profile.email || '-'}</p>
              </div>
            </div>

            <div className="pf-info-item">
              <span className="pf-info-icon"><FaMapMarkerAlt /></span>
              <div>
                <p className="pf-info-label">หมู่บ้าน</p>
                <p className="pf-info-value">
                  {profile.village_id
                    ? (villageName || 'กำลังโหลด...')
                    : 'ทุกหมู่บ้าน (Superadmin)'}
                </p>
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

        {/* Contacts */}
        <div className="content-card">
          <div className="pf-contact-header">
            <h3 className="card-title" style={{ margin: 0 }}>Contact</h3>
            <button className="btn-add-contact" onClick={openAddModal}>
              <FaPlus /> เพิ่มช่องทางติดต่อ
            </button>
          </div>

          {profile.contacts && profile.contacts.length > 0 ? (
            <div className="pf-contact-list">
              {profile.contacts.map((contact) => (
                <div key={contact.id} className="pf-contact-item">
                  <span className="pf-contact-icon">{getContactMeta(contact.content_type).icon}</span>
                  <div className="pf-contact-info">
                    <p className="pf-info-label">{formatContactLabel(contact)}</p>
                    <p className="pf-info-value">{contact.value}</p>
                  </div>
                  <div className="pf-contact-actions">
                    <button className="pf-icon-btn edit" onClick={() => openEditModal(contact)} title="แก้ไข">
                      <FaPen />
                    </button>
                    <button className="pf-icon-btn delete" onClick={() => handleDeleteContact(contact)} title="ลบ">
                      <FaTrashCan />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="pf-empty-contact">ยังไม่มีช่องทางติดต่อเพิ่มเติม — กดปุ่มด้านบนเพื่อเพิ่ม</p>
          )}
        </div>

      </div>

      {/* Modal เพิ่ม/แก้ไข Contact */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingContact ? 'แก้ไขช่องทางติดต่อ' : 'เพิ่มช่องทางติดต่อ'}</h3>
              <button className="modal-close" onClick={() => setShowContactModal(false)} disabled={isSubmitting}>
                <FaXmark />
              </button>
            </div>
            <form className="pf-form" onSubmit={handleContactSubmit}>
              <div className="pf-form-field">
                <label>ประเภท</label>
                <select name="contentType" value={formData.contentType} onChange={handleFormChange}>
                  {CONTACT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {formData.contentType === 'other' && (
                <div className="pf-form-field">
                  <label>ชื่อช่องทาง</label>
                  <input
                    type="text"
                    name="customLabel"
                    placeholder="เช่น WhatsApp, Telegram"
                    value={formData.customLabel}
                    onChange={handleFormChange}
                  />
                </div>
              )}

              <div className="pf-form-field">
                <label>{formData.contentType === 'email' ? 'อีเมล' : 'ข้อมูลติดต่อ'}</label>
                <input
                  type={formData.contentType === 'email' ? 'email' : 'text'}
                  name="value"
                  placeholder={formData.contentType === 'phone' ? 'เช่น 0891234567' : 'กรอกข้อมูลติดต่อ'}
                  value={formData.value}
                  onChange={handleFormChange}
                />
              </div>

              <div className="pf-form-actions">
                <button
                  type="button"
                  className="btn-cancel-pf"
                  onClick={() => setShowContactModal(false)}
                  disabled={isSubmitting}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-pf" disabled={isSubmitting}>
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

export default Profile