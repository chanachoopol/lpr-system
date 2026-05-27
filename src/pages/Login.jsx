import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import cctvImg from '../assets/cctv.png'
import '../styles/Login.css'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    console.log('username:', username)
    console.log('password:', password)
    console.log('remember:', remember)
  }

  return (
    <div className="bg">
      <div className="glow-1"></div>
      <div className="glow-2"></div>

      <div className="card">

        {/* ฝั่งซ้าย */}
        <div className="card-left">
          <img src={cctvImg} alt="CCTV" className="cctv-img" />
          <div className="left-bottom">
            <p>Smart Security</p>
            <span>AI-Powered LPR</span>
          </div>
        </div>

        {/* ฝั่งขวา */}
        <div className="card-right">
          <h2 className="r-title">Welcome back !</h2>
          <p className="r-sub">Sign in to access the system</p>

          <form onSubmit={handleSubmit}>

            <div className="f-group">
              <label className="f-label">Username</label>
              <div className="f-row">
                <input
                  type="text"
                  className="f-box"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="f-group">
              <label className="f-label">Password</label>
              <div className="f-row">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="f-box"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <span
                    className="eye-icon"
                    onClick={() => setShowPassword(!showPassword)}
                    >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                </span>
              </div>
            </div>

            <div className="remember">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <label htmlFor="remember">Remember me</label>
            </div>

            <button type="submit" className="btn">Access Control</button>

          </form>

          <p className="forgot">
            Forgot password? <span>Contact admin</span>
          </p>
        </div>

      </div>
    </div>
  )
}

export default Login