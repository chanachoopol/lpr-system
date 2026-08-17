import { useState, useEffect } from 'react'
import { FaTriangleExclamation, FaTrashCan, FaXmark, FaPlus } from 'react-icons/fa6'
import { FaCar, FaSearch } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { mockBlacklistFoundToday } from '../data/mockData'
import { getBlacklistAPI, createBlacklistAPI, deleteBlacklistAPI } from '../data/api'
import '../styles/Blacklist.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import useVillageStore from '../store/villageStore'

// Role ที่จัดการ (เพิ่ม/ลบ) รายการ blacklist ได้ — เปิดให้ทุก role
const BLACKLIST_MANAGE_ROLES = ['user', 'admin', 'superadmin']

const EMPTY_FORM = { plate: '', province: '', reason: '' }

// รอ user พิมพ์หยุด 400ms ก่อนค่อยยิง API ค้นหา (debounce)
// ป้องกันการยิง API รัวๆ ทุกตัวอักษรที่พิมพ์
const SEARCH_DEBOUNCE_MS = 400

// backend ส่งวันที่มาเป็น ISO string (เช่น 2026-08-13T04:00:21Z)
// ต้อง format เป็นวันที่แบบไทยเองตอนแสดงผล
function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH')
}

function Blacklist() {
  const { user } = useAuthStore()
  const canManageBlacklist = BLACKLIST_MANAGE_ROLES.includes(user?.role)

  const [blacklist, setBlacklist] = useState([])
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [showFoundModal, setShowFoundModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ดึงข้อมูลจาก backend จริง
  async function fetchBlacklist() {
    setIsLoading(true)
    try {
      const data = await getBlacklistAPI({
        villageId: selectedVillageId || undefined,
        licensePlate: searchInput.trim() || undefined
      })
      setBlacklist(data.items)
      setTotal(data.total)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูล Blacklist ได้ กรุณาลองใหม่',
        confirmButtonColor: '#3b82f6'
      })
    } finally {
      setIsLoading(false)
    }
  }

  // ทำงานตอนเปิดหน้าครั้งแรก และทุกครั้งที่ searchInput เปลี่ยน (มี debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBlacklist()
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, selectedVillageId])

  function handleSearch(e) {
    setSearchInput(e.target.value)
  }

  function handleDelete(id, plate) {
    Swal.fire({
      title: `Delete ${plate} from blacklist?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    }).then(async (result) => {
      if (!result.isConfirmed) return

      try {
        await deleteBlacklistAPI(id)
        setBlacklist((prev) => prev.filter((item) => item.id !== id))
        setTotal((prev) => prev - 1)

        Swal.fire({
          icon: 'success',
          title: 'Deleted!',
          text: `${plate} removed from blacklist`,
          showConfirmButton: false,
          timer: 1500
        })
      } catch (error) {
        console.error(error)
        Swal.fire({
          icon: 'error',
          title: 'ลบไม่สำเร็จ',
          text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
          confirmButtonColor: '#3b82f6'
        })
      }
    })
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleAddSubmit(e) {
    e.preventDefault()

    if (!formData.plate.trim() || !formData.province.trim() || !formData.reason.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: 'Please fill in all fields.',
        confirmButtonColor: '#3b82f6'
      })
      return
    }

    setIsSubmitting(true)
    try {
      const newEntry = await createBlacklistAPI(
        selectedVillageId || user?.village_id, // ตอน add ต้องมี village_id เสมอ ถ้า superadmin เลือก "ทุกหมู่บ้าน" (null) ต้องกันไว้
        formData.plate.trim(),
        formData.province.trim(),
        formData.reason.trim()
      )

      setBlacklist((prev) => [newEntry, ...prev])
      setTotal((prev) => prev + 1)
      setFormData(EMPTY_FORM)
      setShowAddModal(false)

      Swal.fire({
        icon: 'success',
        title: 'Success',
        text: `${newEntry.license_plate} added to blacklist`,
        showConfirmButton: false,
        timer: 1500
      })
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'เพิ่มข้อมูลไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: '#3b82f6'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Layout title="Blacklist">
      <div className="blacklist-wrapper">

        {/* KPI Cards */}
        <div className="bl-kpi-row">
          <div className="bl-kpi-card">
            <div className="bl-kpi-icon red">
              <FaTriangleExclamation />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Total Blacklist</p>
              <h2 className="bl-kpi-val">{total}</h2>
            </div>
          </div>

          <div
            className="bl-kpi-card clickable"
            onClick={() => setShowFoundModal(true)}
          >
            <div className="bl-kpi-icon orange">
              <FaCar />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Found Today</p>
              <h2 className="bl-kpi-val">{mockBlacklistFoundToday.length}</h2>
            </div>
            <span className="bl-kpi-hint">Click to view →</span>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="bl-table-header">
            <div className="bl-table-title">
              <FaTriangleExclamation className="bl-title-icon" />
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  Blacklist Records
                </h3>
                <p className="bl-description">
                  รายการยานพาหนะที่ถูกขึ้นบัญชีดำในระบบทั้งหมด
                  ข้อมูลจะไม่ถูก reset ทุกวัน
                </p>
              </div>
            </div>

            <div className="bl-table-header-actions">
              {/* Search Bar — ค้นหาจาก backend ผ่านป้ายทะเบียน */}
              <div className="bl-search-wrap">
                <FaSearch className="bl-search-icon" />
                <input
                  type="text"
                  placeholder="Search license plate..."
                  value={searchInput}
                  onChange={handleSearch}
                  className="bl-search-input"
                />
              </div>

              {canManageBlacklist && selectedVillageId && (
                <button className="btn-add-blacklist" onClick={() => setShowAddModal(true)}>
                  <FaPlus /> Add to Blacklist
                </button>
              )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="bl-table">
              <thead>
                <tr>
                  <th>License Plate</th>
                  <th>Province</th>
                  <th>Reason</th>
                  <th>Date Added</th>
                  {canManageBlacklist && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={canManageBlacklist ? 5 : 4}>
                      <Spinner text="Loading blacklist..." />
                    </td>
                  </tr>
                ) : blacklist.length > 0 ? (
                  blacklist.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="bl-plate-badge">{item.license_plate}</span>
                      </td>
                      <td>{item.province}</td>
                      <td>
                        <span className="bl-reason-badge">{item.reason}</span>
                      </td>
                      <td>{formatDate(item.created_at)}</td>
                      {canManageBlacklist && (
                        <td>
                          <button
                            className="btn-delete"
                            onClick={() => handleDelete(item.id, item.license_plate)}
                          >
                            <FaTrashCan />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canManageBlacklist ? 5 : 4}>
                      <EmptyState
                        icon={<FaTriangleExclamation />}
                        title="No blacklist records"
                        description="No vehicles found matching your search"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal Found Today — ยังไม่มี endpoint จาก backend จึงคงใช้ mock data ไปก่อน */}
      {showFoundModal && (
        <div className="modal-overlay" onClick={() => setShowFoundModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Found Today — {mockBlacklistFoundToday.length} vehicles</h3>
              <button
                className="modal-close"
                onClick={() => setShowFoundModal(false)}
              >
                <FaXmark />
              </button>
            </div>
            <div className="modal-body-list">
              {mockBlacklistFoundToday.map((item) => (
                <div key={item.id} className="found-item">
                  <div className="found-item-left">
                    <FaTriangleExclamation className="found-icon" />
                    <div>
                      <span className="bl-plate-badge">{item.plate}</span>
                      <p className="found-province">{item.province}</p>
                    </div>
                  </div>
                  <span className="found-time">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Add to Blacklist */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add to Blacklist</h3>
              <button
                className="modal-close"
                onClick={() => setShowAddModal(false)}
                disabled={isSubmitting}
              >
                <FaXmark />
              </button>
            </div>
            <form className="bl-add-form" onSubmit={handleAddSubmit}>
              <div className="bl-add-field">
                <label>License Plate</label>
                <input
                  type="text"
                  name="plate"
                  placeholder="เช่น กค 1234"
                  value={formData.plate}
                  onChange={handleFormChange}
                />
              </div>
              <div className="bl-add-field">
                <label>Province</label>
                <input
                  type="text"
                  name="province"
                  placeholder="เช่น นครปฐม"
                  value={formData.province}
                  onChange={handleFormChange}
                />
              </div>
              <div className="bl-add-field">
                <label>Reason</label>
                <input
                  type="text"
                  name="reason"
                  placeholder="เช่น Suspicious Vehicle"
                  value={formData.reason}
                  onChange={handleFormChange}
                />
              </div>
              <div className="bl-add-actions">
                <button
                  type="button"
                  className="btn-cancel-add"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-add" disabled={isSubmitting}>
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

export default Blacklist