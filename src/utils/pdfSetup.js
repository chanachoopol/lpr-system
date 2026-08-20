// src/utils/pdfSetup.js
// ตั้งค่า pdfmake ให้รู้จักฟอนต์ Sarabun (รองรับภาษาไทย)
// ต้อง import ไฟล์นี้ก่อนเรียกใช้ pdfMake.createPdf() เสมอ ไม่งั้นจะเจอ error
// "File 'Sarabun-xxx.ttf' not found in virtual file system"

import pdfMake from 'pdfmake/build/pdfmake'
import sarabunVfs from './sarabunFonts'

// ⚠️ pdfmake เวอร์ชัน 0.3.x เปลี่ยน API การลงทะเบียน vfs ใหม่ทั้งหมด
// การเขียนแบบเก่า `pdfMake.vfs = sarabunVfs` (ใช้ได้แค่ pdfmake 0.1.x/0.2.x) จะไม่มีผลใดๆ
// ในเวอร์ชันนี้ ต้องใช้ addVirtualFileSystem() เพื่อ "เขียนไฟล์" แต่ละตัวเข้า internal filesystem จริงๆ
// ไม่งั้นจะเจอ error "File 'xxx.ttf' not found in virtual file system" ตอน render แม้ข้อมูลฟอนต์จะถูกต้องก็ตาม
pdfMake.addVirtualFileSystem(sarabunVfs)

// ลงทะเบียน font-family ชื่อ "Sarabun" — ใช้ addFonts() เพื่อ merge เข้ากับฟอนต์เริ่มต้น (Roboto)
// ไม่ใช้ pdfMake.fonts = {...} ตรงๆ เพราะจะลบฟอนต์ default (Roboto) ทิ้งไปเลย
pdfMake.addFonts({
  Sarabun: {
    normal: 'Sarabun-Regular.ttf',
    bold: 'Sarabun-Bold.ttf',
    italics: 'Sarabun-Italic.ttf',
    bolditalics: 'Sarabun-BoldItalic.ttf'
  }
})

export default pdfMake