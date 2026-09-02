import { useState, useEffect, useCallback } from 'react'
import { FaSearch, FaCalendarAlt, FaRedo, FaEye } from 'react-icons/fa'
import { FaClipboardList, FaXmark, FaCircleExclamation, FaCircleCheck } from 'react-icons/fa6'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { getAuditLogsAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import '../styles/AuditLog.css'

const PAGE_SIZE = 20

// รายการ action ที่รู้จัก — เผื่อ backend เพิ่ม action ใหม่ในอนาคตที่ยังไม่ได้ map ไว้
// ตัวไหนไม่ตรงกับ list นี้ ระบบจะ fallback ไป format string ให้อ่านง่ายแทน (ดู formatActionLabel)
const ACTION_META = {
  login_success:     { label: 'Login Success',     tone: 'green'  },
  login_failed:       { label: 'Login Failed',       tone: 'red'    },
  logout:              { label: 'Logout',              tone: 'gray'   },
  blacklist_create:   { label: 'Add Blacklist',      tone: 'blue'   },
  blacklist_update:   { label: 'Update Blacklist',   tone: 'orange' },
  blacklist_delete:   { label: 'Delete Blacklist',   tone: 'red'    },
  user_create:         { label: 'Create User',        tone: 'blue'   },
  user_update:         { label: 'Update User',        tone: 'orange' },
  user_delete:         { label: 'Delete User',        tone: 'red'    },
  password_reset:     { label: 'Reset Password',     tone: 'orange' },
  camera_create:       { label: 'Add Camera',         tone: 'blue'   },
  camera_update:       { label: 'Update Camera',      tone: 'orange' },
  camera_delete:       { label: 'Delete Camera',      tone: 'red'    },
}

// ตัวเลือกใน dropdown filter — ใช้ key เดียวกับ ACTION_META
const ACTION_OPTIONS = Object.keys(ACTION_META)

function formatActionLabel(action) {
  if (!action) return '-'
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function getActionMeta(action) {
  return ACTION_META[action] || { label: formatActionLabel(action), tone: 'gray' }
}

// backend ส่ง username มาให้ตรงๆ ใน audit log แล้ว (join ตาราง users มาให้แล้ว)
// ถ้าไม่มี user_id เลย แปลว่าเป็น action ที่ระบบทำเอง (System)
// ถ้ามี user_id แต่ไม่มี username (เช่น user ถูกลบไปแล้ว) ก็ fallback ไปโชว์ UUID แบบย่อ
function extractDisplayUser(log) {
  if (log.username) return { label: log.username, isGuess: false }
  if (!log.user_id) return { label: 'System', isGuess: false }
  return { label: `${log.user_id.slice(0, 8)}…`, isGuess: false }
}

function formatDateTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  })
}

