/**
 * Files & Folders Manager
 * Manages the AI's access to the user's file system with approval workflow
 * Version: 1.2.0
 */

class FilesFoldersManager {
  constructor() {
    // Private properties
    this._mcpClient = null;
    this._pendingUIOperations = [];
    this._standaloneMode = false;
    this._timeoutId = null;

    // State properties
    this.isInitialized = false;
    this.currentPath = '/';
    this.activeContext = null;
    this.pendingOperations = [];
    
    // File System Access API properties
    this.fileSystemHandle = null;
    this.hasWritePermission = false;
    this.fileSystemItemName = '';

    // Cache DOM elements when ready
    this._initializeDomElements();
    
    // Automatically initialize when document is loaded
    if (document.readyState === 'complete') {
      this.initialize();
    } else {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    }
  }

  /**
   * Initialize DOM element references
   * @private
   */
  _initializeDomElements() {
    // We'll initialize these on demand to avoid issues with elements not existing yet
    this.filesFoldersPanel = null;
    this.modificationPanel = null;
    this.directoryPathInput = null;
    this.directoryNavigator = null;
    this.accessStatusSection = null;
    this.activeDirectorySpan = null;
    this.fileList = null;
    this.pathBreadcrumb = null;
    this.pendingCount = null;
    this.pendingBadge = null;
    this.noModifications = null;
    this.modificationsList = null;
    this.batchActions = null;
    
    // Buttons - we'll initialize these on demand too
    this.toggleBtn = null;
    this.closeFilesBtn = null;
    this.closeModificationsBtn = null;
    this.browseDirectoryBtn = null;
    this.grantAccessBtn = null;
    this.revokeAccessBtn = null;
    this.refreshFilesBtn = null;
    this.approveAllBtn = null;
    this.rejectAllBtn = null;
  }
  
  /**
   * Force the creation of an MCP client by directly opening a new WebSocket if needed
   * @returns {Promise<object|null>} A promise that resolves to the MCP client or null
   */
  forceConnectMcpClient() {
    return new Promise((resolve, reject) => {
      console.log('Files & Folders Manager: Force connecting MCP client');
      
      // First check if we already have a client
      if (this._mcpClient) {
        console.log('Files & Folders Manager: Already have a client, using it');
        resolve(this._mcpClient);
        return;
      }
      
      // Try to get a WebSocket from the ConnectionManager
      let socket = null;
      if (window.ConnectionManager && window.ConnectionManager.getWebSocket) {
        socket = window.ConnectionManager.getWebSocket();
      }
      
      // If we have a valid socket and MCPClient, create a client
      if (socket && socket.readyState === WebSocket.OPEN && window.MCPClient) {
        try {
          console.log('Files & Folders Manager: Creating MCP client from existing socket');
          const client = window.MCPClient.createClient(socket);
          
          if (client) {
            this._mcpClient = client;
            
            // Set user ID if available
            if (window._appState && window._appState.userId) {
              client.setUserId(window._appState.userId);
            }
            
            // Show connection success notification
            this.showNotification('Connected to server successfully', 'success');
            
            resolve(client);
            return;
          }
        } catch (e) {
          console.error('Files & Folders Manager: Error creating MCP client during force connect', e);
        }
      }
      
      // If we couldn't create a client with existing resources, try a direct standalone connection
      console.log('Files & Folders Manager: Falling back to standalone mode');
      this._standaloneMode = true;
      resolve(null); // No real MCP client in standalone mode
    });
  }

