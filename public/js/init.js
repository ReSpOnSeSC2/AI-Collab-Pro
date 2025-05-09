/**
 * Initialization script to ensure loading manager is properly initialized
 * This script runs before other scripts to ensure the loading manager overlay is created
 */

// Create loading manager overlay immediately on page load
document.addEventListener('DOMContentLoaded', function() {
  console.log("init.js: Creating loading manager overlay on page load");
  
  // Create the loading overlay element if it doesn't exist
  if (!document.getElementById('collaboration-loading')) {
    console.log("init.js: Creating collaboration loading overlay");
    
    const overlay = document.createElement('div');
    overlay.id = 'collaboration-loading';
    overlay.className = 'collaboration-loading hidden';
    
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
      <div class="debug-info">Overlay initialized</div>
    `;
    
    overlay.innerHTML = content;
    document.body.appendChild(overlay);
    console.log("init.js: Loading overlay added to document body");
    
    // Set up cancel button
    const cancelButton = document.getElementById('cancel-collaboration');
    if (cancelButton) {
      cancelButton.addEventListener('click', function() {
        console.log("Init.js: Cancel button clicked");
        overlay.classList.add('hidden');
        // The full callback will be added when LoadingManager.show() is called
      });
    }
    
    // Add a global debug function
    window.showLoadingOverlay = function() {
      console.log("Manual trigger of loading overlay");
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
      overlay.style.visibility = 'visible';
      
      // Update debug info
      const debugInfo = document.querySelector('.debug-info');
      if (debugInfo) {
        debugInfo.textContent = "Manual activation: " + new Date().toISOString();
      }
    };
    
    // Add keyboard shortcut for testing: Ctrl+Alt+L
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.altKey && e.key === 'l') {
        window.showLoadingOverlay();
      }
    });
  }
});