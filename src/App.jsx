import { useState } from 'react'
import Navbar from './components/Navbar'

function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <Navbar title="LPR System" />
      
      <p>Sidebar: {isOpen ? 'เปิดอยู่' : 'ปิดอยู่'}</p>
      
      <button onClick={() => setIsOpen(!isOpen)}>
        กดเปิด/ปิด Sidebar
      </button>
    </div>
  )
}

export default App