  /**
   * Initialize the Files & Folders Manager
   * @param {MCPClient} mcpClient - The MCP client instance (optional)
   */
  initialize(mcpClient = null) {
    if (this.isInitialized) {
      console.log('Files & Folders Manager: Already initialized, ignoring duplicate call');
      return;
    }

    console.log('Files & Folders Manager: Initializing with MCP client', mcpClient);
    
    // If no client is provided, try to get it from window._app state
    if (!mcpClient && window._app && window._app.getMcpClient) {
      mcpClient = window._app.getMcpClient();
      console.log('Files & Folders Manager: Got MCP client from window._app', mcpClient);
    }
    
    // Set up MCP client available listener
    window.addEventListener('mcp-client-available', (event) => {
      if (event.detail && event.detail.client) {
        console.log('Files & Folders Manager: Received mcp-client-available event with client');
        this.mcpClient = event.detail.client;
      }
    });

    // Set up event listeners for UI
    this._setupEventListeners();
    
    // Use the provided client if available
    if (mcpClient) {
      this.mcpClient = mcpClient;
      console.log('Files & Folders Manager: Using provided MCP client');
    } else {
      // Try to force connect to get a client
      this.forceConnectMcpClient().then(client => {
        if (client) {
          console.log('Files & Folders Manager: Successfully force connected');
        } else {
          console.log('Files & Folders Manager: Force connect did not yield a client, using standalone mode');
          this._standaloneMode = true;
        }
      }).catch(err => {
        console.error('Files & Folders Manager: Error during force connect:', err);
        this._standaloneMode = true;
      });
    }
    
    // Set initialized flag
    this.isInitialized = true;
    console.log('Files & Folders Manager: Initialized');
  }

  /**
   * Set up event listeners for UI elements
   * @private
   */
  _setupEventListeners() {
    // We'll set these up on demand when the toggle panel is called
    // This avoids issues with elements not being in the DOM yet
  }

  /**
   * Ensures that all required DOM elements are available
   * @private
   */
  _ensureDomElements() {
    // Panel elements
    if (!this.filesFoldersPanel) {
      this.filesFoldersPanel = document.getElementById('files-folders-panel');
    }
    if (!this.modificationPanel) {
      this.modificationPanel = document.getElementById('modification-panel');
    }
    
    // Input fields
    if (!this.directoryPathInput) {
      this.directoryPathInput = document.getElementById('directory-path');
    }
    
    // Containers
    if (!this.directoryNavigator) {
      this.directoryNavigator = document.querySelector('.directory-navigator');
    }
    if (!this.accessStatusSection) {
      this.accessStatusSection = document.getElementById('access-status');
    }
    if (!this.activeDirectorySpan) {
      this.activeDirectorySpan = document.getElementById('active-directory');
    }
    if (!this.fileList) {
      this.fileList = document.getElementById('file-list');
    }
    if (!this.pathBreadcrumb) {
      this.pathBreadcrumb = document.getElementById('path-breadcrumb');
    }
    
    // Notification elements
    if (!this.pendingCount) {
      this.pendingCount = document.getElementById('pending-count');
    }
    if (!this.pendingBadge) {
      this.pendingBadge = document.querySelector('.pending-modifications');
    }
    if (!this.noModifications) {
      this.noModifications = document.getElementById('no-modifications');
    }
    if (!this.modificationsList) {
      this.modificationsList = document.getElementById('modifications-list');
    }
    if (!this.batchActions) {
      this.batchActions = document.getElementById('batch-actions');
    }
    
    // Buttons
    if (!this.toggleBtn) {
      this.toggleBtn = document.getElementById('toggle-files-folders');
    }
    if (!this.closeFilesBtn) {
      this.closeFilesBtn = document.getElementById('close-files-panel');
    }
    if (!this.closeModificationsBtn) {
      this.closeModificationsBtn = document.getElementById('close-modifications');
    }
    if (!this.browseDirectoryBtn) {
      this.browseDirectoryBtn = document.getElementById('browse-directory');
    }
    if (!this.grantAccessBtn) {
      this.grantAccessBtn = document.getElementById('grant-access');
    }
    if (!this.revokeAccessBtn) {
      this.revokeAccessBtn = document.getElementById('revoke-access');
    }
    if (!this.refreshFilesBtn) {
      this.refreshFilesBtn = document.getElementById('refresh-files');
    }
    if (!this.approveAllBtn) {
      this.approveAllBtn = document.getElementById('approve-all');
    }
    if (!this.rejectAllBtn) {
      this.rejectAllBtn = document.getElementById('reject-all');
    }
  }

  /**
   * Getter for MCP client - always returns the most up-to-date client
   * @returns {MCPClient} The MCP client
   */
  get mcpClient() {
    // First try to use the stored client
    if (this._mcpClient) {
      return this._mcpClient;
    }

    // If no stored client, try to get it from window._app
    if (window._app && window._app.getMcpClient) {
      const client = window._app.getMcpClient();
      if (client) {
        // If we found a client, store it for future use
        this._mcpClient = client;
        return client;
      }
    }

    // No client available
    return null;
  }

