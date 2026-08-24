// src/data/mockData.js

export const mockLatestCapture = {
  plate: 'กค 1234',
  province: 'นครปฐม',
  color: 'White'
};

export const mockRecentHistory = [
  { id: 1, time: '13:33:39', plate: 'กค 1234', province: 'นครปฐม', color: 'White' },
  { id: 2, time: '13:33:35', plate: 'ฮฮ 1111', province: 'สมุทรสาคร', color: 'Black' },
  { id: 3, time: '13:33:31', plate: '8กฒ 5678', province: 'ราชบุรี', color: 'Red' },
  { id: 4, time: '13:33:27', plate: 'ฮฮ 1111', province: 'สมุทรสาคร', color: 'Black' },
  { id: 5, time: '13:33:23', plate: '2ขย 2222', province: 'กรุงเทพมหานคร', color: 'Silver' }
];

export const mockCameraLocations = [
   { 
    id: 'cam1', 
    name: 'Main Entrance (Inbound)', 
    lat: 13.844849, 
    lon: 100.632904,
    status: 'online',
    streamUrl: 'https://streaming.planetcloud.cloud/streaming/cra/hls/LPR-Test-01/index.m3u8'
  },
  { 
    id: 'cam2', 
    name: 'Rear Gate (Outbound)', 
    lat: 13.844200, 
    lon: 100.633100,
    status: 'online',
    streamUrl: 'https://streaming.planetcloud.cloud/streaming/cra/hls/LPR-Test-01/index.m3u8'
  },
  { 
    id: 'cam3', 
    name: 'Parking Lot A2', 
    lat: 13.845300, 
    lon: 100.632500,
    status: 'offline',
    streamUrl: 'https://streaming.planetcloud.cloud/streaming/cra/hls/LPR-Test-01/index.m3u8'
  },
]

export const mockDashboardStats = {
  carsIn: 300,
  carsOut: 200,
  blacklist: 2,
  aiStatus: 'Online'
}

export const mockDashboardHistory = [
  { id: 1, time: '15:15:22', plate: '1ขร 9999', province: 'กรุงเทพมหานคร', color: 'Blue' },
  { id: 2, time: '15:10:05', plate: 'กค 1234', province: 'นครปฐม', color: 'White' },
  { id: 3, time: '14:55:30', plate: '8กฒ 5678', province: 'ราชบุรี', color: 'Red' },
  { id: 4, time: '14:42:11', plate: 'ฮฮ 1111', province: 'สมุทรสาคร', color: 'Silver' },
  { id: 5, time: '14:30:00', plate: '2ขข 2222', province: 'กรุงเทพมหานคร', color: 'Black' },
]

export const mockHistoryData = Array.from({ length: 40 }, (_, i) => {
  const cameras = ['cam1', 'cam2', 'cam3']
  const cameraNames = {
    cam1: 'Main Entrance (Inbound)',
    cam2: 'Rear Gate (Outbound)',
    cam3: 'Parking Lot A'
  }
  const provinces = [
    'กรุงเทพมหานคร', 'นครปฐม', 'ราชบุรี',
    'เชียงใหม่', 'ชลบุรี', 'สมุทรสาคร'
  ]
  const randomCam = cameras[Math.floor(Math.random() * cameras.length)]
  const randomProvince = provinces[Math.floor(Math.random() * provinces.length)]
  const hour = String(Math.floor(Math.random() * 12) + 7).padStart(2, '0')
  const min = String(Math.floor(Math.random() * 60)).padStart(2, '0')
  const sec = String(Math.floor(Math.random() * 60)).padStart(2, '0')

  // สุ่มวันที่ย้อนหลังไม่เกิน 7 วัน
  const randomDaysAgo = Math.floor(Math.random() * 7)
  const itemDate = new Date()
  itemDate.setDate(itemDate.getDate() - randomDaysAgo)

  const colors = ['White', 'Black', 'Silver', 'Red', 'Blue', 'Gray', 'Green']
  const randomColor = colors[Math.floor(Math.random() * colors.length)]

  return {
    id: i + 1,
    time: `${hour}:${min}:${sec}`,
    date: itemDate.toLocaleDateString('th-TH'),
    plate: `${Math.floor(Math.random() * 9 + 1)}กข ${Math.floor(1000 + Math.random() * 8999)}`,
    province: randomProvince,
    color: randomColor,
    cameraId: randomCam,
    cameraName: cameraNames[randomCam],
    plateImg: null,
    fullImg: null
  }
})

