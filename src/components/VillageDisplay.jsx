import React from 'react'
import useVillageStore, { getVillageInfo, getHistoricalVillages } from '../store/villageStore'
export function renderVillageDisplay(villageId, directName, currentVillages = []) {
  if (!villageId && !directName) return '-'

  // 1. ถ้ามีชื่อหมู่บ้านส่งมาโดยตรง (directName) ให้แสดงผลทันที
  if (directName && directName !== '-') {
    return <span>{directName}</span>
  }

  // 2. ถ้ามี villageId และตรงกับหมู่บ้านในระบบ Active
  if (villageId) {
    const current = currentVillages.find((v) => String(v.id) === String(villageId))
    if (current) {
      return <span>{current.name}</span>
    }
  }

  // 3. Otherwise, village is deleted / historical -> Show name with deleted note
  const hist = getHistoricalVillages()
  const name = directName || (villageId ? hist[villageId] : null) || 'หมู่บ้านที่ไม่ทราบชื่อ'

  return (
    <div>
      <span>{name}</span>
      <span
        style={{
          fontSize: 11,
          color: '#94a3b8',
          display: 'block',
          marginTop: 2,
          fontWeight: 500
        }}
      >
        (หมู่บ้านนี้ถูกลบออกจากระบบแล้ว)
      </span>
    </div>
  )
}

export default function VillageDisplay({ villageId, directName }) {
  const villages = useVillageStore((state) => state.villages)
  return renderVillageDisplay(villageId, directName, villages)
}