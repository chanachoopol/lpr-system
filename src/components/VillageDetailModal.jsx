import { useState, useEffect } from 'react'
import { FaCity, FaVideo, FaUsers, FaLocationDot, FaCalendarDays, FaXmark } from 'react-icons/fa6'
import { getVillageDetailAPI } from '../data/api'
import Spinner from './Spinner'
import EmptyState from './EmptyState'
import '../styles/VillageDetailModal.css'

function formatDateThai(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function VillageDetailModal({ village, onClose }) {
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('cameras') // 'cameras' | 'members'

  const villageId = village?.id

  async function loadDetail() {
    if (!villageId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await getVillageDetailAPI(villageId)
      setDetail(data)
    } catch (err) {
      console.error('Failed to load village detail:', err)
      setError('ไม่สามารถโหลดข้อมูลรายละเอียดหมู่บ้านได้ในขณะนี้')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villageId])

  const cameras = detail?.cameras || []
  const members = detail?.members || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content vdm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header vdm-header">
          <div className="vdm-title-wrap">
            <div className="vdm-icon-badge">
              <FaCity />
            </div>
            <div>
              <h3 style={{ margin: 0 }}>{village?.name || detail?.name || 'Village Detail'}</h3>
              <p className="vdm-subtitle">รายละเอียดหมู่บ้าน กล้องวงจรปิด และสมาชิกในโครงการ</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <FaXmark />
          </button>
        </div>

        {/* Content */}
        <div className="vdm-body">
          {/* Summary Banner */}
          <div className="vdm-summary-card">
            <div className="vdm-summary-item">
              <span className="vdm-label">สถานะ</span>
              <span className={`vdm-status-badge ${village?.is_active ? 'active' : 'suspended'}`}>
                {village?.is_active ? 'Active (เปิดใช้งาน)' : 'Suspended (ระงับใช้งาน)'}
              </span>
            </div>
            <div className="vdm-summary-item">
              <span className="vdm-label"><FaLocationDot /> ที่อยู่</span>
              <span className="vdm-value">{village?.address && village.address !== '-' ? village.address : 'ไม่ได้ระบุที่อยู่'}</span>
            </div>
            <div className="vdm-summary-item">
              <span className="vdm-label"><FaCalendarDays /> วันที่สร้าง</span>
              <span className="vdm-value">{formatDateThai(village?.created_at || detail?.created_at)}</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="vdm-tab-row">
            <button
              className={`vdm-tab-btn ${activeTab === 'cameras' ? 'active' : ''}`}
              onClick={() => setActiveTab('cameras')}
            >
              <FaVideo /> กล้องวงจรปิด ({cameras.length})
            </button>
            <button
              className={`vdm-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              <FaUsers /> สมาชิกในโครงการ ({members.length})
            </button>
          </div>

          {/* Tab Content */}
          {isLoading ? (
            <div className="vdm-loading-wrap">
              <Spinner text="กำลังโหลดรายละเอียดหมู่บ้าน..." />
            </div>
          ) : error ? (
            <div className="vdm-error-wrap">
              <EmptyState
                icon={<FaCity />}
                title="เกิดข้อผิดพลาดในการโหลดข้อมูล"
                description={error}
              />
              <button className="vdm-btn-retry" onClick={loadDetail}>
                ลองใหม่อีกครั้ง
              </button>
            </div>
          ) : activeTab === 'cameras' ? (
            <div className="vdm-list-wrap">
              {cameras.length > 0 ? (
                <div className="table-responsive">
                  <table className="vdm-table">
                    <thead>
                      <tr>
                        <th>ชื่อกล้อง</th>
                        <th>ทิศทาง</th>
                        <th>พิกัด (Lat / Long)</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cameras.map((c) => (
                        <tr key={c.id}>
                          <td className="vdm-cam-name">{c.name}</td>
                          <td>
                            <span className={`vdm-dir-badge ${c.direction || 'entry'}`}>
                              {c.direction || 'entry'}
                            </span>
                          </td>
                          <td className="vdm-coords">
                            {c.lat && c.long ? `${c.lat}, ${c.long}` : '-'}
                          </td>
                          <td>
                            <span className={`vdm-state-dot ${c.is_active ? 'active' : 'inactive'}`}></span>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<FaVideo />}
                  title="ไม่พบกล้องวงจรปิด"
                  description="ยังไม่มีการติดตั้งกล้องในหมู่บ้านนี้"
                />
              )}
            </div>
          ) : (
            <div className="vdm-list-wrap">
              {members.length > 0 ? (
                <div className="table-responsive">
                  <table className="vdm-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>ชื่อ-นามสกุล</th>
                        <th>Role</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id}>
                          <td className="vdm-member-user">{m.username}</td>
                          <td>{m.fullname || '-'}</td>
                          <td>
                            <span className={`vdm-role-badge ${m.role}`}>
                              {m.role ? m.role.toUpperCase() : 'USER'}
                            </span>
                          </td>
                          <td>
                            <span className={`vdm-state-dot ${m.is_active ? 'active' : 'inactive'}`}></span>
                            {m.is_active ? 'Active' : 'Inactive'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<FaUsers />}
                  title="ไม่พบสมาชิก"
                  description="ยังไม่มีผู้ใช้หรือแอดมินสังกัดหมู่บ้านนี้"
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer vdm-footer">
          <button className="btn-cancel-um" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  )
}

export default VillageDetailModal
