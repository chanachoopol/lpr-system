import { useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { FaCar, FaClock, FaTriangleExclamation, FaFilePdf } from 'react-icons/fa6'
import { FaCalendarAlt } from 'react-icons/fa'
import Layout from '../components/Layout'
import { mockReportData } from '../data/mockData'
import '../styles/Report.css'

function Report() {
  const [data] = useState(mockReportData)
  const [selectedDate, setSelectedDate] = useState(new Date())

  // แปลงวันที่เป็นภาษาไทย
  function formatDateThai(date) {
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  function handlePrint() {
    window.print()
  }

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
                {data.totalCars.toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon orange">
              <FaClock />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">Peak Hour</p>
              <h2 className="report-kpi-val">{data.peakTime}</h2>
            </div>
          </div>

          <div className="report-kpi-card">
            <div className="report-kpi-icon red">
              <FaTriangleExclamation />
            </div>
            <div className="report-kpi-info">
              <p className="report-kpi-label">Blacklist Alerts</p>
              <h2 className="report-kpi-val red">{data.blacklistCount}</h2>
            </div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="content-card">
          <h3 className="card-title">Hourly Vehicle Traffic</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={data.hourlyData}
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(27,42,71,0.06)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontFamily: 'DM Sans', fontSize: 12, fill: 'rgb(142,154,171)' }}
                />
                <YAxis
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
                <Bar dataKey="in" name="Vehicles In" fill="rgb(27, 42, 71)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="out" name="Vehicles Out" fill="rgb(147, 197, 253)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Table */}
        <div className="content-card">
          <h3 className="card-title">Top 5 Frequent Visitors This Month</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>License Plate / Province</th>
                <th>Times Detected</th>
              </tr>
            </thead>
            <tbody>
              {data.topVisitors.map((item, index) => (
                <tr key={index}>
                  <td>
                    <span className={`rank-badge rank-${index + 1}`}>
                      {index + 1}
                    </span>
                  </td>
                  <td>
                    <span className="plate-text">{item.plate}</span>
                    <span className="report-province"> {item.province}</span>
                  </td>
                  <td><strong>{item.count}</strong> times</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </Layout>
  )
}

export default Report