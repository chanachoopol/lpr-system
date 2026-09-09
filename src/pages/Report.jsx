import { useState, useEffect, useCallback, useMemo } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  FaCar, FaClock, FaTriangleExclamation, FaFilePdf,
  FaIdCard, FaArrowRightToBracket, FaArrowRightFromBracket, FaShieldHalved
} from 'react-icons/fa6'
import { FaCalendarAlt } from 'react-icons/fa'
import Swal from 'sweetalert2'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { getReportDailyAPI, getReportSummaryAPI } from '../data/api'
import '../styles/Report.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import useVillageStore from '../store/villageStore'
import { generateReportPdf } from '../utils/generateReportPdf'
import { renderCustomDatePickerHeader } from '../components/CustomDatePickerHeader'

// แปลง Date object เป็น YYYY-MM-DD ตามที่ backend ต้องการ
function toDateParam(date) {
  if (!date || isNaN(new Date(date).getTime())) return ''
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// แปลงวันที่เป็นภาษาไทย
function formatDateThai(date) {
  if (!date || isNaN(new Date(date).getTime())) return '-'
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// หาชั่วโมงที่มีการตรวจจับสูงสุดจาก hourly_buckets (สำรองกรณี backend ไม่มี peak_time)
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
  const { selectedVillageId, getVillageName } = useVillageStore()

  // ปฏิทินช่วงวันที่ (จากวันที่ - ถึงวันที่)
  const [startDate, setStartDate] = useState(new Date())
  const [endDate, setEndDate] = useState(new Date())

  const [reportData, setReportData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  // ตรวจสอบว่าเป็นวันเดียวกันหรือไม่
  const isSingleDate = useMemo(() => {
    if (!startDate || !endDate) return true
    return toDateParam(startDate) === toDateParam(endDate)
  }, [startDate, endDate])

  // ข้อความแสดงวันที่: ถ้าวันเดียวกันแสดงครั้งเดียว ถ้าเป็นช่วงให้แสดง "วันแรก - วันสุดท้าย"
  const dateRangeDisplay = useMemo(() => {
    if (!startDate && !endDate) return '-'
    if (isSingleDate || !endDate) {
      return formatDateThai(startDate || endDate)
    }
    return `${formatDateThai(startDate)} - ${formatDateThai(endDate)}`
  }, [startDate, endDate, isSingleDate])

  // หัวข้อตารางผู้มาเยือนซ้ำ
  const visitorHeading = useMemo(() => {
    return `Top Frequent Visitors (ประจำวันที่ ${dateRangeDisplay})`
  }, [dateRangeDisplay])

  // ดึงข้อมูลรายงาน: วันเดียวกันใช้ /api/reports/daily, ต่างวันใช้ /api/reports/summary
  const fetchReport = useCallback(async () => {
    if (!user || !startDate) return
    setIsLoading(true)
    try {
      if (isSingleDate) {
        const data = await getReportDailyAPI({
          villageId: selectedVillageId || undefined,
          date: toDateParam(startDate)
        })
        setReportData(data)
      } else {
        const effectiveEnd = endDate || startDate
        const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const endDay = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate())
        const diffMs = endDay.getTime() - startDay.getTime()
        const diffDays = Math.max(1, Math.min(60, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1))

        const data = await getReportSummaryAPI({
          villageId: selectedVillageId || undefined,
          days: diffDays
        })
        setReportData(data)
      }
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'โหลดข้อมูลรายงานไม่สำเร็จ',
        text: 'ไม่สามารถดึงข้อมูลของช่วงวันที่เลือกได้ กรุณาลองใหม่',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsLoading(false)
    }
  }, [user, startDate, endDate, isSingleDate, selectedVillageId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const chartData = formatHourlyDataForChart(reportData?.hourly_buckets)
  const peakHour = reportData?.peak_time || computePeakHour(reportData?.hourly_buckets)
  const topVisitors = reportData?.top_repeated_plates || []

  // หาชื่อหมู่บ้านสำหรับใส่ในหัวรายงาน PDF
  function resolveVillageNameForPdf() {
    if (user?.role === 'superadmin') {
      return selectedVillageId ? getVillageName(selectedVillageId) : 'ทุกหมู่บ้าน'
    }
    return getVillageName(user?.village_id) || '-'
  }

  // สร้างไฟล์ PDF จริงจากข้อมูล report ปัจจุบัน
  async function handleDownloadPdf() {
    if (isLoading) {
      Swal.fire({
        icon: 'info',
        title: 'กำลังโหลดข้อมูล',
        text: 'กรุณารอข้อมูลรายงานโหลดให้เสร็จก่อนสร้าง PDF',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
      return
    }

    setIsGeneratingPdf(true)
    try {
      generateReportPdf({
        selectedDate: startDate || new Date(),
        dateLabel: dateRangeDisplay,
        villageName: resolveVillageNameForPdf(),
        totalVehicles: reportData?.total_detections ?? 0,
        uniquePlates: reportData?.unique_plates ?? 0,
        entryDetections: reportData?.entry_detections ?? 0,
        exitDetections: reportData?.exit_detections ?? 0,
        whitelistDetections: reportData?.whitelist_detections ?? 0,
        blacklistAlerts: reportData?.blacklist_detections ?? 0,
        peakHour,
        chartData,
        topVisitors,
        topVisitorsHeading: visitorHeading
      })
    } catch (error) {
      console.error(error)
      Swal.fire({
        icon: 'error',
        title: 'สร้าง PDF ไม่สำเร็จ',
        text: 'เกิดข้อผิดพลาดระหว่างสร้างไฟล์ กรุณาลองใหม่อีกครั้ง',
        confirmButtonColor: 'var(--sidebar-bg)'
      })
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <Layout title="Report">
      <div className="report-wrapper">

        {/* Header */}
        <div className="content-card report-header">
          <div className="report-header-left">
            <h2 className="report-title">Summary Report</h2>
            <div className="report-date-range-container">
              <div className="report-datepicker-box">
                <FaCalendarAlt className="report-cal-icon" />
                <DatePicker
                  selected={startDate}
                  onChange={(date) => {
                    if (date) {
                      setStartDate(date)
                      if (endDate && date > endDate) {
                        setEndDate(date)
                      }
                    }
                  }}
                  maxDate={endDate || new Date()}
                  dateFormat="dd/MM/yyyy"
                  className="datepicker-input"
                  placeholderText="จากวันที่"
                  showPopperArrow={false}
                  renderCustomHeader={renderCustomDatePickerHeader}
                />
              </div>
              <span className="report-date-separator">-</span>
              <div className="report-datepicker-box">
                <FaCalendarAlt className="report-cal-icon" />
                <DatePicker
                  selected={endDate}
                  onChange={(date) => {
                    if (date) setEndDate(date)
                  }}
                  minDate={startDate}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  className="datepicker-input"
                  placeholderText="ถึงวันที่"
                  showPopperArrow={false}
                  renderCustomHeader={renderCustomDatePickerHeader}
                />
              </div>
              <span className="report-date-display">
                {dateRangeDisplay}
              </span>
            </div>
          </div>
          <button className="btn-pdf" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
            <FaFilePdf /> {isGeneratingPdf ? 'กำลังสร้าง PDF...' : 'Save as PDF'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="report-kpi-grid">
          <div className="report-kpi-card">
            <div className="report-kpi-icon blue">
              <FaCar />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">การตรวจจับทั้งหมด</p>
              <h2 className="report-kpi-val">
                {isLoading ? '—' : (reportData?.total_detections ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon cyan">
              <FaIdCard />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">จำนวนรถจริง (ไม่ซ้ำคัน)</p>
              <h2 className="report-kpi-val">
                {isLoading ? '—' : (reportData?.unique_plates ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon green">
              <FaArrowRightToBracket />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">รถขาเข้า</p>
              <h2 className="report-kpi-val">
                {isLoading ? '—' : (reportData?.entry_detections ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon orange">
              <FaArrowRightFromBracket />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">รถขาออก</p>
              <h2 className="report-kpi-val">
                {isLoading ? '—' : (reportData?.exit_detections ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon emerald">
              <FaShieldHalved />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">รถลูกบ้าน / สมาชิก</p>
              <h2 className="report-kpi-val">
                {isLoading ? '—' : (reportData?.whitelist_detections ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon red">
              <FaTriangleExclamation />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">แจ้งเตือน Blacklist</p>
              <h2 className="report-kpi-val red">
                {isLoading ? '—' : (reportData?.blacklist_detections ?? 0).toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon purple">
              <FaClock />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">ช่วงเวลาหนาแน่นที่สุด</p>
              <h2 className="report-kpi-val">{isLoading ? '—' : peakHour}</h2>
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="content-card">
          <h3 className="card-title">Hourly Vehicle Detections</h3>
          <div className="chart-wrapper">
            {isLoading ? (
              <Spinner text="Loading chart..." />
            ) : chartData.every((d) => d.count === 0) ? (
              <EmptyState
                icon={<FaCar />}
                title="No detections on this date"
                description="ยังไม่มีข้อมูลการตรวจจับในช่วงวันที่เลือก"
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
                    tick={{ fontFamily: 'DM Sans', fontSize: 12, fill: 'rgb(27, 42, 71)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontFamily: 'DM Sans', fontSize: 12, fill: 'rgb(27, 42, 71)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontFamily: 'DM Sans',
                      borderRadius: '12px',
                      border: '1px solid rgba(27,42,71,0.1)',
                      backgroundColor: '#ffffff',
                      color: 'rgb(27, 42, 71)',
                      boxShadow: '0 8px 24px rgba(27,42,71,0.12)'
                    }}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgb(27, 42, 71)' }} />
                  <Bar dataKey="count" name="Detections" fill="#1b2a47" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top Visitors Table */}
        <div className="content-card">
          <h3 className="card-title report-visitors-title">
            {visitorHeading}
          </h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>License Plate / Province</th>
                <th>Times Detected</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
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
                      <span className="report-province"> {item.province || '-'}</span>
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
                      description="ไม่มีข้อมูลผู้มาเยือนซ้ำในช่วงวันที่เลือก"
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