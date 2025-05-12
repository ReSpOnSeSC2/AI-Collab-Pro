/**
 * File System Access Helper - Utilities for browser's File System Access API
 * Provides global functions for accessing the filesystem through the browser API
 * Version: 1.1.0
 */

// Store file system handles for persistence between sessions
const storedHandles = new Map();

/**
 * Shows the file system picker dialog, allowing users to select files or directories
 * @param {Event} event - The triggering event (optional)
 * @param {Object} options - Options for the picker
 * @param {boolean} options.directory - Whether to show directory picker instead of file picker
 * @param {boolean} options.multiple - Whether to allow multiple file selection
 * @returns {Promise<FileSystemHandle|FileSystemHandle[]|null>} The selected file handle(s)
 */
export async function showFileSystemPicker(event, options = {}) {
  console.log('fileSystemAccessHelper: showFileSystemPicker called', event, options);

  // Prevent default behavior if event provided
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  // Stop propagation if event provided
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }

  // Check if File System Access API is supported
  if (!window.showOpenFilePicker || !window.showDirectoryPicker) {
    console.error('File System Access API is not supported in this browser');
    alert('Your browser does not support direct file system access. Please use Chrome, Edge, or another Chromium-based browser.');
    return null;
  }

  try {
    console.log('fileSystemAccessHelper: Showing file system picker dialog');
    let handle;
    const { directory = true, multiple = false } = options;

    // Show the appropriate picker based on options
    if (directory) {
      console.log('fileSystemAccessHelper: Showing directory picker');
      handle = await window.showDirectoryPicker({
        id: 'ai-collab-directory',
        mode: 'readwrite', // Request read/write access
        startIn: 'documents'
      });
    } else if (multiple) {
      console.log('fileSystemAccessHelper: Showing multiple file picker');
      handle = await window.showOpenFilePicker({
        id: 'ai-collab-files',
        multiple: true,
        types: [{
          description: 'All Files',
          accept: {'*/*': []}
        }]
      });
    } else {
      console.log('fileSystemAccessHelper: Showing single file picker');
      const handles = await window.showOpenFilePicker({
        id: 'ai-collab-file',
        multiple: false,
        types: [{
          description: 'All Files',
          accept: {'*/*': []}
        }]
      });
      handle = handles[0];
    }

    console.log('fileSystemAccessHelper: File System Access selected handle', handle);

    // Store the handle for future use
    if (handle) {
      if (Array.isArray(handle)) {
        // Multiple files selected
        handle.forEach(h => {
          storedHandles.set(h.name, h);
        });
      } else {
        // Single file or directory selected
        storedHandles.set(handle.name, handle);
      }

      // If filesFoldersManager exists, set the handle there
      if (window.filesFoldersManager) {
        console.log('fileSystemAccessHelper: Setting handle in filesFoldersManager');
        // Check if we need write permission and should request it
        let writePermission = false;
        
        try {
          if (handle.kind === 'directory') {
            // Request write permission for directories
            const opts = { mode: 'readwrite' };
            writePermission = (await handle.requestPermission(opts)) === 'granted';
            console.log('fileSystemAccessHelper: Write permission granted:', writePermission);
          }
        } catch (error) {
          console.error('fileSystemAccessHelper: Error requesting write permission:', error);
        }
        
        // Update the file system handle in filesFoldersManager
        const displayName = Array.isArray(handle) 
          ? `${handle.length} files selected` 
          : handle.name;
        
        window.filesFoldersManager.setFileSystemHandle(handle, displayName, writePermission);
        
        // Trigger grant access on the filesFoldersManager
        console.log('fileSystemAccessHelper: Calling grantAccess on filesFoldersManager');
        window.filesFoldersManager.grantAccess();
      } else {
        console.error('fileSystemAccessHelper: filesFoldersManager not found in window');
      }
    }

    return handle;
  } catch (error) {
    // Handle common errors
    if (error.name === 'AbortError') {
      console.log('fileSystemAccessHelper: User cancelled the picker');
    } else {
      console.error('fileSystemAccessHelper: Error selecting file/directory', error);
      alert(`Error accessing file system: ${error.message}`);
    }
    return null;
  }
}

/**
 * Attempts to read a file from a FileSystemFileHandle
 * @param {FileSystemFileHandle} fileHandle - The file handle to read
 * @returns {Promise<{content: string, error: string|null}>} Object containing file content or error
 */
export async function readFileFromHandle(fileHandle) {
  console.log('fileSystemAccessHelper: readFileFromHandle called', fileHandle);
  
  if (!fileHandle || fileHandle.kind !== 'file') {
    return { content: null, error: 'Invalid file handle' };
  }

  try {
    // Request read permission
    const opts = { mode: 'read' };
    const permissionState = await fileHandle.queryPermission(opts);
    
    if (permissionState !== 'granted') {
      // Request permission if not already granted
      const requestResult = await fileHandle.requestPermission(opts);
      if (requestResult !== 'granted') {
        return { content: null, error: 'Permission denied to read file' };
      }
    }

    // Get file from handle
    const file = await fileHandle.getFile();
    
    // Check file size before reading
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return { content: null, error: 'File is too large (maximum 50MB)' };
    }

    // Read the file based on file type
    if (file.type.startsWith('text/') || 
        file.type === 'application/json' || 
        file.type === 'application/javascript' || 
        file.name.match(/\.(txt|js|jsx|ts|tsx|md|html|css|json|xml|yaml|yml|py|java|c|cpp|cs|go|rs|php|rb|pl|sh|bat|ps1)$/i)) {
      // Text file - read as text
      const content = await file.text();
      return { content, error: null };
    } else {
      // Binary file - read as base64 for potential display
      const buffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      return { 
        content: base64, 
        isBase64: true, 
        mimeType: file.type || getMimeTypeFromExtension(file.name),
        error: null 
      };
    }
  } catch (error) {
    console.error('fileSystemAccessHelper: Error reading file:', error);
    return { content: null, error: `Error reading file: ${error.message}` };
  }
}

/**
 * Get a mime type from a file extension
 * @param {string} filename - The filename to check
 * @returns {string} The mime type or 'application/octet-stream' if unknown
 */
function getMimeTypeFromExtension(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'zip': 'application/zip',
    'xml': 'application/xml',
    'csv': 'text/csv'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

// Export utility functions
export const fileSystemUtil = {
  showFileSystemPicker,
  readFileFromHandle,
  getStoredHandles: () => new Map(storedHandles),
  hasStoredHandle: (name) => storedHandles.has(name),
  getStoredHandle: (name) => storedHandles.get(name)
};

// Make available globally
window.showFileSystemPicker = showFileSystemPicker;
window.fileSystemUtil = fileSystemUtil;

console.log('fileSystemAccessHelper: Module loaded and global functions registered');