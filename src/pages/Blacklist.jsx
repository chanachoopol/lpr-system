import { useState, useEffect } from 'react'
import { FaTriangleExclamation, FaTrashCan, FaXmark } from 'react-icons/fa6'
import { FaCar, FaSearch } from 'react-icons/fa'
import toast, { Toaster } from 'react-hot-toast'
import Layout from '../components/Layout'
import useAuthStore from '../store/authStore'
import { mockBlacklistData, mockBlacklistFoundToday } from '../data/mockData'
import '../styles/Blacklist.css'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'



function Blacklist() {
  const { user } = useAuthStore()
  const [blacklist, setBlacklist] = useState(mockBlacklistData)
  const [searchInput, setSearchInput] = useState('')
  const [filteredData, setFilteredData] = useState(mockBlacklistData)
  const [showFoundModal, setShowFoundModal] = useState(false)
 
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 800)
  }, [])


  // ฟังก์ชัน search
  function handleSearch(e) {
  const keyword = e.target.value
  setSearchInput(keyword)
  const result = blacklist.filter(item =>
    item.plate.toLowerCase().includes(keyword.toLowerCase()) ||
    item.province.includes(keyword)
  )
  setFilteredData(result)
}

  // ฟังก์ชันลบรายการ
  function handleDelete(id, plate) {
    toast((t) => (
      <div className="toast-confirm">
        <p>Delete <strong>{plate}</strong> from blacklist?</p>
        <div className="toast-buttons">
          <button
            className="toast-btn confirm"
            onClick={() => {
              const updated = blacklist.filter(item => item.id !== id)
              setBlacklist(updated)
              setFilteredData(updated)
              toast.dismiss(t.id)
              toast.success(`${plate} removed from blacklist`)
            }}
          >
            Confirm
          </button>
          <button
            className="toast-btn cancel"
            onClick={() => toast.dismiss(t.id)}
          >
            Cancel
          </button>
        </div>
      </div>
    ), { duration: 5000 })
  }

  return (
    <Layout title="Blacklist">
      <Toaster position="top-right" />
      <div className="blacklist-wrapper">

        {/* KPI Cards */}
        <div className="bl-kpi-row">
          <div className="bl-kpi-card">
            <div className="bl-kpi-icon red">
              <FaTriangleExclamation />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Total Blacklist</p>
              <h2 className="bl-kpi-val">{blacklist.length}</h2>
            </div>
          </div>

          <div
            className="bl-kpi-card clickable"
            onClick={() => setShowFoundModal(true)}
          >
            <div className="bl-kpi-icon orange">
              <FaCar />
            </div>
            <div className="bl-kpi-info">
              <p className="bl-kpi-label">Found Today</p>
              <h2 className="bl-kpi-val">{mockBlacklistFoundToday.length}</h2>
            </div>
            <span className="bl-kpi-hint">Click to view →</span>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="bl-table-header">
            <div className="bl-table-title">
              <FaTriangleExclamation className="bl-title-icon" />
              <div>
                <h3 className="card-title" style={{ margin: 0 }}>
                  Blacklist Records
                </h3>
                <p className="bl-description">
                  รายการยานพาหนะที่ถูกขึ้นบัญชีดำในระบบทั้งหมด
                  ข้อมูลจะไม่ถูก reset ทุกวัน
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="bl-search-wrap">
              <FaSearch className="bl-search-icon" />
              <input
                type="text"
                placeholder="Search plate / province..."
                value={searchInput}
                onChange={handleSearch}
                className="bl-search-input"
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="bl-table">
              <thead>
                <tr>
                  <th>License Plate</th>
                  <th>Province</th>
                  <th>Reason</th>
                  <th>Date Added</th>
                  {user?.role === 'admin' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 5 : 4}>
                      <Spinner text="Loading blacklist..." />
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="bl-plate-badge">{item.plate}</span>
                      </td>
                      <td>{item.province}</td>
                      <td>
                        <span className="bl-reason-badge">{item.reason}</span>
                      </td>
                      <td>{item.date}</td>
                      {user?.role === 'admin' && (
                        <td>
                          <button
                            className="btn-delete"
                            onClick={() => handleDelete(item.id, item.plate)}
                          >
                            <FaTrashCan />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 5 : 4}>
                      <EmptyState
                        icon={<FaTriangleExclamation />}
                        title="No blacklist records"
                        description="No vehicles found matching your search"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal Found Today */}
      {showFoundModal && (
        <div className="modal-overlay" onClick={() => setShowFoundModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Found Today — {mockBlacklistFoundToday.length} vehicles</h3>
              <button
                className="modal-close"
                onClick={() => setShowFoundModal(false)}
              >
                <FaXmark />
              </button>
            </div>
            <div className="modal-body-list">
              {mockBlacklistFoundToday.map((item) => (
                <div key={item.id} className="found-item">
                  <div className="found-item-left">
                    <FaTriangleExclamation className="found-icon" />
                    <div>
                      <span className="bl-plate-badge">{item.plate}</span>
                      <p className="found-province">{item.province}</p>
                    </div>
                  </div>
                  <span className="found-time">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}

export default Blacklist