function startOfDayISO(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfDayISO(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function AuditLog() {
  const currentUser = useAuthStore((state) => state.user)
  const { selectedVillageId } = useVillageStore()
  const isSuperadmin = currentUser?.role === 'superadmin'

  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  const [actionFilter, setActionFilter] = useState('all')
  const [dateRange, setDateRange] = useState([null, null])
  const [dateFrom, dateTo] = dateRange || [null, null]

  const [selectedLog, setSelectedLog] = useState(null)

  // KPI — ยิงแยกจากตารางหลัก เพราะต้องใช้ total ของ query ที่ไม่ผูกกับ filter บนตาราง
  const [kpiLoading, setKpiLoading] = useState(true)
  const [totalAllTime, setTotalAllTime] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [failedLoginToday, setFailedLoginToday] = useState(0)

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const isSuper = currentUser?.role === 'superadmin'
      const targetVillageId = isSuper ? (selectedVillageId || undefined) : undefined
      const data = await getAuditLogsAPI({
        villageId: targetVillageId,
        action: actionFilter === 'all' ? undefined : actionFilter,
        createdAtFrom: dateFrom ? startOfDayISO(dateFrom) : undefined,
        createdAtTo: dateTo ? endOfDayISO(dateTo) : undefined,
        page,
        pageSize: PAGE_SIZE
      })

      // ถ้าเป็น Admin ให้กรอง Audit Log ของ Superadmin ออก
      const visibleItems = isSuper
        ? (data?.items || [])
        : (data?.items || []).filter((item) => {
            const uname = item.username?.toLowerCase()?.trim()
            return uname !== 'superadmin'
          })

      setLogs(visibleItems)
      setTotal(isSuper ? (data?.total || 0) : Math.max(0, (data?.total || 0) - ((data?.items?.length || 0) - visibleItems.length)))
    } catch (error) {
      console.error('AuditLog fetchLogs error:', error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูล Audit Log ได้ กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentUser?.role, selectedVillageId, actionFilter, dateFrom, dateTo, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // เปลี่ยน filter ใดๆ → กลับไปหน้า 1 เสมอ
  useEffect(() => {
    setPage(1)
  }, [actionFilter, dateFrom, dateTo])

  // ปิด modal ดูรายละเอียด Log Detail เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        setSelectedLog(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ดึงตัวเลข KPI ครั้งเดียวตอนเปิดหน้า (ใช้ page_size:1 เพราะสนใจแค่ total)
  useEffect(() => {
    async function fetchKpis() {
      setKpiLoading(true)
      try {
        const isSuper = currentUser?.role === 'superadmin'
        const targetVillageId = isSuper ? (selectedVillageId || undefined) : undefined
        const [allTime, today, failedToday] = await Promise.all([
          getAuditLogsAPI({ villageId: targetVillageId, page: 1, pageSize: 1 }),
          getAuditLogsAPI({
            villageId: targetVillageId,
            page: 1,
            pageSize: 1,
            createdAtFrom: startOfDayISO(new Date()),
            createdAtTo: endOfDayISO(new Date())
          }),
          getAuditLogsAPI({
            villageId: targetVillageId,
            page: 1,
            pageSize: 1,
            action: 'login_failed',
            createdAtFrom: startOfDayISO(new Date()),
            createdAtTo: endOfDayISO(new Date())
          })
        ])
        setTotalAllTime(allTime?.total || 0)
        setTotalToday(today?.total || 0)
        setFailedLoginToday(failedToday?.total || 0)
      } catch (error) {
        console.error('AuditLog fetchKpis error:', error)
      } finally {
        setKpiLoading(false)
      }
    }
    fetchKpis()
  }, [currentUser?.role, selectedVillageId])

  function handleReset() {
    setActionFilter('all')
    setDateRange([null, null])
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <Layout title="Audit Log">
      <div className="al-wrapper">

        {/* KPI Cards */}
        <div className="al-kpi-row">
          <div className="al-kpi-card">
            <div className="al-kpi-icon blue">
              <FaClipboardList />
            </div>
            <div className="al-kpi-info">
              <p className="al-kpi-label">Total Records</p>
              <h2 className="al-kpi-val">{kpiLoading ? '—' : totalAllTime.toLocaleString()}</h2>
            </div>
          </div>

          <div className="al-kpi-card">
            <div className="al-kpi-icon green">
              <FaCircleCheck />
            </div>
            <div className="al-kpi-info">
              <p className="al-kpi-label">Actions Today</p>
              <h2 className="al-kpi-val">{kpiLoading ? '—' : totalToday.toLocaleString()}</h2>
            </div>
          </div>

          <div className="al-kpi-card">
            <div className="al-kpi-icon red">
              <FaCircleExclamation />
            </div>
            <div className="al-kpi-info">
              <p className="al-kpi-label">Failed Logins Today</p>
              <h2 className="al-kpi-val red">{kpiLoading ? '—' : failedLoginToday.toLocaleString()}</h2>
            </div>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="al-table-header">
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Activity Log</h3>
              <p className="al-description">
                บันทึกการใช้งานทั้งหมดในระบบ — login, จัดการ blacklist, ผู้ใช้ และกล้อง
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="al-filter-bar">
            <div className="al-filter-group">
              <label>Action</label>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                <option value="all">All Actions</option>
                {ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {ACTION_META[action].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="al-filter-group">
              <label>Date Range</label>
              <div className="al-date-wrap">
                <FaCalendarAlt className="al-date-icon" />
                <DatePicker
                  selectsRange
                  startDate={dateFrom}
                  endDate={dateTo}
                  onChange={(update) => setDateRange(update ?? [null, null])}
                  dateFormat="dd/MM/yyyy"
                  maxDate={new Date()}
                  isClearable
                  placeholderText="All dates"
                  className="datepicker-al"
                />
              </div>
            </div>

            <button className="btn-reset-al" onClick={handleReset}>
              <FaRedo /> Reset
            </button>
          </div>

          <div className="table-responsive">
            <table className="al-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Detail</th>
                  <th>IP Address</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6}>
                      <Spinner text="Loading audit logs..." />
                    </td>
                  </tr>
                ) : logs.length > 0 ? (
                  logs.map((log) => {
                    const meta = getActionMeta(log.action)
                    const displayUser = extractDisplayUser(log)
                    return (
                      <tr key={log.id}>
                        <td className="al-timestamp">{formatDateTime(log.created_at)}</td>
                        <td>
                          <span className={`al-user-cell ${displayUser.isGuess ? '' : 'al-user-uuid'}`}>
                            {displayUser.label}
                          </span>
                        </td>
                        <td>
                          <span className={`al-action-badge ${meta.tone}`}>{meta.label}</span>
                        </td>
                        <td className="al-detail-cell">{log.detail}</td>
                        <td className="al-ip">{log.ip_address || '-'}</td>
                        <td>
                          <button className="al-icon-btn" onClick={() => setSelectedLog(log)}>
                            <FaEye />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<FaSearch />}
                        title="No audit logs found"
                        description="Try changing the filter or date range"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                ‹
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} style={{ display: 'flex', gap: '6px' }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="page-ellipsis">…</span>}
                    <button
                      className={`page-btn ${page === p ? 'active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  </span>
                ))}

              <button
                className="page-btn"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                ›
              </button>
            </div>
          )}

          <p className="al-total-count">
            Showing {logs.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + logs.length} of {total.toLocaleString()} records
          </p>
        </div>
      </div>

      {/* Modal Detail */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Log Detail</h3>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>
                <FaXmark />
              </button>
            </div>
            <div className="al-modal-body">
              <div className="al-modal-row">
                <span className="info-label">Timestamp</span>
                <span>{formatDateTime(selectedLog.created_at)}</span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">User</span>
                <span>{extractDisplayUser(selectedLog).label}</span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">Action</span>
                <span className={`al-action-badge ${getActionMeta(selectedLog.action).tone}`}>
                  {getActionMeta(selectedLog.action).label}
                </span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">Detail</span>
                <span>{selectedLog.detail}</span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">User ID</span>
                <span className="al-mono">{selectedLog.user_id || '-'}</span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">Village</span>
                <span>{selectedLog.village_name || selectedLog.village_id || '-'}</span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">IP Address</span>
                <span className="al-mono">{selectedLog.ip_address || '-'}</span>
              </div>
              <div className="al-modal-row">
                <span className="info-label">User Agent</span>
                <span className="al-mono al-ua">{selectedLog.user_agent || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default AuditLog