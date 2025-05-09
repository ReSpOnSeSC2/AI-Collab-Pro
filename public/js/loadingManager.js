/**
 * Loading Manager for AI Collaboration Hub
 * Provides UI for progress indication during multi-model collaboration
 * Version: 1.0.1
 */

class LoadingManager {
  constructor() {
    this.overlay = null;
    this.progressBar = null;
    this.progressText = null;
    this.modelStatusContainer = null;
    this.modelStatuses = {};
    this.cancelCallback = null;
    this.totalModels = 0;
    this.completedModels = 0;
    this.abortController = null;
    this.isVisible = false;
    
    // Wait for document to be ready before creating the overlay
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.createLoadingOverlay());
    } else {
      this.createLoadingOverlay();
    }
  }
  
  /**
   * Creates the loading overlay DOM elements
   */
  createLoadingOverlay() {
    console.log("LoadingManager: Creating loading overlay");
    
    // Check if the overlay already exists
    if (document.getElementById('collaboration-loading')) {
      console.log("LoadingManager: Loading overlay already exists, referencing existing elements");
      this.overlay = document.getElementById('collaboration-loading');
      this.progressBar = document.getElementById('progress-bar');
      this.progressText = document.getElementById('progress-text');
      this.modelStatusContainer = document.getElementById('model-status-container');
      return;
    }
    
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.id = 'collaboration-loading';
    this.overlay.className = 'collaboration-loading hidden';
    
    // Create content
    const content = `
      <div class="loading-content">
        <div class="loading-spinner">
          <div class="spinner">
            <div class="double-bounce1"></div>
            <div class="double-bounce2"></div>
          </div>
        </div>
        <div class="loading-title">AI Collaboration in Progress</div>
        <div class="loading-subtitle">Multiple AI models are working together on your request</div>
        
        <div class="progress-container">
          <div id="progress-bar" class="progress-bar"></div>
        </div>
        <div id="progress-text" class="progress-text">0% Complete</div>
        
        <div id="model-status-container" class="model-status-container">
          <!-- Model status items will be added here -->
        </div>
        
        <button id="cancel-collaboration" class="cancel-button">Cancel Collaboration</button>
      </div>
    `;
    
    this.overlay.innerHTML = content;
    
    // Append to body
    document.body.appendChild(this.overlay);
    console.log("LoadingManager: Loading overlay added to document body");
    
    // Cache elements
    this.progressBar = document.getElementById('progress-bar');
    this.progressText = document.getElementById('progress-text');
    this.modelStatusContainer = document.getElementById('model-status-container');
    
    // Set up cancel button
    const cancelButton = document.getElementById('cancel-collaboration');
    cancelButton.addEventListener('click', () => {
      console.log("LoadingManager: Cancel button clicked");
      if (this.cancelCallback) {
        this.cancelCallback();
      }
      this.hide();
    });
    
    console.log("LoadingManager: Loading overlay created and initialized");
  }
  
  /**
   * Shows the loading overlay
   * @param {Array<string>} models - Array of model IDs being used
   * @param {Function} cancelCallback - Function to call when cancel is clicked
   */
  show(models, cancelCallback) {
    console.log("LoadingManager.show: Showing loading overlay for models:", models);
    
    // Make sure the overlay is created
    if (!this.overlay) {
      console.log("LoadingManager.show: Overlay not found, creating it");
      this.createLoadingOverlay();
    }
    
    // Reset state
    this.totalModels = models.length;
    this.completedModels = 0;
    this.modelStatuses = {};
    this.cancelCallback = cancelCallback;
    this.abortController = new AbortController();
    this.isVisible = true;
    
    // Initialize model statuses
    models.forEach(model => {
      this.modelStatuses[model] = {
        status: 'pending',
        name: this.formatModelName(model)
      };
    });
    
    // Update UI
    this.updateProgressBar();
    this.updateModelStatusList();
    
    // Directly access and show the overlay to ensure it's visible
    if (document.getElementById('collaboration-loading')) {
      const overlay = document.getElementById('collaboration-loading');
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
      overlay.style.visibility = 'visible';
      overlay.classList.remove('hidden');
      console.log("LoadingManager.show: Forced overlay to be visible");
    } else {
      console.warn("LoadingManager.show: Could not find collaboration-loading element");
    }
    
    return this.abortController.signal;
  }
  
  /**
   * Hides the loading overlay
   */
  hide() {
    console.log("LoadingManager.hide: Hiding loading overlay");
    
    // Try to access overlay both from our instance and directly from DOM
    let overlayElement = this.overlay;
    if (!overlayElement) {
      overlayElement = document.getElementById('collaboration-loading');
    }
    
    if (overlayElement) {
      overlayElement.classList.add('hidden');
      // Also set inline styles to ensure hiding
      overlayElement.style.opacity = '0';
      overlayElement.style.visibility = 'hidden';
      console.log("LoadingManager.hide: Loading screen hidden");
    } else {
      console.warn("LoadingManager.hide: Could not find overlay element to hide");
    }
    
    // Abort any in-progress operations
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.isVisible = false;
  }
  
  /**
   * Updates the status of a specific model
   * @param {string} modelId - The ID of the model to update
   * @param {string} status - The new status ('pending', 'processing', 'completed', 'failed')
   * @param {string} message - Optional status message
   */
  updateModelStatus(modelId, status, message = '') {
    // Only process updates if we have a valid model ID
    if (!modelId) {
      console.warn("LoadingManager: Attempted to update status for undefined model ID");
      return;
    }
    
    console.log(`LoadingManager: Updating ${modelId} status to ${status}`);
    
    // Initialize model status if it doesn't exist
    if (!this.modelStatuses[modelId]) {
      this.modelStatuses[modelId] = {
        status: status,
        name: this.formatModelName(modelId),
        message: message
      };
    } else {
      // Don't "downgrade" statuses (e.g., don't change from completed to processing)
      const currentStatus = this.modelStatuses[modelId].status;
      if (currentStatus === 'completed' || currentStatus === 'failed') {
        if (status !== 'cancelled') {
          console.log(`LoadingManager: Ignoring status update for ${modelId} (${currentStatus} → ${status})`);
          return;
        }
      }
      
      this.modelStatuses[modelId].status = status;
      if (message) {
        this.modelStatuses[modelId].message = message;
      }
    }
    
    // If a model completes or fails, update the count
    if ((status === 'completed' || status === 'failed' || status === 'cancelled') && 
        !['completed', 'failed', 'cancelled'].includes(this.modelStatuses[modelId].previousStatus)) {
      this.completedModels++;
      this.modelStatuses[modelId].previousStatus = status;
    }
    
    if (!this.isVisible) {
      console.log("LoadingManager: Status updated but loading UI is not visible");
      return;
    }
    
    this.updateProgressBar();
    this.updateModelStatusList();
  }
  
  /**
   * Updates the progress bar based on completed models
   */
  updateProgressBar() {
    console.log(`LoadingManager.updateProgressBar: ${this.completedModels}/${this.totalModels} models completed`);
    
    // Get a reference to the progress bar
    let progressBar = this.progressBar;
    let progressText = this.progressText;
    
    // If we don't have references to these elements, try to get them from the DOM
    if (!progressBar) {
      progressBar = document.getElementById('progress-bar');
    }
    if (!progressText) {
      progressText = document.getElementById('progress-text');
    }
    
    if (!progressBar || !progressText) {
      console.warn("LoadingManager.updateProgressBar: Could not find progress elements");
      return;
    }
    
    const progress = this.totalModels > 0 ? (this.completedModels / this.totalModels) * 100 : 0;
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}% Complete`;
    
    console.log(`LoadingManager.updateProgressBar: Progress set to ${progress}%`);
    
    // Only auto-hide for individual mode
    // For collaboration modes, we'll wait for the explicit cost_info or collaboration_complete message
    // to ensure the full response is displayed in the chat
    if (progress >= 100 && window._appState?.collaboration?.mode === 'individual') {
      console.log("LoadingManager.updateProgressBar: 100% complete in individual mode, auto-hiding in 1.5s");
      setTimeout(() => this.hide(), 1500);
    } else if (progress >= 100) {
      console.log("LoadingManager.updateProgressBar: 100% complete in collaboration mode, waiting for full completion");
    }
  }
  
  /**
   * Updates the model status list in the UI
   */
  updateModelStatusList() {
    console.log("LoadingManager.updateModelStatusList: Updating model status list");
    
    // Get container reference
    let container = this.modelStatusContainer;
    if (!container) {
      container = document.getElementById('model-status-container');
      if (!container) {
        console.warn("LoadingManager.updateModelStatusList: Could not find model status container");
        return;
      }
    }
    
    // Clear current status list
    container.innerHTML = '';
    
    // Add status items
    Object.entries(this.modelStatuses).forEach(([modelId, data]) => {
      console.log(`LoadingManager.updateModelStatusList: Adding status for ${modelId}: ${data.status}`);
      
      const statusItem = document.createElement('div');
      statusItem.className = `model-status-item ${data.status}`;
      
      statusItem.innerHTML = `
        <span class="model-name">${data.name}</span>
        <span class="status ${data.status}">${data.status}</span>
      `;
      
      container.appendChild(statusItem);
    });
  }
  
  /**
   * Formats model ID to a friendly display name
   * @param {string} modelId - The raw model ID
   * @returns {string} A formatted name for display
   */
  formatModelName(modelId) {
    // Extract provider name
    let provider = modelId;
    if (modelId.includes('-')) {
      provider = modelId.split('-')[0];
    }
    
    // Capitalize provider name
    provider = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    return provider;
  }
}

// Create and export singleton instance
const loadingManager = new LoadingManager();
export default loadingManager;