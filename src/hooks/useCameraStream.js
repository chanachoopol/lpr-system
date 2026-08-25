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
 *
 * ⚠️ MediaMTX integration note (2026-08-25):
 * Backend ยังไม่เคย verify ว่า HLS เล่นต่อเนื่องได้จริงเกิน segment แรกหรือไม่ (token อายุแค่ 5 นาที)
 * ถ้าเจอ error 401 "หลัง" ที่วิดีโอเริ่มเล่นไปแล้ว (ไม่ใช่ตอนโหลดครั้งแรก) ต้องแจ้งทีม backend ทันที
 * ฟังก์ชันนี้เลย log แยกให้ชัดว่า error เกิดตอนไหน (ก่อนเล่น / ระหว่างเล่น) และเป็น 401 หรือไม่
 * เพื่อให้มีหลักฐานไปรายงานได้ทันทีโดยไม่ต้องเดา
 */
function useCameraStream(cameraId) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const isMountedRef = useRef(true)
  const fetchAndRefreshRef = useRef(() => {})
  const hasStartedPlayingRef = useRef(false) // 👈 ใหม่ — ใช้แยก error ก่อน/หลังเริ่มเล่นจริง

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

  // แยกประเภท error ของ hls.js ให้ชัดว่าเป็น HTTP status อะไร (โดยเฉพาะ 401) และเกิดตอนไหน
  // log ให้ครบเพื่อใช้เป็นหลักฐานรายงาน backend ตาม checklist ข้อสุดท้ายของเอกสาร MediaMTX
  function logHlsFatalError(data, cameraId) {
    const httpStatus = data.response?.code ?? data.networkDetails?.status ?? null
    const stage = hasStartedPlayingRef.current ? 'MID-STREAM (หลังเริ่มเล่นแล้ว)' : 'INITIAL LOAD (ก่อนเริ่มเล่น)'
    const is401 = httpStatus === 401

    console.error(
      `[useCameraStream] HLS fatal error — camera: ${cameraId} | stage: ${stage} | type: ${data.type} | details: ${data.details} | httpStatus: ${httpStatus ?? 'n/a'}`
    )

    if (is401 && hasStartedPlayingRef.current) {
      // 👈 นี่คือเคสที่ backend ขอให้แจ้งกลับทันที — token หมดอายุ/invalid กลางทางที่เล่นอยู่
      console.error(
        '[useCameraStream] ⚠️ พบ 401 กลางทางหลังวิดีโอเริ่มเล่นแล้ว — เป็นเคสที่ backend ระบุว่ายังไม่ verify ' +
        'กรุณาแจ้งทีม backend พร้อมแนบ camera_id, เวลาที่เกิด, และ log นี้'
      )
    }
  }

  const attachSource = useCallback((streamUrl) => {
    const video = videoRef.current
    if (!video || !streamUrl) return

    hasStartedPlayingRef.current = false // reset ทุกครั้งที่โหลด source ใหม่ (เช่นตอน refresh token)

    if (Hls.isSupported()) {
      if (!hlsRef.current) {
        const hls = new Hls()
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return
          setIsVideoLoading(false)
          video.play().catch((err) => console.log('รอผู้ใช้กด Play:', err))
        })
        // ถือว่า "เริ่มเล่นจริง" ตอน fragment แรกถูกเล่นสำเร็จ ไม่ใช่แค่ manifest parse เสร็จ
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          hasStartedPlayingRef.current = true
        })
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal && isMountedRef.current) {
            logHlsFatalError(data, cameraId)
            setIsVideoLoading(false)
            setHasStreamError(true)
          }
        })
        hlsRef.current = hls
      }
      // 👇 reload source ตัวเดิม (ไม่สร้าง Hls ใหม่) — จะมีสะดุดสั้นๆ ตามที่ backend แจ้งไว้ว่าเป็นเรื่องปกติ
      hlsRef.current.loadSource(streamUrl)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS — ไม่มี event ละเอียดเท่า hls.js (ไม่รู้ HTTP status ตรงๆ)
      // แต่ยัง log stage (ก่อน/หลังเริ่มเล่น) ไว้เป็นเบาะแสได้
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        if (!isMountedRef.current) return
        setIsVideoLoading(false)
        video.play().catch((err) => console.log('รอผู้ใช้กด Play:', err))
      })
      video.addEventListener('playing', () => {
        hasStartedPlayingRef.current = true
      }, { once: true })
      video.addEventListener('error', () => {
        if (!isMountedRef.current) return
        const stage = hasStartedPlayingRef.current ? 'MID-STREAM (หลังเริ่มเล่นแล้ว)' : 'INITIAL LOAD (ก่อนเริ่มเล่น)'
        console.error(
          `[useCameraStream] Safari native HLS error — camera: ${cameraId} | stage: ${stage} ` +
          '(หมายเหตุ: Safari native player ไม่ส่ง HTTP status code มาให้ตรวจ 401 ได้ตรงๆ)'
        )
        setIsVideoLoading(false)
        setHasStreamError(true)
      })
    }
  }, [cameraId])

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

      console.error(`[useCameraStream] ขอ stream-token ไม่สำเร็จ — camera: ${cameraId} | status: ${error?.response?.status ?? 'network error'}`, error)
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
    hasStartedPlayingRef.current = false
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