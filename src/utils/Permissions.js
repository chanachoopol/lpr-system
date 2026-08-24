// utils/permissions.js
// กำหนดสิทธิ์การมองเห็น profile ของ user แต่ละ role
// - superadmin  : เห็นได้ทุกคนทุกหมู่บ้าน
// - admin       : เห็นได้เฉพาะคนในหมู่บ้านตัวเอง (+ ตัวเอง)
// - user        : เห็นได้แค่ตัวเอง

export function canViewUserProfile(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false

  // currentUser มาจาก authStore (login response) → key เป็น 'id' เสมอ
  // targetUser มาจาก /api/contacts (list หรือ detail) → key เป็น 'user_id'
  const targetId = targetUser.user_id ?? targetUser.id

  // ดูของตัวเองได้เสมอ ไม่ว่า role ไหน
  if (currentUser.id === targetId) return true

  if (currentUser.role === 'superadmin') return true

  if (currentUser.role === 'admin') {
    // village_id เป็น null ได้ (เช่น superadmin ไม่สังกัดหมู่บ้าน)
    // admin ปกติต้องมี village_id เสมอ แต่กันไว้เผื่อ data ผิดปกติ
    return (
      currentUser.village_id !== null &&
      currentUser.village_id === targetUser.village_id
    )
  }

  return false
}

// ใช้กรอง list ก่อน render ตาราง — เป็นการป้องกันชั้น frontend
// (ชั่วคราว จนกว่า backend จะ enforce village_id filtering ที่ endpoint จริง)
// ⚠️ นี่คือ UI-level protection เท่านั้น ไม่ใช่ security fix จริง
// เพราะคนที่เปิด devtools เรียก API ตรงๆ ยังเห็นข้อมูลได้ถ้า backend ไม่กรอง
export function filterVisibleUsers(currentUser, userList) {
  if (!currentUser || !Array.isArray(userList)) return []

  if (currentUser.role === 'superadmin') return userList

  if (currentUser.role === 'admin') {
    return userList.filter(
      (u) => currentUser.village_id !== null && u.village_id === currentUser.village_id
    )
  }

  // user ทั่วไปไม่ควรเห็นหน้านี้อยู่แล้ว (ควรกันด้วย route guard ต่างหาก)
  return userList.filter((u) => (u.user_id ?? u.id) === currentUser.id)
}