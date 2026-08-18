import { useState, useEffect, useCallback } from 'react'
import { FaTriangleExclamation, FaTrashCan, FaXmark, FaPlus } from 'react-icons/fa6'
import { FaCar, FaSearch, FaCheck, FaPen } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import {
  getBlacklistAPI, createBlacklistAPI, updateBlacklistAPI, deleteBlacklistAPI,
  getWhitelistAPI, createWhitelistAPI, updateWhitelistAPI, deleteWhitelistAPI,
  getDetectionsAPI, getCamerasAPI
} from '../data/api'
import '../styles/Blacklist.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const MANAGE_ROLES = ['user', 'admin', 'superadmin']
const SEARCH_DEBOUNCE_MS = 400
const JOIN_PAGE_SIZE = 100
const JOIN_MAX_PAGES = 10 // safety cap กันลูปไม่รู้จบถ้าข้อมูลเยอะผิดปกติ

const EMPTY_BLACKLIST_FORM = { plate: '', province: '', reason: '' }
const EMPTY_WHITELIST_FORM = { category: 'resident', name: '', plate: '', province: '', note: '' }

const CATEGORY_LABELS = {
  resident: 'ผู้พักอาศัย',
  regular: 'ขาประจำ',
  guest: 'แขก'
}

function formatDate(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleDateString('th-TH')
}

function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

// ตัดช่องว่างออกก่อนเทียบป้ายทะเบียน กัน backend เก็บ format ไม่ตรงกันเป๊ะ (เช่น "กค 1234" vs "กค1234")
function normalizePlate(plate) {
  return (plate || '').replace(/\s+/g, '')
}

