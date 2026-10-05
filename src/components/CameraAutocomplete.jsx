import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FaChevronDown } from 'react-icons/fa6'
import '../styles/CameraAutocomplete.css'

function CameraAutocomplete({
  cameras = [],
  value = '',
  onChange,
  allOptionLabel = null,
  allOptionValue = 'all',
  placeholder = 'เลือกหรือค้นหากล้อง...',
  disabled = false,
  variant = 'monitor',
  id,
  name
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })

  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  // รวมรายการตัวเลือกทั้งหมด: ตัวเลือก "ทุกกล้อง" (ถ้ามี) + รายชื่อกล้อง
  const allOptions = useMemo(() => {
    const list = []
    if (allOptionLabel) {
      list.push({ id: allOptionValue, name: allOptionLabel, isAllOption: true })
    }
    cameras.forEach((cam) => {
      list.push({ id: String(cam.id), name: cam.name, isAllOption: false })
    })
    return list
  }, [cameras, allOptionLabel, allOptionValue])

  // หาตัวเลือกที่ถูกเลือกอยู่ปัจจุบัน
  const currentSelectedOption = useMemo(() => {
    return allOptions.find((opt) => String(opt.id) === String(value)) || null
  }, [allOptions, value])

  // ซิงค์ข้อความใน Input ให้ตรงกับตัวเลือกปัจจุบันเมื่อ value หรือรายการกล้องเปลี่ยน
  useEffect(() => {
    if (!isSearching) {
      setInputValue(currentSelectedOption ? currentSelectedOption.name : '')
    }
  }, [currentSelectedOption, isSearching])

  // กรองตัวเลือกตามคำค้นหา (ถ้าผู้ใช้พิมพ์ค้นหา ให้กรองตาม substring / ถ้าไม่ได้พิมพ์ ให้แสดงทั้งหมด)
  const filteredOptions = useMemo(() => {
    if (!isSearching) return allOptions
    const keyword = inputValue.trim().toLowerCase()
    if (!keyword) return allOptions
    return allOptions.filter((opt) => opt.name.toLowerCase().includes(keyword))
  }, [allOptions, inputValue, isSearching])

  // คำนวณตำแหน่งของเมนู Dropdown ให้ตรงกับ Input บนหน้าจอ (Portal)
  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current) return

    const updatePosition = () => {
      if (!inputRef.current) return
      const rect = inputRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      })
    }

    updatePosition()
  }, [isOpen])

  // ปิด Dropdown เมื่อคลิกนอกพื้นที่ หรือ scroll นอกเมนู
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e) {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false)
        setIsSearching(false)
        setInputValue(currentSelectedOption ? currentSelectedOption.name : '')
      }
    }

    function handleScrollOrResize(e) {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) {
        return
      }
      setIsOpen(false)
      setIsSearching(false)
      setInputValue(currentSelectedOption ? currentSelectedOption.name : '')
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen, currentSelectedOption])

  function handleSelect(option) {
    setIsOpen(false)
    setIsSearching(false)
    setInputValue(option.name)
    setHighlightIndex(-1)
    if (onChange) {
      onChange(option.id)
    }
  }

  function handleInputChange(e) {
    const val = e.target.value
    setInputValue(val)
    setIsSearching(true)
    setIsOpen(true)
    setHighlightIndex(0)
  }

  function handleFocus() {
    setIsOpen(true)
    setIsSearching(false)
    setInputValue(currentSelectedOption ? currentSelectedOption.name : '')
    if (inputRef.current) {
      inputRef.current.select()
    }
  }

  function handleKeyDown(e) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setIsOpen(true)
      return
    }

    if (!isOpen) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && filteredOptions[highlightIndex]) {
        handleSelect(filteredOptions[highlightIndex])
      } else if (filteredOptions.length === 1) {
        handleSelect(filteredOptions[0])
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setIsSearching(false)
      setInputValue(currentSelectedOption ? currentSelectedOption.name : '')
    }
  }

  return (
    <div className={`cam-auto-wrap variant-${variant}`}>
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        className="cam-auto-input"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
      />
      <FaChevronDown className={`cam-auto-arrow ${isOpen ? 'open' : ''}`} />

      {isOpen && !disabled && createPortal(
        <ul
          ref={dropdownRef}
          className="cam-auto-dropdown"
          style={{
            top: position.top,
            left: position.left,
            width: position.width
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => {
              const isSelected = String(opt.id) === String(value)
              const isHighlighted = index === highlightIndex
              return (
                <li
                  key={opt.id}
                  className={`cam-auto-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(opt)
                  }}
                >
                  <span>{opt.name}</span>
                </li>
              )
            })
          ) : (
            <li className="cam-auto-empty">ไม่พบกล้องที่ตรงกับการค้นหา</li>
          )}
        </ul>,
        document.body
      )}
    </div>
  )
}

export default CameraAutocomplete
