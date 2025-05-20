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
    
    // For time-based progress tracking
    this.lastProgressUpdate = null;
    this.baseProgress = 0;

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

    // Check if we're in Validated Consensus mode for special handling
    const isValidatedConsensus = window._appState?.collaboration?.mode === 'validated_consensus';
    if (isValidatedConsensus) {
      console.log(`LoadingManager: Special handling for Validated Consensus phase "${phaseName}"`);
      
      // Reset time-based progress tracking for the new phase
      this.lastProgressUpdate = Date.now();
      this.baseProgress = 0;
    }

    // Update phase title with visual emphasis for Validated Consensus
    if (this.phaseTitleElement) {
      this.phaseTitleElement.textContent = phaseName || 'Processing...';
      
      // Add visual emphasis for Validated Consensus mode
      if (isValidatedConsensus) {
        // Make phase transition more visible
        this.phaseTitleElement.style.animation = 'none';
        setTimeout(() => {
          this.phaseTitleElement.style.animation = 'phase-highlight 1s ease-in-out';
        }, 10);
      }
    }

    // Set up model counts for the new phase
    this.totalModelsInPhase = modelsInPhase.length;
    
    // Enhanced phase transition for Validated Consensus
    if (isValidatedConsensus) {
      // Log the phase change
      console.log(`LoadingManager: [ValidatedConsensus] Phase change: "${phaseName}" with ${modelsInPhase.length} models`);
      
      // If transitioning between phases, mark the current phase as complete
      if (Object.keys(this.modelStatuses).length > 0) {
        console.log(`LoadingManager: [ValidatedConsensus] Completing previous phase before transition`);
        this.completedModelsInPhase = this.totalModelsInPhase;
        
        // Force a progress update to show 100% for previous phase
        this.updateProgressBar();
      }
      
      // Always reset completion counter for new phase
      this.completedModelsInPhase = 0;
      
      // Save status of existing models before transition
      const existingStatuses = {...this.modelStatuses};
      
      // Reset statuses for the new phase
      this.modelStatuses = {};
      
      // Initialize all models in this phase as processing
      modelsInPhase.forEach(model => {
        this.modelStatuses[model] = {
          status: 'processing', 
          name: this.formatModelName(model),
          previousStatus: existingStatuses[model]?.status || null,
          phaseStarted: true  // Mark as having started in this phase
        };
      });
      
      // Always ensure there's visual progress even at the start of a phase
      // Minimum 5% progress to show activity
      this.completedModelsInPhase = Math.max(0, Math.floor(modelsInPhase.length * 0.05));
      
    } else {
      // Standard behavior for other collaboration modes
      this.completedModelsInPhase = 0;
      this.modelStatuses = {};
      
      // Initialize all models in this phase as pending
      modelsInPhase.forEach(model => {
        this.modelStatuses[model] = {
          status: 'pending',
          name: this.formatModelName(model),
          previousStatus: null
        };
      });
    }

    // Update UI elements
    this.updateProgressBar();
    this.updateModelStatusList();

    // Ensure overlay is visible with multiple techniques
    if (this.overlay) {
      // Use both CSS class and inline styles
      this.overlay.style.display = 'flex';
      this.overlay.style.opacity = '1';
      this.overlay.style.visibility = 'visible';
      this.overlay.classList.remove('hidden');
      
      // Ensure the overlay is actually visible in the DOM
      if (window.getComputedStyle(this.overlay).display !== 'flex') {
        console.log("LoadingManager: Forcing overlay visibility with !important style");
        this.overlay.setAttribute('style', 'display: flex !important; opacity: 1 !important; visibility: visible !important;');
      }
      
      this.isVisible = true;
    }
    
    // Enhanced DOM updates for Validated Consensus mode
    if (isValidatedConsensus) {
      // First immediate update
      this.updateProgressBar();
      this.updateModelStatusList();
      
      // Force multiple UI updates to ensure rendering
      for (let delay of [50, 150, 300]) {
        setTimeout(() => {
          if (this.isVisible) {
            console.log(`LoadingManager: [ValidatedConsensus] Forced UI update at ${delay}ms`);
            this.updateProgressBar();
            this.updateModelStatusList();
            
            // Add animation to progress bar to make changes more visible
            const progressBar = document.getElementById('progress-bar');
            if (progressBar) {
              progressBar.style.transition = 'width 0.3s ease-in-out';
            }
          }
        }, delay);
      }
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

    console.log(`LoadingManager: Updating ${modelId} status to ${status} with message "${message}"`);
    
    // Check if we're in Validated Consensus mode for special handling throughout
    const isValidatedConsensus = window._appState?.collaboration?.mode === 'validated_consensus';
    if (isValidatedConsensus) {
      console.log("LoadingManager: Extra handling for Validated Consensus mode");
    }

    // Special status mapping for Validated Consensus mode to ensure progression
    if (isValidatedConsensus) {
      // Log extra debug info to diagnose progression issues
      console.log(`LoadingManager: [ValidatedConsensus] Validated Consensus status update for ${modelId}: ${status} - "${message}". Current models in phase: ${this.totalModelsInPhase}, completed: ${this.completedModelsInPhase}`);
      
      // Force status interpretation based on message content for better phase tracking
      if (message) {
        if (message.toLowerCase().includes('phase')) {
          console.log(`LoadingManager: [ValidatedConsensus] ⭐ Phase indicator detected in message: "${message}"`);
          status = 'phase_change';
        } else if (message.toLowerCase().includes('draft completed') || 
                 message.toLowerCase().includes('verification completed') || 
                 message.toLowerCase().includes('revision completed') || 
                 message.toLowerCase().includes('response finalized')) {
          console.log(`LoadingManager: [ValidatedConsensus] ⭐ Completion indicator detected in message: "${message}"`);
          status = 'completed';
        }
      }
    }

    // Force any 'processing' status to get progress tracking in Validated Consensus mode
    if (isValidatedConsensus && status === 'processing') {
      console.log(`LoadingManager: [ValidatedConsensus] Processing status for ${modelId}, updating UI`);
      
      // Ensure model is registered even without explicit phase change
      if (!this.modelStatuses[modelId]) {
        this.modelStatuses[modelId] = {
          status: status,
          name: this.formatModelName(modelId),
          message: message || 'Processing...'
        };
      }
      
      // Make sure this model contributes to total count
      const activeModels = Object.keys(this.modelStatuses);
      this.totalModelsInPhase = Math.max(this.totalModelsInPhase, activeModels.length);
      
      // Force update the UI components
      this.updateProgressBar();
      this.updateModelStatusList();
      
      // Don't return - continue processing for potential phase detection
    }

    // Enhanced phase change detection - catch more phase transition indicators
    if (status === 'phase_change' || 
        (isValidatedConsensus && message && (
          message.toLowerCase().includes('phase') || 
          message.toLowerCase().includes('validation') ||
          message.toLowerCase().includes('draft') ||
          message.toLowerCase().includes('collecting') ||
          message.toLowerCase().includes('generating') ||
          message.toLowerCase().includes('finalizing') ||
          message.toLowerCase().includes('revising') ||
          message.toLowerCase().includes('checking') ||
          message.toLowerCase().includes('consensus')
        ))) {
      // Log additional debug information for Validated Consensus mode
      if (isValidatedConsensus) {
        console.log(`LoadingManager: [ValidatedConsensus] ⭐⭐ Phase change processing for ${modelId}: "${message}"`);
        console.log(`LoadingManager: [ValidatedConsensus] Current models in phase: ${this.totalModelsInPhase}, completed: ${this.completedModelsInPhase}`);
        console.log(`LoadingManager: [ValidatedConsensus] Active models: ${Object.keys(this.modelStatuses).join(', ')}`);
      }
      console.log(`LoadingManager: Phase change detected from ${modelId}: ${message}`);

      let phaseMessage = message;
      
      // Enhanced format message for validated consensus phases
      if (message?.toLowerCase().includes('validation')) {
        phaseMessage = "Phase 2: Validating Claims";
      } else if (message?.toLowerCase().includes('draft')) {
        phaseMessage = "Phase 1: Drafting Initial Responses";
      } else if (message?.toLowerCase().includes('synthesizing')) {
        phaseMessage = "Phase 3: Synthesizing Results";
      } else if (message?.toLowerCase().includes('revision')) {
        phaseMessage = "Phase 3: Revising Based on Feedback";
      } else if (message?.toLowerCase().includes('finalizing')) {
        phaseMessage = "Phase 3: Finalizing Response";
      } else if (message?.toLowerCase().includes('consensus')) {
        phaseMessage = "Phase 4: Building Consensus";
      } else if (message?.toLowerCase().includes('phase')) {
        // Already formatted as a phase message
      } else if (status === 'phase_change') {
        phaseMessage = message || "Next Phase";
      }

      // Use the current active models from UI as a proxy for which models are in this phase
      const activeModelsForPhase = [];

      // First, gather all models that have entries in modelStatuses
      Object.keys(this.modelStatuses).forEach(model => {
        if (this.modelStatuses[model].status !== 'failed' &&
            this.modelStatuses[model].status !== 'cancelled') {
          activeModelsForPhase.push(model);
        }
      });

      // Ensure current model is included
      if (!activeModelsForPhase.includes(modelId)) {
        activeModelsForPhase.push(modelId);
      }

      // For Validated Consensus, use completion to mark progress between phases
      if (isValidatedConsensus) {
        // Mark completed models for the current phase
        Object.keys(this.modelStatuses).forEach(model => {
          if (!activeModelsForPhase.includes(model)) {
            this.modelStatuses[model] = {
              ...this.modelStatuses[model],
              status: 'completed',
              previousStatus: 'completed'
            };
          }
        });
        
        // Force increment completions for phase change in Validated Consensus
        this.completedModelsInPhase = this.totalModelsInPhase;
      } else {
        // Reset completed models count for this new phase in other modes
        this.completedModelsInPhase = 0;
      }

      // Update for the new phase
      this.updateForPhase(phaseMessage, activeModelsForPhase);
      
      // If this was a normal status update that we detected as a phase change,
      // don't return, so we can also update the model status
      if (status !== 'phase_change') {
        // Update the model's status
        this.modelStatuses[modelId] = {
          status: 'processing', // Always set to processing for a new phase
          name: this.formatModelName(modelId),
          message: message,
          previousStatus: this.modelStatuses[modelId]?.status || null
        };
      } else {
        // Force progress update before returning for explicit phase changes
        this.updateProgressBar();
        this.updateModelStatusList();
        return;
      }
    }

    // Initialize model status if it doesn't exist
    if (!this.modelStatuses[modelId]) {
      this.modelStatuses[modelId] = {
        status: status,
        name: this.formatModelName(modelId),
        message: message,
        previousStatus: null
      };
    } else {
      // Store previous status before updating
      const prevStatus = this.modelStatuses[modelId].status;
      
      // Update the model's status
      this.modelStatuses[modelId].status = status;
      if (message) {
        this.modelStatuses[modelId].message = message;
      }
      
      // Only update previousStatus if the status actually changed
      if (prevStatus !== status) {
        this.modelStatuses[modelId].previousStatus = prevStatus;
      }
    }

    // Enhanced completion tracking - more aggressive for Validated Consensus mode
    if ((status === 'completed' || status === 'failed' || status === 'cancelled')) {
      // Log more debug information
      console.log(`LoadingManager: Model ${modelId} status updated to ${status}. Previous status: ${this.modelStatuses[modelId]?.previousStatus}`);

      if (isValidatedConsensus) {
        // For Validated Consensus, be more aggressive about counting completions
        const previousStatus = this.modelStatuses[modelId]?.previousStatus;
        
        // Only increment if this is the first time we're marking it complete in this phase
        // or if we've never seen this model complete before (for any status)
        if (!['completed', 'failed', 'cancelled'].includes(previousStatus)) {
          console.log(`LoadingManager: [ValidatedConsensus] Incrementing counter for ${modelId}`);
          this.completedModelsInPhase++;
          
          // Force visibility of progress changes
          document.getElementById('progress-bar').style.transition = 'width 0.3s ease-in-out';
        } else {
          console.log(`LoadingManager: [ValidatedConsensus] Not incrementing for ${modelId} (prev: ${previousStatus})`);
        }
      } else {
        // Standard behavior for other modes
        if (!['completed', 'failed', 'cancelled'].includes(this.modelStatuses[modelId]?.previousStatus)) {
          this.completedModelsInPhase++;
        }
      }
    }
    
    // Special handling for processing status in Validated Consensus
    if (isValidatedConsensus && status === 'processing' && !this.modelStatuses[modelId]?.alreadyCounted) {
      // Mark when a model starts processing in a new phase
      this.modelStatuses[modelId].phaseStarted = true;
      
      // Force DOM update and ensure all models are represented
      if (Object.keys(this.modelStatuses).length > this.totalModelsInPhase) {
        this.totalModelsInPhase = Object.keys(this.modelStatuses).length;
      }
    }
    
    if (!this.isVisible) {
      console.log("LoadingManager: Status updated but loading UI is not visible");
      return;
    }
    
    // Always update UI, especially critical for Validated Consensus
    this.updateProgressBar();
    this.updateModelStatusList();
    
    // Force DOM update for Validated Consensus mode with a small delay
    if (isValidatedConsensus) {
      // Double-check DOM elements are still available
      if (!document.getElementById('progress-bar')) {
        console.warn("LoadingManager: Progress bar element disappeared, recreating...");
        this.createLoadingOverlay();
      }
      
      // Schedule multiple UI updates with different techniques to ensure visibility
      const delays = [30, 100, 300, 600];
      delays.forEach(delay => {
        setTimeout(() => {
          if (!this.isVisible) return; // Skip if overlay was hidden
          
          console.log(`LoadingManager: [ValidatedConsensus] Forced UI update at ${delay}ms`);
          // Trigger browser re-render to force progress bar update
          this.updateProgressBar();
          this.updateModelStatusList();
          
          // Extra forced DOM update for stubborn browser renderers
          const progressBar = document.getElementById('progress-bar');
          if (progressBar) {
            // Use multiple techniques to force reflow/repaint
            progressBar.style.opacity = '0.99';
            setTimeout(() => {
              progressBar.style.opacity = '1';
              progressBar.style.display = 'none';
              setTimeout(() => progressBar.style.display = 'block', 5);
            }, 5);
          }
          
          // Force reflow on model status container too
          const statusContainer = document.getElementById('model-status-container');
          if (statusContainer) {
            statusContainer.style.opacity = '0.99';
            setTimeout(() => statusContainer.style.opacity = '1', 5);
          }
        }, delay);
      });
    }
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

    // Special handling for Validated Consensus to ensure progress shows
    const isValidatedConsensus = window._appState?.collaboration?.mode === 'validated_consensus';
    
    // Calculate progress percentage
    let progress = this.totalModelsInPhase > 0 ? (this.completedModelsInPhase / this.totalModelsInPhase) * 100 : 0;
    
    // Enhanced progress tracking for Validated Consensus mode
    if (isValidatedConsensus) {
      const activeModelCount = Object.keys(this.modelStatuses).length;
      // Debug information for Validated Consensus mode
      console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Initial progress calculation: ${progress}%`);
      console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Active models: ${activeModelCount}, Total in phase: ${this.totalModelsInPhase}, Completed: ${this.completedModelsInPhase}`);
      
      // Count models by status
      const statusCounts = { processing: 0, completed: 0, failed: 0, pending: 0 };
      Object.values(this.modelStatuses).forEach(model => {
        if (statusCounts[model.status] !== undefined) {
          statusCounts[model.status]++;
        }
      });
      console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Status counts:`, statusCounts);
      
      // Ensure we're tracking all active models
      if (activeModelCount > this.totalModelsInPhase) {
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Updating totalModelsInPhase from ${this.totalModelsInPhase} to ${activeModelCount}`);
        this.totalModelsInPhase = activeModelCount;
        // Recalculate progress with updated total
        progress = this.totalModelsInPhase > 0 ? (this.completedModelsInPhase / this.totalModelsInPhase) * 100 : 0;
      }
      
      // Ensure at least minimum progress based on phase and active models
      // Show at least 5% progress when models are active but not yet completed
      const minProgress = 5;
      if (progress < minProgress && activeModelCount > 0) {
        progress = Math.max(progress, minProgress);
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Enforcing minimum progress of ${minProgress}%`);
      }
      
      // Add progress boost for models in processing state (shows activity)
      if (statusCounts.processing > 0 && progress < 75) {
        const processingBoost = Math.min(statusCounts.processing * 5, 20); // Max 20% boost from processing
        progress = Math.min(progress + processingBoost, 70); // Cap at 70% until completion
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Adding ${processingBoost}% boost for ${statusCounts.processing} processing models. New progress: ${progress}%`);
      }
      
      // Ensure progress advances between phases and over time
      const phaseTitle = this.phaseTitleElement?.textContent || '';
      
      // Track progress over time - important for when statuses aren't updating
      if (!this.lastProgressUpdate) {
        this.lastProgressUpdate = Date.now();
        this.baseProgress = progress;
      }
      
      // Calculate time-based progress boost (roughly 2% every 3 seconds)
      const timeElapsed = Date.now() - this.lastProgressUpdate;
      const timeBasedProgress = Math.min(50, (timeElapsed / 3000) * 2);
      
      // Apply phase-specific minimums
      if (phaseTitle.includes('Phase 1')) {
        // Starting phase should advance to at least 25% within a few seconds
        const phase1Min = Math.min(25, 10 + timeBasedProgress);
        progress = Math.max(progress, phase1Min);
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Phase 1 minimum progress: ${phase1Min.toFixed(1)}%`);
      } else if (phaseTitle.includes('Phase 2')) {
        // Phase 2 should start at 30% and advance to 60%
        const phase2Min = Math.min(60, 30 + timeBasedProgress);
        progress = Math.max(progress, phase2Min);
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Phase 2 minimum progress: ${phase2Min.toFixed(1)}%`);
      } else if (phaseTitle.includes('Phase 3')) {
        // Phase 3 should start at 70% and advance to 95%
        const phase3Min = Math.min(95, 70 + timeBasedProgress);
        progress = Math.max(progress, phase3Min);
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Phase 3 minimum progress: ${phase3Min.toFixed(1)}%`);
      } else {
        // Default phase advancement
        const defaultMin = Math.min(45, 5 + timeBasedProgress);
        progress = Math.max(progress, defaultMin);
        console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Default minimum progress: ${defaultMin.toFixed(1)}%`);
      }
      
      // Save baseline progress for next update
      if (timeElapsed > 1000) {
        this.lastProgressUpdate = Date.now();
        this.baseProgress = progress;
      }
    }
    
    // Ensure animation is smooth for Validated Consensus
    if (isValidatedConsensus) {
      this.progressBar.style.transition = 'width 0.3s ease-in-out';
    }
    
    // Update the DOM elements
    this.progressBar.style.width = `${progress}%`;
    this.progressText.textContent = `${Math.round(progress)}% Complete`;

    // Add extra information for ValidatedConsensus mode
    if (isValidatedConsensus) {
      const phase = this.phaseTitleElement?.textContent || "Current phase";
      this.progressText.textContent = `${Math.round(progress)}% (${this.completedModelsInPhase}/${this.totalModelsInPhase} models)`;
      
      console.log(`LoadingManager.updateProgressBar: [ValidatedConsensus] Progress set to ${progress}% for ${phase}`);
    } else {
      console.log(`LoadingManager.updateProgressBar: Progress set to ${progress}%`);
    }

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
    
    // Check if we're in Validated Consensus mode for special handling
    const isValidatedConsensus = window._appState?.collaboration?.mode === 'validated_consensus';
    
    // Clear current status list
    this.modelStatusContainer.innerHTML = '';
    
    // Deduplicate model entries - fix for ChatGPT double entries
    const deduplicatedEntries = {};
    Object.entries(this.modelStatuses).forEach(([modelId, data]) => {
      // Use the base modelId (without specific model version) as the key
      const baseModelId = modelId.split('-')[0]; // Handle both 'chatgpt' and 'chatgpt-4'
      
      // If we already have this model, only replace if the new status is more interesting
      if (deduplicatedEntries[baseModelId]) {
        const currentStatus = deduplicatedEntries[baseModelId].status;
        // Prioritize 'completed' > 'failed' > 'processing' > others
        const statusPriority = { 'completed': 4, 'failed': 3, 'processing': 2, 'pending': 1 };
        if ((statusPriority[data.status] || 0) > (statusPriority[currentStatus] || 0)) {
          deduplicatedEntries[baseModelId] = {...data, originalId: modelId};
        }
      } else {
        deduplicatedEntries[baseModelId] = {...data, originalId: modelId};
      }
    });
    
    // Add status items (using deduplicated entries)
    Object.entries(deduplicatedEntries).forEach(([baseModelId, data]) => {
      const modelId = data.originalId || baseModelId;
      console.log(`LoadingManager.updateModelStatusList: Adding status for ${baseModelId}: ${data.status}`);
      
      const statusItem = document.createElement('div');
      statusItem.className = `model-status-item ${data.status}`;
      
      // Enhanced status display for Validated Consensus
      if (isValidatedConsensus) {
        // Add message to status display if available - but don't duplicate model name in message
        let statusMessage = '';
        if (data.message) {
          // Skip redundant messages for cleaner UI
          if (data.message !== 'Working on initial draft...' && 
              data.message !== 'Starting response drafting' &&
              !data.message.includes("Phase")) {
            statusMessage = `<span class="status-message">${data.message}</span>`;
          }
        }
        
        // Format status text nicely for Validated Consensus
        let statusText = data.status;
        if (data.status === 'processing') {
          statusText = 'Working...';
        } else if (data.status === 'completed') {
          statusText = '✓ Done';
        } else if (data.status === 'failed') {
          statusText = '⚠️ Failed';
        }
          
        statusItem.innerHTML = `
          <span class="model-name">${data.name}</span>
          <span class="status ${data.status}">${statusText}</span>
          ${statusMessage}
        `;
        
        // Make newly changed statuses more noticeable
        if (data.status !== data.previousStatus && data.previousStatus) {
          statusItem.style.animation = 'status-highlight 1s ease-in-out';
          // Add animation duration for browser compatibility
          statusItem.style.animationDuration = '1s';
          // Add additional properties to ensure animation renders
          statusItem.style.position = 'relative';
        }
      } else {
        // Standard display for other modes
        statusItem.innerHTML = `
          <span class="model-name">${data.name}</span>
          <span class="status ${data.status}">${data.status}</span>
        `;
      }
      
      this.modelStatusContainer.appendChild(statusItem);
    });
    
    // For Validated Consensus, ensure changes are visible
    if (isValidatedConsensus) {
      this.modelStatusContainer.style.opacity = '0.99';
      setTimeout(() => {
        this.modelStatusContainer.style.opacity = '1';
      }, 5);
    }
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