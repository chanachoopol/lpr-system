import { useState, useEffect, useCallback, useMemo,useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaSearch, FaCalendarAlt, FaArrowLeft } from 'react-icons/fa';
import { FaCar, FaRoute, FaMapLocationDot } from 'react-icons/fa6';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Swal from 'sweetalert2';

import Layout from '../components/Layout';
import RouteMap from '../components/RouteMap';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

import { getRouteTrackingAPI, getAuthedImageURL } from '../data/api';
import useVillageStore from '../store/villageStore';

import '../styles/RouteTracking.css';

const MAX_ROUTE_POINTS = 50;

function formatAPIDate(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateKeyOf(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString('th-TH');
}

function formatTime(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDateTime(isoString) {
  if (!isoString) return '-';
  return `${formatDate(isoString)} ${formatTime(isoString)}`;
}

function getDirectionLabel(direction) {
  if (direction === 'entry') return 'เข้า';
  if (direction === 'exit') return 'ออก';
  return '-';
}

function RouteTracking() {
  const { selectedVillageId } = useVillageStore();
  const [searchParams] = useSearchParams();

  const today = useMemo(() => new Date(), []);

  const defaultDateFrom = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 14);
    return date;
  }, [today]);

  const [queryInput, setQueryInput] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);

  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const routeMapRef = useRef(null);

  const runSearch = useCallback(
    async (queryValue, rangeFrom, rangeTo) => {
      const query = (queryValue ?? queryInput).trim();

      if (!query) {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณากรอกป้ายทะเบียน',
          text: 'ต้องระบุป้ายทะเบียนก่อนค้นหา',
          confirmButtonColor: 'var(--sidebar-bg)'
        });
        return [];
      }

      const from = rangeFrom !== undefined ? rangeFrom : dateFrom;
      const to = rangeTo !== undefined ? rangeTo : dateTo;

      let finalFrom = from;
      let finalTo = to;

      if (!finalFrom || !finalTo) {
        finalTo = new Date();
        finalFrom = new Date(finalTo);
        finalFrom.setDate(finalFrom.getDate() - 30);
      }

      const startOfDay = new Date(finalFrom);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(finalTo);
      endOfDay.setHours(23, 59, 59, 999);

      setIsSearching(true);
      setHasSearched(true);
      setSelectedVehicle(null);

      try {
        const data = await getRouteTrackingAPI({
          licensePlate: query,
          villageId: selectedVillageId || undefined,
          dateFrom: formatAPIDate(startOfDay),
          dateTo: formatAPIDate(endOfDay),
          page: 1,
          pageSize: 20
        });

        /*
         * API Response:
         * items -> cars -> detections
         * ทุก detection ถูกเก็บไว้ ไม่ตัด detection ซ้ำ
         */
        const matched = [];

        ;(data?.items || []).forEach((dateGroup) => {
          ;(dateGroup?.cars || []).forEach((car) => {
            ;(car?.detections || []).forEach((detection) => {
              matched.push({
                ...detection,
                license_plate: car.license_plate || '',
                province: car.province || '',
                color: detection.color || '',
                route_date: dateGroup.date || dateKeyOf(detection.time_detect)
              });
            });
          });
        });

        /*
         * Group รถ + จังหวัด + วันที่
         */
        const groupMap = new Map();

        matched.forEach((item) => {
          const day = item.route_date || dateKeyOf(item.time_detect);
          const key = `${item.license_plate}|${item.province}|${day}`;

          if (!groupMap.has(key)) {
            groupMap.set(key, {
              plate: item.license_plate,
              province: item.province,
              date: day,
              items: []
            });
          }

          /*
           * สำคัญ: push ทุก detection ไม่มี dedupe
           */
          groupMap.get(key).items.push(item);
        });

        /*
         * เรียง Detection จากเก่า -> ใหม่
         */
        const groups = Array.from(groupMap.values())
          .map((group) => ({
            ...group,
            items: group.items.sort(
              (a, b) => new Date(a.time_detect) - new Date(b.time_detect)
            )
          }))
          .sort((a, b) => {
            const lastA = a.items[a.items.length - 1]?.time_detect;
            const lastB = b.items[b.items.length - 1]?.time_detect;
            return new Date(lastB) - new Date(lastA);
          });

        setVehicleGroups(groups);
        return groups;
      } catch (error) {
        console.error('Route Tracking API Error:', error);

        Swal.fire({
          icon: 'error',
          title: 'ค้นหาไม่สำเร็จ',
          text:
            error?.response?.data?.detail ||
            'ไม่สามารถดึงข้อมูลเส้นทางได้ กรุณาลองใหม่',
          confirmButtonColor: 'var(--sidebar-bg)'
        });

        setVehicleGroups([]);
        return [];
      } finally {
        setIsSearching(false);
      }
    },
    [queryInput, dateFrom, dateTo, selectedVillageId]
  );

  // ใหม่
