import { useEffect, useRef, useState } from 'react'
import { FaVideo } from 'react-icons/fa'
import Hls from 'hls.js'
import Spinner from './Spinner'
import EmptyState from './EmptyState'

// Tile กล้องเดี่ยวสำหรับ Grid View — มี HLS instance และ state ของตัวเอง
// แยกอิสระจากกล้องอื่นในกริด กล้องนึงล่มไม่กระทบตัวอื่น
function CameraGridTile({ camera }) {
  const videoRef = useRef(null)
  const [isVideoLoading, setIsVideoLoading] = useState(true)
  const [hasStreamError, setHasStreamError] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    const streamUrl = camera?.stream_url

    setIsVideoLoading(true)
    setHasStreamError(false)

    if (!video || !streamUrl) {
      setIsVideoLoading(false)
      return
    }

    let hls

    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsVideoLoading(false)
        video.play().catch((err) => console.log('รอผู้ใช้กด Play:', err))
      })
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          setIsVideoLoading(false)
          setHasStreamError(true)
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setIsVideoLoading(false)
        video.play().catch((err) => console.log('รอผู้ใช้กด Play:', err))
      })
      video.addEventListener('error', () => {
        setIsVideoLoading(false)
        setHasStreamError(true)
      })
    }

    return () => {
      if (hls) hls.destroy()
    }
  }, [camera?.stream_url])

  return (
    <div className="grid-tile">
      <p className="grid-tile-name">{camera.name}</p>
      <div className="video-wrapper grid-tile-video">
        {hasStreamError ? (
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