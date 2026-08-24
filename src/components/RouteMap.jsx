import { useEffect, useRef, useState } from 'react'

const LONGDO_API_KEY = '77b3dd6ca1af611860ee1d100bc5d530'

// วาดเส้นทางการเคลื่อนที่ของรถ 1 คัน: หมุดเรียงเลขลำดับ (1, 2, 3, ...) เชื่อมกันด้วยเส้น
// routePoints ต้องเรียงจากเก่า -> ใหม่มาก่อนแล้ว: [{ lat, long, name, order, time }]
function RouteMap({ routePoints = [] }) {
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
        try {
          map.Ui.Crosshair.visible(false)
          map.Ui.Zoombar.visible(false)
          map.Ui.Toolbar.visible(false)
          map.Ui.Geolocation.visible(false)
          map.Ui.LayerSelector.visible(false)
          map.Ui.Fullscreen.visible(false)
        } catch (error) {
          console.warn('ซ่อน UI ของแผนที่ไม่สำเร็จ:', error)
        }
        setIsMapReady(true)
      })
    }

    if (!window.longdo) {
      const existingScript = document.querySelector(`script[src^="https://api.longdo.com/map/"]`)
      if (existingScript) {
        if (window.longdo) initMap()
        else existingScript.addEventListener('load', initMap)
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

      if (routePoints.length === 0) return

      // เส้นเชื่อมจุดตามลำดับเวลาที่ผ่าน (วาดก่อนหมุด ให้หมุดทับเส้นอยู่ด้านบน)
      if (routePoints.length > 1) {
        const line = new window.longdo.Polyline(
          routePoints.map((p) => ({ lon: p.long, lat: p.lat })),
          {
            lineWidth: 4,
            lineColor: 'rgba(37, 99, 235, 0.85)'
          }
        )
        map.Overlays.add(line)
      }

      // หมุดแต่ละจุด — เขียว = จุดแรก, แดง = จุดล่าสุด, น้ำเงิน = จุดระหว่างทาง พร้อมเลขลำดับในหมุด
      routePoints.forEach((point) => {
        const isFirst = point.order === 1
        const isLast = point.order === routePoints.length
        const pinColor = isLast ? '#dc2626' : isFirst ? '#16a34a' : '#2563eb'

        const marker = new window.longdo.Marker(
          { lon: point.long, lat: point.lat },
          {
            title: point.name,
            clickable: true,
            icon: {
              offset: { x: 16, y: 32 },
              html: `
                <div style="
                  width: 32px;
                  height: 32px;
                  border-radius: 50% 50% 50% 0;
                  background: ${pinColor};
                  transform: rotate(-45deg);
                  border: 2px solid #fff;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                ">
                  <span style="
                    transform: rotate(45deg);
                    color: #ffffff;
                    font-family: 'DM Sans', sans-serif;
                    font-weight: 700;
                    font-size: 13px;
                  ">${point.order}</span>
                </div>`
            },
            popup: {
              closable: true,
              html: `
                <div style="
                  font-family: 'DM Sans', sans-serif;
                  background: #ffffff;
                  border-radius: 16px;
                  padding: 14px 16px;
                  min-width: 200px;
                  box-shadow: 0 10px 30px rgba(27, 42, 71, 0.15);
                ">
                  <strong style="font-size:13px; color:#1b2a47;">จุดที่ ${point.order} — ${point.name}</strong>
                  <div style="font-size:12px; color:#64748b; margin-top:6px;">
                    ${point.time ? new Date(point.time).toLocaleString('th-TH') : '-'}
                  </div>
                </div>
              `
            }
          }
        )

        map.Overlays.add(marker)
      })

      // ปรับมุมมองให้เห็นทุกจุดในเส้นทาง
      if (routePoints.length === 1) {
        map.location({ lon: routePoints[0].long, lat: routePoints[0].lat }, true)
        map.zoom(17, true)
      } else {
        map.bound(routePoints.map((p) => ({ lon: p.long, lat: p.lat })))
      }
    } catch (error) {
      console.error('เกิดข้อผิดพลาดตอนวาดเส้นทาง:', error)
    }
  }, [routePoints, isMapReady])

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }} />
  )
}

export default RouteMap