import React from 'react'
import './DateQuickPresets.css'

export function getDatePresetRanges() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const last7Days = new Date(today)
  last7Days.setDate(today.getDate() - 6)

  const last30Days = new Date(today)
  last30Days.setDate(today.getDate() - 29)

  const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)

  return {
    today: { label: 'วันนี้', start: today, end: today },
    yesterday: { label: 'เมื่อวาน', start: yesterday, end: yesterday },
    last7Days: { label: '7 วันล่าสุด', start: last7Days, end: today },
    last30Days: { label: '30 วันล่าสุด', start: last30Days, end: today },
    thisMonth: { label: 'เดือนนี้', start: startOfThisMonth, end: today },
    lastMonth: { label: 'เดือนที่แล้ว', start: startOfLastMonth, end: endOfLastMonth }
  }
}

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false
  const date1 = new Date(d1)
  const date2 = new Date(d2)
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export default function DateQuickPresets({
  onSelect,
  startDate,
  endDate,
  presets = ['today', 'last7Days', 'last30Days', 'thisMonth', 'lastMonth'],
  className = ''
}) {
  const allPresets = getDatePresetRanges()

  return (
    <div className={`date-quick-presets ${className}`}>
      {presets.map((key) => {
        const item = allPresets[key]
        if (!item) return null
        const isActive = isSameDay(startDate, item.start) && isSameDay(endDate, item.end)

        return (
          <button
            key={key}
            type="button"
            className={`preset-chip ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(item.start, item.end, key)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function SingleDateQuickPresets({
  onSelect,
  selectedDate,
  presets = ['today', 'yesterday', 'daysAgo7', 'monthStart'],
  className = ''
}) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const daysAgo7 = new Date(today)
  daysAgo7.setDate(today.getDate() - 7)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const items = {
    today: { label: 'วันนี้', date: today },
    yesterday: { label: 'เมื่อวาน', date: yesterday },
    daysAgo7: { label: '7 วันก่อน', date: daysAgo7 },
    monthStart: { label: 'ต้นเดือนนี้', date: monthStart }
  }

  return (
    <div className={`date-quick-presets ${className}`}>
      {presets.map((key) => {
        const item = items[key]
        if (!item) return null
        const isActive = isSameDay(selectedDate, item.date)
        return (
          <button
            key={key}
            type="button"
            className={`preset-chip ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(item.date, key)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
