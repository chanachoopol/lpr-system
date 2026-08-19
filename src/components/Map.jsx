import { useEffect, useRef, useState } from 'react'

const LONGDO_API_KEY = '77b3dd6ca1af611860ee1d100bc5d530'

function MapView({ cameras = [] }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [isMapReady, setIsMapReady] = useState(false)

  useEffect(() => {
    let isCancelled = false

    function initMap() {
      if (isCancelled || !mapRef.current || mapInstanceRef.current) return
      if (!window.longdo || typeof window.longdo.Map !== 'function') return

      const map = new window.longdo.Map({ placeholder: mapRef.current, language: 'th' })
      mapInstanceRef.current = map

      map.Event.bind('ready', () => {
        if (isCancelled) return
        map.location({ lon: 100.632904, lat: 13.844849 }, true)
        map.zoom(17, true)

        // ซ่อน UI เริ่มต้นของ Longdo ที่ไม่จำเป็น ให้หน้าตาโล่งๆ
        try {
          map.Ui.Crosshair.visible(false)      // กากบาทสีแดงกลางจอ (ตัวที่ถามถึง)
          map.Ui.Zoombar.visible(false)        // ปุ่ม +/- zoom มุมซ้ายบน
          map.Ui.Toolbar.visible(false)        // แถบเครื่องมือ (วัดระยะ ฯลฯ)
          map.Ui.Geolocation.visible(false)    // ปุ่มระบุตำแหน่งปัจจุบัน
          map.Ui.LayerSelector.visible(false)  // ปุ่มเลือกชั้นแผนที่/ดาวเทียม
          map.Ui.Fullscreen.visible(false)     // ปุ่มขยายเต็มจอ
          // map.Ui.Scale.visible(false)       // แถบมาตราส่วนล่างซ้าย — ปล่อยไว้ก็ได้ ไม่รก
        } catch (error) {
          console.warn('ซ่อน UI ของแผนที่ไม่สำเร็จ:', error)
        }

        setIsMapReady(true)
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

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isMapReady) return

    try {
      map.Overlays.clear()

      cameras.forEach((cam) => {
        const lat = Number(cam.lat)
        const long = Number(cam.long)

        if (!Number.isFinite(lat) || !Number.isFinite(long)) {
          console.warn(`ข้ามกล้อง "${cam.name}" เพราะพิกัดไม่ถูกต้อง:`, cam.lat, cam.long)
          return
        }

        const isActive = cam.is_active
        const markerColor = isActive ? '#16a34a' : '#dc2626'

        const marker = new window.longdo.Marker(
          { lon: long, lat: lat },
          {
            title: cam.name,
            clickable: true,
            icon: {
              offset: { x: 16, y: 32 },
              html: `
                <div style="
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
                       style="transform: rotate(45deg);">
                    <path d="M23 7l-7 5 7 5V7z"></path>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                </div>`
            },
            popup: {
              closable: true,
              html: `
                <div style="
                  font-family: 'DM Sans', sans-serif;
                  background: #ffffff;
                  border-radius: 16px;
                  padding: 16px 18px;
                  min-width: 220px;
                  box-shadow: 0 10px 30px rgba(27, 42, 71, 0.15);
                ">
                  <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                    <div style="
                      width: 34px; height: 34px; border-radius: 10px; flex-shrink:0;
                      background: ${isActive ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)'};
                      display:flex; align-items:center; justify-content:center;
                    ">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                           fill="none" stroke="${isActive ? '#16a34a' : '#dc2626'}" stroke-width="2.2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 7l-7 5 7 5V7z"></path>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                      </svg>
                    </div>
                    <strong style="font-size:14px; color:#1b2a47; line-height:1.3;">${cam.name}</strong>
                  </div>

                  <div style="
                    font-size:12px; color:#64748b; margin-bottom:10px;
                    font-variant-numeric: tabular-nums;
                  ">
                    📍 ${lat.toFixed(6)}, ${long.toFixed(6)}
                  </div>

                  <span style="
                    display:inline-flex; align-items:center; gap:5px;
                    font-size:11px; font-weight:600; letter-spacing:0.3px;
                    padding:4px 12px; border-radius:20px;
                    background:${isActive ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)'};
                    color:${isActive ? '#16a34a' : '#dc2626'};
                  ">
                    <span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>
                    ${isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              `
            }
          }
        )

        map.Overlays.add(marker)
      })
    } catch (error) {
      console.error('เกิดข้อผิดพลาดตอนปักหมุดกล้อง:', error)
    }
  }, [cameras, isMapReady])

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }} />
  )
}

export default MapView