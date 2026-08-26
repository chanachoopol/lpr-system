import { useState, useEffect, useCallback } from 'react'
import { FaVideo, FaSearch } from 'react-icons/fa'
import { FaCirclePlus, FaPen, FaTrashCan, FaXmark, FaRotate, FaTriangleExclamation } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import '../styles/CameraManagement.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import {
  getCameraListAPI,
  createCameraAPI,
  updateCameraAPI,
  deleteCameraAPI,
  resyncAllCamerasAPI,
  resyncCameraAiVisionAPI,
  getCameraStatusAPI
} from '../data/api'

// หมายเหตุ field ของ backend: lat/long (ไม่ใช่ lon), ไม่มี status online/offline
// มีแค่ is_active (เปิด/ปิดใช้งานกล้อง)
// stream_ai = แหล่งสตรีมที่ป้อนเข้า (RTSP) — ส่วน stream_url เป็นค่าที่ backend generate ให้เอง ห้ามส่งตอน create/update
// direction = ทิศทางกล้อง (ยืนยันจาก Swagger: enum "entry" | "exit" เท่านั้น)
const EMPTY_FORM = { name: '', lat: '', long: '', streamAi: '', direction: 'entry', isActive: true, villageId: '' }
const DIRECTION_LABELS = {
  entry: 'ขาเข้า',
  exit: 'ขาออก'
}

// แปลง ISO timestamp เป็นวันที่ + เวลาแบบไทย (ใช้กับ ai_vision_synced_at)
function formatSyncedAt(isoString) {
  if (!isoString) return 'ยังไม่เคยซิงค์'
  return new Date(isoString).toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
}

// map verification_status (เชื่อมต่อกับ AI Vision) + syncWarning เป็น badge เดียวที่โชว์ในตาราง
function getSyncStatusBadge(camera) {
  const status = camera.verification_status
  const aiVisionStuck = camera.syncWarning?.failedServices?.includes('ai_vision')

  if (status === 'pending' && aiVisionStuck) {
    return { label: 'AI Vision ค้างการยืนยัน — กดรีซิงค์ใหม่', tone: 'stuck', clickable: true }
  }
  if (status === 'pending') {
    return { label: 'กำลังเชื่อมต่อ AI Vision...', tone: 'pending', clickable: false }
  }
  if (status === 'verified') {
    return { label: 'เชื่อมต่อ AI Vision สำเร็จ', tone: 'verified', clickable: false }
  }
  if (status === 'failed') {
    return { label: 'AI Vision ปฏิเสธการเชื่อมต่อ — ส่งอีกครั้ง', tone: 'failed', clickable: true }
  }
  return { label: '-', tone: 'unknown', clickable: false }
}

// map stream_online (จาก GET /api/cameras/{id}/status) เป็น badge สำหรับคอลัมน์ Streaming Status (MediaMTX)
function getStreamingStatusBadge(camera) {
  if (camera.stream_online === undefined) {
    return { label: 'กำลังตรวจสอบ...', tone: 'unknown' }
  }
  if (camera.stream_online === true) {
    return { label: 'สตรีมมิ่งออนไลน์', tone: 'online' }
  }
  return { label: 'สตรีมมิ่งออฟไลน์', tone: 'offline' }
}

