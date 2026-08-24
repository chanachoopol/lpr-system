import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { FaEllipsisVertical } from 'react-icons/fa6'
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
  // ต้องทำหลัง DOM update เสร็จ (useLayoutEffect) ไม่งั้นเมนูจะกระพริบตำแหน่งผิดตอนเปิดครั้งแรก
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return

    const rect = triggerRef.current.getBoundingClientRect()
    const menuWidth = 200 // ต้องตรงกับ min-width ใน ActionMenu.css

    // ถ้าเปิดชิดขอบขวาจอเกินไป ให้เมนูงอกไปทางซ้ายของปุ่มแทน กันล้นจอ
    const overflowsRight = rect.left + menuWidth > window.innerWidth
    setPosition({
      top: rect.bottom + window.scrollY + 4,
      left: overflowsRight
        ? rect.right + window.scrollX - menuWidth
        : rect.left + window.scrollX
    })
  }, [isOpen])

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
        <FaEllipsisVertical />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="action-menu-dropdown"
          style={{ top: position.top, left: position.left }}
        >
          {visibleItems.map((item) => (
            <button
              key={item.key}
              className={`action-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
            >
              <span className="action-menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

export default ActionMenu