// ฟังก์ชันจัดการข้อความ Error รายละเอียดของกล้อง (แปลงเป็นภาษาไทยที่อ่านเข้าใจง่าย)
export function formatCameraErrorDetail(rawDetail) {
  if (!rawDetail) return ''
  let text = ''
  if (typeof rawDetail === 'string') {
    text = rawDetail
  } else if (typeof rawDetail === 'object') {
    text = rawDetail.detail || rawDetail.message || rawDetail.note || JSON.stringify(rawDetail)
  }
  const lower = text.toLowerCase()

  // 1. ตรวจจับกรณีข้อความรวม (Multiple status combined) เช่น:
  // "Stream is offline, Camera is not active, Verification status is 'failed'"
  // "Camera is offline, Verification status is 'pending'"
  if (
    (lower.includes('offline') || lower.includes('stream')) &&
    (lower.includes('failed') || lower.includes('not active'))
  ) {
    return 'ไม่สามารถเชื่อมต่อสัญญาณกล้องได้ (สัญญาณออฟไลน์ หรือลิงก์ RTSP ไม่ถูกต้อง)'
  }

  if (lower.includes('offline') && lower.includes('pending')) {
    return 'สัญญาณกล้องออฟไลน์ (ไม่พบการตอบสนองจากลิงก์ RTSP ที่ระบุ)'
  }

  if (
    lower.includes('stream is offline') ||
    lower.includes('stream offline') ||
    lower.includes('stream is not online') ||
    lower.includes('camera is offline')
  ) {
    return 'ไม่พบสัญญาณสตรีมของกล้อง กรุณาตรวจสอบลิงก์ RTSP หรือสถานะการเปิดของกล้อง'
  }

  if (
    lower.includes("verification status is 'failed'") ||
    lower.includes('verification status is failed') ||
    lower.includes('verification failed') ||
    lower.includes('verify failed')
  ) {
    return 'การยืนยันสัญญาณกล้องไม่สำเร็จ (ไม่สามารถดึงภาพวิดีโอจากลิงก์ได้)'
  }

  if (lower.includes("verification status is 'pending'") || lower.includes('verification status is pending')) {
    return 'อยู่ระหว่างรอการยืนยันสัญญาณจากกล้อง'
  }

  if (
    lower.includes('cannot connect') ||
    lower.includes('connection refused') ||
    lower.includes('failed to connect') ||
    lower.includes('could not connect')
  ) {
    return 'ไม่สามารถเชื่อมต่อสัญญาณกล้องได้ กรุณาตรวจสอบ IP หรือเครือข่าย'
  }

  if (lower.includes('camera is not active') || lower.includes('camera inactive')) {
    return 'กล้องถูกปิดการใช้งาน'
  }

  if (lower.includes('ai vision') || lower.includes('ai_vision')) {
    return 'ไม่สามารถเชื่อมต่อระบบ AI Vision กับกล้องตัวนี้ได้'
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'หมดเวลาการเชื่อมต่อสัญญาณกล้อง (กล้องไม่ตอบสนอง)'
  }

  // หากเป็นภาษาไทยอยู่แล้ว หรือข้อความอื่นๆ ให้คืนค่าเดิม
  return text
}