  /**
   * Setter for MCP client - allows updating the MCP client after initialization
   * @param {MCPClient} client - The MCP client to use
   */
  set mcpClient(client) {
    if (!client) {
      console.warn('Files & Folders Manager: Attempt to set null MCP client ignored');
      return;
    }

    this._mcpClient = client;
    
    // Set user ID if available
    if (window._appState && window._appState.userId) {
      client.setUserId(window._appState.userId);
    }
    
    // Process any pending operations
    this._processPendingUIOperations();
  }

  /**
   * Show/hide the files panel
   */
  toggleFilesPanel() {
    console.log('Files & Folders Manager: Toggle Files Panel');
    
    // Ensure DOM elements are available
    this._ensureDomElements();

    if (!this.filesFoldersPanel) {
      console.error('Files & Folders Manager: Files panel element not found');
      return;
    }
    
    // Set up event listeners if not already done
    this._setupPanelEventListeners();

    if (this.filesFoldersPanel.classList.contains('show')) {
      this.closeFilesPanel();
    } else {
      // Make panel visible first
      this.filesFoldersPanel.classList.remove('d-none');
      
      // Force reflow
      window.getComputedStyle(this.filesFoldersPanel).getPropertyValue('right');
      
      // Now add the show class to trigger the animation
      this.filesFoldersPanel.classList.add('show');
      
      // Try to connect if we don't have a client
      if (!this.mcpClient && !this._standaloneMode) {
        this.showNotification('Connecting to server...', 'info');
        
        // Clear any existing timeout
        if (this._timeoutId) {
          clearTimeout(this._timeoutId);
        }
        
        // Try to force connect
        this.forceConnectMcpClient().then(client => {
          if (client) {
            console.log('Files & Folders Manager: Connected to server');
          } else {
            this._standaloneMode = true;
            console.log('Files & Folders Manager: Using standalone mode after connection attempt');
          }
        }).catch(err => {
          console.error('Files & Folders Manager: Error during connection:', err);
          this._standaloneMode = true;
        });
        
        // Set a timeout to move to standalone mode if connection takes too long
        this._timeoutId = setTimeout(() => {
          if (!this.mcpClient) {
            console.log('Files & Folders Manager: Connection timeout, moving to standalone mode');
            this._standaloneMode = true;
            this.showNotification('Using standalone mode (no server connection)', 'warning');
          }
        }, 5000);
      }
    }
  }
  
