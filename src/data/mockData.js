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
    lon: 100.632904 
  },
  { 
    id: 'cam2', 
    name: 'Rear Gate (Outbound)', 
    lat: 13.844200, 
    lon: 100.633100 
  },
  { 
    id: 'cam3', 
    name: 'Parking Lot A2', 
    lat: 13.845300, 
    lon: 100.632500 
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