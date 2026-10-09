# License Plate Recognition (LPR) System - Frontend
> ระบบตรวจจับและบันทึกป้ายทะเบียนยานพาหนะ (Frontend Web Application)  
> เวอร์ชันส่งมอบ: **v1.0.0**

# Overview
ระบบ **LPR System Frontend** เป็นส่วนต่อประสานผู้ใช้เว็บแอปพลิเคชัน (Single Page Application - SPA) พัฒนาขึ้นด้วย **React 19** ร่วมกับ **Vite** ออกแบบสำหรับใช้งานบนเบราว์เซอร์คอมพิวเตอร์ (Desktop Browser) เพื่อบริหารจัดการ, ตรวจสอบภาพสตรีมสดจากกล้องวงจรปิด, ติดตามยานพาหนะ และแจ้งเตือนป้ายทะเบียนเฝ้าระวังแบบ Real-time

# คุณสมบัติหลักของระบบ (Key Features)
ระบบประกอบด้วย 11 โมดูลหลัก ดังนี้:
1. ระบบยืนยันตัวตนและความปลอดภัย (Authentication & RBAC):**
   - เข้าสู่ระบบผ่าน HTTP-Only Cookies ร่วมกับ Access Token
   - ระบบ Auto-refresh Token Interceptor พร้อม Request Queueing
   - ระบบลืมรหัสผ่าน, ตั้งรหัสผ่านใหม่, ยืนยันการเปลี่ยนอีเมล และตรวจสอบความปลอดภัยของรหัสผ่าน (Password Strength)
   - การแบ่งสิทธิ์การใช้งาน (Role-Based Access Control)

2. ระบบแดชบอร์ดสรุปสถิติ (Dashboard & Analytics):**
   - แสดงสถิติยานพาหนะผ่านเข้า-ออก และป้ายทะเบียนเฝ้าระวังแบบ Real-time
   - กราฟแนวโน้มสถิติย้อนหลัง (Recharts) พร้อมตัวกรองช่วงเวลา

3. ระบบแสดงภาพสดกล้องวงจรปิด (Live Camera Monitoring):**
   - รับชมสตรีมภาพสดแบบหลายมุมมองพร้อมกันผ่านโปรโตคอล HLS (`hls.js`)
   - จัดการมุมมอง Grid Tile, ขยายภาพเต็มจอ และตรวจสอบสถานะ Online/Offline ของกล้อง

4. ระบบสืบค้นประวัติการตรวจจับ (Detection History):**
   - ค้นหาและกรองข้อมูลยานพาหนะตามป้ายทะเบียน, หมวดหมู่, จังหวัด, กล้อง และช่วงวันเวลา
   - Custom Date Picker พร้อมปุ่ม Quick Presets วันที่
   - แสดงภาพหลักฐานภาพป้ายทะเบียนและภาพมุมกว้างตัวรถ พร้อมระบบแบ่งหน้า (Pagination)

5. ระบบบัญชีดำและการเตือนภัย (Blacklist & SSE Alerts):**
   - จัดการรายการป้ายทะเบียนเฝ้าระวัง (เพิ่ม / แก้ไข / ลบ / ระงับ)
   - ระบบแจ้งเตือนฉุกเฉินแบบ Modal Popup ทันทีเมื่อกล้องตรวจพบป้ายทะเบียนใน Blacklist ผ่าน Server-Sent Events (SSE)

6. ระบบติดตามเส้นทางยานพาหนะ (Route Tracking):**
   - ค้นหาประวัติการเคลื่อนที่ของยานพาหนะเป้าหมาย
   - พล็อตเส้นทางและจุดตรวจพบลำดับเวลาบนแผนที่ดิจิทัลผ่าน **Longdo Map API**

7. ระบบสร้างและส่งออกรายงาน (PDF Report Generation):**
   - ส่งออกรายงานสรุปประวัติเป็นไฟล์ PDF มาตรฐาน (`pdfmake`)
   - รองรับฟอนต์ภาษาไทย (Sarabun Fonts) และจัดความกว้างของคอลัมน์อัตโนมัติ

8. ระบบจัดการผู้ใช้งาน (User Management):**
   - *(Admin/Superadmin)* จัดการบัญชีผู้ใช้, กำหนดระดับสิทธิ์ (Role), ผูกพื้นที่หมู่บ้านที่ดูแล และระงับบัญชี

9. ระบบจัดการกล้องวงจรปิด (Camera Management):**
   - *(Admin/Superadmin)* ลงทะเบียนกล้อง, ตั้งค่า Stream URL, ระบุตำแหน่งพิกัด GPS ละติจูดและลองจิจูด

