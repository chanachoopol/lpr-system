import { FaCheck, FaXmark } from 'react-icons/fa6'
import { checkPasswordRules, getPasswordStrength, PASSWORD_RULES } from '../utils/passwordPolicy'

// แสดงแถบความแข็งแรง + checklist ทีละข้อ ให้ user เห็นว่าขาดอะไรแบบ real-time
// ใช้ร่วมกันทั้งหน้า ResetPassword / ChangePassword (และหน้า set-password ในอนาคตถ้ามี)
function PasswordStrengthMeter({ password = '' }) {
  if (!password) return null

  const rules = checkPasswordRules(password)
  const { score, label } = getPasswordStrength(password)

  const barColors = ['#dc2626', '#ea580c', '#eab308', '#16a34a', '#15803d']

  const checklist = [
    { key: 'minLength', label: `อย่างน้อย ${PASSWORD_RULES.minLength} ตัวอักษร`, pass: rules.minLength },
    { key: 'hasLetter', label: 'มีตัวอักษรอย่างน้อย 1 ตัว', pass: rules.hasLetter },
    { key: 'hasNumber', label: 'มีตัวเลขอย่างน้อย 1 ตัว', pass: rules.hasNumber },
    { key: 'hasSpecialChar', label: 'มีอักขระพิเศษอย่างน้อย 1 ตัว (เช่น ! @ # $ %)', pass: rules.hasSpecialChar }
  ]

  return (
    <div className="pw-strength-meter">
      <div className="pw-strength-bar-track">
        <div
          className="pw-strength-bar-fill"
          style={{
            width: `${(score / 4) * 100}%`,
            background: barColors[score]
          }}
        />
      </div>
      {label && (
        <p className="pw-strength-label" style={{ color: barColors[score] }}>
          ความแข็งแรง: {label}
        </p>
      )}

      <ul className="pw-strength-checklist">
        {checklist.map((item) => (
          <li key={item.key} className={item.pass ? 'pw-check-pass' : 'pw-check-fail'}>
            {item.pass ? <FaCheck /> : <FaXmark />}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default PasswordStrengthMeter