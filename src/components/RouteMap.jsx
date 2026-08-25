import { useEffect, useRef, useState, useCallback } from 'react';

const LONGDO_API_KEY = '77b3dd6ca1af611860ee1d100bc5d530';
const CARD_WIDTH = 260;
const CARD_GAP = 12; // ระยะห่างระหว่างหมุดกับการ์ด

function RouteMap({ routePoints = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);

  // hoveredPoint = { point, style: {top, left} } | null
  const [hoveredPoint, setHoveredPoint] = useState(null);

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

      // ปิดการ์ด hover ตอน pan/zoom เหมือน Map.jsx
      try {
        map.Event.bind('location', () => setHoveredPoint(null));
        map.Event.bind('zoom', () => setHoveredPoint(null));
      } catch (error) {
        console.warn('ผูก event ปิดการ์ด hover ไม่สำเร็จ:', error);
      }
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

  // คำนวณตำแหน่งการ์ด — ลอยไปทาง "บน-ขวา" ของหมุดที่ hover พร้อม clamp กันล้นกรอบ container
  const computeCardPosition = useCallback((pinEl) => {
    const container = mapRef.current;
    if (!container || !pinEl) return null;

    const containerRect = container.getBoundingClientRect();
    const pinRect = pinEl.getBoundingClientRect();

    let left = pinRect.right - containerRect.left + CARD_GAP;
    let top = pinRect.top - containerRect.top - 8; // เยื้องขึ้นเล็กน้อยจากหัวหมุด

    // ถ้าล้นขอบขวา ให้สลับไปโผล่ทางซ้ายของหมุดแทน
    if (left + CARD_WIDTH > containerRect.width) {
      left = pinRect.left - containerRect.left - CARD_WIDTH - CARD_GAP;
    }
    // กันหลุดขอบบน
    if (top < 8) top = 8;
    // กันหลุดขอบล่าง (ประมาณความสูงการ์ด ~180px เพราะฟิลด์เยอะกว่า Dashboard)
    if (top + 180 > containerRect.height) {
      top = containerRect.height - 180 - 8;
    }
    // กันหลุดขอบซ้ายกรณี container แคบมาก
    if (left < 8) left = 8;

    return { top, left };
  }, []);

  // Event delegation: ผูกที่ container ครั้งเดียว แทนการพึ่ง popup ของ Longdo (ปิดไม่ได้ + คุมดีไซน์เองไม่ได้)
  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    function handleMouseOver(e) {
      const pinEl = e.target.closest('[data-route-point-id]');
      if (!pinEl) return;

      const pointId = pinEl.getAttribute('data-route-point-id');
      const point = routePoints.find((p) => String(p.id ?? p.detectionId) === pointId);
      if (!point) return;

      const style = computeCardPosition(pinEl);
      if (style) setHoveredPoint({ point, style });
    }

    function handleMouseOut(e) {
      const pinEl = e.target.closest('[data-route-point-id]');
      if (!pinEl) return;
      if (pinEl.contains(e.relatedTarget)) return;
      setHoveredPoint(null);
    }

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
    };
  }, [routePoints, computeCardPosition]);

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
      setHoveredPoint(null); // เปลี่ยนชุดจุด → เคลียร์การ์ดค้าง

      if (routePoints.length === 0) {
        return;
      }

      /*
       * ============================
       * Draw Line
       * ============================
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
       * ไม่ใส่ title / popup ให้ Longdo อีกต่อไป — ใช้ React overlay การ์ดของเราเองแทน
       * (title เดิมทำให้เกิด native tooltip ซ้อนกับการ์ด, popup เดิมกดปิดไม่ได้)
       */
      routePoints.forEach((point) => {
        const isFirst = point.order === 1;
        const isLast = point.order === routePoints.length;
        const pinColor = isLast ? '#dc2626' : isFirst ? '#16a34a' : '#2563eb';
        const pointId = point.id ?? point.detectionId;

        const marker = new window.longdo.Marker(
          { lon: point.long, lat: point.lat },
          {
            clickable: true,
            icon: {
              offset: { x: 16, y: 32 },
              html: `
                <div data-route-point-id="${pointId}" style="
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
        map.location({ lon: routePoints[0].long, lat: routePoints[0].lat }, true);
        map.zoom(17, true);
      } else {
        map.bound(routePoints.map((point) => ({ lon: point.long, lat: point.lat })));
      }
    } catch (error) {
      console.error('เกิดข้อผิดพลาดตอนวาดเส้นทาง:', error);
    }
  }, [routePoints, isMapReady]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapRef}
        style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
      />

      {hoveredPoint && (
        <div
          className="rt-map-hover-card"
          style={{ top: hoveredPoint.style.top, left: hoveredPoint.style.left, width: CARD_WIDTH }}
        >
          <div className="rt-map-hover-card-header">
            <span className="rt-map-hover-card-order">{hoveredPoint.point.order}</span>
            <strong className="rt-map-hover-card-title">
              {hoveredPoint.point.name || 'ไม่ทราบชื่อกล้อง'}
            </strong>
          </div>

          <div className="rt-map-hover-card-row">
            <span className="rt-map-hover-card-label">ทะเบียน</span>
            <span>{hoveredPoint.point.licensePlate || '-'} • {hoveredPoint.point.province || '-'}</span>
          </div>
          <div className="rt-map-hover-card-row">
            <span className="rt-map-hover-card-label">สีรถ</span>
            <span>{hoveredPoint.point.color || '-'}</span>
          </div>
          <div className="rt-map-hover-card-row">
            <span className="rt-map-hover-card-label">เวลา</span>
            <span>{hoveredPoint.point.time ? new Date(hoveredPoint.point.time).toLocaleString('th-TH') : '-'}</span>
          </div>

          <span
            className={`rt-map-hover-card-badge ${
              hoveredPoint.point.direction === 'entry'
                ? 'entry'
                : hoveredPoint.point.direction === 'exit'
                ? 'exit'
                : 'unknown'
            }`}
          >
            <span className="rt-map-hover-card-dot" />
            {hoveredPoint.point.direction === 'entry'
              ? 'ขาเข้า'
              : hoveredPoint.point.direction === 'exit'
              ? 'ขาออก'
              : 'ไม่ทราบทิศทาง'}
          </span>
        </div>
      )}
    </div>
  );
}

export default RouteMap;