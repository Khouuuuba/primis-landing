import { useState, useEffect } from 'react'
import './PreviewPanel.css'

function PreviewPanel({ app, onClose }) {
  const [activeTab, setActiveTab] = useState('preview')
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewError, setPreviewError] = useState(null)

  // Set first file as selected when app changes
  useEffect(() => {
    if (app?.code?.files?.length > 0) {
      setSelectedFile(app.code.files[0])
    }
  }, [app])

  if (!app) return null

  const files = app.code?.files || []

  // Get file icon based on extension
  const getFileIcon = (path) => {
    if (path.endsWith('.jsx') || path.endsWith('.js')) return '⚛️'
    if (path.endsWith('.css')) return '🎨'
    if (path.endsWith('.html')) return '📄'
    if (path.endsWith('.json')) return '📋'
    if (path.endsWith('.sql')) return '🗄️'
    if (path.endsWith('.md')) return '📝'
    return '📄'
  }

  // Get language for syntax highlighting
  const getLanguage = (path) => {
    if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript'
    if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript'
    if (path.endsWith('.css')) return 'css'
    if (path.endsWith('.html')) return 'html'
    if (path.endsWith('.json')) return 'json'
    if (path.endsWith('.sql')) return 'sql'
    return 'text'
  }

  // Simple syntax highlighting
  const highlightCode = (code, language) => {
    let highlighted = escapeHtml(code)
    
    if (language === 'javascript' || language === 'typescript') {
      // Keywords
      highlighted = highlighted.replace(
        /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|this|async|await|try|catch|throw|default|switch|case|break|continue|typeof|instanceof|null|undefined|true|false)\b/g,
        '<span class="hl-keyword">$1</span>'
      )
      // Strings
      highlighted = highlighted.replace(
        /(&quot;[^&]*&quot;|&#39;[^&]*&#39;|`[^`]*`)/g,
        '<span class="hl-string">$1</span>'
      )
      // Comments
      highlighted = highlighted.replace(
        /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
        '<span class="hl-comment">$1</span>'
      )
      // JSX tags
      highlighted = highlighted.replace(
        /(&lt;\/?[A-Z][a-zA-Z]*)/g,
        '<span class="hl-tag">$1</span>'
      )
      // Numbers
      highlighted = highlighted.replace(
        /\b(\d+\.?\d*)\b/g,
        '<span class="hl-number">$1</span>'
      )
    } else if (language === 'css') {
      // Selectors
      highlighted = highlighted.replace(
        /([.#]?[a-zA-Z_-][\w-]*)\s*\{/g,
        '<span class="hl-selector">$1</span> {'
      )
      // Properties
      highlighted = highlighted.replace(
        /([a-z-]+):/g,
        '<span class="hl-property">$1</span>:'
      )
      // Values
      highlighted = highlighted.replace(
        /:\s*([^;{]+)/g,
        ': <span class="hl-value">$1</span>'
      )
      // Comments
      highlighted = highlighted.replace(
        /(\/\*[\s\S]*?\*\/)/g,
        '<span class="hl-comment">$1</span>'
      )
    } else if (language === 'json') {
      // Keys
      highlighted = highlighted.replace(
        /(&quot;[^&]+&quot;):/g,
        '<span class="hl-property">$1</span>:'
      )
      // String values
      highlighted = highlighted.replace(
        /:\s*(&quot;[^&]*&quot;)/g,
        ': <span class="hl-string">$1</span>'
      )
      // Numbers
      highlighted = highlighted.replace(
        /:\s*(\d+)/g,
        ': <span class="hl-number">$1</span>'
      )
      // Booleans
      highlighted = highlighted.replace(
        /:\s*(true|false|null)/g,
        ': <span class="hl-keyword">$1</span>'
      )
    } else if (language === 'sql') {
      // Keywords
      highlighted = highlighted.replace(
        /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|UNIQUE|CHECK|AND|OR|IN|LIKE|BETWEEN|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|IF|EXISTS|CASCADE|CONSTRAINT|INT|INTEGER|TEXT|VARCHAR|BOOLEAN|TIMESTAMP|UUID|SERIAL|BIGINT|DECIMAL|FLOAT|DATE|TIME|DATETIME)\b/gi,
        '<span class="hl-keyword">$1</span>'
      )
      // Comments
      highlighted = highlighted.replace(
        /(--.*$)/gm,
        '<span class="hl-comment">$1</span>'
      )
      // Strings
      highlighted = highlighted.replace(
        /(&#39;[^&]*&#39;)/g,
        '<span class="hl-string">$1</span>'
      )
    }
    
    return highlighted
  }

  // Escape HTML entities
  const escapeHtml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // Group files by directory
  const groupedFiles = files.reduce((acc, file) => {
    const parts = file.path.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root'
    if (!acc[dir]) acc[dir] = []
    acc[dir].push(file)
    return acc
  }, {})

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div className="preview-tabs">
          <button 
            className={`preview-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            <span className="tab-icon">👁️</span>
            Preview
          </button>
          <button 
            className={`preview-tab ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            <span className="tab-icon">📄</span>
            Code
            <span className="file-count">{files.length}</span>
          </button>
        </div>
        
        <div className="preview-actions">
          <span className="app-name">{app.name}</span>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="preview-content">
        {activeTab === 'preview' ? (
          <div className="live-preview">
            <div className="preview-toolbar">
              <div className="browser-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <div className="preview-url">
                <span className="url-icon">🔒</span>
                <span className="url-text">preview-{app.id?.slice(-6)}.bob.primis.app</span>
              </div>
              <div className="preview-controls">
                <button className="control-btn" title="Refresh">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                  </svg>
                </button>
                <button className="control-btn" title="Open in new tab">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="preview-frame">
              {previewError ? (
                <div className="preview-error">
                  <span className="error-icon">⚠️</span>
                  <p>{previewError}</p>
                </div>
              ) : (
                <div className="preview-placeholder">
                  <div className="placeholder-content">
                    <span className="placeholder-icon">🚀</span>
                    <h3>Preview Coming Soon</h3>
                    <p>Live preview will be available when deployed.</p>
                    <p className="preview-hint">
                      For now, check the <strong>Code</strong> tab to see generated files.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="code-view">
            <div className="file-sidebar">
              <div className="file-sidebar-header">
                <span className="folder-icon">📁</span>
                <span>Files</span>
              </div>
              <div className="file-tree">
                {Object.entries(groupedFiles).map(([dir, dirFiles]) => (
                  <div key={dir} className="file-group">
                    {dir !== 'root' && (
                      <div className="dir-name">
                        <span className="dir-icon">📂</span>
                        {dir}
                      </div>
                    )}
                    {dirFiles.map((file, index) => (
                      <button
                        key={index}
                        className={`file-item ${selectedFile?.path === file.path ? 'active' : ''}`}
                        onClick={() => setSelectedFile(file)}
                      >
                        <span className="file-icon">{getFileIcon(file.path)}</span>
                        <span className="file-name">
                          {file.path.split('/').pop()}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="code-content">
              {selectedFile ? (
                <>
                  <div className="code-header">
                    <span className="file-path">{selectedFile.path}</span>
                    <button className="copy-btn" onClick={() => {
                      navigator.clipboard.writeText(selectedFile.content)
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy
                    </button>
                  </div>
                  <pre className={`code-block language-${getLanguage(selectedFile.path)}`}>
                    <code dangerouslySetInnerHTML={{ 
                      __html: highlightCode(selectedFile.content, getLanguage(selectedFile.path)) 
                    }} />
                  </pre>
                </>
              ) : (
                <div className="no-file-selected">
                  <p>Select a file to view its contents</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="preview-footer">
        <div className="footer-info">
          <span className="status-badge ready">Ready to Deploy</span>
          <span className="file-stats">{files.length} files generated</span>
        </div>
        <div className="footer-actions">
          <button className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </button>
          <button className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            Deploy — $29/mo
          </button>
        </div>
      </div>
    </div>
  )
}

export default PreviewPanel