export const mockBlacklistData = [
  { id: 1, plate: 'ทน5566', province: 'กรุงเทพฯ', reason: 'Suspicious Vehicle', date: '21/05/2026' },
  { id: 2, plate: 'พพ1122', province: 'นครปฐม', reason: 'Reported Stolen', date: '21/05/2026' },
  { id: 3, plate: 'กข9900', province: 'ราชบุรี', reason: 'Suspicious Vehicle', date: '19/05/2026' },
  { id: 4, plate: 'ฮฮ0077', province: 'สมุทรสาคร', reason: 'Blacklisted', date: '18/05/2026' },
  { id: 5, plate: 'บต3344', province: 'ชลบุรี', reason: 'Reported Stolen', date: '17/05/2026' },
]

export const mockBlacklistFoundToday = [
  { id: 1, plate: 'ทน 5566', province: 'กรุงเทพฯ', time: '10:15' },
  { id: 2, plate: 'พพ 1122', province: 'นครปฐม', time: '14:30' },
]

export const mockReportData = {
  totalCars: 1240,
  peakTime: '16:00 - 17:00',
  blacklistCount: 3,
  hourlyData: [
    { hour: '07:00', in: 45, out: 10 },
    { hour: '08:00', in: 120, out: 40 },
    { hour: '09:00', in: 200, out: 80 },
    { hour: '10:00', in: 250, out: 110 },
    { hour: '11:00', in: 180, out: 150 },
    { hour: '12:00', in: 160, out: 290 },
    { hour: '13:00', in: 140, out: 130 },
    { hour: '14:00', in: 210, out: 130 },
    { hour: '15:00', in: 280, out: 180 },
    { hour: '16:00', in: 420, out: 190 },
    { hour: '17:00', in: 150, out: 390 },
    { hour: '18:00', in: 60, out: 200 },
  ],
  topVisitors: [
    { plate: 'กค 1234', province: 'นครปฐม', count: 24 },
    { plate: '1ขร 9999', province: 'กรุงเทพมหานคร', count: 18 },
    { plate: 'ฬฬ 9876', province: 'เชียงใหม่', count: 15 },
    { plate: 'ฆฆ 555', province: 'ราชบุรี', count: 12 },
    { plate: 'นบ 4321', province: 'ชลบุรี', count: 9 },
  ]
}

export const mockNotifications = [
  {
    id: 1,
    type: 'blacklist',
    title: 'Blacklist Detected',
    plate: 'ทน 5566',
    location: 'Main Entrance (Inbound)',
    time: '10:15',
    read: false
  },
  {
    id: 2,
    type: 'blacklist',
    title: 'Blacklist Detected',
    plate: 'พพ 1122',
    location: 'Rear Gate (Outbound)',
    time: '14:30',
    read: false
  },
  {
    id: 3,
    type: 'camera',
    title: 'Camera Offline',
    plate: null,
    cameraId: 'cam3',
    location: 'Parking Lot A',
    time: '09:00',
    read: false
  },
]