10. ระบบบันทึกประวัติการใช้งาน (Audit Logs):**
    - *(Admin/Superadmin)* ตรวจสอบประวัติการเข้าสู่ระบบและการทำธุรกรรมสำคัญย้อนหลัง

11. การติดตั้งผ่าน Container (Dockerization):**
    - Multi-stage Dockerfile (Node.js 20 Build -> Nginx Alpine Web Server)
    - รันผ่าน Docker Compose บนพอร์ต 3000

# เทคโนโลยีที่ใช้ (Tech Stack)

* **Core Framework:** React 19, Vite
* **Routing:** React Router
* **State Management & Data Fetching:** Zustand
* **UI & Styling:** Tailwind CSS, React Icons
* **Streaming & Media:** HLS.js
* **Maps & Geo:** [Longdo Map API](https://map.longdo.com/)
* **PDF Export:** [pdfmake](https://pdfmake.github.io/docs/), [html2canvas](https://html2canvas.hertzen.com/)
* **Deployment & Web Server:** Docker, Nginx Alpine

# ข้อกำหนดเบื้องต้น (Prerequisites)

* **Node.js:** เวอร์ชัน `>= 20.x`
* **Package Manager:** `npm` (เวอร์ชัน 10+)
* **Docker & Docker Compose:** สำหรับการรันระบบในรูปแบบ Container

---

## การตั้งค่า Environment Variables
ตัวแปร คำอธิบาย ตัวอย่าง
`VITE_TARGET_HOST`, Host ปลายทางสำหรับเชื่อมต่อ API / Stream, `http://192.168.1.100:8000` 
`VITE_API_URL` , Base URL สำหรับ RESTful API , `http://192.168.1.100:8000/api` 
`VITE_LONGDO_API_KEY` , API Key สำหรับใช้งานแผนที่ Longdo Map , `your_longdo_map_api_key` 

# วิธีการติดตั้งและรันระบบ (Installation & Running)

รันสำหรับสภาพแวดล้อมทดสอบ (Local Development)
npm install

# รัน Development Server
npm run dev
เปิดเบราว์เซอร์ไปที่ `http://localhost:5173`

# บิลด์โค้ดสำหรับญโปรดัคชั่น (ไฟล์จะอยู่ในโฟลเดอร์ dist)
npm run build

# สั่ง Build และเริ่มต้น Container ในโหมด Background
docker compose up -d --build

* **การเข้าใช้งาน:** เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` (หรือ IP ของเครื่องเซิร์ฟเวอร์)
* **การหยุดการทำงาน:**
docker stop <ID>

# โครงสร้างโปรเจกต์ (Project Structure)

lpr-system/
├── public/                 # ไฟล์ Static Assets
├── src/
│   ├── animations/         # การตั้งค่า Framer Motion
│   ├── assets/             # รูปภาพ, ฟอนต์ และไฟล์ประกอบ
│   ├── components/         # Reusable UI Components
│   ├── data/               # ข้อมูลค่าคงที่ (Static / Mock Data)
│   ├── hooks/              # Custom React Hooks
│   ├── pages/              # หน้าจอหลักของระบบ (11 โมดูล)
│   ├── store/              # ตัวจัดการ State (Zustand Store)
│   ├── styles/             # Stylesheet และ Global CSS
│   ├── utils/              # Helper Functions, API Client, Interceptors
│   ├── App.jsx             # Root Component และ Routing Configuration
│   └── main.jsx            # จุดเริ่มต้นแอปพลิเคชัน (Entry Point)
├── .env.example            # ไฟล์ตัวอย่างการตั้งค่าสภาพแวดล้อม
├── docker-compose.yml      # การตั้งค่ารัน Container (Port 3000 -> 80)
├── Dockerfile              # Multi-stage Docker Build (Node.js -> Nginx)
├── nginx.conf              # การตั้งค่า Nginx Web Server (SPA Fallback)
├── package.json            # กำหนด Dependencies และ Scripts
└── README.md               # เอกสารแนะนำและคู่มือการใช้งานระบบ

# เอกสารประกอบและการส่งมอบ (Handover Documents)
ฉบับที่ 1: LPR_Frontend_Handover_Document.pdf (เอกสารส่งมอบงาน)
ฉบับที่ 2: LPR_Frontend_User_Manual.pdf (คู่มือการใช้งาน)
* ช่องทางการติดต่อ:** chanachoopol@gmail.com 