  /**
   * Set up event listeners for panel elements
   * @private
   */
  _setupPanelEventListeners() {
    // Only set up if not already done
    if (this._eventListenersInitialized) {
      return;
    }
    
    // Ensure elements exist
    this._ensureDomElements();
    
    // Panel toggle buttons
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleFilesPanel();
      });
    }
    
    if (this.closeFilesBtn) {
      this.closeFilesBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.closeFilesPanel();
      });
    }
    
    if (this.closeModificationsBtn) {
      this.closeModificationsBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.closeModificationsPanel();
      });
    }
    
    // File operation buttons
    if (this.browseDirectoryBtn) {
      this.browseDirectoryBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.browseDirectory(e);
      });
    }
    
    if (this.grantAccessBtn) {
      this.grantAccessBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.grantAccess();
      });
    }
    
    if (this.revokeAccessBtn) {
      this.revokeAccessBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.revokeAccess();
      });
    }
    
    // Mark as initialized
    this._eventListenersInitialized = true;
  }
  
  /**
   * Close the files panel
   */
  closeFilesPanel() {
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    if (!this.filesFoldersPanel) {
      return;
    }
    
    // Remove the show class to trigger the slide-out animation
    this.filesFoldersPanel.classList.remove('show');
    
    // Wait for the animation to finish before hiding the element
    setTimeout(() => {
      if (this.filesFoldersPanel) {
        this.filesFoldersPanel.classList.add('d-none');
      }
    }, 300);
  }
  
  /**
   * Show/hide the modifications panel
   */
  toggleModificationsPanel() {
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    if (!this.modificationPanel) {
      return;
    }
    
    if (this.modificationPanel.classList.contains('show')) {
      this.closeModificationsPanel();
    } else {
      // Make panel visible first
      this.modificationPanel.classList.remove('d-none');
      
      // Force reflow
      window.getComputedStyle(this.modificationPanel).getPropertyValue('right');
      
      // Now add the show class to trigger the animation
      this.modificationPanel.classList.add('show');
    }
  }
  
  /**
   * Close the modifications panel
   */
  closeModificationsPanel() {
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    if (!this.modificationPanel) {
      return;
    }
    
    // Remove the show class to trigger the slide-out animation
    this.modificationPanel.classList.remove('show');
    
    // Wait for the animation to finish before hiding the element
    setTimeout(() => {
      if (this.modificationPanel) {
        this.modificationPanel.classList.add('d-none');
      }
    }, 300);
  }
  
  /**
   * Browse for a directory
   * @param {Event} event - The event that triggered the browse action
   */
  browseDirectory(event) {
    // Use the File System Access API if available
    if (window.showFileSystemPicker) {
      try {
        window.showFileSystemPicker(event);
      } catch (error) {
        console.error('Error in showFileSystemPicker:', error);
        this.showNotification('Error selecting directory or file', 'danger');
      }
    } else {
      // Fallback to prompt
      this._promptForDirectory();
    }
  }
  
  /**
   * Fallback method to prompt the user for a directory path
   * @private
   */
  _promptForDirectory() {
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    if (!this.directoryPathInput) {
      this.showNotification('Error: Could not find directory input field', 'danger');
      return;
    }
    
    const path = prompt('Enter the absolute path to the directory or file:', '/');
    if (path) {
      this.directoryPathInput.value = path;
    }
  }
  
  /**
   * Set the file system handle from the File System Access API
   * @param {FileSystemHandle} handle - The file system handle
   * @param {string} displayName - The name to display
   * @param {boolean} hasWriteAccess - Whether the handle has write access
   * @returns {boolean} Whether the handle was set successfully
   */
  setFileSystemHandle(handle, displayName, hasWriteAccess) {
    if (!handle) {
      return false;
    }
    
    this.fileSystemHandle = handle;
    this.fileSystemItemName = displayName || handle.name || 'Selected item';
    this.hasWritePermission = hasWriteAccess;
    
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    // Update the display in the input field if needed
    if (this.directoryPathInput) {
      this.directoryPathInput.value = this.fileSystemItemName;
    }
    
    return true;
  }
  
  /**
   * Grant access to the selected directory or file
   */
  async grantAccess() {
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    if (!this.directoryPathInput || !this.directoryPathInput.value) {
      this.showNotification('Please select a directory or file first', 'warning');
      return;
    }
    
    // Show the standalone mode if we're in it
    if (this._standaloneMode) {
      this.setupStandaloneMode();
      return;
    }
    
    // Use MCP client if available
    const client = this.mcpClient;
    if (!client) {
      // Try to force connect
      this.showNotification('Connecting to server...', 'info');
      
      try {
        const newClient = await this.forceConnectMcpClient();
        if (newClient) {
          // Retry with the new client
          setTimeout(() => this.grantAccess(), 500);
        } else {
          // Fall back to standalone mode
          this.setupStandaloneMode();
        }
      } catch (error) {
        console.error('Error during force connect:', error);
        this.setupStandaloneMode();
      }
      
      return;
    }
    
    // Continue with normal MCP access
    try {
      this.showNotification('Requesting access...', 'info');
      
      if (this.fileSystemHandle) {
        // Create an MCP context with the item name
        const permissions = this.hasWritePermission
          ? ['read', 'write', 'delete', 'create_directory']
          : ['read'];
          
        const response = await client.registerContext(this.fileSystemItemName, {
          description: 'AI-Collab file access via File System Access API',
          permissions: permissions,
          fileSystemAccessApi: true,
          itemType: this.fileSystemHandle.kind || 'unknown'
        });
        
        if (response.token) {
          this.activeContext = {
            token: response.token,
            directory: this.fileSystemItemName,
            handle: this.fileSystemHandle,
            isFileSystemAccessApi: true
          };
          
          // Update UI
          if (this.directoryNavigator) this.directoryNavigator.classList.remove('d-none');
          if (this.accessStatusSection) this.accessStatusSection.classList.remove('d-none');
          if (this.activeDirectorySpan) this.activeDirectorySpan.textContent = this.fileSystemItemName;
          
          // Show success message
          this.showNotification(`Access granted to: ${this.fileSystemItemName}`, 'success');
        }
      } else {
        // Traditional path-based access
        const response = await client.registerContext(this.directoryPathInput.value, {
          description: 'AI-Collab file access',
          permissions: ['read', 'write', 'delete', 'create_directory']
        });
        
        if (response.token) {
          this.activeContext = {
            token: response.token,
            directory: response.directory
          };
          
          // Update UI
          if (this.directoryNavigator) this.directoryNavigator.classList.remove('d-none');
          if (this.accessStatusSection) this.accessStatusSection.classList.remove('d-none');
          if (this.activeDirectorySpan) this.activeDirectorySpan.textContent = response.directory;
          
          // Show success message
          this.showNotification(`Access granted to: ${response.directory}`, 'success');
        }
      }
    } catch (error) {
      console.error('Error granting access:', error);
      this.showNotification(`Failed to grant access: ${error.message || 'Unknown error'}`, 'danger');
    }
  }
  
  /**
   * Sets up standalone mode using File System Access API without MCP client
   * @returns {boolean} True if setup was successful
   */
  setupStandaloneMode() {
    if (!this.fileSystemHandle) {
      this.showNotification('Please select a directory or file first', 'warning');
      return false;
    }
    
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    // Set up a local context without MCP
    this.activeContext = {
      token: 'local-file-access-only',
      directory: this.fileSystemItemName,
      handle: this.fileSystemHandle,
      isFileSystemAccessApi: true,
      isStandaloneMode: true
    };
    
    // Update UI
    if (this.directoryNavigator) this.directoryNavigator.classList.remove('d-none');
    if (this.accessStatusSection) this.accessStatusSection.classList.remove('d-none');
    if (this.activeDirectorySpan) this.activeDirectorySpan.textContent = this.fileSystemItemName + ' (standalone mode)';
    
    // Show success message
    this.showNotification('Using standalone mode (direct file system access)', 'info');
    
    return true;
  }
  
  /**
   * Revoke access to the current directory or file
   */
  revokeAccess() {
    // Just clear the local context
    this.activeContext = null;
    this.fileSystemHandle = null;
    this.fileSystemItemName = '';
    this.hasWritePermission = false;
    
    // Ensure DOM elements are available
    this._ensureDomElements();
    
    // Update UI
    if (this.directoryNavigator) this.directoryNavigator.classList.add('d-none');
    if (this.accessStatusSection) this.accessStatusSection.classList.add('d-none');
    if (this.activeDirectorySpan) this.activeDirectorySpan.textContent = 'None';
    if (this.fileList) this.fileList.innerHTML = '';
    
    // Show notification
    this.showNotification('Access revoked', 'info');
  }
  
  /**
   * Add a pending UI operation to process when MCP client becomes available
   * @param {string} operation - Name of the operation
   * @param {Function} callback - The function to call when MCP client is available
   */
  addPendingOperation(operation, callback) {
    this._pendingUIOperations.push({ operation, callback });
  }
  
  /**
   * Process any pending UI operations
   * @private
   */
  _processPendingUIOperations() {
    if (this._pendingUIOperations.length === 0) {
      return;
    }
    
    const operations = [...this._pendingUIOperations];
    this._pendingUIOperations = [];
    
    for (const op of operations) {
      try {
        op.callback();
      } catch (error) {
        console.error(`Error processing pending ${op.operation}:`, error);
      }
    }
  }
  
  /**
   * Show a notification to the user
   * @param {string} message - The notification message
   * @param {string} type - The notification type (success, info, warning, danger)
   */
  showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Use UIManager if available
    if (window.UIManager && typeof window.UIManager.showNotification === 'function') {
      window.UIManager.showNotification(message, type);
    } else {
      // Fall back to alert for critical messages
      if (type === 'danger' || type === 'warning') {
        alert(message);
      }
    }
  }
  
  /**
   * Cleans up resources
   */
  destroy() {
    // Clean up any resources
    this.isInitialized = false;
    this._eventListenersInitialized = false;
    
    // Clear any timeouts
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }
}

// Create singleton instance
const filesFoldersManager = new FilesFoldersManager();

// Expose to global window for easy access from all scripts
window.filesFoldersManager = filesFoldersManager;

// Export for modules
export { filesFoldersManager };