// Mock ผู้ใช้สำหรับหน้า User Management
// status: 'active' | 'inactive' — สถานะบัญชี ไม่ใช่ activity ล่าสุด (แยกจาก lastLogin)
export const mockUserData = [
  { id: 1, username: 'boomc4', fullName: 'บุญมา ชูเกียรติ', phone: '0891234567', role: 'user', status: 'active', lastLogin: '20/07/2026 09:46', createdAt: '2026-03-02' },
  { id: 2, username: 'somsak_p', fullName: 'สมศักดิ์ พงษ์ไพร', phone: '0812345678', role: 'user', status: 'active', lastLogin: '20/07/2026 08:12', createdAt: '2026-05-14' },
  { id: 3, username: 'nattaya_ad', fullName: 'ณัฐยา อดิเรก', phone: '0898765432', role: 'admin', status: 'active', lastLogin: '19/07/2026 17:03', createdAt: '2026-01-20' },
  { id: 4, username: 'kittipong_w', fullName: 'กิตติพงศ์ วงศ์สุริยะ', phone: '0865554443', role: 'user', status: 'inactive', lastLogin: '02/06/2026 11:40', createdAt: '2026-06-01' },
  { id: 5, username: 'ploy_ratchaburi', fullName: 'พลอย รัตนกุล', phone: '0876665554', role: 'user', status: 'active', lastLogin: '20/07/2026 07:55', createdAt: '2026-07-15' },
  { id: 6, username: 'superadmin', fullName: 'ผู้ดูแลระบบสูงสุด', phone: '0899998888', role: 'superadmin', status: 'active', lastLogin: '21/07/2026 22:10', createdAt: '2025-11-10' },
]
// ==================== Mock: Route Tracking ====================
// ⚠️ ใช้ชั่วคราวระหว่างรอ backend restore ตาราง detections/cameras
// shape ต้องตรงกับ getDetectionsAPI/getCamerasAPI จริงเป๊ะ เพื่อสลับกลับได้ง่ายทีเดียว
// ป้าย "กค 5319" จังหวัด "ปทุมธานี" ผ่าน 4 กล้องเรียงตามเวลา (เก่า -> ใหม่)
// อีกชุด "กค 5319" จังหวัด "เชียงใหม่" ไว้ทดสอบเคส group หลายจังหวัด


// สร้างเวลาแบบอิงจาก "วันนี้" เสมอ แทน hardcode — กันปัญหา date range ไม่ match ตอนเทส
function daysAgo(days, hour, min, sec) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, min, sec, 0)
  return d.toISOString()
}
// ==================== Route Tracking Mock Data ====================
// เพิ่มท้ายไฟล์ src/data/mockData.js ที่มีอยู่แล้ว (append เข้าไปเลย ไม่ต้องแก้ของเดิม)
// ใช้ตอน USE_MOCK_DATA = true ใน RouteTracking.jsx เท่านั้น
// พอ backend มี endpoint จริง (cameras + detections) แล้ว ลบ 2 export นี้ทิ้งได้เลย ไม่กระทบไฟล์อื่น

// จุดกล้อง — field ตรงตาม schema จริงของ /api/cameras (lat, long ไม่ใช่ lon)
export const mockRouteCameras = [
  { id: 'route-cam-1', name: 'Main Entrance (Inbound)', lat: 13.844849, long: 100.632904, village_id: 'village-1', is_active: true },
  { id: 'route-cam-2', name: 'Rear Gate (Outbound)', lat: 13.844200, long: 100.633100, village_id: 'village-1', is_active: true },
  { id: 'route-cam-3', name: 'Parking Lot A2', lat: 13.845300, long: 100.632500, village_id: 'village-1', is_active: true },
  { id: 'route-cam-4', name: 'ประตูข้าง B', lat: 13.843700, long: 100.634200, village_id: 'village-1', is_active: true },
  { id: 'route-cam-5', name: 'จุดตรวจทางเหนือ', lat: 13.846500, long: 100.631800, village_id: 'village-1', is_active: true },
  { id: 'route-cam-6', name: 'ประตูหลัง C', lat: 13.843100, long: 100.631200, village_id: 'village-1', is_active: true },
  { id: 'route-cam-7', name: 'ทางเข้าแขก (Visitor Gate)', lat: 13.846000, long: 100.634800, village_id: 'village-1', is_active: true }
  // ⚠️ ตั้งใจไม่ใส่ 'route-cam-unknown' / 'route-cam-unknown2' ไว้ที่นี่ — ใช้ทดสอบเคส
  // "กล้องตรวจจับได้ แต่ยังไม่มีพิกัดในระบบ / กล้องถูกลบไปแล้ว" ตอน join กับ detections ด้านล่าง
]

// ประวัติการตรวจจับ — 4 คัน หลายกล้อง หลายวัน (พอสำหรับทดสอบทั้งค้นหาบางส่วน + ช่วงวันที่ + เส้นทางเชิงลึก)
// image_full/image_crop เป็น URL ตัวอย่างจาก picsum (mock เท่านั้น) — ของจริงจะเป็น endpoint ที่ต้องยิงผ่าน getAuthedImageURL
function buildDetection(id, plate, province, color, cameraId, isoTime, villageId = 'village-1') {
  return {
    id,
    license_plate: plate,
    province,
    color,
    camera_id: cameraId,
    village_id: villageId,
    time_detect: isoTime,
    image_full: `https://picsum.photos/seed/${id}/480/320`,
    image_crop: `https://picsum.photos/seed/${id}-crop/220/140`
  }
}

