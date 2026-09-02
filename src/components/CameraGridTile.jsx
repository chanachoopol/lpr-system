import { FaVideo } from 'react-icons/fa'
import Spinner from './Spinner'
import EmptyState from './EmptyState'
import useCameraStream from '../hooks/useCameraStream'

// Tile กล้องเดี่ยวสำหรับ Grid View — ใช้ useCameraStream hook เดียวกับ Monitor.jsx
// แต่ละ tile มี HLS instance + refresh timer ของตัวเอง ผ่าน stream-token endpoint
// แยกอิสระจากกล้องอื่นในกริด กล้องนึงล่ม/ถูกปิดใช้งาน ไม่กระทบตัวอื่น
function CameraGridTile({ camera }) {
  const { videoRef, isVideoLoading, hasStreamError, isDisabled } = useCameraStream(camera?.id)

  return (
    <div className="grid-tile">
      <p className="grid-tile-name">{camera.name}</p>
      <div className="video-wrapper grid-tile-video">
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
              controls={true}
              muted={true}
              style={{ display: isVideoLoading ? 'none' : 'block' }}
            />
            {!isVideoLoading && (
              <div className="video-overlay">
                <span className="live-badge">● LIVE</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default CameraGridTile