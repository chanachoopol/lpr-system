import { useState, useEffect, useCallback } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { FaCar, FaClock, FaTriangleExclamation, FaFilePdf } from 'react-icons/fa6'
import { FaCalendarAlt } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { getReportDailyAPI, getReportSummaryAPI } from '../data/api'
import '../styles/Report.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import useVillageStore from '../store/villageStore'

// จำนวนวันย้อนหลังสำหรับตาราง Top Frequent Visitors
// backend รองรับสูงสุด 60 วัน (ดู max ที่ /api/reports/summary)
const TOP_VISITORS_DAYS = 7

// แปลง Date object เป็น YYYY-MM-DD ตามที่ backend ต้องการ (ไม่ใช้ toISOString เพราะจะเพี้ยน timezone)
function toDateParam(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// แปลงวันที่เป็นภาษาไทย
function formatDateThai(date) {
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// หาชั่วโมงที่มีการตรวจจับสูงสุดจาก hourly_buckets
function computePeakHour(hourlyBuckets) {
  if (!hourlyBuckets || hourlyBuckets.length === 0) return '-'
  const peak = hourlyBuckets.reduce(
    (max, cur) => (cur.count > max.count ? cur : max),
    hourlyBuckets[0]
  )
  if (peak.count === 0) return '-'
  const startH = String(peak.hour).padStart(2, '0')
  const endH = String((peak.hour + 1) % 24).padStart(2, '0')
  return `${startH}:00 - ${endH}:00`
}

// แปลง hourly_buckets ให้เป็น label แบบ "09:00" สำหรับแกน X ของกราฟ
function formatHourlyDataForChart(hourlyBuckets) {
  if (!hourlyBuckets) return []
  return hourlyBuckets.map((b) => ({
    hour: `${String(b.hour).padStart(2, '0')}:00`,
    count: b.count
  }))
}

function Report() {
  const { user } = useAuthStore()
  const { selectedVillageId } = useVillageStore() // 👈 หมู่บ้านที่กำลังดูอยู่ (null = ทุกหมู่บ้าน, เฉพาะ superadmin)
  const [selectedDate, setSelectedDate] = useState(new Date())

  const [dailyData, setDailyData] = useState(null)
  const [isLoadingDaily, setIsLoadingDaily] = useState(true)

  const [summaryData, setSummaryData] = useState(null)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)

  // ดึงข้อมูลรายวัน — โหลดใหม่ทุกครั้งที่เปลี่ยนวันที่จาก DatePicker หรือหมู่บ้านที่เลือก
  const fetchDaily = useCallback(async () => {
    if (!user) return
    setIsLoadingDaily(true)
    try {
      const data = await getReportDailyAPI({
        villageId: selectedVillageId || undefined,
        date: toDateParam(selectedDate)
      })
      setDailyData(data)
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลรายงานไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูลของวันที่เลือกได้ กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsLoadingDaily(false)
    }
  }, [user, selectedDate, selectedVillageId])

  useEffect(() => {
    fetchDaily()
  }, [fetchDaily])

  // ดึงข้อมูลสรุปช่วง 30 วัน — สำหรับ Top Visitors เท่านั้น ไม่ผูกกับ DatePicker
  useEffect(() => {
    async function fetchSummary() {
      if (!user) return
      setIsLoadingSummary(true)
      try {
        const data = await getReportSummaryAPI({
          villageId: selectedVillageId || undefined,
          days: TOP_VISITORS_DAYS
        })
        setSummaryData(data)
      } catch (error) {
        console.error(error)
        // ไม่ต้องเด้ง alert ซ้ำกับ fetchDaily กันรบกวนถ้าพังพร้อมกัน
      } finally {
        setIsLoadingSummary(false)
      }
    }
    fetchSummary()
  }, [user, selectedVillageId])

  function handlePrint() {
    window.print()
  }

  const chartData = formatHourlyDataForChart(dailyData?.hourly_buckets)
  const peakHour = computePeakHour(dailyData?.hourly_buckets)
  const topVisitors = summaryData?.top_repeated_plates || []

  return (
    <Layout title="Report">
      <div className="report-wrapper">

        {/* Header */}
        <div className="content-card report-header">
          <div className="report-header-left">
            <h2 className="report-title">Daily Summary Report</h2>
            <div className="report-date-picker">
              <FaCalendarAlt className="report-cal-icon" />
              <DatePicker
                selected={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                dateFormat="dd/MM/yyyy"
                maxDate={new Date()}
                className="datepicker-input"
                placeholderText="เลือกวันที่"
              />
              <span className="report-date-display">
                {formatDateThai(selectedDate)}
              </span>
            </div>
          </div>
          <button className="btn-pdf" onClick={handlePrint}>
            <FaFilePdf /> Save as PDF
          </button>
        </div>

        {/* KPI Cards */}
        <div className="report-kpi-row">
          <div className="report-kpi-card">
            <div className="report-kpi-icon blue">
              <FaCar />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">Total Vehicles Today</p>
              <h2 className="report-kpi-val">
                {isLoadingDaily ? '—' : (dailyData?.total_detections ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon orange">
              <FaClock />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">Peak Hour</p>
              <h2 className="report-kpi-val">{isLoadingDaily ? '—' : peakHour}</h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon red">
              <FaTriangleExclamation />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">Blacklist Alerts</p>
              <h2 className="report-kpi-val red">
                {isLoadingDaily ? '—' : (dailyData?.blacklist_detections ?? 0)}
              </h2>
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="content-card">
          <h3 className="card-title">Hourly Vehicle Detections</h3>
          <div className="chart-wrapper">
            {isLoadingDaily ? (
              <Spinner text="Loading chart..." />
            ) : chartData.every((d) => d.count === 0) ? (
              <EmptyState
                icon={<FaCar />}
                title="No detections on this day"
                description="ยังไม่มีข้อมูลการตรวจจับในวันที่เลือก"
              />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,42,71,0.06)" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontFamily: 'DM Sans', fontSize: 12, fill: 'rgb(142,154,171)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontFamily: 'DM Sans', fontSize: 12, fill: 'rgb(142,154,171)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontFamily: 'DM Sans',
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 8px 24px rgba(27,42,71,0.12)'
                    }}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 13 }} />
                  <Bar dataKey="count" name="Detections" fill="rgb(27, 42, 71)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Visitors Table */}
        <div className="content-card">
          <h3 className="card-title">Top 5 Frequent Visitors (Last 30 Days)</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>License Plate / Province</th>
                <th>Times Detected</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingSummary ? (
                <tr>
                  <td colSpan={3}>
                    <Spinner text="Loading top visitors..." />
                  </td>
                </tr>
              ) : topVisitors.length > 0 ? (
                topVisitors.map((item, index) => (
                  <tr key={`${item.license_plate}-${index}`}>
                    <td>
                      <span className={`rank-badge rank-${index + 1}`}>
                        {index + 1}
                      </span>
                    </td>
                    <td>
                      <span className="plate-text">{item.license_plate}</span>
                      <span className="report-province"> {item.province}</span>
                    </td>
                    <td><strong>{item.count}</strong> times</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={<FaCar />}
                      title="No data"
                      description={`ไม่มีข้อมูลผู้มาเยือนซ้ำในช่วง ${TOP_VISITORS_DAYS} วันล่าสุด`}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </Layout>
  )
}

export default Report