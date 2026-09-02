import { useEffect, useState, useCallback } from 'react'
import {
  FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaShieldAlt, FaCalendarAlt,
  FaFacebook, FaInstagram, FaGlobe, FaEye
} from 'react-icons/fa'
import { FaCircleCheck, FaCircleXmark, FaXmark } from 'react-icons/fa6'
import { SiLine } from 'react-icons/si'
import { getUserContactsDetailAPI, getUserAvatarBlobURL, getUserDetailAPI } from '../data/api'
import useVillageStore from '../store/villageStore'
import Spinner from './Spinner'
import '../styles/UserProfileModal.css'

const CONTACT_META = {
  phone: { label: 'เบอร์โทร', icon: <FaPhone /> },
  line: { label: 'Line ID', icon: <SiLine /> },
  facebook: { label: 'Facebook', icon: <FaFacebook /> },
  instagram: { label: 'Instagram', icon: <FaInstagram /> },
  other: { label: 'อื่นๆ', icon: <FaGlobe /> }
}

function getContactMeta(contentType) {
  return CONTACT_META[contentType] || CONTACT_META.other
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

function UserProfileModal({ user, onClose }) {
  const { villages, getVillageName, fetchVillages } = useVillageStore()
  const [userData, setUserData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFullAvatarModal, setShowFullAvatarModal] = useState(false)

  const userId = user?.id ?? user?.user_id

  useEffect(() => {
    if (villages.length === 0) {
      fetchVillages()
    }
  }, [villages.length, fetchVillages])

  useEffect(() => {
    if (!userId) return

    let isCancelled = false

    async function loadData() {
      setIsLoading(true)
      try {
        const [contactData, avatar, userFullData] = await Promise.all([
          getUserContactsDetailAPI(userId).catch(() => null),
          getUserAvatarBlobURL(userId).catch(() => null),
          getUserDetailAPI(userId).catch(() => null)
        ])

        if (!isCancelled) {
          if (contactData) setDetail(contactData)
          if (avatar) setAvatarUrl(avatar)
          if (userFullData) setUserData(userFullData)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }

    loadData()

    return () => {
      isCancelled = true
      if (avatarUrl) {
        URL.revokeObjectURL(avatarUrl)
      }
    }
  }, [userId])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (showFullAvatarModal) {
          setShowFullAvatarModal(false)
        } else if (onClose) {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFullAvatarModal, onClose])

  if (!user) return null

  const activeUser = userData || user
  const displayFullname = activeUser?.fullname || detail?.fullname || activeUser?.username || user?.username
  const targetVillageId = activeUser?.village_id ?? activeUser?.villageId ?? user?.village_id ?? user?.villageId ?? detail?.village_id
  let displayVillage = '-'

  if (targetVillageId) {
    const vName = getVillageName(targetVillageId)
    displayVillage = (vName && vName !== '-')
      ? vName
      : (activeUser?.village_name || user?.village_name || detail?.village_name || `หมู่บ้าน #${targetVillageId}`)
  } else if (activeUser?.village_name || user?.village_name || detail?.village_name) {
    displayVillage = activeUser?.village_name || user?.village_name || detail?.village_name
  } else if (activeUser?.role === 'superadmin' || user?.role === 'superadmin') {
    displayVillage = 'ทุกหมู่บ้าน (Superadmin)'
  } else {
    displayVillage = '-'
  }

  const isUserVerified = activeUser?.is_verify ?? user?.is_verify ?? false
  const isUserActive = activeUser?.is_active ?? user?.is_active ?? true
  const userRole = activeUser?.role || user?.role || 'user'
  const userCreatedAt = activeUser?.created_at || user?.created_at || detail?.created_at
  const displayEmail = activeUser?.email || user?.email || detail?.email || '-'

  const contactsList = detail?.contacts || []

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content um-profile-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose} title="ปิด">
            <FaXmark />
          </button>

          {/* Header Card */}
          <div className="um-pm-header">
            <div className="um-pm-avatar-wrap">
              <div className="um-pm-avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="um-pm-avatar-img" />
                ) : (
                  <FaUser />
                )}
              </div>
              {avatarUrl && (
                <button
                  type="button"
                  className="um-pm-view-avatar-btn"
                  onClick={() => setShowFullAvatarModal(true)}
                  title="ดูรูปโปรไฟล์แบบเต็ม"
                >
                  <FaEye /> ดูรูปเต็ม
                </button>
              )}
            </div>

            <div className="um-pm-header-info">
              <h3 className="um-pm-fullname">{displayFullname}</h3>
              <p className="um-pm-username">@{activeUser.username || user.username || detail?.username}</p>

              <div className="um-pm-badges">
                <span className={`pf-role-badge pf-role-${userRole}`}>
                  <FaShieldAlt /> {roleLabel(userRole)}
                </span>
                <span className={`pf-status-badge ${isUserActive ? 'active' : 'inactive'}`}>
                  {isUserActive ? <FaCircleCheck /> : <FaCircleXmark />}
                  {isUserActive ? 'Active' : 'Inactive'}
                </span>
                {!isUserVerified && (
                  <span className="pf-status-badge unverified">Unverified</span>
                )}
              </div>
            </div>
          </div>

          {/* Account Details Grid */}
          <div className="um-pm-section">
            <h4 className="um-pm-section-title">Account Information</h4>
            <div className="um-pm-grid">
              <div className="um-pm-info-item">
                <span className="um-pm-info-icon"><FaEnvelope /></span>
                <div>
                  <p className="um-pm-info-label">Email</p>
                  <p className="um-pm-info-value">{displayEmail}</p>
                </div>
              </div>

              <div className="um-pm-info-item">
                <span className="um-pm-info-icon"><FaMapMarkerAlt /></span>
                <div>
                  <p className="um-pm-info-label">หมู่บ้าน</p>
                  <p className="um-pm-info-value">{displayVillage}</p>
                </div>
              </div>

              <div className="um-pm-info-item">
                <span className="um-pm-info-icon"><FaCalendarAlt /></span>
                <div>
                  <p className="um-pm-info-label">สมัครสมาชิกเมื่อ</p>
                  <p className="um-pm-info-value">{formatDateThai(userCreatedAt)}</p>
                </div>
              </div>

              <div className="um-pm-info-item">
                <span className="um-pm-info-icon"><FaUser /></span>
                <div>
                  <p className="um-pm-info-label">User ID</p>
                  <p className="um-pm-info-value pf-mono">{userId}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contacts List */}
          <div className="um-pm-section">
            <h4 className="um-pm-section-title">
              Contact ({contactsList.length} ช่องทาง)
            </h4>

            {isLoading ? (
              <div style={{ padding: '16px 0' }}><Spinner text="กำลังโหลดข้อมูล..." /></div>
            ) : contactsList.length === 0 ? (
              <p className="um-pm-empty-contact">ไม่มีช่องทางติดต่อเพิ่มเติม</p>
            ) : (
              <div className="um-pm-contact-list">
                {contactsList.map((c) => {
                  const meta = getContactMeta(c.content_type)
                  const label = c.content_type === 'other' && c.custom_label ? c.custom_label : meta.label

                  return (
                    <div key={c.id} className="um-pm-contact-item">
                      <span className="um-pm-contact-icon">{meta.icon}</span>
                      <div className="um-pm-contact-info">
                        <p className="um-pm-contact-label">{label}</p>
                        <p className="um-pm-contact-value">{c.value}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal ดูรูปเต็ม */}
      {showFullAvatarModal && avatarUrl && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowFullAvatarModal(false)}>
          <div className="pf-full-avatar-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowFullAvatarModal(false)}>
              <FaXmark />
            </button>
            <img src={avatarUrl} alt="Avatar Full" className="pf-full-avatar-img" />
          </div>
        </div>
      )}
    </>
  )
}

export default UserProfileModal