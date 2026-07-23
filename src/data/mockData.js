// src/data/mockData.js

export const mockLatestCapture = {
  plate: 'กค 1234',
  province: 'นครปฐม'
};

export const mockRecentHistory = [
  { id: 1, time: '13:33:39', plate: 'กค 1234', province: 'นครปฐม' },
  { id: 2, time: '13:33:35', plate: 'ฮฮ 1111', province: 'สมุทรสาคร' },
  { id: 3, time: '13:33:31', plate: '8กฒ 5678', province: 'ราชบุรี' },
  { id: 4, time: '13:33:27', plate: 'ฮฮ 1111', province: 'สมุทรสาคร' },
  { id: 5, time: '13:33:23', plate: '2ขย 2222', province: 'กรุงเทพมหานคร' }
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
  { id: 1, time: '15:15:22', plate: '1ขร 9999', province: 'กรุงเทพมหานคร' },
  { id: 2, time: '15:10:05', plate: 'กค 1234', province: 'นครปฐม' },
  { id: 3, time: '14:55:30', plate: '8กฒ 5678', province: 'ราชบุรี' },
  { id: 4, time: '14:42:11', plate: 'ฮฮ 1111', province: 'สมุทรสาคร' },
  { id: 5, time: '14:30:00', plate: '2ขข 2222', province: 'กรุงเทพมหานคร' },
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

  return {
    id: i + 1,
    time: `${hour}:${min}:${sec}`,
    date: itemDate.toLocaleDateString('th-TH'),
    plate: `${Math.floor(Math.random() * 9 + 1)}กข ${Math.floor(1000 + Math.random() * 8999)}`,
    province: randomProvince,
    cameraId: randomCam,
    cameraName: cameraNames[randomCam],
    plateImg: null,
    fullImg: null
  }
})

export const mockBlacklistData = [
  { id: 1, plate: 'ทน 5566', province: 'กรุงเทพฯ', reason: 'Suspicious Vehicle', date: '21/05/2026' },
  { id: 2, plate: 'พพ 1122', province: 'นครปฐม', reason: 'Reported Stolen', date: '21/05/2026' },
  { id: 3, plate: 'กข 9900', province: 'ราชบุรี', reason: 'Suspicious Vehicle', date: '19/05/2026' },
  { id: 4, plate: 'ฮฮ 0077', province: 'สมุทรสาคร', reason: 'Blacklisted', date: '18/05/2026' },
  { id: 5, plate: 'บต 3344', province: 'ชลบุรี', reason: 'Reported Stolen', date: '17/05/2026' },
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
  { id: 1, username: 'boomc4', fullName: 'บุญมา ชูเกียรติ', role: 'user', status: 'active', lastLogin: '20/07/2026 09:46', createdAt: '2026-03-02' },
  { id: 2, username: 'somsak_p', fullName: 'สมศักดิ์ พงษ์ไพร', role: 'user', status: 'active', lastLogin: '20/07/2026 08:12', createdAt: '2026-05-14' },
  { id: 3, username: 'nattaya_ad', fullName: 'ณัฐยา อดิเรก', role: 'admin', status: 'active', lastLogin: '19/07/2026 17:03', createdAt: '2026-01-20' },
  { id: 4, username: 'kittipong_w', fullName: 'กิตติพงศ์ วงศ์สุริยะ', role: 'user', status: 'inactive', lastLogin: '02/06/2026 11:40', createdAt: '2026-06-01' },
  { id: 5, username: 'ploy_ratchaburi', fullName: 'พลอย รัตนกุล', role: 'user', status: 'active', lastLogin: '20/07/2026 07:55', createdAt: '2026-07-15' },
  { id: 6, username: 'superadmin', fullName: 'ผู้ดูแลระบบสูงสุด', role: 'superadmin', status: 'active', lastLogin: '21/07/2026 22:10', createdAt: '2025-11-10' },
]