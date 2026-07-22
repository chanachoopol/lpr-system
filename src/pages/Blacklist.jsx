import { useState, useEffect } from 'react'
import { FaTriangleExclamation, FaTrashCan, FaXmark, FaPlus } from 'react-icons/fa6'
import { FaCar, FaSearch } from 'react-icons/fa'
import Swal from 'sweetalert2' // นำเข้า SweetAlert2
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { mockBlacklistData, mockBlacklistFoundToday } from '../data/mockData'
import '../styles/Blacklist.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

// Role ที่จัดการ (เพิ่ม/ลบ) รายการ blacklist ได้ — เปิดให้ทุก role
// เพราะกลุ่มเป้าหมายของ role "user" คือเจ้าหน้าที่รักษาความปลอดภัยที่ต้องจัดการเองหน้างาน
const BLACKLIST_MANAGE_ROLES = ['user', 'admin', 'superadmin']

const EMPTY_FORM = { plate: '', province: '', reason: '' }

function Blacklist() {
  const { user } = useAuthStore()
  const canManageBlacklist = BLACKLIST_MANAGE_ROLES.includes(user?.role)
  const [blacklist, setBlacklist] = useState(mockBlacklistData)
  const [searchInput, setSearchInput] = useState('')
  const [filteredData, setFilteredData] = useState(mockBlacklistData)
  const [showFoundModal, setShowFoundModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 800)
  }, [])

  // ฟังก์ชัน search
  function handleSearch(e) {
    const keyword = e.target.value
    setSearchInput(keyword)
    const result = blacklist.filter(item =>
      item.plate.toLowerCase().includes(keyword.toLowerCase()) ||
      item.province.includes(keyword)
    )
    setFilteredData(result)
  }

  // ฟังก์ชันลบรายการ
  function handleDelete(id, plate) {
    // ใช้ SweetAlert2 สำหรับ Confirm Delete แบบคลีนๆ
    Swal.fire({
      title: `Delete ${plate} from blacklist?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444', // สีแดงให้สื่อถึงการลบ
      cancelButtonColor: '#9ca3af', // สีเทาสำหรับปุ่มยกเลิก
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        // Logic การลบเมื่อกดยืนยัน
        const updated = blacklist.filter(item => item.id !== id)
        setBlacklist(updated)
        setFilteredData(updated)
        
        // แจ้งเตือนเมื่อลบสำเร็จ
        Swal.fire({
          icon: 'success',
          title: 'Deleted!',
          text: `${plate} removed from blacklist`,
          showConfirmButton: false,
          timer: 1500
        })
      }
    })
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function handleAddSubmit(e) {
    e.preventDefault()

    if (!formData.plate.trim() || !formData.province.trim() || !formData.reason.trim()) {
      // แจ้งเตือนเมื่อกรอกข้อมูลไม่ครบ
      Swal.fire({
        icon: 'error',
        title: 'Validation Error',
        text: 'Please fill in all fields.',
        confirmButtonColor: '#3b82f6'
      })
      return
    }

    const newEntry = {
      id: Date.now(),
      plate: formData.plate.trim(),
      province: formData.province.trim(),
      reason: formData.reason.trim(),
      date: new Date().toLocaleDateString('th-TH')
    }

    const updated = [newEntry, ...blacklist]
    setBlacklist(updated)
    setFilteredData(updated)
    setFormData(EMPTY_FORM)
    setShowAddModal(false)
    
    // แจ้งเตือนเมื่อเพิ่มข้อมูลสำเร็จ
    Swal.fire({
      icon: 'success',
      title: 'Success',
      text: `${newEntry.plate} added to blacklist`,
      showConfirmButton: false,
      timer: 1500
    })
  }

  return (
    <Layout title="Blacklist">
      {/* ลบ <Toaster /> ของ react-hot-toast ออกไปแล้ว */}
      <div className="blacklist-wrapper">

        {/* KPI Cards */}
        <div className="bl-kpi-row">
          <div className="bl-kpi-card">
            <div className="bl-kpi-icon red">
              <FaTriangleExclamation />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Total Blacklist</p>
              <h2 className="bl-kpi-val">{blacklist.length}</h2>
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
              {/* Search Bar */}
              <div className="bl-search-wrap">
                <FaSearch className="bl-search-icon" />
                <input
                  type="text"
                  placeholder="Search plate / province..."
                  value={searchInput}
                  onChange={handleSearch}
                  className="bl-search-input"
                />
              </div>

              {canManageBlacklist && (
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
                ) : filteredData.length > 0 ? (
                  filteredData.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="bl-plate-badge">{item.plate}</span>
                      </td>
                      <td>{item.province}</td>
                      <td>
                        <span className="bl-reason-badge">{item.reason}</span>
                      </td>
                      <td>{item.date}</td>
                      {canManageBlacklist && (
                        <td>
                          <button
                            className="btn-delete"
                            onClick={() => handleDelete(item.id, item.plate)}
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

      {/* Modal Found Today */}
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
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add to Blacklist</h3>
              <button
                className="modal-close"
                onClick={() => setShowAddModal(false)}
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
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-add">
                  บันทึก
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