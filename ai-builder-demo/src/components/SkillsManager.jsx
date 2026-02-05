import { useState, useEffect, useRef } from 'react'
import './SkillsManager.css'

function SkillsManager({ instanceId, user, showToast, onClose }) {
  const [skills, setSkills] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSkill, setNewSkill] = useState({ name: '', content: '', description: '' })
  const fileInputRef = useRef(null)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

  // Fetch skills
  useEffect(() => {
    fetchSkills()
  }, [instanceId])

  const fetchSkills = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/skills?instanceId=${instanceId}`,
        { headers: { 'x-privy-id': user?.id } }
      )
      if (response.ok) {
        const data = await response.json()
        setSkills(data.skills || [])
        setStats(data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      showToast?.('Please upload a .md or .txt file', 'error')
      return
    }

    setUploading(true)
    
    try {
      const content = await file.text()
      const name = file.name.replace(/\.(md|txt)$/, '')
      
      const response = await fetch(`${API_URL}/api/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': user?.id
        },
        body: JSON.stringify({
          instanceId,
          name,
          content,
          filename: file.name
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        showToast?.(data.message || 'Skill added!', 'success')
        fetchSkills()
      } else {
        showToast?.(data.error || 'Failed to add skill', 'error')
      }
    } catch (err) {
      console.error('Upload error:', err)
      showToast?.('Failed to upload file', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle manual skill creation
  const handleCreateSkill = async () => {
    if (!newSkill.name || !newSkill.content) {
      showToast?.('Name and content are required', 'error')
      return
    }

    setUploading(true)
    
    try {
      const response = await fetch(`${API_URL}/api/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-privy-id': user?.id
        },
        body: JSON.stringify({
          instanceId,
          name: newSkill.name,
          content: newSkill.content,
          description: newSkill.description
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        showToast?.(data.message || 'Skill added!', 'success')
        setNewSkill({ name: '', content: '', description: '' })
        setShowAddForm(false)
        fetchSkills()
      } else {
        showToast?.(data.error || 'Failed to add skill', 'error')
      }
    } catch (err) {
      console.error('Create error:', err)
      showToast?.('Failed to create skill', 'error')
    } finally {
      setUploading(false)
    }
  }

  // Toggle skill
  const handleToggleSkill = async (skillId) => {
    try {
      const response = await fetch(`${API_URL}/api/skills/${skillId}/toggle`, {
        method: 'POST',
        headers: { 'x-privy-id': user?.id }
      })

      if (response.ok) {
        fetchSkills()
      }
    } catch (err) {
      console.error('Toggle error:', err)
    }
  }

  // Delete skill
  const handleDeleteSkill = async (skillId, skillName) => {
    if (!confirm(`Delete skill "${skillName}"?`)) return

    try {
      const response = await fetch(`${API_URL}/api/skills/${skillId}`, {
        method: 'DELETE',
        headers: { 'x-privy-id': user?.id }
      })

      if (response.ok) {
        showToast?.('Skill deleted', 'success')
        fetchSkills()
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  return (
    <div className="skills-manager">
      <div className="skills-header">
        <div className="skills-title">
          <span className="skills-icon">📚</span>
          <div>
            <h3>Skills & Knowledge</h3>
            <p>Teach your bot with .md files</p>
          </div>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {stats && (
        <div className="skills-stats">
          <div className="stat">
            <span className="stat-value">{stats.active}</span>
            <span className="stat-label">Active Skills</span>
          </div>
          <div className="stat">
            <span className="stat-value">{stats.tokenUsage}%</span>
            <span className="stat-label">Token Usage</span>
          </div>
          <div className="token-bar">
            <div 
              className="token-fill" 
              style={{ width: `${stats.tokenUsage}%` }}
            />
          </div>
        </div>
      )}

      <div className="skills-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button 
          className="upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {uploading ? 'Uploading...' : 'Upload .md File'}
        </button>
        <button 
          className="add-btn"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Write Skill
        </button>
      </div>

      {showAddForm && (
        <div className="add-skill-form">
          <input
            type="text"
            placeholder="Skill name (e.g., Return Policy)"
            value={newSkill.name}
            onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
          />
          <textarea
            placeholder="Skill content (what should the bot know?)"
            value={newSkill.content}
            onChange={(e) => setNewSkill({ ...newSkill, content: e.target.value })}
            rows={6}
          />
          <div className="form-actions">
            <button className="cancel-btn" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button 
              className="save-btn" 
              onClick={handleCreateSkill}
              disabled={uploading || !newSkill.name || !newSkill.content}
            >
              {uploading ? 'Saving...' : 'Add Skill'}
            </button>
          </div>
        </div>
      )}

      <div className="skills-list">
        {loading ? (
          <div className="skills-loading">Loading skills...</div>
        ) : skills.length === 0 ? (
          <div className="skills-empty">
            <span className="empty-icon">📖</span>
            <p>No skills yet</p>
            <p className="empty-hint">Upload a .md file to teach your bot new knowledge</p>
          </div>
        ) : (
          skills.map(skill => (
            <div key={skill.id} className={`skill-card ${!skill.is_active ? 'inactive' : ''}`}>
              <div className="skill-info">
                <div className="skill-name">
                  <span className="skill-file-icon">📄</span>
                  {skill.name}
                </div>
                <div className="skill-meta">
                  {skill.content_tokens} tokens • {skill.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div className="skill-actions">
                <button 
                  className={`toggle-btn ${skill.is_active ? 'active' : ''}`}
                  onClick={() => handleToggleSkill(skill.id)}
                  title={skill.is_active ? 'Disable' : 'Enable'}
                >
                  {skill.is_active ? '✓' : '○'}
                </button>
                <button 
                  className="delete-btn"
                  onClick={() => handleDeleteSkill(skill.id, skill.name)}
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="skills-footer">
        <p className="footer-note">
          💡 <strong>Pro tip:</strong> After adding skills, redeploy your bot to apply changes.
        </p>
      </div>
    </div>
  )
}

export default SkillsManager
