import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { getCameraStreamTokenAPI } from '../data/api'

const EXPIRY_BUFFER_MS = 30_000 // เผื่อเวลา 30 วิ ก่อน JWT จะหมดอายุจริง กัน network latency (ตามที่ backend แนะนำ)
const MIN_REFRESH_DELAY_MS = 5_000 // กันไม่ให้ refresh ถี่เกินไปกรณี clock skew ระหว่าง client/server
const RETRY_DELAY_MS = 10_000 // เจอ error ที่ไม่ใช่ 409 (เช่น network/5xx ชั่วคราว) — retry แบบมี backoff สั้นๆ

/**
 * Hook จัดการ HLS video stream ของกล้องตัวเดียว โดยใช้ endpoint ใหม่จาก backend:
 *   GET /api/cameras/{camera_id}/stream-token
 *
 * - เรียก endpoint ตอน mount (หรือตอน cameraId เปลี่ยน) แล้ว loadSource เข้า HLS instance เดิม
 *   (ไม่สร้าง instance ใหม่ทุกครั้งที่ refresh กัน flicker เกินจำเป็น)
 * - วน setTimeout เพื่อขอ token ใหม่ก่อนหมดอายุ โดยคำนวณจาก expires_at ที่ backend ส่งมาเสมอ
 *   (ไม่ hardcode อายุ token 300 วิ ไว้ฝั่ง frontend ตามที่ backend ขอ)
 * - ถ้าเจอ 409 (กล้องถูกปิดใช้งาน) → หยุด stream ถาวร เคลียร์ HLS instance ไม่ retry ต่อ
 * - cameraId เป็น null/undefined ได้ (เช่นตอนอยู่ Grid Mode ที่ Monitor.jsx ไม่ได้ใช้ single view)
 *   hook จะไม่ยิง request ใดๆ
 */
function useCameraStream(cameraId) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const isMountedRef = useRef(true)
  const fetchAndRefreshRef = useRef(() => {})

  const [isVideoLoading, setIsVideoLoading] = useState(true)
  const [hasStreamError, setHasStreamError] = useState(false)
  const [isDisabled, setIsDisabled] = useState(false) // 👈 true เมื่อกล้องถูกปิดใช้งาน (409) — ห้าม retry

  const cleanup = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  const attachSource = useCallback((streamUrl) => {
    const video = videoRef.current
    if (!video || !streamUrl) return

    if (Hls.isSupported()) {
      if (!hlsRef.current) {
        const hls = new Hls()
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return
          setIsVideoLoading(false)
          video.play().catch((err) => console.log('รอผู้ใช้กด Play:', err))
        })
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal && isMountedRef.current) {
            setIsVideoLoading(false)
            setHasStreamError(true)
          }
        })
        hlsRef.current = hls
      }
      // 👇 reload source ตัวเดิม (ไม่สร้าง Hls ใหม่) — จะมีสะดุดสั้นๆ ตามที่ backend แจ้งไว้ว่าเป็นเรื่องปกติ
      hlsRef.current.loadSource(streamUrl)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        if (!isMountedRef.current) return
        setIsVideoLoading(false)
        video.play().catch((err) => console.log('รอผู้ใช้กด Play:', err))
      })
      video.addEventListener('error', () => {
        if (!isMountedRef.current) return
        setIsVideoLoading(false)
        setHasStreamError(true)
      })
    }
  }, [])

  const scheduleNext = useCallback((expiresAt) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)

    // 👇 คำนวณเวลาที่ต้อง refresh จาก expires_at เสมอ ไม่ hardcode 300 วิ (ตามคำแนะนำของ backend)
    const msUntilExpiry = new Date(expiresAt).getTime() - Date.now()
    const refreshIn = Math.max(msUntilExpiry - EXPIRY_BUFFER_MS, MIN_REFRESH_DELAY_MS)

    refreshTimerRef.current = setTimeout(() => {
      fetchAndRefreshRef.current()
    }, refreshIn)
  }, [])

  const fetchAndRefresh = useCallback(async () => {
    if (!cameraId || !isMountedRef.current) return

    try {
      const data = await getCameraStreamTokenAPI(cameraId)
      if (!isMountedRef.current) return

      setHasStreamError(false)
      attachSource(data.stream_url)
      scheduleNext(data.expires_at)
    } catch (error) {
      if (!isMountedRef.current) return

      // 👇 409 = กล้องถูกปิดใช้งาน (is_active=false) — หยุด stream ถาวร ไม่ retry ตามที่ backend แจ้ง
      if (error?.response?.status === 409) {
        cleanup()
        setIsVideoLoading(false)
        setIsDisabled(true)
        return
      }

      console.error(error)
      setIsVideoLoading(false)
      setHasStreamError(true)
      // network/5xx อื่นๆ — retry แบบมี backoff สั้นๆ กันสแปม request รัว
      refreshTimerRef.current = setTimeout(() => {
        fetchAndRefreshRef.current()
      }, RETRY_DELAY_MS)
    }
  }, [cameraId, attachSource, scheduleNext, cleanup])

  useEffect(() => {
    fetchAndRefreshRef.current = fetchAndRefresh
  }, [fetchAndRefresh])

  useEffect(() => {
    isMountedRef.current = true
    setHasStreamError(false)
    setIsDisabled(false)
    cleanup()

    if (cameraId) {
      setIsVideoLoading(true)
      fetchAndRefreshRef.current()
    } else {
      setIsVideoLoading(false)
    }

    return () => {
      isMountedRef.current = false
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId])

  return { videoRef, isVideoLoading, hasStreamError, isDisabled }
}

export default useCameraStream