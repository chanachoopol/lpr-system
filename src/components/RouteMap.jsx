import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import Spinner from './Spinner';

const LONGDO_API_KEY = import.meta.env.VITE_LONGDO_API_KEY || '77b3dd6ca1af611860ee1d100bc5d530';
const CARD_WIDTH = 260;
const CARD_GAP = 12;
const FOCUS_ANIMATION_DELAY_MS = 350; // เผื่อเวลา map.location/zoom animate เสร็จก่อนคำนวณตำแหน่งการ์ด

// พิกัดถือว่า "ซ้ำกัน" (กล้องเดียวกันจับซ้ำ) ถ้าต่างกันน้อยกว่านี้ — กันปัญหา floating point เทียบเป๊ะไม่เจอ
const SAME_LOCATION_EPSILON = 0.00001;

function isSameLocation(a, b) {
  return (
    Math.abs(a.long - b.long) < SAME_LOCATION_EPSILON &&
    Math.abs(a.lat - b.lat) < SAME_LOCATION_EPSILON
  );
}

function isValidLatLong(lat, long) {
  return (
    typeof lat === 'number' && typeof long === 'number' &&
    Number.isFinite(lat) && Number.isFinite(long)
  );
}

// ยิง Longdo Route Service (GeoJSON) หาเส้นทางจริงระหว่าง 2 จุด
// คืน array ของ {lon, lat} เรียงตามเส้นทาง หรือ null ถ้าหาไม่เจอ/error
async function fetchRoadPath(fromPoint, toPoint) {
  const url = `https://api.longdo.com/RouteService/geojson/route?flon=${fromPoint.long}&flat=${fromPoint.lat}&tlon=${toPoint.long}&tlat=${toPoint.lat}&locale=th&key=${LONGDO_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.message || !data.features || data.features.length === 0) {
    return null;
  }

  const coords = [];
  data.features.forEach((feature) => {
    const geomType = feature.geometry?.type;
    if (geomType === 'LineString') {
      feature.geometry.coordinates.forEach((c) => coords.push({ lon: c[0], lat: c[1] }));
    } else if (geomType === 'MultiLineString') {
      feature.geometry.coordinates.forEach((line) => {
        line.forEach((c) => coords.push({ lon: c[0], lat: c[1] }));
      });
    }
  });

  // กรองพิกัดที่ไม่ถูกต้องออกก่อนคืนค่า — กัน response จาก Longdo เพี้ยนบางจุด (null/NaN)
  const validCoords = coords.filter((c) => isValidLatLong(c.lat, c.lon));

  return validCoords.length >= 2 ? validCoords : null;
}

// จัดมุมมองแผนที่ให้ครอบคลุมทุกจุด — อัตราส่วนการซูมมุมกว้าง สะอาด สบายตา แบบเดียวกับหน้า Dashboard
function fitMapToPoints(map, points) {
  if (!map || !points || points.length === 0) return;

  const validPoints = points
    .map((p) => ({ lat: Number(p.lat), lon: Number(p.long) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (validPoints.length === 0) return;

  if (validPoints.length === 1) {
    map.location({ lon: validPoints[0].lon, lat: validPoints[0].lat }, true);
    map.zoom(15, true);
    return;
  }

  const lons = validPoints.map((p) => p.lon);
  const lats = validPoints.map((p) => p.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // คำนวณจุดกึ่งกลาง + ระดับการซูมที่ครอบคลุมทุกจุดพร้อมระยะเผื่อขอบ (แบบเดียวกับหน้า Dashboard)
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const maxSpan = Math.max(maxLon - minLon, maxLat - minLat);

  let zoom = 15;
  if (maxSpan > 1.0) zoom = 7;
  else if (maxSpan > 0.5) zoom = 9;
  else if (maxSpan > 0.2) zoom = 10;
  else if (maxSpan > 0.1) zoom = 11;
  else if (maxSpan > 0.05) zoom = 12;
  else if (maxSpan > 0.02) zoom = 13;
  else if (maxSpan > 0.01) zoom = 14;
  else if (maxSpan > 0.004) zoom = 15;
  else if (maxSpan > 0.001) zoom = 15;
  else zoom = 15;

  map.location({ lon: centerLon, lat: centerLat }, true);
  map.zoom(zoom, true);
}

const RouteMap = forwardRef(function RouteMap({ routePoints = [] }, ref) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // hoveredPoint = { point, style: {top, left}, pinned? } | null
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
        language: 'th',
        ...(window.longdo.Ui?.HIDDEN ? { ui: window.longdo.Ui.HIDDEN } : {})
      });

      mapInstanceRef.current = map;

      map.Event.bind('ready', () => {
        if (isCancelled) return;

        try {
          if (map.Ui) {
            map.Ui.Crosshair?.visible(false);
            map.Ui.Zoombar?.visible(false);
            map.Ui.DPad?.visible(false);
            map.Ui.Scale?.visible(false);
            map.Ui.Toolbar?.visible(false);
            map.Ui.Geolocation?.visible(false);
            map.Ui.LayerSelector?.visible(false);
            map.Ui.Fullscreen?.visible(false);
          }
        } catch (error) {
          console.warn('ซ่อน UI ของแผนที่ไม่สำเร็จ:', error);
        }

        setIsMapReady(true);
      });

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

  const computeCardPosition = useCallback((pinEl) => {
    const container = mapRef.current;
    if (!container || !pinEl) return null;

    const containerRect = container.getBoundingClientRect();
    const pinRect = pinEl.getBoundingClientRect();

    let left = pinRect.right - containerRect.left + CARD_GAP;
    let top = pinRect.top - containerRect.top - 8;

    if (left + CARD_WIDTH > containerRect.width) {
      left = pinRect.left - containerRect.left - CARD_WIDTH - CARD_GAP;
    }
    if (top < 8) top = 8;
    if (top + 180 > containerRect.height) {
      top = containerRect.height - 180 - 8;
    }
    if (left < 8) left = 8;

    return { top, left };
  }, []);

  // เปิดเมธอด focusPoint ให้ RouteTracking.jsx สั่งจาก timeline ได้
  useImperativeHandle(ref, () => ({
    focusPoint(pointId, shouldPan = true) {
      const map = mapInstanceRef.current;
      if (!map) return;

      const point = routePoints.find(
        (p) => String(p.id ?? p.detectionId) === String(pointId)
      );
      // กันพิกัดไม่ถูกต้อง (NaN/undefined) หลุดเข้า map.location() แล้วโดน "Invalid location"
      if (!point || !isValidLatLong(point.lat, point.long)) return;

      if (shouldPan) {
        map.location({ lon: point.long, lat: point.lat }, true);
      }

      // อัปเดตตัวเลขบนหมุดที่ตำแหน่งนั้นให้เป็นเลข order ปัจจุบัน พร้อมเปิดการ์ดข้อมูล
      const delay = shouldPan ? FOCUS_ANIMATION_DELAY_MS : 50;
      setTimeout(() => {
        const container = mapRef.current;
        if (!container) return;

        const locKey = `${point.lat.toFixed(5)},${point.long.toFixed(5)}`;
        const allPins = container.querySelectorAll('.rt-map-marker-pin');
        allPins.forEach((p) => p.classList.remove('rt-pin-active'));

        const locPins = container.querySelectorAll(`[data-route-location="${locKey}"]`);
        locPins.forEach((pin) => {
          pin.classList.add('rt-pin-active');
          const span = pin.querySelector('span');
          if (span) span.textContent = point.order;
        });

        const targetPin = container.querySelector(`[data-route-point-id="${pointId}"]`) || locPins[0];
        if (!targetPin) return;

        const style = computeCardPosition(targetPin);
        if (style) setHoveredPoint({ point, style, pinned: true });
      }, delay);
    }
  }));

  // Event delegation: hover ปกติ — จะมาแทนที่การ์ด pinned ถ้ามีอยู่ก่อน
  useEffect(() => {
    const container = mapRef.current;
    if (!container) return;

    function handleMouseOver(e) {
      const pinEl = e.target.closest('.rt-map-marker-pin');
      if (!pinEl) return;

      const pointId = pinEl.getAttribute('data-route-point-id');
      const point = routePoints.find((p) => String(p.id ?? p.detectionId) === pointId);
      if (!point) return;

      const style = computeCardPosition(pinEl);
      if (style) setHoveredPoint({ point, style });
    }

    function handleMouseOut(e) {
      const pinEl = e.target.closest('.rt-map-marker-pin');
      if (!pinEl) return;
      if (pinEl.contains(e.relatedTarget)) return;
      // การ์ดที่ pinned ไว้จาก focusPoint ไม่ถูกปิดจาก mouseout ธรรมดา (ผู้ใช้ไม่ได้ hover มันอยู่)
      setHoveredPoint((prev) => (prev?.pinned ? prev : null));
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
   * Draw Markers ทันที (ไม่รอ routing เสร็จ) + วาดเส้นทางจริงแบบ sequential
   * ============================
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isMapReady) return;

    let isCancelled = false;

    async function drawEverything() {
      try {
        map.Overlays.clear();
        setHoveredPoint(null);

        if (routePoints.length === 0) return;

        // ---------- วาด Marker ก่อนเลย ให้ผู้ใช้เห็นหมุดทันที ไม่ต้องรอ routing ----------
        // เก็บว่าจุดไหนวาดสำเร็จบ้าง (พิกัดถูกต้อง + สร้าง Marker ไม่ error) ไว้ใช้คำนวณ bound ต่อ
        const drawnPoints = [];

        routePoints.forEach((point) => {
          if (!isValidLatLong(point.lat, point.long)) {
            console.warn(`ข้ามจุดที่ ${point.order} (id: ${point.id ?? point.detectionId}) เพราะพิกัดไม่ถูกต้อง:`, point.lat, point.long);
            return;
          }

          const pinColor = '#16a34a';
          const pointId = point.id ?? point.detectionId;
          const locKey = `${point.lat.toFixed(5)},${point.long.toFixed(5)}`;

          try {
            const marker = new window.longdo.Marker(
              { lon: point.long, lat: point.lat },
              {
                clickable: true,
                icon: {
                  offset: { x: 16, y: 32 },
                  html: `
                    <div class="rt-map-marker-pin" data-route-point-id="${pointId}" data-route-order="${point.order}" data-route-location="${locKey}" style="
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
            drawnPoints.push(point);
          } catch (error) {
            // จุดนี้พิกัดผ่าน isValidLatLong แล้วแต่ Longdo ยังปฏิเสธ (เช่น lat/long เกินขอบเขตโลกจริง)
            console.warn(`สร้าง Marker จุดที่ ${point.order} ไม่สำเร็จ (พิกัด: ${point.lat}, ${point.long}):`, error);
          }
        });

        // ไม่มีจุดไหนวาดได้เลย — ไม่ต้องพยายาม bound/route ต่อ
        if (drawnPoints.length === 0) return;

        // จัดมุมมองแผนที่ให้ครอบคลุมทุกจุดที่วาดได้จริง — ดูฟังก์ชัน fitMapToPoints() ด้านบน
        fitMapToPoints(map, drawnPoints);

        // เหลือแค่จุดเดียวที่วาดได้จริง (ไม่ว่าเพราะข้อมูลมีจุดเดียวจริง หรือจุดอื่นพิกัดเสียหมด)
        // ไม่มีคู่ไหนให้คำนวณเส้นทางต่อ
        if (drawnPoints.length === 1) return;

        // ---------- คำนวณเส้นทางจริงทีละคู่ (sequential) ----------
        setIsLoadingRoute(true);

        for (let i = 0; i < routePoints.length - 1; i++) {
          if (isCancelled) return;

          const from = routePoints[i];
          const to = routePoints[i + 1];

          // ข้ามคู่ที่มีพิกัดไม่ถูกต้องไปเลย ไม่ยิง request ไม่วาดเส้น
          if (!isValidLatLong(from.lat, from.long) || !isValidLatLong(to.lat, to.long)) {
            console.warn(`ข้ามช่วงจุดที่ ${from.order}-${to.order} เพราะพิกัดไม่ถูกต้อง`);
            continue;
          }

          if (isSameLocation(from, to)) continue;

          let segmentCoords = null;
          try {
            segmentCoords = await fetchRoadPath(from, to);
          } catch (error) {
            console.warn(`หาเส้นทางจริงช่วงจุดที่ ${from.order}-${to.order} ไม่สำเร็จ:`, error);
          }

          if (isCancelled) return;

          try {
            if (segmentCoords) {
              const polyline = new window.longdo.Polyline(segmentCoords, {
                lineWidth: 4,
                lineColor: 'rgba(37, 99, 235, 0.85)'
              });
              map.Overlays.add(polyline);
            } else {
              const fallbackLine = new window.longdo.Polyline(
                [{ lon: from.long, lat: from.lat }, { lon: to.long, lat: to.lat }],
                {
                  lineWidth: 3,
                  lineColor: 'rgba(148, 163, 184, 0.9)',
                  lineStyle: window.longdo.LineStyle?.Dashed ?? undefined
                }
              );
              map.Overlays.add(fallbackLine);
            }
          } catch (error) {
            // ไม่ปล่อยให้เส้นช่วงเดียวพัง ทำให้ทั้ง loop หยุดกลางคัน — log ไว้แล้วไปวาดช่วงถัดไปต่อ
            console.warn(`วาดเส้นช่วงจุดที่ ${from.order}-${to.order} ไม่สำเร็จ:`, error);
          }
        }
      } catch (error) {
        console.error('เกิดข้อผิดพลาดตอนวาดเส้นทาง:', error);
      } finally {
        if (!isCancelled) setIsLoadingRoute(false);
      }
    }

    drawEverything();

    return () => {
      isCancelled = true;
    };
  }, [routePoints, isMapReady]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapRef}
        style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}
      />

      {isLoadingRoute && (
        <div className="rt-map-loading-overlay">
          <Spinner text="กำลังคำนวณเส้นทางจริง..." />
        </div>
      )}

      {hoveredPoint && (
        <div
          className={`rt-map-hover-card ${hoveredPoint.pinned ? 'pinned' : ''}`}
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
});

export default RouteMap;