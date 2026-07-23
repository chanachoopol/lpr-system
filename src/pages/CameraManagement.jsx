import { useState, useEffect } from 'react'
import { FaVideo, FaSearch } from 'react-icons/fa'
import { FaCirclePlus, FaPen, FaTrashCan, FaXmark } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import { mockCameraLocations } from '../data/mockData'
import '../styles/CameraManagement.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const EMPTY_FORM = { name: '', lat: '', lon: '', streamUrl: '', status: 'online' }

function CameraManagement() {
  const [cameras, setCameras] = useState(mockCameraLocations)
  const [searchInput, setSearchInput] = useState('')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingCamera, setEditingCamera] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 800)
  }, [])

  const totalCameras = cameras.length
  const onlineCount = cameras.filter((c) => c.status === 'online').length
  const offlineCount = cameras.filter((c) => c.status === 'offline').length

  const filteredCameras = cameras.filter((c) => {
    const keyword = searchInput.toLowerCase().trim()
    return keyword === '' || c.name.toLowerCase().includes(keyword)
  })

  function openAddModal() {
    setEditingCamera(null)
    setFormData(EMPTY_FORM)
    setShowFormModal(true)
  }

  function openEditModal(camera) {
    setEditingCamera(camera)
    setFormData({
      name: camera.name,
      lat: camera.lat,
      lon: camera.lon,
      streamUrl: camera.streamUrl,
      status: camera.status
    })
    setShowFormModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function handleFormSubmit(e) {
    e.preventDefault()

    if (!formData.name.trim() || !formData.lat || !formData.lon || !formData.streamUrl.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรอกข้อมูลไม่ครบ',
        text: 'กรุณากรอกชื่อกล้อง, พิกัด (lat/lon) และ Stream URL',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (editingCamera) {
      setCameras((prev) =>
        prev.map((c) =>
          c.id === editingCamera.id
            ? {
                ...c,
                name: formData.name.trim(),
                lat: parseFloat(formData.lat),
                lon: parseFloat(formData.lon),
                streamUrl: formData.streamUrl.trim(),
                status: formData.status
              }
            : c
        )
      )
      Swal.fire({
        icon: 'success',
        title: 'บันทึกการแก้ไขกล้องแล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } else {
      const newCamera = {
        id: `cam-${Date.now()}`,
        name: formData.name.trim(),
        lat: parseFloat(formData.lat),
        lon: parseFloat(formData.lon),
        streamUrl: formData.streamUrl.trim(),
        status: 'online'
      }
      setCameras((prev) => [newCamera, ...prev])
      Swal.fire({
        icon: 'success',
        title: 'เพิ่มกล้องใหม่แล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }

    setShowFormModal(false)
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

    if (result.isConfirmed) {
      setCameras((prev) => prev.filter((c) => c.id !== camera.id))
      Swal.fire({
        icon: 'success',
        title: 'ลบกล้องแล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

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
              <h2 className="cm-kpi-val">{totalCameras}</h2>
            </div>
          </div>

          <div className="cm-kpi-card">
            <div className="cm-kpi-icon green">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Online</p>
              <h2 className="cm-kpi-val green">{onlineCount}</h2>
            </div>
          </div>

          <div className="cm-kpi-card">
            <div className="cm-kpi-icon red">
              <FaVideo />
            </div>
            <div className="cm-kpi-info">
              <p className="cm-kpi-label">Offline</p>
              <h2 className="cm-kpi-val red">{offlineCount}</h2>
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
            <button className="btn-add-camera" onClick={openAddModal}>
              <FaCirclePlus /> Add Camera
            </button>
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
                  <th>Location (lat, lon)</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4}>
                      <Spinner text="Loading cameras..." />
                    </td>
                  </tr>
                ) : filteredCameras.length > 0 ? (
                  filteredCameras.map((c) => (
                    <tr key={c.id}>
                      <td className="cm-camera-name">{c.name}</td>
                      <td className="cm-location">{c.lat.toFixed(6)}, {c.lon.toFixed(6)}</td>
                      <td>
                        <span className={`cm-status-badge ${c.status}`}>
                          {c.status === 'online' ? 'Online' : 'Offline'}
                        </span>
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
                    <td colSpan={4}>
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
        <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCamera ? 'Edit Camera' : 'Add New Camera'}</h3>
              <button className="modal-close" onClick={() => setShowFormModal(false)}>
                <FaXmark />
              </button>
            </div>
            <form className="cm-form" onSubmit={handleFormSubmit}>
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
                    name="lon"
                    placeholder="เช่น 100.632904"
                    value={formData.lon}
                    onChange={handleFormChange}
                  />
                </div>
              </div>
              <div className="cm-form-field">
                <label>Stream URL</label>
                <input
                  type="text"
                  name="streamUrl"
                  placeholder="https://..."
                  value={formData.streamUrl}
                  onChange={handleFormChange}
                />
              </div>
              {editingCamera && (
                <div className="cm-form-field">
                  <label>สถานะ</label>
                  <select name="status" value={formData.status} onChange={handleFormChange}>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
              )}
              <div className="cm-form-actions">
                <button type="button" className="btn-cancel-cm" onClick={() => setShowFormModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-cm">
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

export default CameraManagement