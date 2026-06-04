import { useEffect, useRef } from 'react'
import { mockCameraLocations } from '../data/mockData'

// API Key ของ Longdo Map
const LONGDO_API_KEY = '77b3dd6ca1af611860ee1d100bc5d530'

function MapView() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    // โหลด Longdo Map script ถ้ายังไม่มี
    if (!window.longdo) {
      const script = document.createElement('script')
      script.src = `https://api.longdo.com/map/?key=${LONGDO_API_KEY}`
      script.async = true
      script.onload = () => initMap()
      document.head.appendChild(script)
    } else {
      initMap()
    }

    return () => {
      // cleanup ตอน component ถูกลบ
      mapInstanceRef.current = null
    }
  }, [])

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return

    // สร้างแผนที่
    const map = new window.longdo.Map({
      placeholder: mapRef.current,
      language: 'th'
    })

    // กำหนดตำแหน่งกลางแผนที่
    map.location({ lon: 100.632904, lat: 13.844849 }, true)
    map.zoom(17, true)

    // ปักหมุดกล้องทุกตัวจาก mockData
    mockCameraLocations.forEach((cam) => {
      const marker = new window.longdo.Marker(
        { lon: cam.lon, lat: cam.lat },
        {
          title: cam.name,
          detail: 'Status: Online',
          icon: {
            url: 'https://api.longdo.com/map/images/pin-red.png',
            offset: { x: 12, y: 45 }
          }
        }
      )
      map.Overlays.add(marker)
    })

    mapInstanceRef.current = map
  }

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: '300px',
        borderRadius: '16px',
        overflow: 'hidden'
      }}
    />
  )
}

export default MapView