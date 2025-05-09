/**
 * Collaboration Limits Module
 * Provides notifications and guidance about AI collaboration limitations
 */

// Thresholds for determining risk levels
const THRESHOLDS = {
  HIGH_RISK: 5, // 5+ models is high risk
  MEDIUM_RISK: 4  // 4 models is medium risk
};

/**
 * Check if the current selection of models poses a risk of timeout
 * @param {Array} activeModels - Array of active model IDs
 * @returns {Object} Risk assessment with level and message
 */
export function assessCollaborationRisk(activeModels) {
  const modelCount = activeModels.length;
  
  if (modelCount >= THRESHOLDS.HIGH_RISK) {
    return {
      level: 'high',
      message: `Using ${modelCount} models simultaneously poses a high risk of timeout. Consider using 3 or fewer models for reliable results.`
    };
  } else if (modelCount >= THRESHOLDS.MEDIUM_RISK) {
    return {
      level: 'medium',
      message: `Using ${modelCount} models may cause timeouts with complex requests. Keep prompts brief and concise.`
    };
  }
  
  return {
    level: 'low',
    message: null // No message needed for low risk
  };
}

/**
 * Display a timeout warning based on the active models
 * @param {Array} activeModels - Array of active model IDs
 */
export function showTimeoutWarning(activeModels) {
  const risk = assessCollaborationRisk(activeModels);
  
  // Only show warnings for medium or high risk
  if (risk.level === 'low' || !risk.message) return;
  
  // Create or update the warning notification
  let warningEl = document.getElementById('collab-timeout-warning');
  
  if (!warningEl) {
    warningEl = document.createElement('div');
    warningEl.id = 'collab-timeout-warning';
    warningEl.className = 'alert alert-warning position-fixed bottom-0 start-50 translate-middle-x mb-3 d-flex align-items-center';
    warningEl.style.zIndex = "1050";
    warningEl.style.maxWidth = "90%";
    warningEl.style.width = "500px";
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-close ms-auto';
    closeBtn.setAttribute('data-bs-dismiss', 'alert');
    closeBtn.setAttribute('aria-label', 'Close');
    
    warningEl.appendChild(closeBtn);
    document.body.appendChild(warningEl);
  }
  
  // Update warning class based on risk level
  warningEl.className = warningEl.className.replace(/alert-(warning|danger)/, 
    risk.level === 'high' ? 'alert-danger' : 'alert-warning');
  
  // Add warning icon and message
  const iconClass = risk.level === 'high' ? 'bi-exclamation-triangle-fill' : 'bi-exclamation-circle';
  
  // Update the content
  warningEl.innerHTML = `
    <div>
      <i class="bi ${iconClass} me-2"></i>
      <span>${risk.message}</span>
    </div>
    <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  // Show the warning
  warningEl.style.display = 'flex';
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    warningEl.style.display = 'none';
  }, 10000);
}

/**
 * Show a notification when collaboration fails due to timeout
 * @param {string} message - The error message
 */
export function showCollaborationFailure(message) {
  // Create the failure notification
  let failureEl = document.getElementById('collab-failure-notification');
  
  if (!failureEl) {
    failureEl = document.createElement('div');
    failureEl.id = 'collab-failure-notification';
    failureEl.className = 'alert alert-danger position-fixed top-50 start-50 translate-middle p-4';
    failureEl.style.zIndex = "1060";
    failureEl.style.maxWidth = "90%";
    failureEl.style.width = "500px";
    
    document.body.appendChild(failureEl);
  }
  
  // Set content
  failureEl.innerHTML = `
    <h5><i class="bi bi-x-circle-fill me-2"></i>Collaboration Failed</h5>
    <p>${message || 'The collaboration timed out. Try using fewer AI models or simplifying your request.'}</p>
    <hr>
    <div class="d-flex justify-content-between">
      <div>
        <strong>Tips:</strong>
        <ul class="mb-0">
          <li>Use 2-3 models instead of 5-6</li>
          <li>Keep your prompts concise</li>
          <li>Try the 'Individual' mode for complex requests</li>
        </ul>
      </div>
      <button type="button" class="btn btn-sm btn-outline-dark align-self-end" 
        onclick="document.getElementById('collab-failure-notification').style.display='none'">
        Dismiss
      </button>
    </div>
  `;
  
  // Show the notification
  failureEl.style.display = 'block';
}

/**
 * Initialize collaboration limits monitoring
 */
export function initialize() {
  // Listen for collaboration status messages
  document.addEventListener('collaboration-aborted', (event) => {
    showCollaborationFailure(event.detail?.message);
  });
  
  // Add listeners for model selection changes
  document.addEventListener('models-selected', (event) => {
    if (event.detail?.activeModels) {
      showTimeoutWarning(event.detail.activeModels);
    }
  });
}