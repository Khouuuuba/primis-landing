import { useState, useEffect, useCallback } from 'react';
import './FilesPanel.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const FOLDERS = {
  datasets: {
    icon: '📊',
    label: 'Datasets',
    description: 'Training data, CSV, JSON, images',
  },
  models: {
    icon: '🧠',
    label: 'Models',
    description: 'Model weights, checkpoints, configs',
  },
  outputs: {
    icon: '📁',
    label: 'Outputs',
    description: 'Generated results, logs, exports',
  },
};

const FILE_ICONS = {
  // Data
  csv: '📄',
  json: '📋',
  parquet: '🗃️',
  // Images
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  webp: '🖼️',
  // Models
  pt: '🔮',
  pth: '🔮',
  onnx: '⚡',
  safetensors: '🔐',
  // Code
  py: '🐍',
  ipynb: '📓',
  // Archives
  zip: '📦',
  tar: '📦',
  gz: '📦',
  // Default
  default: '📄',
};

function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function getFileType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? `.${ext}` : '';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function FilesPanel({ user }) {
  const [files, setFiles] = useState([]);
  const [storage, setStorage] = useState(null);
  const [folderCounts, setFolderCounts] = useState({ datasets: 0, models: 0, outputs: 0 });
  const [selectedFolder, setSelectedFolder] = useState('datasets');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const fetchFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/files?folder=${selectedFolder}`, {
        headers: {
          'x-privy-id': user?.id || 'demo-user',
        },
      });
      const data = await response.json();
      
      if (data.success) {
        setFiles(data.files || []);
        setStorage(data.storage);
        if (data.folderCounts) {
          setFolderCounts(data.folderCounts);
        }
      } else {
        setError(data.error || 'Failed to load files');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  }, [selectedFolder, user?.id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Auto-dismiss messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', selectedFolder);
      
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      const response = await fetch(`${API_URL}/api/files/upload`, {
        method: 'POST',
        headers: {
          'x-privy-id': user?.id || 'demo-user',
        },
        body: formData,
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(`${file.name} uploaded successfully`);
        fetchFiles();
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const handleDelete = async (folder, filename) => {
    if (!confirm(`Delete "${filename}"? This action cannot be undone.`)) return;
    
    try {
      const response = await fetch(`${API_URL}/api/files/${folder}/${filename}`, {
        method: 'DELETE',
        headers: {
          'x-privy-id': user?.id || 'demo-user',
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess('File deleted');
        fetchFiles();
      } else {
        setError(data.error || 'Delete failed');
      }
    } catch (err) {
      setError('Delete failed');
    }
  };

  const handleDownload = async (folder, filename) => {
    try {
      const response = await fetch(`${API_URL}/api/files/download/${folder}/${filename}`, {
        headers: {
          'x-privy-id': user?.id || 'demo-user',
        },
      });
      
      const data = await response.json();
      
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      } else {
        setError(data.error || 'Download failed');
      }
    } catch (err) {
      setError('Download failed');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  };

  // Filter files by search query
  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="files-panel">
      {/* Header */}
      <div className="files-header">
        <div className="files-title">
          <h2>Files</h2>
          <span className="files-subtitle">
            Upload datasets, models, and manage your outputs
          </span>
        </div>
        
        {storage && (
          <div className="storage-indicator">
            <span className="storage-label">Storage Used</span>
            <div className="storage-bar">
              <div 
                className="storage-bar-fill" 
                style={{ width: `${Math.min(parseFloat(storage.percentUsed), 100)}%` }}
              />
            </div>
            <span className="storage-text">
              {storage.usedGB} GB of {storage.maxGB} GB
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="files-message error">
          <span className="message-icon">✕</span>
          <span className="message-text">{error}</span>
          <button className="message-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {success && (
        <div className="files-message success">
          <span className="message-icon">✓</span>
          <span className="message-text">{success}</span>
          <button className="message-close" onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Main Content */}
      <div className="files-content">
        {/* Sidebar */}
        <div className="files-sidebar">
          {/* Folder Navigation */}
          <div className="folder-nav">
            <div className="folder-nav-header">Folders</div>
            <div className="folder-list">
              {Object.entries(FOLDERS).map(([key, folder]) => (
                <button
                  key={key}
                  className={`folder-item ${selectedFolder === key ? 'active' : ''}`}
                  onClick={() => setSelectedFolder(key)}
                >
                  <div className="folder-icon">{folder.icon}</div>
                  <div className="folder-details">
                    <span className="folder-name">{folder.label}</span>
                    <span className="folder-count">
                      {folderCounts[key] || 0} files
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Upload Card */}
          <div className="upload-card">
            <div className="upload-card-header">Upload Files</div>
            <div 
              className={`upload-zone ${dragOver ? 'drag-over' : ''} ${isUploading ? 'uploading' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isUploading ? (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span>Uploading... {uploadProgress}%</span>
                </div>
              ) : (
                <>
                  <div className="upload-icon">↑</div>
                  <p>Drop files here</p>
                  <span className="upload-hint">or click to browse</span>
                  <label className="upload-btn">
                    Select File
                    <input 
                      type="file" 
                      onChange={handleFileInput}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span className="upload-limit">Max 500MB per file</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Area */}
        <div className="files-main">
          {/* Search */}
          <div className="files-search">
            <span className="search-icon">🔍</span>
            <input 
              type="text"
              placeholder={`Search in ${FOLDERS[selectedFolder].label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* File List */}
          <div className="files-list-container">
            <div className="files-list-header">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>
            
            <div className="files-list">
              {isLoading ? (
                <div className="files-loading">
                  <div className="loading-spinner" />
                  <span>Loading files...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="files-empty">
                  <div className="empty-icon">{FOLDERS[selectedFolder].icon}</div>
                  <h3>
                    {searchQuery 
                      ? 'No matching files' 
                      : `No files in ${FOLDERS[selectedFolder].label}`}
                  </h3>
                  <p>
                    {searchQuery 
                      ? 'Try a different search term'
                      : FOLDERS[selectedFolder].description}
                  </p>
                </div>
              ) : (
                filteredFiles.map((file, index) => (
                  <div 
                    key={file.id || index} 
                    className="file-row"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className="col-name">
                      <div className="file-icon">{getFileIcon(file.name)}</div>
                      <div className="file-info">
                        <span className="file-name">{file.name}</span>
                        <span className="file-type">{getFileType(file.name)}</span>
                      </div>
                    </div>
                    <div className="col-size">{formatBytes(file.size)}</div>
                    <div className="col-date">{formatDate(file.createdAt)}</div>
                    <div className="col-actions">
                      <button 
                        className="action-btn"
                        onClick={() => handleDownload(file.folder, file.name)}
                        title="Download"
                      >
                        ↓
                      </button>
                      <button 
                        className="action-btn delete"
                        onClick={() => handleDelete(file.folder, file.name)}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FilesPanel;
