import { useEffect, useRef, useState, useCallback } from 'react'

const LONGDO_API_KEY = import.meta.env.VITE_LONGDO_API_KEY || '77b3dd6ca1af611860ee1d100bc5d530'
const CARD_WIDTH = 240
const CARD_GAP = 12 // ระยะห่างระหว่างหมุดกับการ์ด

function MapView({ cameras = [] }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([]) // เก็บ marker object ไว้ map camera_id -> ตำแหน่งพิกัด
  const [isMapReady, setIsMapReady] = useState(false)

  // hoveredCamera = { camera, style: {top, left} } | null
  const [hoveredCamera, setHoveredCamera] = useState(null)

  useEffect(() => {
    let isCancelled = false

    function initMap() {
      if (isCancelled || !mapRef.current || mapInstanceRef.current) return
      if (!window.longdo || typeof window.longdo.Map !== 'function') return

      const map = new window.longdo.Map({
        placeholder: mapRef.current,
        language: 'th',
        ...(window.longdo.Ui?.HIDDEN ? { ui: window.longdo.Ui.HIDDEN } : {})
      })
      mapInstanceRef.current = map

      map.Event.bind('ready', () => {
        if (isCancelled) return
        map.location({ lon: 100.632904, lat: 13.844849 }, true)
        map.zoom(17, true)

        try {
          if (map.Ui) {
            map.Ui.Crosshair?.visible(false)
            map.Ui.Zoombar?.visible(false)
            map.Ui.DPad?.visible(false)
            map.Ui.Scale?.visible(false)
            map.Ui.Toolbar?.visible(false)
            map.Ui.Geolocation?.visible(false)
            map.Ui.LayerSelector?.visible(false)
            map.Ui.Fullscreen?.visible(false)
          }
        } catch (error) {
          console.warn('ซ่อน UI ของแผนที่ไม่สำเร็จ:', error)
        }

        setIsMapReady(true)
      })
try {
  map.Event.bind('location', () => setHoveredCamera(null))
  map.Event.bind('zoom', () => setHoveredCamera(null))
} catch (error) {
  console.warn('ผูก event ปิดการ์ด hover ไม่สำเร็จ:', error)
}
    } 

    if (!window.longdo) {
      const existingScript = document.querySelector(`script[src^="https://api.longdo.com/map/"]`)
      if (existingScript) {
        if (window.longdo) {
          initMap()
        } else {
          existingScript.addEventListener('load', initMap)
        }
      } else {
        const script = document.createElement('script')
        script.src = `https://api.longdo.com/map/?key=${LONGDO_API_KEY}`
        script.async = true
        script.onload = initMap
        document.head.appendChild(script)
      }
    } else {
      initMap()
    }

    return () => {
      isCancelled = true
      mapInstanceRef.current = null
      setIsMapReady(false)
    }
  }, [])

  // คำนวณตำแหน่งการ์ดให้ลอยไปทาง "บน-ขวา" ของหมุดที่ hover พร้อม clamp กันล้นกรอบ container
  const computeCardPosition = useCallback((pinEl) => {
    const container = mapRef.current
    if (!container || !pinEl) return null

    const containerRect = container.getBoundingClientRect()
    const pinRect = pinEl.getBoundingClientRect()

    let left = pinRect.right - containerRect.left + CARD_GAP
    let top = pinRect.top - containerRect.top - 8 // เยื้องขึ้นเล็กน้อยจากหัวหมุด

    // ถ้าล้นขอบขวา ให้สลับไปโผล่ทางซ้ายของหมุดแทน
    if (left + CARD_WIDTH > containerRect.width) {
      left = pinRect.left - containerRect.left - CARD_WIDTH - CARD_GAP
    }
    // กันหลุดขอบบน
    if (top < 8) top = 8
    // กันหลุดขอบล่าง (ประมาณความสูงการ์ด ~120px)
    if (top + 120 > containerRect.height) {
      top = containerRect.height - 120 - 8
    }
    // กันหลุดขอบซ้ายกรณี container แคบมาก
    if (left < 8) left = 8

    return { top, left }
  }, [])

  // Event delegation: ผูกที่ container ครั้งเดียว ไม่ผูกกับแต่ละ marker ตรงๆ
  // เพราะ Longdo re-render DOM ของ marker บ่อยตอน pan/zoom ทำให้ listener เดิมหลุด
  useEffect(() => {
    const container = mapRef.current
    if (!container) return

    function handleMouseOver(e) {
      const pinEl = e.target.closest('[data-camera-id]')
      if (!pinEl) return

      const cameraId = pinEl.getAttribute('data-camera-id')
      const camera = cameras.find((c) => String(c.id) === cameraId)
      if (!camera) return

      const style = computeCardPosition(pinEl)
      if (style) setHoveredCamera({ camera, style })
    }

    function handleMouseOut(e) {
      const pinEl = e.target.closest('[data-camera-id]')
      if (!pinEl) return
      // ถ้าเมาส์ยังอยู่ในหมุดเดิม (ย้ายไป element ลูกข้างใน) ไม่ต้องซ่อน
      if (pinEl.contains(e.relatedTarget)) return
      setHoveredCamera(null)
    }

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
    }
  }, [cameras, computeCardPosition])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isMapReady) return

    try {
      map.Overlays.clear()
      markersRef.current = []
      setHoveredCamera(null) // เปลี่ยน list กล้อง → เคลียร์การ์ดค้าง

      cameras.forEach((cam) => {
        const lat = Number(cam.lat)
        const long = Number(cam.long)

        if (!Number.isFinite(lat) || !Number.isFinite(long)) {
          console.warn(`ข้ามกล้อง "${cam.name}" เพราะพิกัดไม่ถูกต้อง:`, cam.lat, cam.long)
          return
        }

        const isActive = cam.is_active
        const markerColor = isActive ? '#16a34a' : '#dc2626'

        // ไม่ใส่ popup ให้ Longdo อีกต่อไป — ใช้ React overlay การ์ดของเราเองแทน (ดู hoveredCamera ด้านล่าง)
        const marker = new window.longdo.Marker(
          { lon: long, lat: lat },
          {
            clickable: true,
            icon: {
              offset: { x: 16, y: 32 },
              html: `
                <div data-camera-id="${cam.id}" style="
                  width: 32px;
                  height: 32px;
                  border-radius: 50% 50% 50% 0;
                  background: ${markerColor};
                  transform: rotate(-45deg);
                  border: 2px solid #fff;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                ">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                       fill="none" stroke="#ffffff" stroke-width="2.2"
                       stroke-linecap="round" stroke-linejoin="round"
                       style="transform: rotate(45deg); pointer-events: none;">
                    <path d="M23 7l-7 5 7 5V7z"></path>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                </div>`
            }
          }
        )

        map.Overlays.add(marker)
        markersRef.current.push(marker)
      })
    } catch (error) {
      console.error('เกิดข้อผิดพลาดตอนปักหมุดกล้อง:', error)
    }
  }, [cameras, isMapReady])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }} />

      {hoveredCamera && (
        <div
          className="map-hover-card"
          style={{ top: hoveredCamera.style.top, left: hoveredCamera.style.left, width: CARD_WIDTH }}
        >
          <div className="map-hover-card-header">
            <span
              className="map-hover-card-icon"
              style={{
                background: hoveredCamera.camera.is_active ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                color: hoveredCamera.camera.is_active ? '#16a34a' : '#dc2626'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z"></path>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </span>
            <strong className="map-hover-card-title">{hoveredCamera.camera.name}</strong>
          </div>

          <div className="map-hover-card-coord">
            📍 {Number(hoveredCamera.camera.lat).toFixed(6)}, {Number(hoveredCamera.camera.long).toFixed(6)}
          </div>

          <span
            className="map-hover-card-badge"
            style={{
              background: hoveredCamera.camera.is_active ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
              color: hoveredCamera.camera.is_active ? '#16a34a' : '#dc2626'
            }}
          >
            <span className="map-hover-card-dot" />
            {hoveredCamera.camera.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      )}
    </div>
  )
}

export default MapView