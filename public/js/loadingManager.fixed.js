/**
 * Loading Manager for AI Collaboration Hub
 * Provides UI for progress indication during multi-model collaboration
 * Version: 1.0.2 (Fixed)
 */

class LoadingManager {
  constructor() {
    this.overlay = null;
    this.progressBar = null;
    this.progressText = null;
    this.modelStatusContainer = null;
    this.phaseTitleElement = null; // Added for phase title
    this.modelStatuses = {};
    this.cancelCallback = null;
    this.totalModelsInPhase = 0; // Modified to track models per phase
    this.completedModelsInPhase = 0; // Modified to track models per phase
    this.abortController = null;
    this.isVisible = false;

    // Create the loading overlay immediately on instantiation
    this.createLoadingOverlay();

    // Also make sure it's created when the DOM is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.createLoadingOverlay());
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
      this.progressBarElement = this.progressBar; // Add alias for consistency
      this.progressText = document.getElementById('progress-text');
      this.modelStatusContainer = document.getElementById('model-status-container');
      this.phaseTitleElement = document.getElementById('loading-phase-title'); // Get phase title element
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
        <div id="loading-phase-title" class="loading-phase-title">Initializing...</div>
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
    this.progressBarElement = this.progressBar; // Add alias for consistency
    this.progressText = document.getElementById('progress-text');
    this.modelStatusContainer = document.getElementById('model-status-container');
    this.phaseTitleElement = document.getElementById('loading-phase-title');
    
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
   * Updates the loading screen for a new collaboration phase.
   * @param {string} phaseName - The name of the new phase.
   * @param {Array<string>} modelsInPhase - Array of model IDs active in this phase.
   */
  updateForPhase(phaseName, modelsInPhase) {
    console.log(`LoadingManager: Updating for phase "${phaseName}" with models:`, modelsInPhase);
    if (!this.overlay || !document.getElementById('collaboration-loading')) {
      this.createLoadingOverlay();
    }

    if (this.phaseTitleElement) {
        this.phaseTitleElement.textContent = phaseName || 'Processing...';
    }

    this.totalModelsInPhase = modelsInPhase.length;
    this.completedModelsInPhase = 0;
    this.modelStatuses = {}; // Reset statuses for the new phase

    modelsInPhase.forEach(model => {
      this.modelStatuses[model] = {
        status: 'pending', // Or 'processing' if they start immediately
        name: this.formatModelName(model)
      };
    });

    this.updateProgressBar();
    this.updateModelStatusList();

    // Ensure overlay is visible
    if (this.overlay) {
        this.overlay.style.display = 'flex';
        this.overlay.style.opacity = '1';
        this.overlay.style.visibility = 'visible';
        this.overlay.classList.remove('hidden');
        this.isVisible = true;
    }
  }

  /**
   * Shows the loading overlay
   * @param {Array<string>} models - Array of model IDs being used
   * @param {Function} cancelCallback - Function to call when cancel is clicked
   */
  show(models, cancelCallback) {
    console.log("LoadingManager.show: Showing loading overlay for models:", models);

    // Make sure the overlay is created
    if (!this.overlay || !document.getElementById('collaboration-loading')) {
      console.log("LoadingManager.show: Overlay not found, creating it");
      this.createLoadingOverlay();
    }

    // Reset state
    this.totalModelsInPhase = models.length;
    this.completedModelsInPhase = 0;
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

    // Set initial phase title
    if (this.phaseTitleElement) {
      this.phaseTitleElement.textContent = 'Phase 1: Initializing Collaboration';
    }
    
    // Update UI
    this.updateProgressBar();
    this.updateModelStatusList();
    
    // Force the loading screen to be displayed with inline styles
    this.overlay = document.getElementById('collaboration-loading');
    if (this.overlay) {
      this.overlay.style.display = 'flex';
      this.overlay.style.opacity = '1';
      this.overlay.style.visibility = 'visible';
      this.overlay.classList.remove('hidden');
      
      // Add a debug message to the loading screen to verify it's working
      const debugMessage = document.createElement('div');
      debugMessage.style.color = 'white';
      debugMessage.style.marginTop = '10px';
      debugMessage.style.fontSize = '12px';
      debugMessage.textContent = `Debug: ${models.length} models active`;
      
      const loadingContent = this.overlay.querySelector('.loading-content');
      if (loadingContent) {
        loadingContent.appendChild(debugMessage);
      }
      
      console.log("LoadingManager.show: Forced overlay to be visible with inline styles");
    } else {
      console.error("LoadingManager.show: Failed to find collaboration-loading element after creation");
    }
    
    return this.abortController.signal;
  }
  
  /**
   * Hides the loading overlay
   */
  hide() {
    console.log("LoadingManager.hide: Hiding loading overlay");

    // Get reference to overlay
    this.overlay = document.getElementById('collaboration-loading');

    if (this.overlay) {
      // Use both classList and inline styles to ensure hiding
      this.overlay.classList.add('hidden');
      this.overlay.style.opacity = '0';
      this.overlay.style.visibility = 'hidden';

      // Complete hiding after transition
      setTimeout(() => {
        this.overlay.style.display = 'none';
      }, 300);

      // Reset phase title on hide
      if (this.phaseTitleElement) {
        this.phaseTitleElement.textContent = 'Initializing...';
      }

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
   * @param {string} status - The new status ('pending', 'processing', 'completed', 'failed', 'phase_change')
   * @param {string} message - Optional status message
   */
  updateModelStatus(modelId, status, message = '') {
    // Only process updates if we have a valid model ID
    if (!modelId) {
      console.warn("LoadingManager: Attempted to update status for undefined model ID");
      return;
    }

    console.log(`LoadingManager: Updating ${modelId} status to ${status}`);

    // Special handling for phase_change status
    if (status === 'phase_change') {
      console.log(`LoadingManager: Phase change notification from ${modelId}: ${message}`);

      // Use the current active models from UI as a proxy for which models are in this phase
      const activeModelsForPhase = [];

      // First, gather all models that have entries in modelStatuses
      Object.keys(this.modelStatuses).forEach(model => {
        if (this.modelStatuses[model].status !== 'completed' &&
            this.modelStatuses[model].status !== 'failed' &&
            this.modelStatuses[model].status !== 'cancelled') {
          activeModelsForPhase.push(model);
        }
      });

      // Ensure current model is included
      if (!activeModelsForPhase.includes(modelId)) {
        activeModelsForPhase.push(modelId);
      }

      // Update for the new phase
      this.updateForPhase(message, activeModelsForPhase);
      return;
    }

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
        !['completed', 'failed', 'cancelled'].includes(this.modelStatuses[modelId]?.previousStatus)) {
      this.completedModelsInPhase++; // Use phase-specific counter
      if (this.modelStatuses[modelId]) this.modelStatuses[modelId].previousStatus = status;
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
    console.log(`LoadingManager.updateProgressBar: ${this.completedModelsInPhase}/${this.totalModelsInPhase} models completed in current phase`);

    // Get references to progress elements
    this.progressBar = document.getElementById('progress-bar');
    this.progressText = document.getElementById('progress-text');

    if (!this.progressBar || !this.progressText) {
      console.warn("LoadingManager.updateProgressBar: Could not find progress elements");
      return;
    }

    let progress = this.totalModelsInPhase > 0 ? (this.completedModelsInPhase / this.totalModelsInPhase) * 100 : 0;
    
    // Show some progress even when models are just processing
    if (progress === 0 && this.totalModelsInPhase > 0) {
      // Count how many models are actively processing
      const processingCount = Object.values(this.modelStatuses).filter(model => 
        model.status === 'processing'
      ).length;
      
      if (processingCount > 0) {
        // Show 5-30% progress based on how many models are processing
        const processingProgress = Math.min(30, 5 + (processingCount * 8));
        progress = Math.max(progress, processingProgress);
        console.log(`LoadingManager: Showing processing progress: ${processingProgress}% for ${processingCount} processing models`);
      }
    }
    
    this.progressBar.style.width = `${progress}%`;
    this.progressText.textContent = `${Math.round(progress)}% Complete`;

    console.log(`LoadingManager.updateProgressBar: Progress set to ${progress}%`);

    // For 100% progress, just log it but don't auto-hide
    // The main.js will handle hiding based on 'cost_info' or 'collaboration_cancelled'
    if (progress >= 100) {
      console.log("LoadingManager.updateProgressBar: 100% complete for current phase.");
      // Do not auto-hide here for multi-phase collaborations
    }
  }
  
  /**
   * Updates the model status list in the UI
   */
  updateModelStatusList() {
    console.log("LoadingManager.updateModelStatusList: Updating model status list");
    
    // Get container reference
    this.modelStatusContainer = document.getElementById('model-status-container');
    
    if (!this.modelStatusContainer) {
      console.warn("LoadingManager.updateModelStatusList: Could not find model status container");
      return;
    }
    
    // Clear current status list
    this.modelStatusContainer.innerHTML = '';
    
    // Add status items
    Object.entries(this.modelStatuses).forEach(([modelId, data]) => {
      console.log(`LoadingManager.updateModelStatusList: Adding status for ${modelId}: ${data.status}`);
      
      const statusItem = document.createElement('div');
      statusItem.className = `model-status-item ${data.status}`;
      
      statusItem.innerHTML = `
        <span class="model-name">${data.name}</span>
        <span class="status ${data.status}">${data.status}</span>
      `;
      
      this.modelStatusContainer.appendChild(statusItem);
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

// Make sure the loading screen is initialized when this script loads
document.addEventListener('DOMContentLoaded', () => {
  console.log("LoadingManager: DOM Content Loaded event - ensuring loading screen is created");
  if (!document.getElementById('collaboration-loading')) {
    loadingManager.createLoadingOverlay();
  }
});

// Export the singleton instance
export default loadingManager;