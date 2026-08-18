import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import MapView from '../components/Map'
import { getReportDailyAPI, getDetectionsAPI, getCameraListAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import useNotificationStore from '../store/notificationStore'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { FaCar } from 'react-icons/fa'
import '../styles/Dashboard.css'

const RECENT_HISTORY_LIMIT = 10

function toDateParam(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function Dashboard() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore()
  const latestDetection = useNotificationStore((state) => state.latestDetection)

  // ---------- Stat Cards ----------
  const [dailyData, setDailyData] = useState(null)
  const [isLoadingStats, setIsLoadingStats] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!user) return
    setIsLoadingStats(true)
    try {
      const data = await getReportDailyAPI({
        villageId: selectedVillageId || undefined,
        date: toDateParam(new Date())
      })
      setDailyData(data)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingStats(false)
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // ---------- Camera Map ----------
  const [cameras, setCameras] = useState([])
  const [isLoadingCameras, setIsLoadingCameras] = useState(true)

  const fetchCameras = useCallback(async () => {
    if (!user) return
    setIsLoadingCameras(true)
    try {
      const data = await getCameraListAPI({
        villageId: selectedVillageId || undefined,
        page: 1,
        pageSize: 100
      })
      setCameras(data.items)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingCameras(false)
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchCameras()
  }, [fetchCameras])

  // ---------- Recent History ----------
  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  const fetchRecentHistory = useCallback(async () => {
    if (!user) return
    setIsLoadingHistory(true)
    try {
      const data = await getDetectionsAPI({
        village_id: selectedVillageId || undefined,
        page: 1,
        page_size: RECENT_HISTORY_LIMIT
      })
      setHistory(data.items)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [user, selectedVillageId])

  useEffect(() => {
    fetchRecentHistory()
  }, [fetchRecentHistory])

  // bump รถที่ตรวจจับล่าสุดขึ้นบนสุดตาราง แบบ real-time ผ่าน SSE
  useEffect(() => {
    if (!latestDetection) return

    // superadmin scope global ได้ทุกหมู่บ้าน — ถ้ากำลังเลือกดูหมู่บ้านเดียวอยู่ ให้กรองให้ตรง
    if (selectedVillageId && latestDetection.camera?.village_id
        && latestDetection.camera.village_id !== selectedVillageId) {
      return
    }

    setHistory((prev) => {
      if (prev.some((item) => item.id === latestDetection.detection_id)) return prev // กันซ้ำตอน reconnect
      const newItem = {
        id: latestDetection.detection_id,
        time_detect: latestDetection.time_detect,
        license_plate: latestDetection.license_plate,
        province: latestDetection.province,
        color: latestDetection.color
      }
      return [newItem, ...prev].slice(0, RECENT_HISTORY_LIMIT)
    })
  }, [latestDetection, selectedVillageId])

  return (
    <Layout title="Dashboard">
      <div className="dashboard-wrapper">

        {/* การ์ดสถิติแถวบน */}
        <div className="stat-row">
          <div className="stat-card">
            <p className="stat-label">Vehicles In Today</p>
            <h2 className="stat-val blue">
              {isLoadingStats ? '—' : (dailyData?.total_detections ?? 0).toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">จำนวนป้ายทะเบียนไม่ซ้ำกัน</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.unique_plates ?? 0).toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Whitelist Today</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : (dailyData?.whitelist_detections ?? 0).toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Blacklist Today</p>
            <h2 className="stat-val red">
              {isLoadingStats ? '—' : (dailyData?.blacklist_detections ?? 0).toLocaleString()}
            </h2>
          </div>
        </div>

        {/* แถวล่าง */}
        <div className="bottom-row">
          <div className="content-card">
            <h3 className="card-title">LPR Camera Map</h3>
            {isLoadingCameras ? (
              <div className="video-skeleton" style={{ height: '100%', minHeight: '300px', borderRadius: '16px' }}>
                <Spinner text="กำลังโหลดตำแหน่งกล้อง..." />
              </div>
            ) : (
              <MapView cameras={cameras} />
            )}
          </div>

          <div className="content-card">
            <h3 className="card-title">Recent History</h3>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>License Plate</th>
                  <th>Province</th>
                  <th>Color</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingHistory ? (
                  <tr>
                    <td colSpan="4">
                      <Spinner text="กำลังโหลด..." />
                    </td>
                  </tr>
                ) : history.length > 0 ? (
                  history.map((item) => (
                    <tr key={item.id}>
                      <td>{formatTime(item.time_detect)}</td>
                      <td className="plate-text">{item.license_plate}</td>
                      <td>{item.province}</td>
                      <td>{item.color}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">
                      <EmptyState icon={<FaCar />} title="No data available" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  )
}

export default Dashboard