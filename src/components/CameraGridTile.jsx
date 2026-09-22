import { useState, useRef, useEffect, useCallback } from 'react'
import { FaVideo, FaExpand, FaCompress } from 'react-icons/fa'
import Spinner from './Spinner'
import EmptyState from './EmptyState'
import useCameraStream from '../hooks/useCameraStream'

// Tile กล้องเดี่ยวสำหรับ Grid View — ใช้ useCameraStream hook เดียวกับ Monitor.jsx
// แต่ละ tile มี HLS instance + refresh timer ของตัวเอง ผ่าน stream-token endpoint
// แยกอิสระจากกล้องอื่นในกริด กล้องนึงล่ม/ถูกปิดใช้งาน ไม่กระทบตัวอื่น
function CameraGridTile({ camera }) {
  const { videoRef, isVideoLoading, hasStreamError, isDisabled } = useCameraStream(camera?.id)
  const wrapperRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === wrapperRef.current))
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  const handleToggleFullscreen = useCallback(() => {
    const el = wrapperRef.current || videoRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch((err) => console.log('Fullscreen error:', err))
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => console.log('Exit fullscreen error:', err))
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen()
      }
    }
  }, [videoRef])

  return (
    <div className="grid-tile">
      <p className="grid-tile-name">{camera.name}</p>
      <div ref={wrapperRef} className="video-wrapper grid-tile-video">
        {isDisabled ? (
          <div className="video-skeleton">
            <EmptyState
              icon={<FaVideo />}
              title="กล้องถูกปิดใช้งาน"
            />
          </div>
        ) : hasStreamError ? (
          <div className="video-skeleton">
            <EmptyState
              icon={<FaVideo />}
              title="เชื่อมต่อไม่สำเร็จ"
            />
          </div>
        ) : (
          <>
            {isVideoLoading && (
              <div className="video-skeleton">
                <Spinner text="Connecting..." />
              </div>
            )}
            <video
              ref={videoRef}
              className="live-video"
              controls={false}
              autoPlay={true}
              playsInline={true}
              muted={true}
              style={{ display: isVideoLoading ? 'none' : 'block' }}
              onDoubleClick={handleToggleFullscreen}
            />
            {!isVideoLoading && (
              <>
                <div className="video-overlay">
                  <span className="live-badge">● LIVE</span>
                </div>
                <button
                  type="button"
                  className="video-fullscreen-btn"
                  onClick={handleToggleFullscreen}
                  title={isFullscreen ? 'ออกจากโหมดเต็มหน้าจอ (Esc)' : 'เต็มหน้าจอ (หรือดับเบิลคลิกที่วิดีโอ)'}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <FaCompress /> : <FaExpand />}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default CameraGridTile