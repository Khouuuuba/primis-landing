import { useState } from 'react'
import ChatInterface from './components/ChatInterface'
import Sidebar from './components/Sidebar'
import PreviewPanel from './components/PreviewPanel'
import './App.css'

function App() {
  const [currentApp, setCurrentApp] = useState(null)
  const [apps, setApps] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [previewApp, setPreviewApp] = useState(null)

  const handleNewApp = () => {
    setCurrentApp(null)
    setShowPreview(false)
  }

  const handleAppCreated = (app) => {
    setApps(prev => [app, ...prev])
    setCurrentApp(app)
    // Auto-show preview when app is created
    if (app.code?.files?.length > 0) {
      setPreviewApp(app)
      setShowPreview(true)
    }
  }

  const handleSelectApp = (app) => {
    setCurrentApp(app)
    if (app.code?.files?.length > 0) {
      setPreviewApp(app)
      setShowPreview(true)
    }
  }

  const handleClosePreview = () => {
    setShowPreview(false)
  }

  return (
    <div className="app-container">
      <Sidebar 
        apps={apps} 
        currentApp={currentApp}
        onSelectApp={handleSelectApp}
        onNewApp={handleNewApp}
      />
      <main className="main-content">
        <ChatInterface 
          currentApp={currentApp}
          onAppCreated={handleAppCreated}
          onShowPreview={() => {
            if (currentApp?.code) {
              setPreviewApp(currentApp)
              setShowPreview(true)
            }
          }}
        />
      </main>
      
      {showPreview && previewApp && (
        <PreviewPanel 
          app={previewApp}
          onClose={handleClosePreview}
        />
      )}
    </div>
  )
}

export default App