// เหมือน buildDetection แต่ไม่มีรูป — ไว้ทดสอบสถานะ "ไม่มีรูปภาพ" ใน timeline (กล้องบางจุดอาจเก็บภาพไม่ได้)
function buildDetectionNoImage(id, plate, province, color, cameraId, isoTime, villageId = 'village-1') {
  return {
    id,
    license_plate: plate,
    province,
    color,
    camera_id: cameraId,
    village_id: villageId,
    time_detect: isoTime,
    image_full: null,
    image_crop: null
  }
}

export const mockRouteDetections = [
  // รถคันที่ 1 — "1กข 2547" นครปฐม (มีจอดซ้ำกล้องเดียวกันติดกัน ไว้ทดสอบ dedupe)
  buildDetection('rtd-001', '1กข 2547', 'นครปฐม', 'White', 'route-cam-1', '2026-08-20T08:05:00'),
  buildDetection('rtd-002', '1กข 2547', 'นครปฐม', 'White', 'route-cam-3', '2026-08-20T08:47:00'),
  buildDetection('rtd-003', '1กข 2547', 'นครปฐม', 'White', 'route-cam-3', '2026-08-20T09:10:00'),
  buildDetection('rtd-004', '1กข 2547', 'นครปฐม', 'White', 'route-cam-2', '2026-08-20T10:02:00'),

  // รถคันที่ 2 — "2ขค 8825" ราชบุรี
  buildDetection('rtd-005', '2ขค 8825', 'ราชบุรี', 'Black', 'route-cam-1', '2026-08-19T07:30:00'),
  buildDetection('rtd-006', '2ขค 8825', 'ราชบุรี', 'Black', 'route-cam-4', '2026-08-19T07:58:00'),
  buildDetection('rtd-007', '2ขค 8825', 'ราชบุรี', 'Black', 'route-cam-5', '2026-08-19T08:40:00'),
  buildDetection('rtd-008', '2ขค 8825', 'ราชบุรี', 'Black', 'route-cam-2', '2026-08-19T09:25:00'),

  // รถคันที่ 3 — "กค 1234" นครปฐม (2 รอบ คนละวัน ไว้ทดสอบกรองช่วงวันที่)
  buildDetection('rtd-009', 'กค 1234', 'นครปฐม', 'White', 'route-cam-1', '2026-08-10T13:33:00'),
  buildDetection('rtd-010', 'กค 1234', 'นครปฐม', 'White', 'route-cam-3', '2026-08-10T14:02:00'),
  buildDetection('rtd-011', 'กค 1234', 'นครปฐม', 'White', 'route-cam-1', '2026-08-21T09:15:00'),
  buildDetection('rtd-012', 'กค 1234', 'นครปฐม', 'White', 'route-cam-2', '2026-08-21T09:50:00'),

  // รถคันที่ 4 — "ฮฮ 1111" สมุทรสาคร
  buildDetection('rtd-013', 'ฮฮ 1111', 'สมุทรสาคร', 'Black', 'route-cam-4', '2026-08-18T16:10:00'),
  buildDetection('rtd-014', 'ฮฮ 1111', 'สมุทรสาคร', 'Black', 'route-cam-5', '2026-08-18T16:45:00'),
  buildDetection('rtd-015', 'ฮฮ 1111', 'สมุทรสาคร', 'Black', 'route-cam-1', '2026-08-18T17:20:00'),

  // ==================== เพิ่มเติม — ครอบคลุม use case อื่นๆ ====================
  // ใช้ daysAgo() แทน hardcode วันที่ ให้ข้อมูลยังสมเหตุสมผลไม่ว่าจะเปิดหน้านี้วันไหนก็ตาม

  // รถคันที่ 5 — "34กง 1188" นครปฐม — เข้าหมู่บ้าน 3 วันไม่ติดกัน (ตามตัวอย่างที่ยกมา)
  // ค้นหา "34" ต้องเจอ 3 แถวแยกวัน (grouped ทีละวัน), กดแต่ละแถวเห็นแค่เส้นทางของวันนั้น
  buildDetection('rtd-101', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-1', daysAgo(9, 8, 10, 0)),
  buildDetection('rtd-102', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-2', daysAgo(9, 9, 5, 0)),
  buildDetection('rtd-103', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-1', daysAgo(5, 8, 0, 0)),
  buildDetection('rtd-104', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-3', daysAgo(5, 8, 30, 0)),
  buildDetection('rtd-105', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-2', daysAgo(5, 9, 15, 0)),
  buildDetection('rtd-106', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-1', daysAgo(0, 7, 45, 0)),
  buildDetection('rtd-107', '34กง 1188', 'นครปฐม', 'Blue', 'route-cam-2', daysAgo(0, 8, 20, 0)),

  // รถคันที่ 6 — "89กท 4455" กรุงเทพมหานคร — เส้นทางยาวผ่านหลายกล้องในวันเดียว (ทดสอบการ์ด "เส้นทางผ่านกล้อง" แบบยาว)
  buildDetection('rtd-108', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-1', daysAgo(1, 6, 0, 0)),
  buildDetection('rtd-109', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-3', daysAgo(1, 6, 20, 0)),
  buildDetection('rtd-110', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-7', daysAgo(1, 6, 55, 0)),
  buildDetection('rtd-111', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-6', daysAgo(1, 7, 40, 0)),
  buildDetection('rtd-112', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-4', daysAgo(1, 8, 10, 0)),
  buildDetection('rtd-113', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-5', daysAgo(1, 8, 50, 0)),
  buildDetection('rtd-114', '89กท 4455', 'กรุงเทพมหานคร', 'Silver', 'route-cam-2', daysAgo(1, 9, 30, 0)),

  // รถคันที่ 7 — "1กก 1001" เชียงใหม่ — พบครั้งเดียว (เคส route จุดเดียว: หมุดเดียวบนแผนที่ ไม่มีเส้น)
  buildDetection('rtd-115', '1กก 1001', 'เชียงใหม่', 'Red', 'route-cam-1', daysAgo(2, 12, 0, 0)),

  // รถคันที่ 8 — "2ขข 2002" ชลบุรี — บางจุดผ่านกล้องที่ไม่มีพิกัดในระบบแล้ว (กล้องถูกถอด/ยังไม่ผูกพิกัด)
  // ทดสอบว่าแผนที่/เส้นทางต้องข้ามจุดที่ไม่มีพิกัดได้อย่างไม่พัง แต่ยัง list ใน timeline ได้ (ชื่อกล้องจะขึ้น '-')
  buildDetection('rtd-116', '2ขข 2002', 'ชลบุรี', 'Black', 'route-cam-1', daysAgo(3, 10, 0, 0)),
  buildDetection('rtd-117', '2ขข 2002', 'ชลบุรี', 'Black', 'route-cam-unknown', daysAgo(3, 10, 35, 0)),
  buildDetection('rtd-118', '2ขข 2002', 'ชลบุรี', 'Black', 'route-cam-4', daysAgo(3, 11, 5, 0)),

  // รถคันที่ 9 — "4งจ 4004" กาญจนบุรี — ทั้งเส้นทางอยู่ที่กล้องไม่มีพิกัดล้วน (เคส empty state บนแผนที่ "ไม่มีข้อมูลตำแหน่งกล้อง")
  buildDetection('rtd-119', '4งจ 4004', 'กาญจนบุรี', 'Green', 'route-cam-unknown2', daysAgo(4, 15, 0, 0)),
  buildDetection('rtd-120', '4งจ 4004', 'กาญจนบุรี', 'Green', 'route-cam-unknown2', daysAgo(4, 15, 40, 0)),

  // รถคันที่ 10 — "3คค 3003" ปทุมธานี — บางจุดไม่มีรูปภาพ (กล้องเก็บภาพไม่ได้ / ภาพเสีย) ทดสอบสถานะ "ไม่มีรูปภาพ" + hover ต้องไม่ขึ้นพรีวิว
  buildDetection('rtd-121', '3คค 3003', 'ปทุมธานี', 'White', 'route-cam-2', daysAgo(6, 13, 0, 0)),
  buildDetectionNoImage('rtd-122', '3คค 3003', 'ปทุมธานี', 'White', 'route-cam-5', daysAgo(6, 13, 25, 0)),
  buildDetectionNoImage('rtd-123', '3คค 3003', 'ปทุมธานี', 'White', 'route-cam-6', daysAgo(6, 14, 0, 0)),
  buildDetection('rtd-124', '3คค 3003', 'ปทุมธานี', 'White', 'route-cam-1', daysAgo(6, 14, 30, 0)),

  // รถคันที่ 11 — ทะเบียนซ้ำแต่คนละจังหวัด "8กฒ 5678" ราชบุรี vs เพชรบุรี (ต้อง group แยกกันแม้ทะเบียนเหมือนกัน)
  buildDetection('rtd-125', '8กฒ 5678', 'ราชบุรี', 'Red', 'route-cam-1', daysAgo(7, 9, 0, 0)),
  buildDetection('rtd-126', '8กฒ 5678', 'ราชบุรี', 'Red', 'route-cam-2', daysAgo(7, 9, 40, 0)),
  buildDetection('rtd-127', '8กฒ 5678', 'เพชรบุรี', 'Red', 'route-cam-4', daysAgo(2, 16, 0, 0)),
  buildDetection('rtd-128', '8กฒ 5678', 'เพชรบุรี', 'Red', 'route-cam-5', daysAgo(2, 16, 30, 0)),

  // รถคันที่ 12/13 — ทะเบียนมี "55" ร่วมกัน คนละคัน คนละจังหวัด (ทดสอบค้นหาแบบพิมพ์บางส่วน "55")
  buildDetection('rtd-129', '55กบ 1155', 'ปทุมธานี', 'Gray', 'route-cam-3', daysAgo(1, 11, 0, 0)),
  buildDetection('rtd-130', '55กบ 1155', 'ปทุมธานี', 'Gray', 'route-cam-2', daysAgo(1, 11, 25, 0)),
  buildDetection('rtd-131', '7จร 5599', 'ระยอง', 'Green', 'route-cam-1', daysAgo(8, 17, 0, 0)),

  // รถคันที่ 14 — "6งง 6006" ตาก — พบข้ามคืนใกล้เที่ยงคืน (ทดสอบ dateKeyOf แยกวันถูกต้องตรงรอยต่อ 00:00)
  buildDetection('rtd-132', '6งง 6006', 'ตาก', 'Black', 'route-cam-7', daysAgo(2, 23, 58, 0)),
  buildDetection('rtd-133', '6งง 6006', 'ตาก', 'Black', 'route-cam-1', daysAgo(1, 0, 5, 0)),

  // รถคันที่ 15 — "7จจ 7007" — มาจากอีกหมู่บ้านหนึ่ง (village_id ต่างกัน) ไว้ทดสอบตอน backend จริงกรองตาม village_id
  buildDetection('rtd-134', '7จจ 7007', 'สระบุรี', 'Silver', 'route-cam-1', daysAgo(3, 18, 0, 0), 'village-2'),
  buildDetection('rtd-135', '7จจ 7007', 'สระบุรี', 'Silver', 'route-cam-2', daysAgo(3, 18, 20, 0), 'village-2'),

  // รถคันที่ 16 — "9ฒฒ 9009" สมุทรปราการ — 60 จุดในวันเดียว ทดสอบ MAX_ROUTE_POINTS (ตัดที่ 50 จุดล่าสุด + ข้อความแจ้งเตือน)
  ...Array.from({ length: 60 }, (_, i) => {
    const surgeCameras = ['route-cam-1', 'route-cam-3', 'route-cam-2', 'route-cam-4', 'route-cam-6', 'route-cam-7', 'route-cam-5']
    const cameraId = surgeCameras[i % surgeCameras.length]
    const totalMinutes = 6 * 60 + i * 4 // เริ่ม 06:00 เดินหน้าทีละ 4 นาที
    const hour = Math.floor(totalMinutes / 60) % 24
    const min = totalMinutes % 60
    return buildDetection(
      `rtd-surge-${String(i + 1).padStart(3, '0')}`,
      '9ฒฒ 9009',
      'สมุทรปราการ',
      'Gray',
      cameraId,
      daysAgo(0, hour, min, 0)
    )
  })
]