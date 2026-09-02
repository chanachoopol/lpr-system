import React, { useState, useEffect } from 'react'
import { FaTriangleExclamation, FaCheck, FaCar, FaCamera, FaClock, FaLocationDot } from 'react-icons/fa6'
import useNotificationStore from '../store/notificationStore'
import { getAuthedImageURL, getDetectionsAPI } from '../data/api'
import '../styles/BlacklistAlertModal.css'

function formatAlertDateTime(isoString) {
  if (!isoString) return '-'
  return new Date(isoString).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  })
}

function StackedAlertCard({ alert, index, totalCount, onAcknowledge }) {
  const [resolvedAlert, setResolvedAlert] = useState(alert)
  const [imageUrl, setImageUrl] = useState(null)
  const [isLoadingImage, setIsLoadingImage] = useState(false)

  const isActive = index === 0
  const isBehind1 = index === 1
  const isBehind2 = index === 2
  const isBehindDeep = index >= 3

  let cardClass = 'bl-alert-card'
  if (isActive) cardClass += ' is-active'
  else if (isBehind1) cardClass += ' is-behind-1'
  else if (isBehind2) cardClass += ' is-behind-2'
  else if (isBehindDeep) cardClass += ' is-behind-deep'

  const imageSource =
    resolvedAlert.image_full ||
    resolvedAlert.image_crop ||
    resolvedAlert.crop_url ||
    resolvedAlert.image_url ||
    resolvedAlert.image_path

  useEffect(() => {
    let isCancelled = false
    let currentBlobUrl = null

    async function resolveAndLoadImage() {
      setIsLoadingImage(true)
      try {
        let directSource = imageSource

        // ถ้าไม่มี image path ส่งมาตรงๆ ให้ดึงจาก detection ล่าสุดของป้ายนี้ทันที
        if (!directSource && alert.license_plate) {
          try {
            const data = await getDetectionsAPI({
              license_plate: alert.license_plate,
              page: 1,
              page_size: 1
            })
            const det = data?.items?.[0]
            if (det && !isCancelled) {
              setResolvedAlert((prev) => ({
                ...prev,
                ...det,
                camera_name: prev.camera_name || det.camera_name
              }))
              directSource = det.image_full || det.image_crop || det.image_url || det.crop_url
            }
          } catch (e) {
            console.error('ค้นหา detection สำหรับ alert ไม่สำเร็จ:', e)
          }
        }

        if (directSource && !isCancelled) {
          const url = await getAuthedImageURL(directSource)
          if (!isCancelled && url) {
            currentBlobUrl = url
            setImageUrl(url)
          }
        }
      } catch (err) {
        console.error('โหลดรูปภาพ Blacklist Alert ไม่สำเร็จ:', err)
      } finally {
        if (!isCancelled) setIsLoadingImage(false)
      }
    }

    resolveAndLoadImage()

    return () => {
      isCancelled = true
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl)
      }
    }
  }, [alert.license_plate, imageSource])

  const remainingCount = totalCount - 1

  return (
    <div className={cardClass}>
      <div className="bl-card-header">
        <div className="bl-card-title-wrap">
          <FaTriangleExclamation className="bl-card-icon" />
          <h4 className="bl-card-title">พบป้ายทะเบียนที่ต้องสงสัย</h4>
        </div>
        {remainingCount > 0 && isActive && (
          <span className="bl-card-stack-badge">
            ซ้อนอยู่ +{remainingCount}
          </span>
        )}
      </div>

      <div className="bl-card-body">
        <div className="bl-card-image-wrap">
          {imageUrl ? (
            <img src={imageUrl} alt="ภาพรถที่ตรวจจับได้" className="bl-card-image" />
          ) : (
            <div className="bl-card-no-image">
              <FaCar style={{ fontSize: 32, opacity: 0.5 }} />
              <span>{isLoadingImage ? 'กำลังโหลดรูปภาพ...' : 'ไม่มีรูปภาพ'}</span>
            </div>
          )}
        </div>

        <div className="bl-card-plate-banner">
          <span className="bl-card-plate-val">{resolvedAlert.license_plate || '-'}</span>
          <span className="bl-card-province-val">{resolvedAlert.province || 'ไม่ระบุจังหวัด'}</span>
        </div>

        <div className="bl-card-info-grid">
          <div className="bl-card-info-row">
            <span className="bl-card-info-label">
              <FaCamera style={{ marginRight: 6, opacity: 0.7 }} /> กล้องตรวจจับ
            </span>
            <span className="bl-card-info-data">{resolvedAlert.camera_name || resolvedAlert.camera?.name || '-'}</span>
          </div>
          <div className="bl-card-info-row">
            <span className="bl-card-info-label">
              <FaClock style={{ marginRight: 6, opacity: 0.7 }} /> เวลาที่ตรวจพบ
            </span>
            <span className="bl-card-info-data">{formatAlertDateTime(resolvedAlert.time_detect || resolvedAlert.created_at)}</span>
          </div>
        </div>

        {resolvedAlert.reason && (
          <div className="bl-card-reason-box">
            <strong>เหตุผลที่ต้องสงสัย:</strong> {resolvedAlert.reason}
          </div>
        )}
      </div>

      {isActive && (
        <div className="bl-card-footer">
          <button className="btn-bl-acknowledge" onClick={onAcknowledge}>
            <FaCheck /> {remainingCount > 0 ? `รับทราบ (เหลืออีก ${remainingCount} รายการ)` : 'รับทราบ'}
          </button>
        </div>
      )}
    </div>
  )
}

function BlacklistAlertModal() {
  const activeAlerts = useNotificationStore((state) => state.activeBlacklistAlerts)
  const dismissFrontAlert = useNotificationStore((state) => state.dismissFrontBlacklistAlert)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && activeAlerts && activeAlerts.length > 0) {
        dismissFrontAlert()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeAlerts, dismissFrontAlert])

  if (!activeAlerts || activeAlerts.length === 0) {
    return null
  }

  // แสดงผลการ์ดซ้อนกันสูงสุด 4 ชั้น (ใบที่ลึกกว่านั้นจะซ่อนอยู่หลังสุด)
  const visibleStack = activeAlerts.slice(0, 4)

  return (
    <div className="bl-alert-backdrop">
      <div className="bl-alert-stack-container">
        {/* Render จากหลังมาหน้า เพื่อให้ z-index ของใบหน้าสุดทับใบหลัง */}
        {visibleStack
          .map((alert, idx) => ({ alert, index: idx }))
          .reverse()
          .map(({ alert, index }) => (
            <StackedAlertCard
              key={alert._stackId || alert.id || `${alert.license_plate}-${alert.time_detect}-${index}`}
              alert={alert}
              index={index}
              totalCount={activeAlerts.length}
              onAcknowledge={dismissFrontAlert}
            />
          ))}
      </div>
    </div>
  )
}

export default BlacklistAlertModal
