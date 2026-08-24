import { useEffect, useRef, useState } from 'react';

const LONGDO_API_KEY = '77b3dd6ca1af611860ee1d100bc5d530';

function RouteMap({ routePoints = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);

  /*
   * ============================
   * Initialize Longdo Map
   * ============================
   */
  useEffect(() => {
    let isCancelled = false;

    function initMap() {
      if (isCancelled || !mapRef.current || mapInstanceRef.current) {
        return;
      }

      if (!window.longdo || typeof window.longdo.Map !== 'function') {
        return;
      }

      const map = new window.longdo.Map({
        placeholder: mapRef.current,
        language: 'th'
      });

      mapInstanceRef.current = map;

      map.Event.bind('ready', () => {
        if (isCancelled) return;

        try {
          map.Ui.Crosshair.visible(false);
          map.Ui.Zoombar.visible(false);
          map.Ui.Toolbar.visible(false);
          map.Ui.Geolocation.visible(false);
          map.Ui.LayerSelector.visible(false);
          map.Ui.Fullscreen.visible(false);
        } catch (error) {
          console.warn('ซ่อน UI ของแผนที่ไม่สำเร็จ:', error);
        }

        setIsMapReady(true);
      });
    }

    if (!window.longdo) {
      const existingScript = document.querySelector(
        'script[src^="https://api.longdo.com/map/"]'
      );

      if (existingScript) {
        if (window.longdo) {
          initMap();
        } else {
          existingScript.addEventListener('load', initMap);
        }
      } else {
        const script = document.createElement('script');
        script.src = `https://api.longdo.com/map/?key=${LONGDO_API_KEY}`;
        script.async = true;
        script.onload = initMap;
        document.head.appendChild(script);
      }
    } else {
      initMap();
    }

    return () => {
      isCancelled = true;
      mapInstanceRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  /*
   * ============================
   * Draw Route
   * ============================
   */
  useEffect(() => {
    const map = mapInstanceRef.current;

    if (!map || !isMapReady) {
      return;
    }

    try {
      map.Overlays.clear();

      if (routePoints.length === 0) {
        return;
      }

      /*
       * ============================
       * Draw Line
       * ============================
       *
       * เชื่อมทุก Detection
       * ไม่ dedupe
       */
      if (routePoints.length > 1) {
        const line = new window.longdo.Polyline(
          routePoints.map((point) => ({
            lon: point.long,
            lat: point.lat
          })),
          {
            lineWidth: 4,
            lineColor: 'rgba(37, 99, 235, 0.85)'
          }
        );

        map.Overlays.add(line);
      }

      /*
       * ============================
       * Draw Marker
       * ============================
       *
       * 1 Detection = 1 Marker
       * ดังนั้นกล้องเดิมจับซ้ำ ก็จะแสดง Marker ซ้ำ
       */
      routePoints.forEach((point) => {
        const isFirst = point.order === 1;
        const isLast = point.order === routePoints.length;
        const pinColor = isLast ? '#dc2626' : isFirst ? '#16a34a' : '#2563eb';

        const formattedTime = point.time
          ? new Date(point.time).toLocaleString('th-TH')
          : '-';

        const marker = new window.longdo.Marker(
          {
            lon: point.long,
            lat: point.lat
          },
          {
            title: point.name || 'ไม่ทราบชื่อกล้อง',
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
                  ">
                    ${point.order}
                  </span>
                </div>
              `
            },

            /*
             * ============================
             * Popup Detail
             * ============================
             */
            popup: {
              closable: true,
              html: `
                <div style="
                  font-family: 'DM Sans', sans-serif;
                  background: #ffffff;
                  border-radius: 16px;
                  padding: 16px;
                  min-width: 260px;
                  max-width: 320px;
                  box-shadow: 0 10px 30px rgba(27, 42, 71, 0.15);
                ">
                  <div style="
                    font-size: 14px;
                    font-weight: 700;
                    color: #1b2a47;
                    margin-bottom: 12px;
                  ">
                    จุดที่ ${point.order}
                  </div>
                  <div style="
                    font-size: 13px;
                    font-weight: 600;
                    color: #1b2a47;
                    margin-bottom: 10px;
                  ">
                    ${point.name || '-'}
                  </div>
                  <div style="
                    font-size: 12px;
                    color: #64748b;
                    line-height: 1.8;
                  ">
                    <div>
                      <strong style="color:#1b2a47;">ทะเบียน:</strong>
                      ${point.licensePlate || '-'}
                    </div>
                    <div>
                      <strong style="color:#1b2a47;">จังหวัด:</strong>
                      ${point.province || '-'}
                    </div>
                    <div>
                      <strong style="color:#1b2a47;">สีรถ:</strong>
                      ${point.color || '-'}
                    </div>
                    <div>
                      <strong style="color:#1b2a47;">ทิศทาง:</strong>
                      ${point.direction || '-'}
                    </div>
                    <div>
                      <strong style="color:#1b2a47;">เวลา:</strong>
                      ${formattedTime}
                    </div>
                    <div style="
                      margin-top: 6px;
                      font-size: 10px;
                      word-break: break-all;
                    ">
                      <strong style="color:#1b2a47;">Detection ID:</strong>
                      ${point.detectionId || point.id || '-'}
                    </div>
                  </div>
                </div>
              `
            }
          }
        );

        map.Overlays.add(marker);
      });

      /*
       * ============================
       * Fit Map
       * ============================
       */
      if (routePoints.length === 1) {
        map.location(
          {
            lon: routePoints[0].long,
            lat: routePoints[0].lat
          },
          true
        );

        map.zoom(17, true);
      } else {
        map.bound(
          routePoints.map((point) => ({
            lon: point.long,
            lat: point.lat
          }))
        );
      }
    } catch (error) {
      console.error('เกิดข้อผิดพลาดตอนวาดเส้นทาง:', error);
    }
  }, [routePoints, isMapReady]);

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '16px',
        overflow: 'hidden'
      }}
    />
  );
}

export default RouteMap;