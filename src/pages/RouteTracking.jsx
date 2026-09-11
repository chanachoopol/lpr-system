import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaSearch, FaCalendarAlt, FaArrowLeft } from 'react-icons/fa';
import { FaCar, FaRoute, FaMapLocationDot, FaXmark, FaArrowRotateLeft, FaArrowDownWideShort, FaArrowUpWideShort } from 'react-icons/fa6';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Swal from 'sweetalert2';

import Layout from '../components/Layout';
import RouteMap from '../components/RouteMap';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

import { getRouteTrackingAPI, getAuthedImageURL } from '../data/api';
import useVillageStore from '../store/villageStore';
import { renderCustomDatePickerHeader } from '../components/CustomDatePickerHeader';

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

function getVisiblePageNumbers(current, total, maxVisible) {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - Math.floor(maxVisible / 2));
  let end = start + maxVisible - 1;
  if (end > total) {
    end = total;
    start = end - maxVisible + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function RouteTracking() {
  const { selectedVillageId } = useVillageStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = useMemo(() => new Date(), []);

  const defaultDateFrom = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 14);
    return date;
  }, [today]);

  const [queryInput, setQueryInput] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(today);
  const [formErrors, setFormErrors] = useState({
    plate: false,
    dateFrom: false,
    dateTo: false
  });

  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [vehicleGroups, setVehicleGroups] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const routeMapRef = useRef(null);

  // Sorting & Pagination & Dynamic Rows
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = ล่าสุดก่อน, 'asc' = เก่าสุดก่อน
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const tableContainerRef = useRef(null);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  const sortedVehicleGroups = useMemo(() => {
    const list = [...vehicleGroups];
    list.sort((a, b) => {
      const lastA = a.items[a.items.length - 1]?.time_detect || a.date || 0;
      const lastB = b.items[b.items.length - 1]?.time_detect || b.date || 0;
      const tA = new Date(lastA).getTime();
      const tB = new Date(lastB).getTime();
      return sortOrder === 'asc' ? tA - tB : tB - tA;
    });
    return list;
  }, [vehicleGroups, sortOrder]);

  // คำนวณจำนวนแถวให้พอดีกับความสูงของตารางแบบ Real-time โดยไม่ให้มี scrollbar
  const calculateRows = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const height = el.clientHeight;
    if (!height) return;
    const headerHeight = 40;
    const rowHeight = 44;
    const available = height - headerHeight;
    if (available > 0) {
      const calculated = Math.max(3, Math.floor(available / rowHeight));
      setPageSize((prev) => (prev !== calculated ? calculated : prev));
    }
  }, []);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    calculateRows();
    const observer = new ResizeObserver(calculateRows);
    observer.observe(el);

    return () => observer.disconnect();
  }, [calculateRows, hasSearched, selectedVehicle, sortedVehicleGroups.length]);

  const totalPages = Math.max(1, Math.ceil(sortedVehicleGroups.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedVehicleGroups.slice(start, start + pageSize);
  }, [sortedVehicleGroups, currentPage, pageSize]);

  const visiblePages = useMemo(() => {
    return getVisiblePageNumbers(currentPage, totalPages, 5);
  }, [currentPage, totalPages]);

  const runSearch = useCallback(
    async (queryValue, rangeFrom, rangeTo, options = {}) => {
      const query = (queryValue !== undefined ? queryValue : queryInput).trim();
      const from = rangeFrom !== undefined ? rangeFrom : dateFrom;
      const to = rangeTo !== undefined ? rangeTo : dateTo;

      const errors = {
        plate: !query,
        dateFrom: !from,
        dateTo: !to
      };

      if (errors.plate || errors.dateFrom || errors.dateTo) {
        if (!options.silent) {
          setFormErrors(errors);
        }
        return [];
      }

      setFormErrors({ plate: false, dateFrom: false, dateTo: false });

      const startOfDay = new Date(from);
      startOfDay.setHours(0, 0, 0, 0);
      const dateFromParam = formatAPIDate(startOfDay);

      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      const dateToParam = formatAPIDate(endOfDay);

      setIsSearching(true);
      setHasSearched(true);
      setSelectedVehicle(null);
      setCurrentPage(1);

      try {
        const data = await getRouteTrackingAPI({
          licensePlate: query,
          villageId: selectedVillageId || undefined,
          dateFrom: dateFromParam,
          dateTo: dateToParam,
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
              const isBlacklist = Boolean(
                detection.is_blacklist ||
                detection.is_blacklisted ||
                detection.category === 'blacklist' ||
                detection.type === 'blacklist' ||
                car.is_blacklist ||
                car.is_blacklisted ||
                car.category === 'blacklist' ||
                car.type === 'blacklist'
              );
              matched.push({
                ...detection,
                license_plate: car.license_plate || '',
                province: car.province || '',
                color: detection.color || '',
                route_date: dateGroup.date || dateKeyOf(detection.time_detect),
                is_blacklist: isBlacklist
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
              is_blacklist: Boolean(item.is_blacklist),
              items: []
            });
          }

          if (item.is_blacklist) {
            groupMap.get(key).is_blacklist = true;
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

        if (!options.silent) {
          Swal.fire({
            icon: 'error',
            title: 'ค้นหาไม่สำเร็จ',
            text:
              error?.response?.data?.detail ||
              'ไม่สามารถดึงข้อมูลเส้นทางได้ กรุณาลองใหม่',
            confirmButtonColor: 'var(--sidebar-bg)'
          });
        }

        setVehicleGroups([]);
        return [];
      } finally {
        setIsSearching(false);
      }
    },
    [queryInput, dateFrom, dateTo, selectedVillageId]
  );

  // ฟังก์ชันรีเซ็ตค่าการค้นหากลับสู่สถานะเริ่มต้น (2 สัปดาห์ล่าสุด)
  const handleReset = useCallback(() => {
    setQueryInput('');
    setDateFrom(defaultDateFrom);
    setDateTo(today);
    setFormErrors({ plate: false, dateFrom: false, dateTo: false });
    setVehicleGroups([]);
    setSelectedVehicle(null);
    setHasSearched(false);
    setCurrentPage(1);
    setSortOrder('desc');
    setSearchParams({}, { replace: true });
  }, [defaultDateFrom, today, setSearchParams]);

  // ค้นหาแบบ Real-time อัตโนมัติเมื่อพิมพ์ป้ายทะเบียน และเลือกช่วงวันที่ครบ
  useEffect(() => {
    if (searchParams.get('plate')) return;

    const timer = setTimeout(() => {
      const trimmed = queryInput.trim();

      // ถ้าไม่มีข้อมูลครบทั้ง 3 ช่อง ให้ล้างผลการค้นหาทันที
      if (!trimmed || !dateFrom || !dateTo) {
        setVehicleGroups([]);
        setHasSearched(false);
        setSelectedVehicle(null);

        const hasStarted = Boolean(trimmed || dateFrom || dateTo);
        if (hasStarted) {
          setFormErrors({
            plate: !trimmed,
            dateFrom: !dateFrom,
            dateTo: !dateTo
          });
        }
        return;
      }

      // ถ้ากำลังดูเส้นทางของรถคันนี้อยู่แล้ว (Auto fill มาจากการคลิกดูเส้นทาง) ไม่ต้อง trigger search ซ้ำ
      if (selectedVehicle && trimmed === selectedVehicle.plate) {
        return;
      }

      setFormErrors({ plate: false, dateFrom: false, dateTo: false });
      runSearch(trimmed, dateFrom, dateTo, { silent: true });
    }, 400);

    return () => clearTimeout(timer);
  }, [queryInput, dateFrom, dateTo, runSearch, searchParams, selectedVehicle]);

  // โหลดข้อมูลจาก URL Search Params (รองรับทั้งการกด "ดูเส้นทาง" จากหน้าอื่น และการกด F5 Refresh)
  useEffect(() => {
    const queryFromURL = searchParams.get('plate');
    const provinceFromURL = searchParams.get('province');
    const dateFromURL = searchParams.get('date'); // รูปแบบ YYYY-MM-DD
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    if (!queryFromURL) return;

    setQueryInput(queryFromURL);

    let searchFrom = defaultDateFrom;
    let searchTo = today;

    if (fromParam && toParam) {
      searchFrom = new Date(fromParam);
      searchTo = new Date(toParam);
      setDateFrom(searchFrom);
      setDateTo(searchTo);
    } else if (dateFromURL) {
      const [year, month, day] = dateFromURL.split('-').map(Number);
      const targetDate = (!isNaN(year) && !isNaN(month) && !isNaN(day))
        ? new Date(year, month - 1, day, 0, 0, 0)
        : new Date(dateFromURL);

      searchFrom = new Date(targetDate);
      searchTo = new Date(targetDate);

      setDateFrom(searchFrom);
      setDateTo(searchTo);
    }

    runSearch(queryFromURL, searchFrom, searchTo).then((groups) => {
      if (!groups || groups.length === 0) return;

      // 1. ถ้ามี province หรือ date ระบุมา ให้พยายามหาคู่ที่ตรงกัน
      let matchedGroup = null;
      if (provinceFromURL || dateFromURL) {
        matchedGroup = groups.find(
          (g) =>
            (!provinceFromURL || g.province === provinceFromURL) &&
            (!dateFromURL || g.date === dateFromURL)
        );
      }

      // 2. ถ้าไม่ตรงเป๊ะ หรือไม่ได้ระบุ province/date มา ให้เลือก group แรก (ล่าสุด) อัตโนมัติทันที
      const targetToSelect = matchedGroup || groups[0];
      if (targetToSelect) {
        if (targetToSelect.date) {
          const [year, month, day] = targetToSelect.date.split('-').map(Number);
          const vehicleDate = (!isNaN(year) && !isNaN(month) && !isNaN(day))
            ? new Date(year, month - 1, day, 0, 0, 0)
            : new Date(targetToSelect.date);

          setDateFrom(vehicleDate);
          setDateTo(vehicleDate);
        }

        setSelectedVehicle({
          plate: targetToSelect.plate,
          province: targetToSelect.province,
          date: targetToSelect.date
        });
        setTimelinePage(1);
        setTimeout(scrollToMap, 100);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // เมื่อเปลี่ยนหมู่บ้านใน Navbar ให้ Re-fetch ค้นหาเส้นทางใหม่ตามขอบเขตหมู่บ้านที่เลือกอัตโนมัติ
  useEffect(() => {
    const currentQuery = queryInput.trim() || selectedVehicle?.plate;
    if (!currentQuery || !hasSearched) return;

    runSearch(currentQuery).then((groups) => {
      if (!groups || groups.length === 0) {
        setSelectedVehicle(null);
        return;
      }
      if (selectedVehicle) {
        const stillExists = groups.find(
          (g) =>
            g.plate === selectedVehicle.plate &&
            g.province === selectedVehicle.province &&
            g.date === selectedVehicle.date
        );
        if (stillExists) {
          setSelectedVehicle(stillExists);
        } else {
          setSelectedVehicle(groups[0]);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVillageId]);

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
   * Detection ทั้งหมด ไม่ dedupe (memoized เพื่อไม่ให้ mapItems instance เปลี่ยนเวลาเปลี่ยนหน้า pagination)
   */
  const allItems = useMemo(() => selectedGroup?.items || [], [selectedGroup]);

  /*
   * ใช้ Detection ทุกตัวสำหรับ Map จำกัดเฉพาะ 50 จุดล่าสุด
   */
  const mapItems = useMemo(() => allItems.slice(-MAX_ROUTE_POINTS), [allItems]);
  const isTruncated = allItems.length > MAX_ROUTE_POINTS;

  // Timeline Pagination & Sorting & Dynamic Rows (ฝั่งขวา)
  const [timelineSortOrder, setTimelineSortOrder] = useState('asc'); // 'asc' = เก่าไปใหม่ (1->N), 'desc' = ใหม่ไปเก่า
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePageSize, setTimelinePageSize] = useState(3);
  const timelineContainerRef = useRef(null);

  const toggleTimelineSortOrder = () => {
    setTimelineSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    setTimelinePage(1);
  };

  const sortedTimelineItems = useMemo(() => {
    const list = [...mapItems];
    if (timelineSortOrder === 'desc') {
      list.sort((a, b) => new Date(b.time_detect) - new Date(a.time_detect));
    } else {
      list.sort((a, b) => new Date(a.time_detect) - new Date(b.time_detect));
    }
    return list;
  }, [mapItems, timelineSortOrder]);

  const calculateTimelineRows = useCallback(() => {
    const el = timelineContainerRef.current;
    if (!el) return;
    const height = el.clientHeight;
    if (!height) return;
    const paginationReserved = 52; // ความสูงสำหรับแถบ pagination + margin
    const available = height - paginationReserved;
    const itemHeight = 98; // ความสูงจริงของแต่ละการ์ด timeline item
    if (available > 0) {
      const calculated = Math.max(2, Math.floor(available / itemHeight));
      setTimelinePageSize((prev) => (prev !== calculated ? calculated : prev));
    }
  }, []);

  useEffect(() => {
    const el = timelineContainerRef.current;
    if (!el) return;

    calculateTimelineRows();
    const observer = new ResizeObserver(calculateTimelineRows);
    observer.observe(el);

    return () => observer.disconnect();
  }, [calculateTimelineRows, selectedVehicle, sortedTimelineItems.length]);

  const totalTimelinePages = Math.max(1, Math.ceil(sortedTimelineItems.length / timelinePageSize));

  useEffect(() => {
    if (timelinePage > totalTimelinePages) {
      setTimelinePage(totalTimelinePages);
    }
  }, [timelinePage, totalTimelinePages]);

  const paginatedTimelineItems = useMemo(() => {
    const start = (timelinePage - 1) * timelinePageSize;
    return sortedTimelineItems.slice(start, start + timelinePageSize);
  }, [sortedTimelineItems, timelinePage, timelinePageSize]);

  const timelineVisiblePages = useMemo(() => {
    return getVisiblePageNumbers(timelinePage, totalTimelinePages, 5);
  }, [timelinePage, totalTimelinePages]);

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
    setIsLoadingRouteImages(true);

    Promise.allSettled(
      mapItems.map(async (item) => {
        const src = item.image_full || item.image_crop;
        if (!src) return [item.detection_id, null];

        const url = await getAuthedImageURL(src);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapItemsKey]);

  function scrollToMap() {
    const mapCard = document.querySelector('.rt-map-card') || document.querySelector('.rt-result-row');
    if (mapCard) {
      mapCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const layoutContent = document.querySelector('.layout-content');
    if (layoutContent) {
      layoutContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSelectVehicle(group) {
    if (group?.plate) {
      setQueryInput(group.plate);
    }

    // อัปเดตช่วงวันที่ในปฏิทินให้เป็นวันที่พบป้ายทะเบียนคันนี้
    if (group?.date) {
      const [year, month, day] = group.date.split('-').map(Number);
      const vehicleDate = (!isNaN(year) && !isNaN(month) && !isNaN(day))
        ? new Date(year, month - 1, day, 0, 0, 0)
        : new Date(group.date);

      setDateFrom(vehicleDate);
      setDateTo(vehicleDate);
    }

    setSelectedVehicle({
      plate: group.plate,
      province: group.province,
      date: group.date
    });
    setTimelinePage(1);

    // Sync to URL Search Params so F5 refresh stays on this vehicle view
    const params = {
      plate: group.plate,
      province: group.province || '',
      date: group.date || ''
    };
    if (group?.date) {
      params.from = group.date;
      params.to = group.date;
    } else {
      if (dateFrom) params.from = formatAPIDate(dateFrom);
      if (dateTo) params.to = formatAPIDate(dateTo);
    }
    setSearchParams(params, { replace: true });

    setTimeout(scrollToMap, 100);
  }

  function handleBackToList() {
    setSelectedVehicle(null);
    setSearchParams({}, { replace: true });
  }

  return (
    <Layout title="Route Tracking">
      <div className="rt-wrapper">

        {/* Search */}
        {!selectedVehicle && (
          <div className="content-card rt-search-card">
            <div className="rt-search-header">
              <h3 className="card-title" style={{ margin: 0 }}>
                ค้นหาเส้นทางการเคลื่อนที่
              </h3>
              <p className="rt-description">
                พิมพ์ป้ายทะเบียนเพื่อค้นหาเส้นทางการเคลื่อนที่ของรถ
              </p>
            </div>

            <div className="rt-search-row">
              <div className="rt-search-field rt-search-field-plate">
                <label>
                  ป้ายทะเบียน
                  {!queryInput.trim() && (
                    <span className="rt-required-star">
                      * {formErrors.plate && <span className="rt-inline-error">(กรุณากรอกป้ายทะเบียน)</span>}
                    </span>
                  )}
                </label>
                <div className="rt-input-wrap">
                  <FaSearch className="rt-input-icon" />
                  <input
                    type="text"
                    placeholder="เช่น กข1234"
                    value={queryInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQueryInput(val);
                      if (!val.trim()) {
                        setVehicleGroups([]);
                        setHasSearched(false);
                        setSelectedVehicle(null);
                        if (dateFrom || dateTo) {
                          setFormErrors((prev) => ({ ...prev, plate: true }));
                        }
                      } else {
                        setFormErrors((prev) => ({ ...prev, plate: false }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runSearch();
                    }}
                  />
                </div>
              </div>

              <div className="rt-search-field">
                <label>
                  จากวันที่
                  {!dateFrom && (
                    <span className="rt-required-star">
                      * {formErrors.dateFrom && <span className="rt-inline-error">(กรุณาเลือกวันที่)</span>}
                    </span>
                  )}
                </label>
                <div className="rt-input-wrap">
                  <FaCalendarAlt className="rt-input-icon" />
                  <DatePicker
                    selected={dateFrom}
                    onChange={(date) => {
                      setDateFrom(date);
                      if (!date) {
                        setVehicleGroups([]);
                        setHasSearched(false);
                        setSelectedVehicle(null);
                        if (queryInput.trim() || dateTo) {
                          setFormErrors((prev) => ({ ...prev, dateFrom: true }));
                        }
                      } else {
                        setFormErrors((prev) => ({ ...prev, dateFrom: false }));
                      }
                    }}
                    dateFormat="dd/MM/yyyy"
                    maxDate={dateTo || today}
                    placeholderText="เลือกวันที่"
                    isClearable={true}
                    showPopperArrow={false}
                    renderCustomHeader={renderCustomDatePickerHeader}
                    className="datepicker-rt"
                  />
                </div>
              </div>

              <div className="rt-search-field">
                <label>
                  ถึงวันที่
                  {!dateTo && (
                    <span className="rt-required-star">
                      * {formErrors.dateTo && <span className="rt-inline-error">(กรุณาเลือกวันที่)</span>}
                    </span>
                  )}
                </label>
                <div className="rt-input-wrap">
                  <FaCalendarAlt className="rt-input-icon" />
                  <DatePicker
                    selected={dateTo}
                    onChange={(date) => {
                      setDateTo(date);
                      if (!date) {
                        setVehicleGroups([]);
                        setHasSearched(false);
                        setSelectedVehicle(null);
                        if (queryInput.trim() || dateFrom) {
                          setFormErrors((prev) => ({ ...prev, dateTo: true }));
                        }
                      } else {
                        setFormErrors((prev) => ({ ...prev, dateTo: false }));
                      }
                    }}
                    dateFormat="dd/MM/yyyy"
                    minDate={dateFrom}
                    maxDate={today}
                    placeholderText="เลือกวันที่"
                    isClearable={true}
                    showPopperArrow={false}
                    renderCustomHeader={renderCustomDatePickerHeader}
                    className="datepicker-rt"
                  />
                </div>
              </div>

              <div className="rt-search-buttons">
                <button
                  className="btn-rt-reset"
                  onClick={handleReset}
                  title="รีเซ็ตค่าการค้นหา"
                >
                  <FaArrowRotateLeft />
                  รีเซ็ต
                </button>
              </div>
            </div>
          </div>
        )}

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
              description="พิมพ์ป้ายทะเบียนด้านบน เพื่อดูเส้นทางการเคลื่อนที่"
            />
          </div>
        ) : !selectedVehicle ? (
          /* Search Result */
          <div className="content-card rt-table-card">
            <div className="rt-table-header">
              <h3 className="card-title" style={{ margin: 0 }}>
                ผลการค้นหา
              </h3>
              <div className="rt-header-right">
                <p className="rt-description" style={{ margin: 0 }}>
                  พบ <strong>{vehicleGroups.length}</strong> รายการ — คลิกแถวเพื่อดูเส้นทาง
                </p>
                <button
                  type="button"
                  className="btn-sort-icon-toggle"
                  onClick={toggleSortOrder}
                  title={
                    sortOrder === 'desc'
                      ? 'เรียงลำดับ: ใหม่ไปเก่า (คลิกเพื่อสลับเป็น เก่าไปใหม่)'
                      : 'เรียงลำดับ: เก่าไปใหม่ (คลิกเพื่อสลับเป็น ใหม่ไปเก่า)'
                  }
                >
                  {sortOrder === 'desc' ? (
                    <FaArrowDownWideShort className="sort-btn-icon" />
                  ) : (
                    <FaArrowUpWideShort className="sort-btn-icon" />
                  )}
                </button>
              </div>
            </div>

            {vehicleGroups.length === 0 ? (
              <EmptyState
                icon={<FaCar />}
                title="ไม่พบข้อมูล"
                description="ไม่พบป้ายทะเบียนนี้ในช่วงเวลาที่เลือก"
              />
            ) : (
              <>
                <div className="table-responsive" ref={tableContainerRef}>
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
                      {paginatedGroups.map((group) => {
                        const latestItem = group.items[group.items.length - 1];
                        return (
                          <tr
                            key={`${group.plate}|${group.province}|${group.date}`}
                            className="rt-row-clickable"
                            onClick={() => handleSelectVehicle(group)}
                          >
                            <td className={`plate-text ${group.is_blacklist ? 'plate-blacklist' : ''}`}>
                              {group.plate}
                            </td>
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

                {/* Pagination */}
                <div className="pagination">
                  <button
                    className="page-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    ‹
                  </button>

                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      className={`page-btn ${currentPage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    className="page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    ›
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Route Detail */
          <div className="rt-detail-container">
            <button className="rt-back-btn" onClick={handleBackToList}>
              <FaArrowLeft />
              กลับไปยังรายการที่พบ
            </button>

            <div className="rt-detail-columns">
              {/* ฝั่งซ้าย: แผนที่เต็มความสูง */}
              <div className="rt-detail-left">
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
              </div>

              {/* ฝั่งขวา: รายละเอียดแต่ละจุด */}
              <div className="rt-detail-right">
                <div className="content-card rt-timeline-card">
                  <div className="rt-timeline-header-wrap">
                    <div className="rt-timeline-header-top">
                      <h3 className="card-title" style={{ margin: 0 }}>
                        รายละเอียดแต่ละจุด
                      </h3>
                      <button
                        type="button"
                        className="btn-sort-icon-toggle"
                        onClick={toggleTimelineSortOrder}
                        title={
                          timelineSortOrder === 'desc'
                            ? 'เรียงลำดับ: ใหม่ไปเก่า (คลิกเพื่อสลับเป็น เก่าไปใหม่)'
                            : 'เรียงลำดับ: เก่าไปใหม่ (คลิกเพื่อสลับเป็น ใหม่ไปเก่า)'
                        }
                      >
                        {timelineSortOrder === 'desc' ? (
                          <FaArrowDownWideShort className="sort-btn-icon" />
                        ) : (
                          <FaArrowUpWideShort className="sort-btn-icon" />
                        )}
                      </button>
                    </div>
                    <div className="rt-timeline-stats-bar">
                      <div className="rt-stat-badge">
                        <span className="rt-stat-label">จำนวนครั้งที่พบ:</span>
                        <span className="rt-stat-value">{allItems.length} ครั้ง</span>
                      </div>
                      <div className="rt-stat-badge">
                        <span className="rt-stat-label">ช่วงเวลา:</span>
                        <span className="rt-stat-value">
                          {formatDateTime(allItems[0]?.time_detect)} — {formatDateTime(allItems[allItems.length - 1]?.time_detect)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isLoadingRouteImages ? (
                    <Spinner text="กำลังโหลดรูปภาพ..." />
                  ) : (
                    <div className="rt-timeline-body-wrap" ref={timelineContainerRef}>
                      <div className="rt-timeline">
                        {paginatedTimelineItems.map((item) => {
                          const direction = item.direction;
                          const pointIndex = mapItems.findIndex(
                            (m) => String(m.detection_id) === String(item.detection_id)
                          );
                          const pointNumber = pointIndex !== -1 ? pointIndex + 1 : 1;

                          return (
                            <div
                              key={item.detection_id}
                              className="rt-timeline-item"
                              onClick={() => {
                                routeMapRef.current?.focusPoint(item.detection_id, true);
                                scrollToMap();
                              }}
                            >
                              <div className="rt-timeline-marker">{pointNumber}</div>

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
                                    alt={`จุดที่ ${pointNumber}`}
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
                                  {item.license_plate || '-'} {item.province ? `(${item.province})` : ''} {' • '} {item.color || '-'}
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

                      {/* Pagination for Timeline */}
                      {totalTimelinePages > 1 && (
                        <div className="pagination rt-timeline-pagination">
                          <button
                            className="page-btn"
                            disabled={timelinePage <= 1}
                            onClick={() => setTimelinePage((p) => Math.max(1, p - 1))}
                          >
                            ‹
                          </button>

                          {timelineVisiblePages.map((page) => (
                            <button
                              key={page}
                              className={`page-btn ${timelinePage === page ? 'active' : ''}`}
                              onClick={() => setTimelinePage(page)}
                            >
                              {page}
                            </button>
                          ))}

                          <button
                            className="page-btn"
                            disabled={timelinePage >= totalTimelinePages}
                            onClick={() => setTimelinePage((p) => Math.min(totalTimelinePages, p + 1))}
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
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