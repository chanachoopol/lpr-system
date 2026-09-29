// utils/Permissions.js
// ฟังก์ชันจัดการและกรองสิทธิ์การมองเห็นข้อมูลผู้ใช้ (Role-Based Access Control)

// ⚠️ TEMPORARY FIX (2026-08-25):
// GET /api/users ไม่ส่ง field village_id กลับมาใน response ของแต่ละ user object
// (ยืนยันจาก DevTools — response มีแค่ id, username, role, is_active, is_verify, created_at)
// ทำให้ filter เดิม (เทียบ u.village_id === currentUser.village_id) กรองทุกคนออกหมด
// เพราะ u.village_id เป็น undefined เสมอ
//
// เนื่องจาก fetchUsers() ใน UserManagement.jsx ส่ง villageId: selectedVillageId
// ไปให้ backend กรองอยู่แล้วตอนเรียก getUsersAPI(...) จึงเชื่อใจ backend ไปก่อน
// และข้าม frontend-level filter ชั่วคราว จนกว่า backend จะเพิ่ม village_id
// ใน response ของ /api/users แล้วค่อยเปิด filter นี้กลับมาใช้
//
// TODO: แจ้ง backend ให้เพิ่ม village_id ใน response ของ GET /api/users
//       แล้ว revert filter ด้านล่างกลับไปเป็นแบบเดิม (เทียบ village_id ตรงๆ)
export function filterVisibleUsers(currentUser, userList) {
  if (!currentUser || !Array.isArray(userList)) return []

  if (currentUser.role === 'superadmin') return userList

  if (currentUser.role === 'admin') {
    // Admin เห็นเฉพาะ user และ admin เท่านั้น — กรอง superadmin ออกเสมอ
    return userList.filter((u) => u.role !== 'superadmin')
  }

  return userList.filter((u) => (u.user_id ?? u.id) === currentUser.id)
}