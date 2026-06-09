import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FaSearch, FaEye, FaRedo } from 'react-icons/fa'
import { FaXmark } from 'react-icons/fa6'
import Layout from '../components/Layout'
import { mockHistoryData, mockCameraLocations } from '../data/mockData'
import '../styles/History.css'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { FaCalendarAlt } from 'react-icons/fa'

const ROWS_PER_PAGE = 10

function History() {
  const [searchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState('')
  const [selectedCamera, setSelectedCamera] = useState('all')
  const [filteredData, setFilteredData] = useState(mockHistoryData)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())

  // รับค่า search จาก URL (มาจาก Navbar search)
  useEffect(() => {
    const searchFromURL = searchParams.get('search')
    if (searchFromURL) {
      setSearchInput(searchFromURL)
      applyFilters(searchFromURL, selectedCamera)
    }
  }, [searchParams])

  // ฟังก์ชัน filter ข้อมูล
  function applyFilters(
  search = searchInput,
  camera = selectedCamera,
  date = selectedDate
) {
  const keyword = search.toLowerCase().trim()
  const result = mockHistoryData.filter((item) => {
    const matchSearch =
      keyword === '' ||
      item.plate.toLowerCase().includes(keyword) ||
      item.province.includes(keyword)
    const matchCamera = camera === 'all' || item.cameraId === camera
    const matchDate =
      date === null ||
      item.date === date.toLocaleDateString('th-TH')
    return matchSearch && matchCamera && matchDate
  })
  setFilteredData(result)
  setCurrentPage(1)
}

  function handleFilter() {
    applyFilters()
  }

  function handleReset() {
  setSearchInput('')
  setSelectedCamera('all')
  setSelectedDate(new Date())
  setFilteredData(mockHistoryData)
  setCurrentPage(1)
}

  // Pagination
  const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE)
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE
  const currentData = filteredData.slice(startIndex, startIndex + ROWS_PER_PAGE)

  return (
    <Layout title="History">
      <div className="history-wrapper">

        {/* ส่วนค้นหา */}
        <div className="content-card history-filter">
          <div className="filter-group">
            <label>Search License Plate / Province</label>
            <div className="filter-input-wrap">
              <FaSearch className="filter-icon" />
              <input
                type="text"
                placeholder="Type to search..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Camera</label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
            >
              <option value="all">All Cameras</option>
              {mockCameraLocations.map((cam) => (
                <option key={cam.id} value={cam.id}>
                    {cam.name}
                </option>
                ))}
            </select>
          </div>

          <div className="filter-buttons">
            <button className="btn-filter" onClick={handleFilter}>
              <FaSearch /> Filter
            </button>
            <div className="filter-group">
              <label>Date</label>
              <div className="filter-input-wrap">
                <FaCalendarAlt className="filter-icon" />
                <DatePicker
                  selected={selectedDate}
                  onChange={(date) => setSelectedDate(date)}
                  dateFormat="dd/MM/yyyy"
                  maxDate={new Date()}
                  className="datepicker-history"
                  placeholderText="Select date"
                />
              </div>
            </div>
            <button className="btn-reset" onClick={handleReset}>
                <FaRedo /> Reset
            </button>
          </div>
        </div>

        {/* ตาราง */}
        <div className="content-card">
          <div className="history-table-header">
            <h3 className="card-title" style={{ margin: 0 }}>Vehicle History</h3>
            <p className="history-total">
              Found <strong>{filteredData.length}</strong> records
            </p>
          </div>

          <div className="table-responsive">
            <table className="history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>License Plate</th>
                  <th>Province</th>
                  <th>Camera</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentData.length > 0 ? (
                  currentData.map((item, index) => (
                    <tr key={item.id}>
                      <td>{startIndex + index + 1}</td>
                      <td>{item.time}</td>
                      <td className="plate-text">{item.plate}</td>
                      <td>{item.province}</td>
                      <td>{item.cameraName}</td>
                      <td>
                        <button
                          className="btn-view"
                          onClick={() => setSelectedItem(item)}
                        >
                          <FaEye /> View
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="no-data">
                      No records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                ‹
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
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
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                ›
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Vehicle Detail</h3>
              <button className="modal-close" onClick={() => setSelectedItem(null)}>
                <FaXmark />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-img-section">
                <div className="modal-img-placeholder">
                  <p>Full Image</p>
                </div>
                <div className="modal-img-placeholder small">
                  <p>Plate Crop</p>
                </div>
              </div>
              <div className="modal-info">
                <div className="modal-info-row">
                  <span className="info-label">License Plate</span>
                  <span className="plate-text">{selectedItem.plate}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Province</span>
                  <span>{selectedItem.province}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Time</span>
                  <span>{selectedItem.time}</span>
                </div>
                <div className="modal-info-row">
                  <span className="info-label">Camera</span>
                  <span>{selectedItem.cameraName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}

export default History