// รวมสถานะกล้อง (Power, AI Vision, Streaming / MediaMTX) ให้เป็น Camera Status เดียวที่เข้าใจง่าย
export function getUnifiedCameraStatusBadge(camera, isChecking = false, isStreamingServerDown = false) {
  if (!camera) {
    return { label: 'ไม่ทราบสถานะ', tone: 'starting', description: 'ไม่มีข้อมูลสถานะกล้อง' }
  }

  // 1. ปิดใช้งานกล้อง (ผู้ใช้สั่งปิดการทำงานเอง — is_active: false)
  // ต้องตรวจเช็คตรงนี้ก่อนเป็นลำดับแรกสุด เพราะเมื่อสั่งปิด Backend จะตัดสตรีม (status: false, stream_online: false)
  // ซึ่งไม่ใช่ข้อผิดพลาดของกล้อง แต่เกิดจากความตั้งใจของผู้ใช้เอง
  if (!camera.is_active) {
    return { label: 'ปิดใช้งาน', tone: 'disabled', description: 'ผู้ใช้ปิดการทำงานกล้อง' }
  }

  // 1.1 เซิร์ฟเวอร์สตรีมมิ่ง (MediaMTX) มีปัญหา — แสดงสถานะเป็นไม่ทราบสถานะ ตามที่ backend แนะนำ
  if (isStreamingServerDown) {
    return { label: 'ไม่ทราบสถานะ', tone: 'starting', description: 'ระบบสตรีมมิ่งส่วนกลางขัดข้อง' }
  }

  // 2. กำลังโหลด/ตรวจสอบเฉพาะกล้องตัวนี้
  if (isChecking) {
    return { label: 'กำลังตรวจสอบสัญญาณ...', tone: 'starting', description: 'กำลังส่งคำขอตรวจสอบไปยังระบบ' }
  }

  // 3. อยู่ระหว่างรอยืนยันสัญญาณ / กำลังเริ่มระบบ (Pending / Connecting / Starting)
  // ตรวจสอบตรงนี้ก่อน เพื่อไม่ให้กล้องที่เพิ่งเพิ่มใหม่ (verification_status = pending) หลุดไปเป็น "ขัดข้อง"
  const isPending =
    camera.verification_status === 'pending' ||
    camera.verification_status === 'connecting' ||
    camera.is_starting === true

  if (isPending && camera.verification_status !== 'failed' && camera.status !== false) {
    return {
      label: 'รอยืนยันสัญญาณ...',
      tone: 'starting',
      description: 'กำลังตรวจสอบการเชื่อมต่อกับกล้อง (กรุณารอสักครู่)'
    }
  }

  // 4. ขัดข้อง / เชื่อมต่อไม่สำเร็จ (เมื่อยืนยันว่าล้มเหลวจริง ในขณะที่กล้องยังเปิดใช้งานอยู่)
  const hasFailureSignals =
    camera.verification_status === 'failed' ||
    (camera.status === false && camera.verification_status !== 'pending') ||
    (camera.verification_status === 'verified' && camera.stream_online === false) ||
    (camera.detail &&
      camera.verification_status !== 'pending' &&
      !camera.detail.includes('ถี่เกินไป') &&
      !camera.detail.toLowerCase().includes('rate limit') &&
      (
        camera.detail.toLowerCase().includes('offline') ||
        camera.detail.toLowerCase().includes('failed') ||
        camera.detail.toLowerCase().includes('refused') ||
        camera.detail.toLowerCase().includes('ขัดข้อง') ||
        camera.detail.toLowerCase().includes('ไม่สำเร็จ')
      ))

  // กล้องที่ใส่ลิงก์ปลอม หรือสัญญาณหลุด หรือ verify ไม่ผ่าน ต้องขึ้น "ขัดข้อง" เสมอ ไม่ใช่ "ปิดใช้งาน"
  if (hasFailureSignals) {
    let errDetail = formatCameraErrorDetail(camera.detail)
    if (!errDetail) {
      if (camera.verification_status === 'failed') {
        errDetail = 'การยืนยันกล้องไม่สำเร็จ (ไม่พบสัญญาณ)'
      } else if (camera.stream_online === false) {
        errDetail = 'สัญญาณสตรีมมิ่งออฟไลน์'
      } else {
        errDetail = 'ไม่สามารถเชื่อมต่อสัญญาณได้'
      }
    }
    return {
      label: 'ขัดข้อง',
      tone: 'error',
      description: errDetail,
      canRetry: true
    }
  }

  // 5. พร้อมใช้งาน (เมื่อ backend status === true หรือผ่านเงื่อนไข verified & stream_online)
  const isReady = camera.status === true || (camera.verification_status === 'verified' && camera.stream_online === true)
  if (isReady) {
    return { label: 'พร้อมใช้งาน', tone: 'ready', description: 'กล้องพร้อมตรวจจับ' }
  }

  // 6. ถ้ายังไม่มี status ชัดเจน แต่ยังไม่ล้มเหลว
  if (
    (camera.status === undefined && camera.stream_online === undefined) ||
    (camera.status === undefined && camera.stream_online === false)
  ) {
    return { label: 'รอยืนยันสัญญาณ...', tone: 'starting', description: 'กำลังเชื่อมต่อสัญญาณกล้อง' }
  }

  // Fallback
  return {
    label: camera.verification_status || 'รอยืนยันสัญญาณ...',
    tone: 'starting',
    description: 'กำลังเชื่อมต่อสัญญาณกล้อง'
  }
}

// ตรวจสอบว่ากล้องอยู่ในสถานะ "พร้อมใช้งาน" (tone === 'ready') หรือไม่
// ถ้าใช่ -> หมุดสีเขียว (#16a34a) / ถ้าไม่ใช่สถานะพร้อมใช้งาน -> หมุดสีแดง (#dc2626)
export function isCameraReady(camera, isStreamingServerDown = false) {
  if (!camera) return false
  if (!camera.is_active) return false
  const badge = getUnifiedCameraStatusBadge(camera, false, isStreamingServerDown)
  return badge.tone === 'ready'
}

// อัปเดตข้อมูลกล้องตาม SSE event (เช่น verified, verification_failed, sync_failed, online, offline)
export function applyCameraEventToCamera(camera, event) {
  if (!camera || !event) return camera
  if (String(camera.id) !== String(event.camera_id)) return camera

  const { type } = event
  if (type === 'verified') {
    return {
      ...camera,
      verification_status: 'verified',
      stream_online: event.stream_online ?? true,
      status: event.status ?? true,
      is_starting: false,
      is_active: event.is_active ?? camera.is_active,
      detail: null,
      syncWarning: null
    }
  }
  if (type === 'verification_failed') {
    return {
      ...camera,
      verification_status: 'failed',
      stream_online: event.stream_online ?? false,
      status: event.status ?? false,
      is_starting: false,
      is_active: event.is_active ?? false,
      detail: formatCameraErrorDetail(event.detail) || 'การยืนยันกล้องไม่สำเร็จ (ไม่พบสัญญาณภาพ)',
      syncWarning: null
    }
  }
  if (type === 'sync_failed') {
    return {
      ...camera,
      status: false,
      stream_online: false,
      is_starting: false,
      verification_status: 'failed',
      detail: 'ซิงค์ระบบกับกล้องไม่สำเร็จ (ไม่สามารถเชื่อมต่อสัญญาณได้)',
      syncWarning: event.failed_services ? { failedServices: event.failed_services, at: new Date() } : null
    }
  }
  if (type === 'online') {
    return {
      ...camera,
      status: true,
      stream_online: true,
      is_online: true,
      verification_status: 'verified',
      is_starting: false,
      is_active: event.is_active ?? camera.is_active,
      detail: null,
      syncWarning: null
    }
  }
  if (type === 'offline') {
    return {
      ...camera,
      status: false,
      stream_online: false,
      is_online: false,
      is_starting: false,
      detail: 'ไม่พบสัญญาณสตรีมของกล้อง กรุณาตรวจสอบลิงก์ RTSP หรือสถานะการเปิดของกล้อง',
      syncWarning: null
    }
  }
  return camera
}
