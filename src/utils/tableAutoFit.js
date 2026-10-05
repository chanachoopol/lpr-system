/**
 * Helper คำนวณจำนวนแถวที่สามารถแสดงในตารางได้เต็ม 100% พอดีเป๊ะตามขนาดหน้าจอจริง (Dynamic DOM Measurement)
 * - วัดความสูงของ thead และ tr จาก DOM จริงที่เบราว์เซอร์เรนเดอร์ในแต่ละขนาดหน้าจอ/สเกล
 * - ปัดเศษทิ้ง (Math.floor) เสมอ เพื่อไม่ให้แถวโดนตัดขอบล่าง หรือเกิด scrollbar ล้น
 */
export function calculateFitRows(
  containerEl,
  {
    defaultRowHeight = 34,
    defaultHeaderHeight = 28,
    minRows = 1,
    reservedBottomSpace = 0
  } = {}
) {
  if (!containerEl) return minRows

  const containerHeight = containerEl.clientHeight
  if (!containerHeight || containerHeight <= 0) return minRows

  // 1. วัดความสูงจริงของหัวตาราง (thead) จาก DOM
  const thead = containerEl.querySelector('thead')
  const headerHeight =
    thead && thead.offsetHeight > 0 ? thead.offsetHeight : defaultHeaderHeight

  // 2. วัดความสูงจริงของแถวข้อมูล (tbody tr) โดยข้ามแถว spinner หรือ empty-state
  const rows = containerEl.querySelectorAll('tbody tr')
  let measuredRowHeight = 0
  for (const r of rows) {
    if (
      !r.querySelector('.spinner-container') &&
      !r.querySelector('.empty-state') &&
      !r.classList.contains('no-data')
    ) {
      if (r.offsetHeight > 0) {
        measuredRowHeight = r.offsetHeight
        break
      }
    }
  }

  const rowHeight =
    measuredRowHeight >= 18 && measuredRowHeight <= 80
      ? measuredRowHeight
      : defaultRowHeight

  const availableHeight = containerHeight - headerHeight - reservedBottomSpace
  if (availableHeight <= 0) return minRows

  const fitCount = Math.floor(availableHeight / rowHeight)
  return Math.max(minRows, fitCount)
}
