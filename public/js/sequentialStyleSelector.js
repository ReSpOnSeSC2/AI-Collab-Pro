/**
 * Sequential Style Selector
 * UI component to select between different style options for the Sequential Critique Chain
 */

(function() {
  // Style options and descriptions
  const STYLE_OPTIONS = {
    'harmonious': {
      name: 'Harmonious',
      description: 'Focuses on building consensus and a unified voice. Each AI builds upon the previous work in a complementary way.'
    },
    'balancedContrasting': {
      name: 'Balanced Contrasting',
      description: 'Encourages productive disagreement and diverse perspectives. Each AI intentionally brings different viewpoints to enrich the final answer.'
    }
  };

  // Current selected style
  let currentStyle = 'harmonious'; // Default style

  // Initialize the style selector UI
  function initializeStyleSelector() {
    const collaborationControls = document.querySelector('.collaboration-controls');
    
    // If Sequential Critique Chain mode is not selected, don't show style options
    if (!collaborationControls) return;

    // Check if the mode selector exists
    const modeSelector = document.querySelector('#collab-mode-selector');
    if (!modeSelector) return;

    // Create container for style options (initially hidden)
    const styleContainer = document.createElement('div');
    styleContainer.className = 'sequential-style-options';
    styleContainer.style.display = 'none'; // Hidden by default
    styleContainer.innerHTML = `
      <h4>Sequential Style Options</h4>
      <div class="style-options-container">
        ${Object.entries(STYLE_OPTIONS).map(([key, style]) => `
          <div class="style-option ${key === currentStyle ? 'selected' : ''}" data-style="${key}">
            <div class="style-option-header">
              <span class="style-name">${style.name}</span>
              <span class="style-selector ${key === currentStyle ? 'checked' : ''}">
                <input type="radio" name="sequential-style" value="${key}" ${key === currentStyle ? 'checked' : ''}>
                <span class="checkmark"></span>
              </span>
            </div>
            <p class="style-description">${style.description}</p>
          </div>
        `).join('')}
      </div>
    `;

    // Insert after the mode selector
    modeSelector.parentNode.insertBefore(styleContainer, modeSelector.nextSibling);

    // Add click handlers for style options
    document.querySelectorAll('.style-option').forEach(option => {
      option.addEventListener('click', function() {
        const styleKey = this.getAttribute('data-style');
        setSelectedStyle(styleKey);
      });
    });

    // Add mode change listener to show/hide style options
    modeSelector.addEventListener('change', function() {
      const selectedMode = this.value;
      if (selectedMode === 'sequential_critique_chain') {
        styleContainer.style.display = 'block';
      } else {
        styleContainer.style.display = 'none';
      }
    });

    // Check initial mode
    if (modeSelector.value === 'sequential_critique_chain') {
      styleContainer.style.display = 'block';
    }
  }

  // Set the selected style
  function setSelectedStyle(styleKey) {
    if (!STYLE_OPTIONS[styleKey]) return;
    
    currentStyle = styleKey;
    
    // Update UI
    document.querySelectorAll('.style-option').forEach(option => {
      const isSelected = option.getAttribute('data-style') === styleKey;
      option.classList.toggle('selected', isSelected);
      
      const radio = option.querySelector('input[type="radio"]');
      if (radio) radio.checked = isSelected;
      
      const checkmark = option.querySelector('.style-selector');
      if (checkmark) checkmark.classList.toggle('checked', isSelected);
    });
    
    // Save preference (optional)
    localStorage.setItem('sequentialStylePreference', styleKey);
    
    // Broadcast event for other components
    const event = new CustomEvent('sequentialStyleChanged', {
      detail: { style: styleKey }
    });
    document.dispatchEvent(event);
  }

  // Load saved preference
  function loadSavedPreference() {
    const savedStyle = localStorage.getItem('sequentialStylePreference');
    if (savedStyle && STYLE_OPTIONS[savedStyle]) {
      currentStyle = savedStyle;
    }
  }

  // Add method to get current style
  window.getSequentialStyle = function() {
    return currentStyle;
  };

  // Initialize when DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    loadSavedPreference();
    initializeStyleSelector();
  });

  // Re-initialize when collaboration controls are dynamically updated
  document.addEventListener('collaborationControlsUpdated', function() {
    setTimeout(initializeStyleSelector, 100); // Small delay to ensure DOM is updated
  });
})();