import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { FaGear } from 'react-icons/fa6'
import '../styles/ActionMenu.css'

// Dropdown action menu (จุดสามจุด) ใช้แทนแถวปุ่ม icon เดี่ยว ๆ ที่เยอะเกินไปในตาราง
//
// ใช้ createPortal render เมนูไปที่ document.body แทนที่จะ render อยู่ใน DOM ตำแหน่งเดิม
// เพราะถ้า trigger อยู่ใน container ที่มี overflow-x: auto (เช่น .table-responsive)
// เมนูแบบ position: absolute ธรรมดาจะโดนตัดขอบ โดยเฉพาะแถวที่อยู่ใกล้ขอบตาราง
//
// Props:
// - items: [{ key, label, icon, onClick, danger, hidden, disabled }]
//   - hidden: true = ไม่แสดง item นี้เลย (ใช้แทน condition แบบ u.is_verify && ...)
//   - danger: true = โชว์เป็นสีแดง (เช่น "ลบ")
function ActionMenu({ items }) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const visibleItems = items.filter((item) => !item.hidden)

  // คำนวณตำแหน่งเมนูจากตำแหน่งจริงของปุ่ม trigger บนหน้าจอ (viewport)
  // เพราะ CSS ใช้ position: fixed — พิกัดต้องอิงจาก viewport (ไม่ต้องบวก scrollY/scrollX)
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const menuWidth = 200
    // คำนวณความสูงเมนูจริงจาก DOM (หรือประเมินล่วงหน้าจากจำนวน items)
    const menuHeight = menuRef.current?.offsetHeight || (visibleItems.length * 38 + 16)

    // จัดให้ขอบขวาของเมนูตรงกับขอบขวาของปุ่ม trigger พอดี
    let left = rect.right - menuWidth
    if (left < 10) left = 10 // กันล้นขอบซ้ายจอ
    if (left + menuWidth > window.innerWidth - 10) {
      left = window.innerWidth - menuWidth - 10 // กันล้นขอบขวาจอ
    }

    // คำนวณพื้นที่ว่างด้านล่างและด้านบน
    const spaceBelow = window.innerHeight - rect.bottom - 10
    const spaceAbove = rect.top - 10

    let top = rect.bottom + 6

    // ถ้าพื้นที่ด้านล่างไม่พอสำหรับเมนู และพื้นที่ด้านบนมีมากกว่า ให้เด้งขึ้นด้านบน
    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      top = rect.top - menuHeight - 6
    }

    // ป้องกันไม่ให้เมนูล้นขอบจอด้านบนหรือด้านล่าง (Safe Clamp)
    if (top + menuHeight > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - menuHeight - 10)
    }
    if (top < 10) {
      top = 10
    }

    setPosition({ top, left })
  }, [isOpen, visibleItems.length])

  // ปิดเมนูเมื่อคลิกข้างนอก หรือ scroll/resize (กันเมนูค้างผิดตำแหน่งตอน scroll ตาราง)
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false)
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
  }, [isOpen])

  function handleItemClick(item) {
    if (item.disabled) return
    setIsOpen(false)
    item.onClick()
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="action-menu-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        title="เพิ่มเติม"
      >
        <FaGear />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="action-menu-dropdown"
          style={{ top: position.top, left: position.left }}
        >
          {visibleItems.map((item) => {
            const itemClasses = [
              'action-menu-item',
              item.danger && 'danger',
              item.success && 'success'
            ].filter(Boolean).join(' ')

            return (
              <button
                key={item.key}
                className={itemClasses}
                style={item.color ? { color: item.color, ...item.style } : item.style}
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                title={item.title || undefined}
              >
                <span className="action-menu-icon" style={item.color ? { color: item.color } : undefined}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}

export default ActionMenu