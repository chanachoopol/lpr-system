import { useEffect } from 'react'
import { FaMapMarkerAlt } from 'react-icons/fa'
import useAuthStore from '../store/authStore'
import useVillageStore from '../store/villageStore'

// Superadmin: เห็น dropdown เลือกหมู่บ้าน (รวม "ทุกหมู่บ้าน")
// Admin/User: เห็นแค่ badge ชื่อหมู่บ้านตัวเอง กดเปลี่ยนไม่ได้
function VillageSelector() {
  const { user } = useAuthStore()
  const {
    villages,
    isLoadingVillages,
    selectedVillageId,
    fetchVillages,
    setSelectedVillage
  } = useVillageStore()

  // โหลดรายชื่อหมู่บ้านทุกครั้งที่มี user (fetchVillages เองมี guard กันยิงซ้ำอยู่แล้ว)
  useEffect(() => {
    if (!user) return
    fetchVillages()
  }, [user, fetchVillages])

  if (!user) return null

  // Superadmin — เลือกดูหมู่บ้านไหนก็ได้ รวมถึง "ทุกหมู่บ้าน"
  if (user.role === 'superadmin') {
    return (
      <div className="village-select-wrap">
        <FaMapMarkerAlt className="village-select-icon" />
        <select
          className="village-select"
          value={selectedVillageId || 'all'}
          onChange={(e) => setSelectedVillage(e.target.value === 'all' ? null : e.target.value)}
          disabled={isLoadingVillages}
        >
          <option value="all">ทุกหมู่บ้าน</option>
          {villages.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // Admin / User — โชว์อย่างเดียว ดูได้แค่หมู่บ้านตัวเอง
  const villageName = villages.find((v) => v.id === user.village_id)?.name

  return (
    <div className="village-badge">
      <FaMapMarkerAlt className="village-badge-icon" />
      <span>{isLoadingVillages ? 'กำลังโหลด...' : villageName || '-'}</span>
    </div>
  )
}

export default VillageSelector