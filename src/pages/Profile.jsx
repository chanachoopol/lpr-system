import { useState, useEffect } from 'react'
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaShieldAlt, FaCalendarAlt } from 'react-icons/fa'
import { FaCircleCheck, FaCircleXmark } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import { getMyProfileAPI } from '../data/api'
import useVillageStore from '../store/villageStore'
import '../styles/Profile.css'

// แปลง content_type ของ contact ให้อ่านง่าย (backend ส่งมาเป็น key เช่น 'phone', 'line', 'email')
const CONTACT_LABELS = {
  phone: 'เบอร์โทร',
  line: 'Line ID',
  email: 'อีเมลสำรอง'
}

function formatContactLabel(contact) {
  // ถ้า backend ใส่ custom_label มาด้วย ให้ใช้อันนั้นก่อน (เผื่อ type อื่นที่ไม่รู้จัก)
  if (contact.custom_label) return contact.custom_label
  return CONTACT_LABELS[contact.content_type] || formatFallbackLabel(contact.content_type)
}

function formatFallbackLabel(text) {
  if (!text) return 'Contact'
  return text.charAt(0).toUpperCase() + text.slice(1)
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
  const { villages, getVillageName, fetchVillages } = useVillageStore()
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
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
    }
    fetchProfile()
  }, [])

  // ต้องมีรายชื่อหมู่บ้านไว้ lookup ชื่อจาก village_id (เผื่อยังไม่เคยโหลดมาก่อนหน้านี้)
  useEffect(() => {
    fetchVillages()
  }, [fetchVillages])

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
          <h3 className="card-title">Contact</h3>
          {profile.contacts && profile.contacts.length > 0 ? (
            <div className="pf-contact-list">
              {profile.contacts.map((contact) => (
                <div key={contact.id} className="pf-contact-item">
                  <span className="pf-contact-icon"><FaPhone /></span>
                  <div>
                    <p className="pf-info-label">{formatContactLabel(contact)}</p>
                    <p className="pf-info-value">{contact.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="pf-empty-contact">ยังไม่มีช่องทางติดต่อเพิ่มเติม</p>
          )}
        </div>

      </div>
    </Layout>
  )
}

export default Profile