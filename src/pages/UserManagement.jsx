import { useState, useEffect } from 'react'
import { FaUsers, FaUserPlus, FaUserShield, FaSearch } from 'react-icons/fa'
import { FaUserCheck, FaUserClock, FaPen, FaTrashCan, FaKey, FaXmark } from 'react-icons/fa6'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { mockUserData } from '../data/mockData'
import '../styles/UserManagement.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

// Role ที่แก้ไข/ลบบัญชี "admin" ได้ — เฉพาะ superadmin เท่านั้น
// admin แก้ไข/ลบกันเองไม่ได้ ป้องกัน admin คนหนึ่งลบ admin คนอื่น
const CAN_MANAGE_ADMIN_ROLES = ['superadmin']

// Role ที่เพิ่มบัญชี "admin" ได้ — เฉพาะ superadmin
const CAN_ADD_ADMIN_ROLES = ['superadmin']

const EMPTY_FORM = { username: '', fullName: '', phone: '', password: '', status: 'active' }

function capitalize(text) {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function isSameMonth(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
}

function UserManagement() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState(mockUserData)
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [addRole, setAddRole] = useState('user')
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 800)
  }, [])

  const totalUsers = users.length
  const activeToday = users.filter((u) => u.status === 'active').length
  const newThisMonth = users.filter((u) => isSameMonth(u.createdAt)).length

  const filteredUsers = users.filter((u) => {
    const keyword = searchInput.toLowerCase().trim()
    const matchSearch =
      keyword === '' ||
      u.username.toLowerCase().includes(keyword) ||
      u.fullName.toLowerCase().includes(keyword)
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    const matchStatus = statusFilter === 'all' || u.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  // เช็คว่า currentUser จัดการ (แก้ไข/ลบ) บัญชีเป้าหมายได้ไหม
  function canManage(targetUser) {
    if (targetUser.role === 'user') return true
    return CAN_MANAGE_ADMIN_ROLES.includes(currentUser?.role)
  }

  function openAddModal(role) {
    setEditingUser(null)
    setAddRole(role)
    setFormData(EMPTY_FORM)
    setShowFormModal(true)
  }

  function openEditModal(targetUser) {
    setEditingUser(targetUser)
    setFormData({
      username: targetUser.username,
      fullName: targetUser.fullName,
      phone: targetUser.phone,
      password: '',
      status: targetUser.status
    })
    setShowFormModal(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function handleFormSubmit(e) {
    e.preventDefault()

    if (!formData.username.trim() || !formData.fullName.trim() || !formData.phone.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรอกข้อมูลไม่ครบ',
        text: 'กรุณากรอก Username, ชื่อ-นามสกุล และเบอร์โทร',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    if (editingUser) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, username: formData.username.trim(), fullName: formData.fullName.trim(), phone: formData.phone.trim(), status: formData.status }
            : u
        )
      )
      Swal.fire({
        icon: 'success',
        title: 'บันทึกการแก้ไขแล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } else {
      const newUser = {
        id: Date.now(),
        username: formData.username.trim(),
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim(),
        role: addRole,
        status: 'active',
        lastLogin: '-',
        createdAt: new Date().toISOString().slice(0, 10)
      }
      setUsers((prev) => [newUser, ...prev])
      Swal.fire({
        icon: 'success',
        title: addRole === 'admin' ? 'เพิ่มบัญชี Admin แล้ว' : 'เพิ่มผู้ใช้ใหม่แล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }

    setShowFormModal(false)
  }

  async function handleDelete(targetUser) {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบผู้ใช้',
      text: `ต้องการลบบัญชี "${targetUser.username}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: 'rgb(220, 38, 38)',
      cancelButtonColor: 'var(--sidebar-bg)'
    })

    if (result.isConfirmed) {
      setUsers((prev) => prev.filter((u) => u.id !== targetUser.id))
      Swal.fire({
        icon: 'success',
        title: 'ลบผู้ใช้แล้ว',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    }
  }

  async function handleResetPassword(targetUser) {
    await Swal.fire({
      icon: 'info',
      title: 'รีเซ็ตรหัสผ่านแล้ว',
      text: `ระบบได้ส่งรหัสผ่านชั่วคราวให้ "${targetUser.username}" แล้ว`,
      confirmButtonColor: 'var(--sidebar-bg)'
    })
  }

  return (
    <Layout title="User Management">
      <div className="um-wrapper">

        {/* KPI Cards */}
        <div className="um-kpi-row">
          <div className="um-kpi-card">
            <div className="um-kpi-icon blue">
              <FaUsers />
            </div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">Total Users</p>
              <h2 className="um-kpi-val">{totalUsers}</h2>
            </div>
          </div>

          <div className="um-kpi-card">
            <div className="um-kpi-icon green">
              <FaUserCheck />
            </div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">Active Today</p>
              <h2 className="um-kpi-val">{activeToday}</h2>
            </div>
          </div>

          <div className="um-kpi-card">
            <div className="um-kpi-icon orange">
              <FaUserClock />
            </div>
            <div className="um-kpi-info">
              <p className="um-kpi-label">New This Month</p>
              <h2 className="um-kpi-val">{newThisMonth}</h2>
            </div>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="um-table-header">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>User List</h3>
              <p className="um-description">
                รายชื่อผู้ใช้งานทั้งหมดในระบบ — แก้ไข/ลบได้เฉพาะสิทธิ์ที่อนุญาต
              </p>
            </div>
            <div className="um-header-actions">
              <button className="btn-add-user" onClick={() => openAddModal('user')}>
                <FaUserPlus /> Add User
              </button>
              <button
                className="btn-add-admin"
                disabled={!CAN_ADD_ADMIN_ROLES.includes(currentUser?.role)}
                onClick={() => CAN_ADD_ADMIN_ROLES.includes(currentUser?.role) && openAddModal('admin')}
                title={
                  !CAN_ADD_ADMIN_ROLES.includes(currentUser?.role)
                    ? 'เฉพาะ Superadmin เท่านั้นที่เพิ่มบัญชี Admin ได้'
                    : undefined
                }
              >
                <FaUserShield /> Add Admin
              </button>
            </div>
          </div>

          <div className="um-filters">
            <div className="um-search-wrap">
              <FaSearch className="um-search-icon" />
              <input
                type="text"
                placeholder="ค้นหา username หรือชื่อ..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="um-search-input"
              />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="table-responsive">
            <table className="um-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6}>
                      <Spinner text="Loading users..." />
                    </td>
                  </tr>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const manageable = canManage(u)
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="um-user-cell">
                            <div className="um-mini-avatar">{u.username.charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="um-username">{u.username}</div>
                              <div className="um-fullname">{u.fullName}</div>
                            </div>
                          </div>
                        </td>
                        <td>{u.phone}</td>
                        <td>
                          <span className={`um-badge um-badge-${u.role}`}>{u.role}</span>
                        </td>
                        <td>
                          <span className={`um-status-dot ${u.status}`}></span>
                          {u.status === 'active' ? 'Active' : 'Inactive'}
                        </td>
                        <td>{u.lastLogin}</td>
                        <td>
                          <div className="um-actions">
                            <button
                              className="um-icon-btn edit"
                              disabled={!manageable}
                              onClick={() => manageable && openEditModal(u)}
                            >
                              <FaPen />
                            </button>
                            <button
                              className="um-icon-btn reset"
                              disabled={!manageable}
                              onClick={() => manageable && handleResetPassword(u)}
                            >
                              <FaKey />
                            </button>
                            <button
                              className="um-icon-btn delete"
                              disabled={!manageable}
                              onClick={() => manageable && handleDelete(u)}
                            >
                              <FaTrashCan />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<FaUsers />}
                        title="No users found"
                        description="Try changing the filter or search keyword"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Add/Edit User */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <button className="modal-close" onClick={() => setShowFormModal(false)}>
                <FaXmark />
              </button>
            </div>
            <form className="um-form" onSubmit={handleFormSubmit}>
              <div className="um-form-field">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  placeholder="เช่น somchai_k"
                  value={formData.username}
                  onChange={handleFormChange}
                />
              </div>
              <div className="um-form-field">
                <label>ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  name="fullName"
                  placeholder="เช่น สมชาย กิจเจริญ"
                  value={formData.fullName}
                  onChange={handleFormChange}
                />
              </div>
              <div className="um-form-field">
                <label>เบอร์โทร</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="เช่น 0891234567"
                  value={formData.phone}
                  onChange={handleFormChange}
                />
              </div>
              <div className="um-form-field">
                <label>Role</label>
                <input
                  type="text"
                  value={editingUser ? capitalize(editingUser.role) : capitalize(addRole)}
                  disabled
                />
                <p className="um-role-hint">
                  {editingUser
                    ? null
                    : addRole === 'admin'
                      ? 'กำลังสร้างบัญชีสิทธิ์ Admin'
                      : currentUser?.role === 'admin'
                        ? 'จำกัดไว้ที่ User เนื่องจากบัญชีของคุณมีสิทธิ์ Admin เท่านั้น'
                        : 'กำลังสร้างบัญชีสิทธิ์ User'}
                </p>
              </div>
              {!editingUser && (
                <div className="um-form-field">
                  <label>Password ชั่วคราว</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleFormChange}
                  />
                </div>
              )}
              {editingUser && (
                <div className="um-form-field">
                  <label>สถานะ</label>
                  <select name="status" value={formData.status} onChange={handleFormChange}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}
              <div className="um-form-actions">
                <button type="button" className="btn-cancel-um" onClick={() => setShowFormModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn-confirm-um">
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

export default UserManagement