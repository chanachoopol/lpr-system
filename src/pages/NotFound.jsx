import '../styles/NotFound.css'

function NotFound() {
  return (
    <div className="notfound-minimal-wrap">
      <h1 className="notfound-minimal-code">404</h1>
      <h2 className="notfound-minimal-title">ไม่พบหน้าที่คุณต้องการ</h2>
      <p className="notfound-minimal-desc">
        ขออภัย ไม่พบหน้าที่ระบุในระบบ กรุณาตรวจสอบ URL อีกครั้ง
      </p>
    </div>
  )
}

export default NotFound
