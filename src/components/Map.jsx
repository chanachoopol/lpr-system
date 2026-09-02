import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useVillageStore from '../store/villageStore'

const LONGDO_API_KEY = import.meta.env.VITE_LONGDO_API_KEY || '77b3dd6ca1af611860ee1d100bc5d530'
const CARD_WIDTH = 240
const CARD_GAP = 14 // ระยะห่างระหว่างหมุดกับการ์ด (14px)

// จัดมุมมองแผนที่ให้ครอบคลุมทุกหมุดกล้องอัตโนมัติ
function fitMapToCameras(map, cameras) {
  if (!map || !cameras || cameras.length === 0) return

  const validPoints = cameras
    .map((c) => ({ lat: Number(c.lat), lon: Number(c.long) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))

  if (validPoints.length === 0) return

  if (validPoints.length === 1) {
    map.location({ lon: validPoints[0].lon, lat: validPoints[0].lat }, true)
    map.zoom(16, true)
    return
  }

  const lons = validPoints.map((p) => p.lon)
  const lats = validPoints.map((p) => p.lat)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)

  // คำนวณจุดกึ่งกลาง + ระดับการซูมที่ครอบคลุมทุกจุดพร้อมระยะเผื่อขอบ (Safety Margin)
  const centerLon = (minLon + maxLon) / 2
  const centerLat = (minLat + maxLat) / 2
  const maxSpan = Math.max(maxLon - minLon, maxLat - minLat)

  let zoom = 15
  if (maxSpan > 1.0) zoom = 7
  else if (maxSpan > 0.5) zoom = 9
  else if (maxSpan > 0.2) zoom = 10
  else if (maxSpan > 0.1) zoom = 11
  else if (maxSpan > 0.05) zoom = 12
  else if (maxSpan > 0.02) zoom = 13
  else if (maxSpan > 0.01) zoom = 14
  else if (maxSpan > 0.004) zoom = 15
  else if (maxSpan > 0.001) zoom = 16
  else zoom = 16

  map.location({ lon: centerLon, lat: centerLat }, true)
  map.zoom(zoom, true)
}

function MapView({ cameras = [] }) {
  const navigate = useNavigate()
  const getVillageName = useVillageStore((state) => state.getVillageName)
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([]) // เก็บ marker object ไว้ map camera_id -> ตำแหน่งพิกัด
  const camerasRef = useRef(cameras)
  camerasRef.current = cameras
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

        if (camerasRef.current && camerasRef.current.length > 0) {
          fitMapToCameras(map, camerasRef.current)
        } else {
          map.location({ lon: 100.632904, lat: 13.844849 }, true)
          map.zoom(15, true)
        }

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

        try {
          map.Event.bind('zoom', () => setHoveredCamera(null))
        } catch (error) {
          console.warn('ผูก event ปิดการ์ด hover ไม่สำเร็จ:', error)
        }
      })
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

  // คำนวณตำแหน่งการ์ด: ลอยอยู่เหนือหัวหมุด 14px จัดกึ่งกลางพอดี (ไม่บังหมุด 100%)
  // ถ้าชนขอบบน จะสลับไปลอยอยู่ใต้ปลายหมุด 14px อัตโนมัติ
  const computeCardPosition = useCallback((pinEl) => {
    const container = mapRef.current
    if (!container || !pinEl) return null

    const containerRect = container.getBoundingClientRect()
    const pinRect = pinEl.getBoundingClientRect()

    const pinCenterX = pinRect.left + pinRect.width / 2 - containerRect.left
    const pinTop = pinRect.top - containerRect.top
    const pinBottom = pinRect.bottom - containerRect.top
    const CARD_HEIGHT = 115

    // 1. ตำแหน่งแนวนอน: วางตรงกลางหมุดพอดี
    let left = pinCenterX - CARD_WIDTH / 2

    // ป้องกันหลุดขอบซ้าย-ขวา
    if (left < 10) left = 10
    if (left + CARD_WIDTH > containerRect.width - 10) {
      left = Math.max(10, containerRect.width - CARD_WIDTH - 10)
    }

    // 2. ตำแหน่งแนวตั้ง: ลอยอยู่เหนือหัวหมุด 14px
    let top = pinTop - CARD_HEIGHT - CARD_GAP

    // ถ้าชนขอบบน: สลับไปอยู่ใต้ปลายหมุด 14px แทน
    if (top < 10) {
      top = pinBottom + CARD_GAP
    }

    // ป้องกันหลุดขอบล่าง
    if (top + CARD_HEIGHT > containerRect.height - 10) {
      top = Math.max(10, containerRect.height - CARD_HEIGHT - 10)
    }

    return { top, left }
  }, [])

  // Event delegation: ผูกที่ container ครั้งเดียว ไม่ผูกกับแต่ละ marker ตรงๆ
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

    function handleClick(e) {
      const pinEl = e.target.closest('[data-camera-id]')
      if (!pinEl) return
      const cameraId = pinEl.getAttribute('data-camera-id')
      if (cameraId) {
        navigate(`/monitor?camera=${cameraId}`)
      }
    }

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)
    container.addEventListener('click', handleClick)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
      container.removeEventListener('click', handleClick)
    }
  }, [cameras, computeCardPosition, navigate])

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

      // จัดขอบเขตแผนที่ให้ครอบคลุมทุกหมุดกล้องอัตโนมัติ
      fitMapToCameras(map, cameras)
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
          style={{ top: hoveredCamera.style.top, left: hoveredCamera.style.left, width: CARD_WIDTH, cursor: 'pointer' }}
          onClick={() => navigate(`/monitor?camera=${hoveredCamera.camera.id}`)}
          title="คลิกเพื่อดูภาพสด"
        >
          <div className="map-hover-card-village"> Village: 
            {getVillageName(hoveredCamera.camera.village_id) || hoveredCamera.camera.village_name || hoveredCamera.camera.village?.name || '-'}
          </div>

          <div className="map-hover-card-header">
            <strong className="map-hover-card-title">{hoveredCamera.camera.name}</strong>
          </div>

          <div className="map-hover-card-row">
            <span className="map-hover-card-label">ทิศทาง:</span>
            <span
              className={`map-direction-badge ${
                hoveredCamera.camera.direction === 'entry' ? 'entry' : hoveredCamera.camera.direction === 'exit' ? 'exit' : ''
              }`}
            >
              {hoveredCamera.camera.direction === 'entry'
                ? 'ขาเข้า (Entry)'
                : hoveredCamera.camera.direction === 'exit'
                ? 'ขาออก (Exit)'
                : '-'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapView