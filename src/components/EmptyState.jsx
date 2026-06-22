import { FaInbox } from 'react-icons/fa'

function EmptyState({ 
  icon, 
  title = 'No data found', 
  description = '' 
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {icon || <FaInbox />}
      </div>
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
    </div>
  )
}

export default EmptyState