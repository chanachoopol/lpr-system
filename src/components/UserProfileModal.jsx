import { useEffect, useState } from 'react'
import { FaTimes, FaUserCircle, FaPhone, FaEnvelope, FaCommentDots, FaAddressCard } from 'react-icons/fa'
import { getUserContactsDetailAPI } from '../data/api'
import useVillageStore from '../store/villageStore'
import Spinner from './Spinner'
import '../styles/UserProfileModal.css'

// ไอคอนตาม content_type ที่เจอบ่อย — ถ้าเจอ type ที่ไม่รู้จักจะ fallback เป็น FaAddressCard
const CONTACT_ICONS = {
  phone: FaPhone,
  email: FaEnvelope,
  line: FaCommentDots
}

function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Modal แสดงรายละเอียด profile ของ user (read-only)
// เปิดใช้จาก UserManagement.jsx เมื่อกดปุ่ม "ดู profile" ในตาราง
//
// Props:
// - user: object แถวจาก list (/api/contacts) เช่น { user_id, username, fullname, role, village_id, village_name }
//         ต้องเช็ค canViewUserProfile(currentUser, user) ก่อนเปิด modal นี้แล้วจากภายนอก
// - onClose: function ปิด modal
function UserProfileModal({ user, onClose }) {
  const { getVillageName } = useVillageStore()
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // รองรับทั้ง user.id (จาก getUsersAPI ในหน้า User Management)
  // และ user.user_id (จาก /api/contacts list) — path param ของ endpoint นี้เป็น uuid เดียวกัน
  const userId = user?.id ?? user?.user_id

  useEffect(() => {
    if (!userId) return

    let isCancelled = false

    async function fetchDetail() {
      setIsLoading(true)
      setHasError(false)
      try {
        // /api/contacts/users/{user_id} — คืน user_id, username, fullname, village_id, village_name, contacts[]
        const data = await getUserContactsDetailAPI(userId)
        if (!isCancelled) setDetail(data)
      } catch (error) {
        console.error(error)
        if (!isCancelled) setHasError(true)
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }

    fetchDetail()

    return () => {
      isCancelled = true
    }
  }, [userId])

  if (!user) return null

  // fallback ชื่อหมู่บ้าน: ใช้ village_name จาก response ถ้ามี ไม่งั้น lookup จาก store ด้วย village_id
  const villageDisplay =
    user.village_name || detail?.village_name || getVillageName(user.village_id) || 'ไม่สังกัดหมู่บ้าน'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <FaTimes />
        </button>

        <div className="profile-modal-header">
          <FaUserCircle className="profile-modal-avatar" />
          <h3>{user.fullname || user.username || '-'}</h3>
          <span className={`role-badge role-${user.role}`}>{user.role}</span>
        </div>

        <div className="profile-modal-body">
          <div className="profile-field">
            <label>Username</label>
            <p>{user.username || '-'}</p>
          </div>

          <div className="profile-field">
            <label>หมู่บ้าน</label>
            <p>{villageDisplay}</p>
          </div>
        </div>

        <div className="profile-modal-contacts">
          <h4>ช่องทางติดต่อ</h4>

          {isLoading ? (
            <Spinner text="กำลังโหลด..." />
          ) : hasError ? (
            <p className="contact-error">โหลดข้อมูลติดต่อไม่สำเร็จ</p>
          ) : !detail?.contacts || detail.contacts.length === 0 ? (
            <p className="contact-empty">ยังไม่มีข้อมูลติดต่อ</p>
          ) : (
            <ul className="contact-list">
              {detail.contacts.map((contact) => {
                const Icon = CONTACT_ICONS[contact.content_type] || FaAddressCard
                return (
                  <li key={contact.id} className="contact-item">
                    <Icon className="contact-icon" />
                    <div>
                      <p className="contact-value">{contact.value}</p>
                      <span className="contact-label">
                        {contact.custom_label || contact.content_type} · เพิ่มเมื่อ {formatDate(contact.created_at)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserProfileModal