import React, { useState, useRef, useEffect } from 'react'
import { FaChevronLeft, FaChevronRight, FaChevronDown } from 'react-icons/fa'
import './CustomDatePickerHeader.css'

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม'
]

// สร้างรายการ ค.ศ. เรียงจาก ปัจจุบัน ลงไปอดีต (เช่น 2026, 2025, 2024, 2023...)
export function getYearsDescending(startOffset = 0, count = 15) {
  const currentYear = new Date().getFullYear()
  const start = currentYear + startOffset
  return Array.from({ length: count }, (_, i) => start - i)
}

function CustomHeaderContent({
  date,
  changeYear,
  changeMonth,
  decreaseMonth,
  increaseMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled
}) {
  const [isMonthOpen, setIsMonthOpen] = useState(false)
  const [isYearOpen, setIsYearOpen] = useState(false)
  const containerRef = useRef(null)

  const currentMonthIndex = date.getMonth()
  const currentYear = date.getFullYear()
  const years = getYearsDescending(0, 15)

  // ปิด dropdown เมื่อคลิกนอกขอบเขต
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsMonthOpen(false)
        setIsYearOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="custom-dp-header" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setIsMonthOpen(false)
          setIsYearOpen(false)
          decreaseMonth()
        }}
        disabled={prevMonthButtonDisabled}
        className="custom-dp-arrow-btn"
        title="เดือนก่อนหน้า"
      >
        <FaChevronLeft />
      </button>

      <div className="custom-dp-select-group">
        {/* Month Custom Dropdown */}
        <div className="custom-dp-dropdown-wrap">
          <button
            type="button"
            className={`custom-dp-trigger-btn month-trigger ${isMonthOpen ? 'active' : ''}`}
            onClick={() => {
              setIsMonthOpen((prev) => !prev)
              setIsYearOpen(false)
            }}
          >
            <span>{THAI_MONTHS[currentMonthIndex]}</span>
            <FaChevronDown className={`custom-dp-caret ${isMonthOpen ? 'rotate' : ''}`} />
          </button>

          {isMonthOpen && (
            <div className="custom-dp-menu month-menu">
              {THAI_MONTHS.map((monthName, idx) => (
                <button
                  key={monthName}
                  type="button"
                  className={`custom-dp-menu-item ${idx === currentMonthIndex ? 'selected' : ''}`}
                  onClick={() => {
                    changeMonth(idx)
                    setIsMonthOpen(false)
                  }}
                >
                  {monthName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Year Custom Dropdown */}
        <div className="custom-dp-dropdown-wrap">
          <button
            type="button"
            className={`custom-dp-trigger-btn year-trigger ${isYearOpen ? 'active' : ''}`}
            onClick={() => {
              setIsYearOpen((prev) => !prev)
              setIsMonthOpen(false)
            }}
          >
            <span>{currentYear}</span>
            <FaChevronDown className={`custom-dp-caret ${isYearOpen ? 'rotate' : ''}`} />
          </button>

          {isYearOpen && (
            <div className="custom-dp-menu year-menu">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`custom-dp-menu-item ${y === currentYear ? 'selected' : ''}`}
                  onClick={() => {
                    changeYear(y)
                    setIsYearOpen(false)
                  }}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setIsMonthOpen(false)
          setIsYearOpen(false)
          increaseMonth()
        }}
        disabled={nextMonthButtonDisabled}
        className="custom-dp-arrow-btn"
        title="เดือนถัดไป"
      >
        <FaChevronRight />
      </button>
    </div>
  )
}

export function renderCustomDatePickerHeader(headerProps) {
  return <CustomHeaderContent {...headerProps} />
}
