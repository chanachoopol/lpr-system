import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { THAI_PROVINCES, isValidThaiProvince } from '../data/thaiProvinces'
import '../styles/ProvinceAutocomplete.css'

// Dropdown สำหรับเลือกจังหวัด (78 รายชื่อ: 77 จังหวัด + เบตง)
// พิมพ์คำอะไรก็ได้ในช่อง จะ filter รายชื่อที่ "มีคำนั้นอยู่ในชื่อ" แบบเรียลไทม์ (ไม่ต้องขึ้นต้นตรงเป๊ะ)
// เช่น พิมพ์ "กรุง" -> เจอ "กรุงเทพมหานคร", พิมพ์ "บุรี" -> เจอหลายจังหวัดที่มีคำว่า "บุรี"
//
// บังคับให้เลือกจากรายการเท่านั้น — พิมพ์ค้นหาได้ แต่ถ้าออกจากช่อง (blur) โดยไม่ได้กดเลือกจาก
// dropdown จริงๆ (เช่น พิมพ์ผิด/พิมพ์ครึ่งๆ กลาง) ค่านั้นจะถูกเคลียร์ทิ้งพร้อมโชว์ข้อความแจ้งเตือน
// กันข้อมูลจังหวัดผิดพลาดหลุดเข้าไปในระบบ
//
// ใช้ createPortal render dropdown ไปที่ document.body แทนที่จะ render ในตำแหน่ง DOM เดิม
// เพราะ modal-content ของโปรเจกต์นี้ตั้ง overflow: hidden ไว้ (กันมุมโค้งเพี้ยน) ซึ่งจะตัดขอบ
// dropdown แบบ position: absolute ถ้า render อยู่ข้างในเฉยๆ — pattern เดียวกับ ActionMenu.jsx
//
// Props:
// - value: ค่าปัจจุบัน (string) — ต้องเป็นชื่อจังหวัดที่ตรงกับรายการเป๊ะๆ เท่านั้น (หรือค่าว่าง)
// - onChange: (newValue: string) => void — ยิงเฉพาะตอนพิมพ์ (สำหรับ filter) และตอนเลือกจริงจาก dropdown
//   ถ้า blur แล้วค่าไม่ตรงกับรายการ จะยิง onChange('') ให้ parent ทราบว่าค่าถูกเคลียร์แล้ว
// - name/id: เผื่อใช้กับ label htmlFor หรือ form submission แบบ native
function ProvinceAutocomplete({ value, onChange, name = 'province', id, placeholder = 'พิมพ์เพื่อค้นหาจังหวัด...', disabled = false }) {
  const [inputValue, setInputValue] = useState(value || '')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [showError, setShowError] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  // sync ค่าจาก parent — สำคัญตอนเปิดโหมดแก้ไข (parent set formData.province มาแล้ว)
  // หรือตอนกด reset ฟอร์มจาก parent
  useEffect(() => {
    setInputValue(value || '')
    setShowError(false)
  }, [value])

  const keyword = inputValue.trim()
  const filtered = keyword
    ? THAI_PROVINCES.filter((p) => p.includes(keyword))
    : THAI_PROVINCES

  // คำนวณตำแหน่ง dropdown จากตำแหน่งจริงของ input บนหน้าจอ (viewport) — ต้องทำหลัง DOM update (useLayoutEffect)
  // ไม่งั้นจะกระพริบตำแหน่งผิดตอนเปิดครั้งแรก (เหมือน pattern ของ ActionMenu.jsx)
  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
      width: rect.width
    })
  }, [isOpen])

  // ตรวจสอบและ "ปิดจ็อบ" ค่าปัจจุบัน — เรียกตอนออกจากช่อง (blur/Escape/คลิกนอกกล่อง)
  // ถ้าค่าที่พิมพ์ไม่ตรงกับรายการจังหวัดเป๊ะๆ ให้เคลียร์ทิ้งพร้อมโชว์ error กันข้อมูลผิดหลุดเข้าระบบ
  function validateAndSettle() {
    setIsOpen(false)
    const trimmed = inputValue.trim()

    if (!trimmed) {
      setShowError(false)
      return
    }

    if (isValidThaiProvince(trimmed)) {
      setShowError(false)
      // normalize ให้ตรงกับรายการเป๊ะ เผื่อผู้ใช้พิมพ์เว้นวรรคหัวท้ายมา
      if (trimmed !== inputValue) {
        setInputValue(trimmed)
        onChange(trimmed)
      }
    } else {
      setShowError(true)
      setInputValue('')
      onChange('')
    }
  }

  // ปิด dropdown + validate เมื่อคลิกนอกกล่อง (ทั้ง input เดิม และ dropdown ที่ portal ไปอยู่ที่ document.body)
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e) {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        validateAndSettle()
      }
    }
    function handleScrollOrResize() {
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, inputValue])

  function handleInputChange(e) {
    const val = e.target.value
    setInputValue(val)
    onChange(val)
    setIsOpen(true)
    setHighlightIndex(-1)
    if (showError) setShowError(false)
  }

  function handleSelect(province) {
    setInputValue(province)
    onChange(province)
    setIsOpen(false)
    setHighlightIndex(-1)
    setShowError(false)
  }

  // blur ปกติ (เช่น กด Tab ออกจากช่อง) — ใช้ setTimeout หน่วงเล็กน้อยให้ onMouseDown ของ
  // dropdown item (ซึ่ง preventDefault ไว้) ทำงานก่อน ไม่งั้น validateAndSettle จะเคลียร์ค่าทิ้ง
  // ก่อนที่ handleSelect จะทันได้บันทึกค่าที่เลือกจริง
  function handleBlur() {
    setTimeout(() => {
      if (document.activeElement !== inputRef.current) {
        validateAndSettle()
      }
    }, 150)
  }

  function handleKeyDown(e) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true)
      return
    }
    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && filtered[highlightIndex]) {
        handleSelect(filtered[highlightIndex])
      } else if (filtered.length === 1) {
        // เหลือตัวเลือกเดียวพอดี — เลือกให้เลยเพื่อความสะดวก (ไม่ต้องกดลูกศรก่อน Enter)
        handleSelect(filtered[0])
      }
    } else if (e.key === 'Escape') {
      validateAndSettle()
    }
  }

  return (
    <div className="pa-wrapper">
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        className={`pa-input ${showError ? 'pa-input-error' : ''}`}
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        disabled={disabled}
      />

      {showError && (
        <p className="pa-error-text">กรุณาเลือกจังหวัดจากรายการที่มีให้เท่านั้น</p>
      )}

      {isOpen && !disabled && createPortal(
        <ul
          ref={dropdownRef}
          className="pa-dropdown"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          {filtered.length > 0 ? (
            filtered.map((p, index) => (
              <li
                key={p}
                // ใช้ onMouseDown + preventDefault กัน input เสีย focus (blur) ก่อน onClick จะทำงาน
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(p)
                }}
                className={`pa-option ${index === highlightIndex ? 'active' : ''} ${p === value ? 'selected' : ''}`}
              >
                {p}
              </li>
            ))
          ) : (
            <li className="pa-option pa-empty">ไม่พบจังหวัดที่ค้นหา — กรุณาลองพิมพ์คำอื่น</li>
          )}
        </ul>,
        document.body
      )}
    </div>
  )
}

export default ProvinceAutocomplete