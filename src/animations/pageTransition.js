// ค่ากลางสำหรับ animation ตอนเปลี่ยนหน้า
// ใช้ร่วมกันทุกหน้า (ผ่าน Layout.jsx และ Login.jsx) จะได้ไม่ต้องเขียนซ้ำ

export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 }
}

export const pageTransition = {
  duration: 0.28,
  ease: 'easeInOut'
}