function Blacklist() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const canManage = MANAGE_ROLES.includes(user?.role)

  const [activeTab, setActiveTab] = useState('blacklist')
  const isBlacklistTab = activeTab === 'blacklist'

  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showFoundModal, setShowFoundModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [formData, setFormData] = useState(EMPTY_BLACKLIST_FORM)

  // ---------- Found Today (join blacklist + detections วันนี้ ฝั่ง frontend) ----------
  const [foundToday, setFoundToday] = useState([])
  const [isLoadingFoundToday, setIsLoadingFoundToday] = useState(true)
  const [cameras, setCameras] = useState([])

  // ดึงรายชื่อกล้องไว้แปลง camera_id -> ชื่อกล้อง (เหมือน pattern ใน History.jsx)
  useEffect(() => {
    async function fetchCameras() {
      if (!user) return
      try {
        const data = await getCamerasAPI(selectedVillageId)
        setCameras(data)
      } catch (error) {
        console.error(error)
      }
    }
    fetchCameras()
  }, [user, selectedVillageId])

  function getCameraName(cameraId) {
    const cam = cameras.find((c) => c.id === cameraId)
    return cam ? cam.name : '-'
  }

  // ดึง blacklist ทั้งหมด (loop ถ้าเกิน 1 หน้า) เอาไว้ join
  async function fetchAllBlacklistEntries() {
    let page = 1
    let items = []
    while (page <= JOIN_MAX_PAGES) {
      const data = await getBlacklistAPI({ villageId: selectedVillageId || undefined, page, pageSize: JOIN_PAGE_SIZE })
      items = items.concat(data.items)
      if (items.length >= data.total || data.items.length === 0) break
      page += 1
    }
    return items
  }

  // ดึง detections ของวันนี้ทั้งหมด (loop ถ้าเกิน 1 หน้า)
  async function fetchAllDetectionsToday() {
    const now = new Date()
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999)

    let page = 1
    let items = []
    while (page <= JOIN_MAX_PAGES) {
      const data = await getDetectionsAPI({
        village_id: selectedVillageId || undefined,
        time_detect_from: startOfDay.toISOString(),
        time_detect_to: endOfDay.toISOString(),
        page,
        page_size: JOIN_PAGE_SIZE
      })
      items = items.concat(data.items)
      if (items.length >= data.total || data.items.length === 0) break
      page += 1
    }
    return items
  }

  const fetchFoundToday = useCallback(async () => {
    if (!user) return
    setIsLoadingFoundToday(true)
    try {
      const [blacklistEntries, todayDetections] = await Promise.all([
        fetchAllBlacklistEntries(),
        fetchAllDetectionsToday()
      ])

      const blacklistSet = new Set(
        blacklistEntries.map((b) => `${normalizePlate(b.license_plate)}|${b.province}`)
      )

      const matched = todayDetections.filter((d) =>
        blacklistSet.has(`${normalizePlate(d.license_plate)}|${d.province}`)
      )

      setFoundToday(matched)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูลรถที่พบวันนี้ได้ กรุณาลองใหม่',
        confirmButtonColor: '#3b82f6'
      })
    } finally {
      setIsLoadingFoundToday(false)
    }
  }, [user, selectedVillageId])

  // โหลดตอนอยู่ tab Blacklist หรือเปลี่ยนหมู่บ้าน (ให้ตัวเลขบน KPI card อัปเดตทันทีโดยไม่ต้องกดเปิด modal ก่อน)
  useEffect(() => {
    if (!isBlacklistTab) return
    fetchFoundToday()
  }, [isBlacklistTab, fetchFoundToday])

  // ---------- ตาราง Blacklist/Whitelist หลัก (โค้ดเดิม ไม่เปลี่ยน) ----------
  const fetchList = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = isBlacklistTab
        ? await getBlacklistAPI({ villageId: selectedVillageId || undefined, licensePlate: searchInput.trim() || undefined })
        : await getWhitelistAPI({ villageId: selectedVillageId || undefined, licensePlate: searchInput.trim() || undefined })
      setList(data.items)
      setTotal(data.total)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        text: `ไม่สามารถดึงข้อมูล ${isBlacklistTab ? 'Blacklist' : 'Whitelist'} ได้ กรุณาลองใหม่`,
        confirmButtonColor: '#3b82f6'
      })
    } finally {
      setIsLoading(false)
    }
  }, [isBlacklistTab, selectedVillageId, searchInput])

  useEffect(() => {
    const timer = setTimeout(fetchList, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [fetchList])

  function handleTabChange(tab) {
    setActiveTab(tab)
    setSearchInput('')
  }

  function handleDelete(id, plate) {
    const deleteFn = isBlacklistTab ? deleteBlacklistAPI : deleteWhitelistAPI
    Swal.fire({
      title: `Delete ${plate} from ${isBlacklistTab ? 'blacklist' : 'whitelist'}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#9ca3af',
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    }).then(async (result) => {
      if (!result.isConfirmed) return
      try {
        await deleteFn(id)
        setList((prev) => prev.filter((item) => item.id !== id))
        setTotal((prev) => prev - 1)
        // ถ้าลบจาก tab blacklist อาจกระทบตัวเลข "Found Today" ด้วย → refresh ให้ตรงกัน
        if (isBlacklistTab) fetchFoundToday()
        Swal.fire({ icon: 'success', title: 'Deleted!', text: `${plate} removed`, showConfirmButton: false, timer: 1500 })
      } catch (error) {
        console.error(error)
        Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'เกิดข้อผิดพลาด กรุณาลองใหม่', confirmButtonColor: '#3b82f6' })
      }
    })
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function openAddModal() {
    setEditingEntry(null)
    setFormData(isBlacklistTab ? EMPTY_BLACKLIST_FORM : EMPTY_WHITELIST_FORM)
    setShowFormModal(true)
  }

  function openEditModal(entry) {
    setEditingEntry(entry)
    if (isBlacklistTab) {
      setFormData({ plate: entry.license_plate, province: entry.province, reason: entry.reason })
    } else {
      setFormData({
        category: entry.category,
        name: entry.name,
        plate: entry.license_plate,
        province: entry.province,
        note: entry.note || ''
      })
    }
    setShowFormModal(true)
  }

  async function handleFormSubmit(e) {
    e.preventDefault()

    if (isBlacklistTab) {
      if (!formData.plate.trim() || !formData.province.trim() || !formData.reason.trim()) {
        Swal.fire({ icon: 'error', title: 'Validation Error', text: 'Please fill in all fields.', confirmButtonColor: '#3b82f6' })
        return
      }
    } else {
      if (!formData.plate.trim() || !formData.province.trim() || !formData.name.trim()) {
        Swal.fire({ icon: 'error', title: 'Validation Error', text: 'กรุณากรอกป้ายทะเบียน, จังหวัด และชื่อ', confirmButtonColor: '#3b82f6' })
        return
      }
    }

    if (!editingEntry && !selectedVillageId) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกหมู่บ้าน',
        text: `โปรดเลือกหมู่บ้านที่ต้องการเพิ่มรายการ ${isBlacklistTab ? 'Blacklist' : 'Whitelist'} จากเมนูด้านบนก่อน`,
        confirmButtonColor: '#3b82f6'
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingEntry) {
        if (isBlacklistTab) {
          const updated = await updateBlacklistAPI(editingEntry.id, {
            licensePlate: formData.plate.trim(),
            province: formData.province.trim(),
            reason: formData.reason.trim()
          })
          setList((prev) => prev.map((item) => (item.id === editingEntry.id ? updated : item)))
        } else {
          const updated = await updateWhitelistAPI(editingEntry.id, {
            category: formData.category,
            name: formData.name.trim(),
            licensePlate: formData.plate.trim(),
            province: formData.province.trim(),
            note: formData.note.trim()
          })
          setList((prev) => prev.map((item) => (item.id === editingEntry.id ? updated : item)))
        }
        if (isBlacklistTab) fetchFoundToday() // แก้ป้าย/จังหวัดอาจกระทบผลจับคู่ Found Today
        Swal.fire({ icon: 'success', title: 'แก้ไขแล้ว', showConfirmButton: false, timer: 1500 })
      } else {
        if (isBlacklistTab) {
          const newEntry = await createBlacklistAPI(selectedVillageId, formData.plate.trim(), formData.province.trim(), formData.reason.trim())
          setList((prev) => [newEntry, ...prev])
          fetchFoundToday() // เพิ่ม blacklist ใหม่อาจแมตช์กับ detection ที่มีอยู่แล้ววันนี้
        } else {
          const newEntry = await createWhitelistAPI(
            selectedVillageId, formData.category, formData.name.trim(),
            formData.plate.trim(), formData.province.trim(), formData.note.trim()
          )
          setList((prev) => [newEntry, ...prev])
        }
        setTotal((prev) => prev + 1)
        Swal.fire({ icon: 'success', title: 'Success', showConfirmButton: false, timer: 1500 })
      }

      setFormData(isBlacklistTab ? EMPTY_BLACKLIST_FORM : EMPTY_WHITELIST_FORM)
      setShowFormModal(false)
      setEditingEntry(null)
    } catch (error) {
      console.error(error)
      const backendMessage = error.response?.data?.detail
      Swal.fire({
        icon: 'error',
        title: editingEntry ? 'แก้ไขไม่สำเร็จ' : 'เพิ่มข้อมูลไม่สำเร็จ',
        text: typeof backendMessage === 'string' ? backendMessage : 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: '#3b82f6'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Layout title="Blacklist & Whitelist">
      <div className="blacklist-wrapper">

        <div className="bl-tab-row">
          <button className={`bl-tab-btn ${isBlacklistTab ? 'active' : ''}`} onClick={() => handleTabChange('blacklist')}>
            <FaTriangleExclamation /> Blacklist
          </button>
          <button className={`bl-tab-btn whitelist ${!isBlacklistTab ? 'active' : ''}`} onClick={() => handleTabChange('whitelist')}>
            <FaCheck /> Whitelist
          </button>
        </div>

        <div className="bl-kpi-row">
          <div className="bl-kpi-card">
            <div className={`bl-kpi-icon ${isBlacklistTab ? 'red' : 'green'}`}>
              {isBlacklistTab ? <FaTriangleExclamation /> : <FaCheck />}
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Total {isBlacklistTab ? 'Blacklist' : 'Whitelist'}</p>
              <h2 className="bl-kpi-val">{total}</h2>
            </div>
          </div>

          {isBlacklistTab && (
            <div className="bl-kpi-card clickable" onClick={() => setShowFoundModal(true)}>
              <div className="bl-kpi-icon orange">
                <FaCar />
              </div>
              <div className="bl-kpi-info">
                <p className="bl-kpi-label">Found Today</p>
                <h2 className="bl-kpi-val">{isLoadingFoundToday ? '—' : foundToday.length}</h2>
              </div>
              <span className="bl-kpi-hint">Click to view →</span>
            </div>
          )}
        </div>

        {/* ตาราง — เหมือนเดิมทั้งหมด ไม่เปลี่ยน */}
        <div className="content-card">
          <div className="bl-table-header">
            <div className="bl-table-title">
              {isBlacklistTab ? <FaTriangleExclamation className="bl-title-icon" /> : <FaCheck className="bl-title-icon whitelist" />}
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  {isBlacklistTab ? 'Blacklist Records' : 'Whitelist Records'}
                </h3>
                <p className="bl-description">
                  {isBlacklistTab
                    ? 'รายการยานพาหนะที่ถูกขึ้นบัญชีดำในระบบทั้งหมด'
                    : 'รายการยานพาหนะที่ได้รับอนุญาตพิเศษในระบบทั้งหมด'}
                </p>
              </div>
            </div>

            <div className="bl-table-header-actions">
              <div className="bl-search-wrap">
                <FaSearch className="bl-search-icon" />
                <input
                  type="text"
                  placeholder="Search license plate..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="bl-search-input"
                />
              </div>

              {canManage && (
                <button className="btn-add-blacklist" onClick={openAddModal}>
                  <FaPlus /> Add to {isBlacklistTab ? 'Blacklist' : 'Whitelist'}
                </button>
              )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="bl-table">
              <thead>
                {isBlacklistTab ? (
                  <tr>
                    <th>License Plate</th>
                    <th>Province</th>
                    <th>Reason</th>
                    <th>Date Added</th>
                    {canManage && <th>Action</th>}
                  </tr>
                ) : (
                  <tr>
                    <th>License Plate</th>
                    <th>Province</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Note</th>
                    <th>Date Added</th>
                    {canManage && <th>Action</th>}
                  </tr>
                )}
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={isBlacklistTab ? (canManage ? 5 : 4) : (canManage ? 7 : 6)}><Spinner text="Loading..." /></td></tr>
                ) : list.length > 0 ? (
                  list.map((item) => (
                    isBlacklistTab ? (
                      <tr key={item.id}>
                        <td><span className="bl-plate-badge">{item.license_plate}</span></td>
                        <td>{item.province}</td>
                        <td><span className="bl-reason-badge">{item.reason}</span></td>
                        <td>{formatDate(item.created_at)}</td>
                        {canManage && (
                          <td>
                            <div className="bl-action-group">
                              <button className="btn-edit" onClick={() => openEditModal(item)} title="แก้ไข"><FaPen /></button>
                              <button className="btn-delete" onClick={() => handleDelete(item.id, item.license_plate)} title="ลบ"><FaTrashCan /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ) : (
                      <tr key={item.id}>
                        <td><span className="bl-plate-badge whitelist">{item.license_plate}</span></td>
                        <td>{item.province}</td>
                        <td>{item.name}</td>
                        <td><span className="bl-category-badge">{CATEGORY_LABELS[item.category] || item.category}</span></td>
                        <td>{item.note || '-'}</td>
                        <td>{formatDate(item.created_at)}</td>
                        {canManage && (
                          <td>
                            <div className="bl-action-group">
                              <button className="btn-edit" onClick={() => openEditModal(item)} title="แก้ไข"><FaPen /></button>
                              <button className="btn-delete" onClick={() => handleDelete(item.id, item.license_plate)} title="ลบ"><FaTrashCan /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  ))
                ) : (
                  <tr>
                    <td colSpan={isBlacklistTab ? (canManage ? 5 : 4) : (canManage ? 7 : 6)}>
                      <EmptyState
                        icon={isBlacklistTab ? <FaTriangleExclamation /> : <FaCheck />}
                        title={`No ${isBlacklistTab ? 'blacklist' : 'whitelist'} records`}
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

      {/* Modal Found Today — ตอนนี้ใช้ข้อมูลจริงจากการ join แล้ว ไม่ใช่ mock */}
      {showFoundModal && (
        <div className="modal-overlay" onClick={() => setShowFoundModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Found Today — {foundToday.length} vehicles</h3>
              <button className="modal-close" onClick={() => setShowFoundModal(false)}><FaXmark /></button>
            </div>
            <div className="modal-body-list">
              {isLoadingFoundToday ? (
                <Spinner text="กำลังโหลด..." />
              ) : foundToday.length > 0 ? (
                foundToday.map((item) => (
                  <div key={item.id} className="found-item">
                    <div className="found-item-left">
                      <FaTriangleExclamation className="found-icon" />
                      <div>
                        <span className="bl-plate-badge">{item.license_plate}</span>
                        <p className="found-province">{item.province} • {getCameraName(item.camera_id)}</p>
                      </div>
                    </div>
                    <span className="found-time">{formatTime(item.time_detect)}</span>
                  </div>
                ))
              ) : (
                <EmptyState icon={<FaTriangleExclamation />} title="ยังไม่พบรถที่ติด Blacklist วันนี้" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Add / Edit — เหมือนเดิม ไม่เปลี่ยน */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEntry ? 'Edit' : 'Add to'} {isBlacklistTab ? 'Blacklist' : 'Whitelist'}</h3>
              <button className="modal-close" onClick={() => setShowFormModal(false)} disabled={isSubmitting}>
                <FaXmark />
              </button>
            </div>
            <form className="bl-add-form" onSubmit={handleFormSubmit}>
              {!isBlacklistTab && (
                <div className="bl-add-field">
                  <label>Category</label>
                  <select name="category" value={formData.category} onChange={handleFormChange}>
                    <option value="resident">ผู้พักอาศัย (Resident)</option>
                    <option value="regular">ขาประจำ (Regular)</option>
                    <option value="guest">แขก (Guest)</option>
                  </select>
                </div>
              )}

              {!isBlacklistTab && (
                <div className="bl-add-field">
                  <label>Name</label>
                  <input type="text" name="name" placeholder="ชื่อเจ้าของรถ / ผู้พักอาศัย" value={formData.name} onChange={handleFormChange} />
                </div>
              )}

              <div className="bl-add-field">
                <label>License Plate</label>
                <input type="text" name="plate" placeholder="เช่น กค 1234" value={formData.plate} onChange={handleFormChange} />
              </div>
              <div className="bl-add-field">
                <label>Province</label>
                <input type="text" name="province" placeholder="เช่น นครปฐม" value={formData.province} onChange={handleFormChange} />
              </div>

              {isBlacklistTab ? (
                <div className="bl-add-field">
                  <label>Reason</label>
                  <input type="text" name="reason" placeholder="เช่น Suspicious Vehicle" value={formData.reason} onChange={handleFormChange} />
                </div>
              ) : (
                <div className="bl-add-field">
                  <label>Note (ไม่บังคับ)</label>
                  <input type="text" name="note" placeholder="หมายเหตุเพิ่มเติม" value={formData.note} onChange={handleFormChange} />
                </div>
              )}

              <div className="bl-add-actions">
                <button type="button" className="btn-cancel-add" onClick={() => setShowFormModal(false)} disabled={isSubmitting}>
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