function CameraManagement() {
  const { user } = useAuthStore()
  const { selectedVillageId, getVillageName, villages } = useVillageStore()

  const [cameras, setCameras] = useState([])
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingCamera, setEditingCamera] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResyncingAll, setIsResyncingAll] = useState(false)

  const latestCameraEvent = useNotificationStore((state) => state.latestCameraEvent)

  // merge SSE event เข้า state คล้าย pattern latestDetection ใน Dashboard.jsx
  // syncWarning เป็น session-only field ไม่มีใน API — หายไปเมื่อ refresh หน้า (ตามที่ตกลงไว้)
  useEffect(() => {
    if (!latestCameraEvent) return
    const { type, camera_id } = latestCameraEvent

    setCameras((prev) => prev.map((c) => {
      if (c.id !== camera_id) return c

      if (type === 'verified') {
        return {
          ...c,
          verification_status: 'verified',
          is_active: latestCameraEvent.is_active ?? c.is_active,
          syncWarning: null
        }
      }
      if (type === 'verification_failed') {
        // backend ปิดกล้องอัตโนมัติตอน verify failed → ต้อง sync is_active ด้วย ไม่ใช่แค่ badge
        return {
          ...c,
          verification_status: 'failed',
          is_active: latestCameraEvent.is_active ?? false,
          syncWarning: null
        }
      }
      if (type === 'sync_failed') {
        // ไม่แตะ verification_status/is_active เลย เป็นแค่ warning ซ้อน
        return {
          ...c,
          syncWarning: { failedServices: latestCameraEvent.failed_services, at: new Date() }
        }
      }
      return c
    }))
  }, [latestCameraEvent])

  // ดึงรายการกล้องจาก backend จริง — ยึดตาม selectedVillageId (หมู่บ้านที่กำลังดูอยู่)
  // superadmin เลือก "ทุกหมู่บ้าน" (null) → ไม่ส่ง village_id ได้ทุกหมู่บ้าน
  const fetchCameras = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getCameraListAPI({
        villageId: selectedVillageId || undefined,
        page: 1,
        pageSize: 100
      })
      setCameras(data.items)
      setTotal(data.total)
      setIsLoading(false)

      // ดึงสถานะ MediaMTX (stream_online) ของแต่ละกล้องแบบขนาน — ไม่มี endpoint แบบ bulk
      // ไม่บล็อกการแสดงตารางหลัก ถ้ากล้องไหน error ก็ไม่ล้มทั้งหน้า แค่ badge กล้องนั้นจะโชว์ "กำลังตรวจสอบ..."
      const statusResults = await Promise.allSettled(
        data.items.map((c) => getCameraStatusAPI(c.id))
      )

      setCameras((prev) =>
        prev.map((c, index) => {
          const result = statusResults[index]
          if (result?.status === 'fulfilled') {
            return { ...c, stream_online: result.value.stream_online }
          }
          return c
        })
      )
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลกล้องไม่สำเร็จ',
        text: 'กรุณาลองรีเฟรชหน้าใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      setIsLoading(false)
    }
  }, [selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  const activeCount = cameras.filter((c) => c.is_active).length
  const inactiveCount = cameras.filter((c) => !c.is_active).length

  const filteredCameras = cameras.filter((c) => {
    const keyword = searchInput.toLowerCase().trim()
    return keyword === '' || c.name.toLowerCase().includes(keyword)
  })

  function openAddModal() {
    setEditingCamera(null)
    setFormData({
      ...EMPTY_FORM,
      // admin ล็อกไว้ที่หมู่บ้านตัวเอง, superadmin default ตามหมู่บ้านที่กำลังดูอยู่ (เลือกใหม่ได้)
      villageId: user?.role === 'admin' ? user.village_id : (selectedVillageId || '')
    })
    setShowFormModal(true)
  }

  function openEditModal(camera) {
    setEditingCamera(camera)
    setFormData({
      name: camera.name,
      lat: camera.lat,
      long: camera.long,
      streamAi: camera.stream_ai || '',
      direction: camera.direction || 'entry', // fallback 'entry' เผื่อกล้องเก่าไม่มี field นี้
      isActive: camera.is_active,
      villageId: camera.village_id || ''
    })
    setShowFormModal(true)
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleFormSubmit(e) {
    e.preventDefault()

    if (!formData.name.trim() || formData.lat === '' || formData.long === '' || !formData.streamAi.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรอกข้อมูลไม่ครบ',
        text: 'กรุณากรอกชื่อกล้อง, พิกัด (lat/long) และ Stream Source',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingCamera) {
        await updateCameraAPI(editingCamera.id, {
          name: formData.name.trim(),
          lat: parseFloat(formData.lat),
          long: parseFloat(formData.long),
          stream_ai: formData.streamAi.trim(),
          direction: formData.direction,
          is_active: formData.isActive
        })
        Swal.fire({
          icon: 'success',
          title: 'บันทึกการแก้ไขกล้องแล้ว',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      } else {
        // ใช้หมู่บ้านจากฟอร์ม (superadmin เลือกเอง / admin ถูกล็อกไว้แล้วตอน openAddModal)
        if (!formData.villageId) {
          Swal.fire({
            icon: 'warning',
            title: 'กรุณาเลือกหมู่บ้าน',
            text: 'โปรดเลือกหมู่บ้านที่ต้องการเพิ่มกล้องก่อนบันทึก',
            confirmButtonColor: 'var(--sidebar-bg)'
          })
          setIsSubmitting(false)
          return
        }
        await createCameraAPI(
          formData.villageId,
          formData.name.trim(),
          parseFloat(formData.lat),
          parseFloat(formData.long),
          formData.streamAi.trim(),
          formData.direction
        )
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มกล้องใหม่แล้ว',
          confirmButtonColor: 'var(--sidebar-bg)'
        })
      }

      setShowFormModal(false)
      fetchCameras()
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

  async function handleDelete(camera) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบกล้อง',
      text: `ต้องการลบ "${camera.name}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (!result.isConfirmed) return

    try {
      await deleteCameraAPI(camera.id)
      setCameras((prev) => prev.filter((c) => c.id !== camera.id))
      setTotal((prev) => prev - 1)
      Swal.fire({
        icon: 'success',
        title: 'ลบกล้องแล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
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

  async function handleResyncAll() {
    setIsResyncingAll(true)
    try {
      await resyncAllCamerasAPI()
      Swal.fire({
        icon: 'success',
        title: 'สั่งซิงค์กล้องทั้งหมดกับ Streaming แล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      fetchCameras()
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ซิงค์ไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsResyncingAll(false)
    }
  }

  async function handleResyncOne(camera) {
    try {
      await resyncCameraAiVisionAPI(camera.id)
      Swal.fire({
        icon: 'success',
        title: `ซิงค์ ${camera.name} แล้ว`,
        showConfirmButton: false,
        timer: 1500
      })
      fetchCameras()
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'ซิงค์ไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  const showVillageColumn = user?.role === 'superadmin'

  return (
    <Layout title="Camera Management">
      <div className="cm-wrapper">

        {/* KPI Cards */}
        <div className="cm-kpi-row">
          <div className="cm-kpi-card">
            <div className="cm-kpi-icon blue">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Total Cameras</p>
              <h2 className="cm-kpi-val">{total}</h2>
            </div>
          </div>

          <div className="cm-kpi-card">
            <div className="cm-kpi-icon green">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Active</p>
              <h2 className="cm-kpi-val green">{activeCount}</h2>
            </div>
          </div>

          <div className="cm-kpi-card">
            <div className="cm-kpi-icon red">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Inactive</p>
              <h2 className="cm-kpi-val red">{inactiveCount}</h2>
            </div>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="cm-table-header">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Camera List</h3>
              <p className="cm-description">
                รายการกล้อง LPR ทั้งหมดในระบบ — ใช้ร่วมกับหน้า Monitor และ Dashboard
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn-add-camera"
                onClick={handleResyncAll}
                disabled={isResyncingAll}
                style={{ background: 'rgb(37, 99, 235)' }}
              >
                <FaRotate /> {isResyncingAll ? 'กำลังซิงค์...' : 'Resync All'}
              </button>
              <button className="btn-add-camera" onClick={openAddModal}>
                <FaCirclePlus /> Add Camera
              </button>
            </div>
          </div>

          <div className="cm-search-wrap">
            <FaSearch className="cm-search-icon" />
            <input
              type="text"
              placeholder="ค้นหาชื่อกล้อง..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="cm-search-input"
            />
          </div>

          <div className="table-responsive">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Camera Name</th>
                  {showVillageColumn && <th>Village</th>}
                  <th>Location (lat, long)</th>
                  <th>Direction</th>
                  <th>Power Status</th>
                  <th>AI Vision Status</th>
                  <th>Streaming Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={showVillageColumn ? 8 : 7}>
                      <Spinner text="Loading cameras..." />
                    </td>
                  </tr>
                ) : filteredCameras.length > 0 ? (
                  filteredCameras.map((c) => (
                    <tr key={c.id}>
                      <td className="cm-camera-name">{c.name}</td>
                      {showVillageColumn && <td>{getVillageName(c.village_id)}</td>}
                      <td className="cm-location">
                        {Number(c.lat).toFixed(6)}, {Number(c.long).toFixed(6)}
                      </td>
                      <td>
                        <span className={`cm-direction-badge ${c.direction || 'entry'}`}>
                          {DIRECTION_LABELS[c.direction] || '-'}
                        </span>
                      </td>
                      <td>
                        <span className={`cm-status-badge ${c.is_active ? 'online' : 'offline'}`}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="cm-sync-cell">
                        {(() => {
                          const badge = getSyncStatusBadge(c)
                          return (
                            <>
                              <span
                                className={`cm-sync-badge ${badge.tone}`}
                                onClick={badge.clickable ? () => handleResyncOne(c) : undefined}
                                title={badge.clickable ? 'คลิกเพื่อส่งคำขอซิงค์ใหม่' : undefined}
                              >
                                {badge.label}
                              </span>
                              {c.syncWarning && (
                                <span
                                  className="cm-sync-warning-icon"
                                  title={`Sync error: ${c.syncWarning.failedServices?.join(', ') || 'unknown'}`}
                                >
                                  <FaTriangleExclamation />
                                </span>
                              )}
                              <p className="cm-sync-time">{formatSyncedAt(c.ai_vision_synced_at)}</p>
                            </>
                          )
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const streamBadge = getStreamingStatusBadge(c)
                          return (
                            <span className={`cm-status-badge ${streamBadge.tone}`}>
                              {streamBadge.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td>
                        <div className="cm-actions">
                          <button className="cm-icon-btn edit" onClick={() => openEditModal(c)}>
                            <FaPen />
                          </button>
                          <button className="cm-icon-btn delete" onClick={() => handleDelete(c)}>
                            <FaTrashCan />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={showVillageColumn ? 8 : 7}>
                      <EmptyState
                        icon={<FaVideo />}
                        title="No cameras found"
                        description="Try a different search keyword"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Add/Edit Camera */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => !isSubmitting && setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCamera ? 'Edit Camera' : 'Add New Camera'}</h3>
              <button className="modal-close" onClick={() => setShowFormModal(false)} disabled={isSubmitting}>
                <FaXmark />
              </button>
            </div>
            <form className="cm-form" onSubmit={handleFormSubmit}>
              {!editingCamera && (
                <div className="cm-form-field">
                  <label>หมู่บ้าน</label>
                  {user?.role === 'superadmin' ? (
                    <select name="villageId" value={formData.villageId} onChange={handleFormChange}>
                      <option value="">-- เลือกหมู่บ้าน --</option>
                      {villages.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={getVillageName(user?.village_id)} disabled />
                  )}
                  <p className="cm-description" style={{ margin: '4px 0 0' }}>
                    {user?.role === 'superadmin'
                      ? 'เลือกหมู่บ้านที่ต้องการเพิ่มกล้องเข้าไป'
                      : 'ล็อกไว้ที่หมู่บ้านของคุณ เนื่องจาก Admin เพิ่มกล้องได้เฉพาะหมู่บ้านตัวเอง'}
                  </p>
                </div>
              )}

              <div className="cm-form-field">
                <label>Camera Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="เช่น Main Entrance (Inbound)"
                  value={formData.name}
                  onChange={handleFormChange}
                />
              </div>
              <div className="cm-form-row">
                <div className="cm-form-field">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    name="lat"
                    placeholder="เช่น 13.844849"
                    value={formData.lat}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="cm-form-field">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    name="long"
                    placeholder="เช่น 100.632904"
                    value={formData.long}
                    onChange={handleFormChange}
                  />
                </div>
              </div>
              <div className="cm-form-field">
                <label>Stream Source (RTSP / AI Input)</label>
                <input
                  type="text"
                  name="streamAi"
                  placeholder="rtsp://..."
                  value={formData.streamAi}
                  onChange={handleFormChange}
                  disabled={!!editingCamera}
                />
                {editingCamera && (
                  <p className="cm-description" style={{ margin: '4px 0 0' }}>
                    ไม่สามารถแก้ไขลิงก์สตรีมของกล้องที่เพิ่มไว้แล้วได้ หากต้องการเปลี่ยนแหล่งสตรีม กรุณาลบกล้องนี้แล้วเพิ่มใหม่
                  </p>
                )}
              </div>
              <div className="cm-form-field">
                <label>Direction (ทิศทาง)</label>
                <select name="direction" value={formData.direction} onChange={handleFormChange}>
                  <option value="entry">ขาเข้า (Entry)</option>
                  <option value="exit">ขาออก (Exit)</option>
                </select>
              </div>
              {editingCamera && (
                <div className="cm-form-field">
                  <label>สถานะ</label>
                  <select
                    name="isActive"
                    value={formData.isActive ? 'active' : 'inactive'}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, isActive: e.target.value === 'active' }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
              <div className="cm-form-actions">
                <button
                  type="button"
                  className="btn-cancel-cm"
                  onClick={() => setShowFormModal(false)}
                  disabled={isSubmitting}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-cm" disabled={isSubmitting}>
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

export default CameraManagement