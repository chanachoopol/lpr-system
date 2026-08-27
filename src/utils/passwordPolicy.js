// src/utils/passwordPolicy.js

// อ้างอิงจากที่ backend ยืนยัน: อย่างน้อย 8 ตัว + ตัวอักษร + ตัวเลข + อักขระพิเศษ
// ถ้า backend เปลี่ยน policy ในอนาคต แก้แค่ไฟล์นี้ไฟล์เดียว ไม่ต้องไล่แก้ทีละหน้า
export const PASSWORD_RULES = {
  minLength: 8,
  requireLetter: true,
  requireNumber: true,
  requireSpecialChar: true
}

// รายการอักขระพิเศษที่นับว่าผ่านเกณฑ์ — กันกรณี user ใช้ตัวที่ backend อาจไม่รับ (เช่น space)
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/

// เช็คแต่ละเงื่อนไขแยกจากกัน คืนเป็น object ใช้แสดง checklist ทีละข้อใน UI
export function checkPasswordRules(password = '') {
  return {
    minLength: password.length >= PASSWORD_RULES.minLength,
    hasLetter: /[a-zA-Zก-๙]/.test(password), // รองรับกรณีมีคนพิมพ์ภาษาไทยปนมาด้วย ไม่ตัดสิทธิ์
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: SPECIAL_CHAR_REGEX.test(password)
  }
}

// ผ่านครบทุกเงื่อนไข = ใช้ submit ได้ — ใช้ตัวนี้เช็คก่อนยิง API แทนการเช็คแค่ length อย่างเดียว
export function isPasswordValid(password = '') {
  const rules = checkPasswordRules(password)
  return Object.values(rules).every(Boolean)
}

// คะแนนความแข็งแรง 0-4 — ใช้กับ progress bar สี (แยกจาก "ผ่าน/ไม่ผ่าน" เกณฑ์บังคับ)
// นับจากจำนวนเงื่อนไขที่ผ่าน + โบนัสความยาวเกิน 12 ตัว เพื่อสะท้อนว่ายาวขึ้นแข็งแรงขึ้นจริง
export function getPasswordStrength(password = '') {
  if (!password) return { score: 0, label: '' }

  const rules = checkPasswordRules(password)
  let score = Object.values(rules).filter(Boolean).length // 0-4

  if (password.length >= 12 && score === 4) score = 4 // แข็งแรงที่สุด
  else if (score === 4) score = 3 // ผ่านครบแต่ยังสั้น

  const labels = ['อ่อนมาก', 'อ่อน', 'ปานกลาง', 'ดี', 'แข็งแรงมาก']
  return { score, label: labels[score] }
}
// ==================== Username Policy ====================
// ยืนยันจาก backend แล้ว: ตัวอักษรภาษาอังกฤษเท่านั้น (พิมพ์ใหญ่/เล็กได้) ความยาว 4-36 ตัว
// ห้าม underscore, ตัวเลข, อักขระพิเศษ, ภาษาไทย
export const USERNAME_RULES = {
  minLength: 4,
  maxLength: 36,
  pattern: /^[a-zA-Z]+$/
}

export function checkUsernameRules(username = '') {
  return {
    minLength: username.length >= USERNAME_RULES.minLength,
    maxLength: username.length <= USERNAME_RULES.maxLength,
    onlyLetters: USERNAME_RULES.pattern.test(username)
  }
}

export function isUsernameValid(username = '') {
  if (!username) return false
  const rules = checkUsernameRules(username)
  return Object.values(rules).every(Boolean)
}

// ข้อความ error รวมเป็นก้อนเดียว ใช้โชว์ใต้ช่อง username ตอน validate ไม่ผ่าน
export function getUsernameErrorMessage(username = '') {
  if (!username) return 'กรุณากรอก Username'
  const rules = checkUsernameRules(username)
  if (!rules.onlyLetters) return 'Username ต้องเป็นตัวอักษรภาษาอังกฤษเท่านั้น (a-z, A-Z)'
  if (!rules.minLength) return `Username ต้องมีอย่างน้อย ${USERNAME_RULES.minLength} ตัวอักษร`
  if (!rules.maxLength) return `Username ต้องไม่เกิน ${USERNAME_RULES.maxLength} ตัวอักษร`
  return ''
}

// ==================== Password Policy (login form) ====================
// เพิ่ม maxLength เข้าไปใน PASSWORD_RULES เดิม (ของหน้า reset/change password ใช้ minLength อยู่แล้ว
// ไม่กระทบของเดิม เพราะเป็นการเพิ่ม key ใหม่ ไม่ใช่แก้ key เดิม)
PASSWORD_RULES.maxLength = 36

// เวอร์ชัน "เช็คแบบ hard block สำหรับฟอร์ม login" — ต่างจาก isPasswordValid ปกติที่ไม่เช็ค maxLength
// (หน้า reset/change password ไม่ได้ผูก max ไว้ตอนแรก เผื่อ policy ต่างกันคนละจุด)
export function isLoginPasswordValid(password = '') {
  if (!password) return false
  const rules = checkPasswordRules(password)
  const withinMax = password.length <= PASSWORD_RULES.maxLength
  return Object.values(rules).every(Boolean) && withinMax
}

export function getPasswordErrorMessage(password = '') {
  if (!password) return 'กรุณากรอกรหัสผ่าน'
  const rules = checkPasswordRules(password)
  if (!rules.minLength) return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_RULES.minLength} ตัวอักษร`
  if (password.length > PASSWORD_RULES.maxLength) return `รหัสผ่านต้องไม่เกิน ${PASSWORD_RULES.maxLength} ตัวอักษร`
  if (!rules.hasLetter) return 'รหัสผ่านต้องมีตัวอักษรอย่างน้อย 1 ตัว'
  if (!rules.hasNumber) return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'
  if (!rules.hasSpecialChar) return 'รหัสผ่านต้องมีอักขระพิเศษอย่างน้อย 1 ตัว'
  return ''
}
// ==================== Email Format ====================
// regex มาตรฐานทั่วไป ไม่ใช่ RFC 5322 เต็มรูปแบบ (นั่นซับซ้อนเกินจำเป็นสำหรับ client-side check)
// เพียงพอสำหรับกรองพิมพ์ผิดชัดๆ เช่นไม่มี @ หรือไม่มี domain ส่วน validation จริงยังต้องพึ่ง backend
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailValid(email = '') {
  return EMAIL_REGEX.test(email.trim())
}

export function getEmailErrorMessage(email = '') {
  const trimmed = email.trim()
  if (!trimmed) return 'กรุณากรอกอีเมล'
  if (!isEmailValid(trimmed)) return 'รูปแบบอีเมลไม่ถูกต้อง'
  return ''
}