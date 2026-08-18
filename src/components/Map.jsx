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

      // สำคัญ: ต้องรอ event 'ready' ก่อนถึงจะเรียกใช้ Overlays ได้จริง
      // (ตาม official pattern ของ Longdo doc)
      map.Event.bind('ready', () => {
        if (isCancelled) return
        map.location({ lon: 100.632904, lat: 13.844849 }, true)
        map.zoom(17, true)
        setIsMapReady(true)
      })
    }

    if (!window.longdo) {
      const existingScript = document.querySelector(`script[src^="https://api.longdo.com/map/"]`)
      if (existingScript) {
        // เผื่อ script โหลดเสร็จไปแล้วก่อนหน้า (StrictMode / re-mount)
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
    console.log('cameras ที่ได้รับ:', cameras)

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
        offset: { x: 16, y: 32 }, // ปักตำแหน่งกึ่งกลางล่าง เหมือนหมุดจริง ปลายแหลมชี้ตำแหน่ง
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
        html: `<div style="padding:8px 12px; font-family:'DM Sans',sans-serif;">
                 <strong style="font-size:13px;">${cam.name}</strong><br/>
                 <span style="font-size:11px; color:#64748b;">
                   ${lat.toFixed(6)}, ${long.toFixed(6)}
                 </span>
               </div>`
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