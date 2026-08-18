import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { mockDashboardHistory } from '../data/mockData'
import '../styles/Dashboard.css'
import MapView from '../components/Map'
import { getReportDailyAPI, getDetectionsAPI } from '../data/api'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { FaCar } from 'react-icons/fa'

const RECENT_HISTORY_LIMIT = 5

// แปลง Date object เป็น YYYY-MM-DD ตามที่ backend ต้องการ
// (ใช้ logic เดียวกับ Report.jsx — ไม่ใช้ toISOString() เพราะจะเพี้ยน timezone)
function toDateParam(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// แปลง ISO timestamp เป็นเวลาแบบไทย
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
  const { selectedVillageId } = useVillageStore() // หมู่บ้านที่กำลังดูอยู่ (null = ทุกหมู่บ้าน, เฉพาะ superadmin)

  // ---------- Stat Cards ----------
  const [dailyData, setDailyData] = useState(null)
  const [isLoadingStats, setIsLoadingStats] = useState(true)

  // TODO: ยังไม่มี field จาก backend สำหรับจำนวนป้ายทะเบียนไม่ซ้ำ
  // ต้องขอทีม backend เพิ่ม field เช่น "unique_plates_today" ใน /api/reports/daily
  const [uniquePlatesToday] = useState(0)

  // TODO: รอหน้า Whitelist (ยังไม่ได้ทำ) — mock ไว้ก่อน
  const [whitelistToday] = useState(0)

  const fetchStats = useCallback(async () => {
    if (!user) return // ห้ามเช็ค village_id ตรงๆ เพราะ superadmin ไม่มี village_id
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
              {isLoadingStats ? '—' : uniquePlatesToday.toLocaleString()}
            </h2>
          </div>
          <div className="stat-card">
            <p className="stat-label">Whitelist Today</p>
            <h2 className="stat-val green">
              {isLoadingStats ? '—' : whitelistToday.toLocaleString()}
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
            <MapView />
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