useEffect(() => {
    const queryFromURL = searchParams.get('plate');
    const provinceFromURL = searchParams.get('province');
    const dateFromURL = searchParams.get('date'); // รูปแบบ YYYY-MM-DD

    if (!queryFromURL) return;

    setQueryInput(queryFromURL);

    // มาจากปุ่ม "ดูเส้นทาง" ใน History พร้อม date — ปรับช่วงวันที่ให้ครอบคลุมวันนั้นแน่ๆ
    // แทนที่จะพึ่ง default 14 วัน ซึ่งอาจไม่ครอบคลุมถ้า detection เก่ากว่านั้น
    let searchFrom = defaultDateFrom;
    let searchTo = today;

    if (dateFromURL) {
      const targetDate = new Date(`${dateFromURL}T00:00:00`);
      searchFrom = new Date(targetDate);
      searchFrom.setDate(searchFrom.getDate() - 3);
      searchTo = new Date(targetDate);
      searchTo.setDate(searchTo.getDate() + 3);
      if (searchTo > today) searchTo = today;

      setDateFrom(searchFrom);
      setDateTo(searchTo);
    }

    runSearch(queryFromURL, searchFrom, searchTo).then((groups) => {
      if (!provinceFromURL || !dateFromURL) return; // ข้อมูลไม่พอจะ auto-select แค่โชว์ list ปกติ

      // ⚠️ ASSUMPTION: group.date มาจาก dateKeyOf()/dateGroup.date ของ backend ซึ่งควรเป็น
      // รูปแบบ YYYY-MM-DD เดียวกับที่ History.jsx ส่งมา (toDateParam) — ถ้า backend ส่งคนละ format
      // ต้องปรับจุดนี้ให้ normalize ก่อนเทียบ
      const matchedGroup = groups.find(
        (g) => g.province === provinceFromURL && g.date === dateFromURL
      );

      if (matchedGroup) {
        handleSelectVehicle(matchedGroup);
      } else {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบข้อมูลที่ตรงกัน',
          text: 'กรุณาเลือกจากรายการด้านล่าง',
          confirmButtonColor: 'var(--sidebar-bg)'
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedGroup = useMemo(
    () =>
      vehicleGroups.find(
        (group) =>
          group.plate === selectedVehicle?.plate &&
          group.province === selectedVehicle?.province &&
          group.date === selectedVehicle?.date
      ),
    [vehicleGroups, selectedVehicle]
  );

  /*
   * Detection ทั้งหมด ไม่ dedupe
   */
  const allItems = selectedGroup?.items || [];

  /*
   * ใช้ Detection ทุกตัวสำหรับ Map จำกัดเฉพาะ 50 จุดล่าสุด
   */
  const mapItems = allItems.slice(-MAX_ROUTE_POINTS);
  const isTruncated = allItems.length > MAX_ROUTE_POINTS;

  /*
   * แปลง Detection -> RouteMap Point
   */
  const routePoints = useMemo(
    () =>
      mapItems
        .map((item, index) => {
          const lat = Number(item.lat);
          const long = Number(item.long);

          if (!Number.isFinite(lat) || !Number.isFinite(long)) {
            return null;
          }

          return {
            id: item.detection_id,
            detectionId: item.detection_id,
            lat,
            long,
            name: item.camera_name || 'ไม่ทราบชื่อกล้อง',
            order: index + 1,
            time: item.time_detect,
            licensePlate: item.license_plate || '',
            province: item.province || '',
            color: item.color || '',
            direction: item.direction || ''
          };
        })
        .filter(Boolean),
    [mapItems]
  );

  /*
   * แสดงกล้องทุก Detection
   */
  const gateSummary = allItems
    .map((item) => item.camera_name || 'ไม่ทราบชื่อกล้อง')
    .join('  -->  ');

  const [routeImages, setRouteImages] = useState({});
  const [isLoadingRouteImages, setIsLoadingRouteImages] = useState(false);
  const [hoveredImageId, setHoveredImageId] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);

  const mapItemsKey = mapItems.map((item) => item.detection_id).join('|');

  /*
   * โหลดรูปภาพของทุก Detection
   */
  useEffect(() => {
    if (mapItems.length === 0) {
      setRouteImages({});
      return;
    }

    let isCancelled = false;
    const createdUrls = [];
    setIsLoadingRouteImages(true);

    Promise.allSettled(
      mapItems.map(async (item) => {
        const src = item.image_full || item.image_crop;
        if (!src) return [item.detection_id, null];

        const url = await getAuthedImageURL(src);
        createdUrls.push(url);
        return [item.detection_id, url];
      })
    )
      .then((results) => {
        if (isCancelled) return;

        const imageMap = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            const [id, url] = result.value;
            imageMap[id] = url;
          }
        });
        setRouteImages(imageMap);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingRouteImages(false);
        }
      });

    return () => {
      isCancelled = true;
      createdUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapItemsKey]);

  function handleThumbHover(e, itemId) {
    if (!routeImages[itemId]) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const PREVIEW_W = 300;
    const PREVIEW_H = 380;
    const GAP = 14;

    let left = rect.right + GAP;

    if (left + PREVIEW_W > window.innerWidth - 12) {
      left = rect.left - PREVIEW_W - GAP;
    }
    if (left < 12) left = 12;

    let top = rect.top + rect.height / 2 - PREVIEW_H / 2;

    if (top + PREVIEW_H > window.innerHeight - 12) {
      top = window.innerHeight - PREVIEW_H - 12;
    }
    if (top < 12) top = 12;

    setHoveredImageId(itemId);
    setHoverPos({ top, left });
  }

  function handleSelectVehicle(group) {
    setSelectedVehicle({
      plate: group.plate,
      province: group.province,
      date: group.date
    });
  }

  function handleBackToList() {
    setSelectedVehicle(null);
  }

  return (
    <Layout title="Route Tracking">
      <div className="rt-wrapper">

        {/* Search */}
        <div className="content-card rt-search-card">
          <h3 className="card-title" style={{ margin: 0 }}>
            ค้นหาเส้นทางการเคลื่อนที่
          </h3>
          <p className="rt-description">
            พิมพ์ป้ายทะเบียนเพื่อค้นหาเส้นทางการเคลื่อนที่ของรถ
          </p>

          <div className="rt-search-row">
            <div className="rt-search-field rt-search-field-plate">
              <label>ป้ายทะเบียน</label>
              <div className="rt-input-wrap">
                <FaSearch className="rt-input-icon" />
                <input
                  type="text"
                  placeholder="เช่น กข1234"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runSearch();
                  }}
                />
              </div>
            </div>

            <div className="rt-search-field">
              <label>จากวันที่</label>
              <div className="rt-input-wrap">
                <FaCalendarAlt className="rt-input-icon" />
                <DatePicker
                  selected={dateFrom}
                  onChange={(date) => setDateFrom(date)}
                  dateFormat="dd/MM/yyyy"
                  maxDate={dateTo || today}
                  placeholderText="เลือกวันที่"
                  isClearable={false}
                  className="datepicker-rt"
                />
              </div>
            </div>

            <div className="rt-search-field">
              <label>ถึงวันที่</label>
              <div className="rt-input-wrap">
                <FaCalendarAlt className="rt-input-icon" />
                <DatePicker
                  selected={dateTo}
                  onChange={(date) => setDateTo(date)}
                  dateFormat="dd/MM/yyyy"
                  minDate={dateFrom}
                  maxDate={today}
                  placeholderText="เลือกวันที่"
                  isClearable={false}
                  className="datepicker-rt"
                />
              </div>
            </div>

            <div className="rt-search-buttons">
              <button
                className="btn-rt-search"
                onClick={() => runSearch()}
                disabled={isSearching}
              >
                <FaSearch />
                {isSearching ? 'กำลังค้นหา...' : 'ค้นหา'}
              </button>
            </div>
          </div>
        </div>

        {/* Loading / Results / Empty States */}
        {isSearching ? (
          <div className="content-card">
            <Spinner text="กำลังค้นหาเส้นทาง..." />
          </div>
        ) : !hasSearched ? (
          <div className="content-card">
            <EmptyState
              icon={<FaSearch />}
              title="ยังไม่มีข้อมูล"
              description="พิมพ์ป้ายทะเบียนด้านบน แล้วกดค้นหา เพื่อดูเส้นทางการเคลื่อนที่"
            />
          </div>
        ) : !selectedVehicle ? (
          /* Search Result */
          <div className="content-card">
            <div className="rt-table-header">
              <h3 className="card-title" style={{ margin: 0 }}>
                ผลการค้นหา
              </h3>
              <p className="rt-description" style={{ margin: 0 }}>
                พบ <strong>{vehicleGroups.length}</strong> รายการ — คลิกแถวเพื่อดูเส้นทาง
              </p>
            </div>

            {vehicleGroups.length === 0 ? (
              <EmptyState
                icon={<FaCar />}
                title="ไม่พบข้อมูล"
                description="ไม่พบป้ายทะเบียนนี้ในช่วงเวลาที่เลือก"
              />
            ) : (
              <div className="table-responsive">
                <table className="rt-table">
                  <thead>
                    <tr>
                      <th>ทะเบียน</th>
                      <th>จังหวัด</th>
                      <th>วันที่</th>
                      <th>สี</th>
                      <th>จำนวนครั้งที่พบ</th>
                      <th>พบล่าสุด</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleGroups.map((group) => {
                      const latestItem = group.items[group.items.length - 1];
                      return (
                        <tr
                          key={`${group.plate}|${group.province}|${group.date}`}
                          className="rt-row-clickable"
                          onClick={() => handleSelectVehicle(group)}
                        >
                          <td className="plate-text">{group.plate}</td>
                          <td>{group.province || '-'}</td>
                          <td>{formatDate(group.items[0]?.time_detect)}</td>
                          <td>{latestItem?.color || '-'}</td>
                          <td>{group.items.length} ครั้ง</td>
                          <td>{formatDateTime(latestItem?.time_detect)}</td>
                          <td>
                            <button
                              className="btn-view-route"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectVehicle(group);
                              }}
                            >
                              <FaMapLocationDot />
                              ดูเส้นทาง
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Route Detail */
          <>
            <button className="rt-back-btn" onClick={handleBackToList}>
              <FaArrowLeft />
              กลับไปยังรายการที่พบ
            </button>

            <div className="rt-result-row">
              {/* Map */}
              <div className="content-card rt-map-card">
                <h3 className="card-title" style={{ margin: 0 }}>
                  เส้นทางการเดินรถ
                </h3>
                <p className="rt-description">
                  หมุดเรียงลำดับตามเวลาที่ผ่านแต่ละกล้องตรวจจับ
                </p>

                <div className="rt-map-wrap">
                  {routePoints.length > 0 ? (
                  <RouteMap ref={routeMapRef} routePoints={routePoints} />
                ) : (
                    <EmptyState
                      icon={<FaRoute />}
                      title="ไม่มีข้อมูลตำแหน่งกล้อง"
                      description="ข้อมูลการตรวจจับยังไม่มีพิกัดตำแหน่ง"
                    />
                  )}
                </div>

                {isTruncated && (
                  <p className="rt-truncate-note">
                    แสดงเฉพาะ {MAX_ROUTE_POINTS} จุดล่าสุด จากทั้งหมด {allItems.length} จุด
                  </p>
                )}
              </div>

              {/* Vehicle Info */}
              <div className="content-card rt-info-card">
                <h3 className="card-title" style={{ margin: 0 }}>
                  ข้อมูลรถ
                </h3>
                <div className="rt-info-rows">
                  <div className="rt-info-row">
                    <span className="info-label">ทะเบียน</span>
                    <span className="rt-plate-text">
                      {selectedVehicle.plate} ({selectedVehicle.province || '-'})
                    </span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">สี</span>
                    <span>{allItems[allItems.length - 1]?.color || '-'}</span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">จำนวนครั้ง</span>
                    <span>{allItems.length} ครั้ง</span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">ช่วงเวลาที่พบ</span>
                    <span>
                      {formatDateTime(allItems[0]?.time_detect)}
                      {' — '}
                      {formatDateTime(allItems[allItems.length - 1]?.time_detect)}
                    </span>
                  </div>
                  <div className="rt-info-row">
                    <span className="info-label">กล้องที่ผ่าน</span>
                    <span>{gateSummary || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="content-card">
              <h3 className="card-title" style={{ margin: 0 }}>
                รายละเอียดแต่ละจุด
              </h3>
              <p className="rt-description">
                ภาพที่กล้องจับได้ ณ จุดตรวจแต่ละจุด เรียงตามลำดับเวลา
                โดยแสดงทุก Detection ที่ตรวจจับได้ รวมถึงรายการที่กล้องเดิมตรวจจับซ้ำ
              </p>

              {isLoadingRouteImages ? (
                <Spinner text="กำลังโหลดรูปภาพ..." />
              ) : (
                <div className="rt-timeline">
                  {mapItems.map((item, index) => {
                    const direction = item.direction;

                    return (
                      <div key={item.detection_id} className="rt-timeline-item"
                      onClick={() => routeMapRef.current?.focusPoint(item.detection_id)}>
                        <div className="rt-timeline-marker">{index + 1}</div>

                        <div
                          className={`rt-timeline-thumb${
                            routeImages[item.detection_id]
                              ? ' rt-timeline-thumb-hoverable'
                              : ''
                          }`}
                          onMouseEnter={(e) => handleThumbHover(e, item.detection_id)}
                          onMouseLeave={() => {
                            setHoveredImageId(null);
                            setHoverPos(null);
                          }}
                        >
                          {routeImages[item.detection_id] ? (
                            <img
                              src={routeImages[item.detection_id]}
                              alt={`จุดที่ ${index + 1}`}
                            />
                          ) : (
                            <div className="rt-timeline-noimg">ไม่มีรูปภาพ</div>
                          )}
                        </div>

                        <div className="rt-timeline-body">
                          <p className="rt-timeline-camera">
                            {item.camera_name || 'ไม่ทราบชื่อกล้อง'}
                          </p>
                          <p className="rt-timeline-time">
                            {formatDateTime(item.time_detect)}
                          </p>
                          <p className="rt-timeline-plate">
                            {item.license_plate || '-'} {' • '} {item.color || '-'}
                          </p>
                          <span
                            className={`rt-direction-badge ${
                              direction === 'entry'
                                ? 'rt-direction-entry'
                                : direction === 'exit'
                                ? 'rt-direction-exit'
                                : 'rt-direction-unknown'
                            }`}
                          >
                            {getDirectionLabel(direction)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Hover Image Preview */}
      {hoveredImageId && hoverPos && routeImages[hoveredImageId] && (() => {
        const hoveredItem = mapItems.find(
          (item) => item.detection_id === hoveredImageId
        );
        const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768;

        return (
          <div
            className="rt-hover-preview"
            style={
              isDesktop
                ? { top: `${hoverPos.top}px`, left: `${hoverPos.left}px` }
                : undefined
            }
          >
            <img
              src={routeImages[hoveredImageId]}
              alt="ภาพเต็มจากกล้อง"
              className="rt-hover-preview-img"
            />
            {hoveredItem && (
              <div className="rt-hover-preview-body">
                <p className="rt-hover-preview-camera">
                  {hoveredItem.camera_name || 'ไม่ทราบชื่อกล้อง'}
                </p>
                <p className="rt-hover-preview-time">
                  {formatDateTime(hoveredItem.time_detect)}
                </p>
                <span
                  className={`rt-direction-badge ${
                    hoveredItem.direction === 'entry'
                      ? 'rt-direction-entry'
                      : hoveredItem.direction === 'exit'
                      ? 'rt-direction-exit'
                      : 'rt-direction-unknown'
                  }`}
                >
                  {getDirectionLabel(hoveredItem.direction)}
                </span>
              </div>
            )}
          </div>
        );
      })()}
    </Layout>
  );
}

export default RouteTracking;