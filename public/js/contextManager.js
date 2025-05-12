/**
 * Context Manager for AI Collaboration Hub
 * Handles client-side context management, UI interactions, and context-related features
 * Version: 8.0.0
 */

// State
let contextInfo = {
  sessionId: null,
  messageCount: 0,
  contextSize: 0,
  maxContextSize: 32000, // Default, will be updated from server
  percentUsed: 0,
  isNearLimit: false,
  hasWarningDisplayed: false,
  contextMode: 'none' // Default to no context
};

// Available context modes from the server
const CONTEXT_MODES = {
  NONE: 'none',
  SUMMARY: 'summary',
  FULL: 'full'
};

// DOM Elements
let contextStatusElement;
let contextResetButton;
let contextTrimButton;
let contextWarningElement;
let contextProgressBar;
let contextModeSelector;
let contextToggleSwitch;

/**
 * Initialize the context manager UI elements
 */
export function initializeContextManager() {
  // Find or create UI elements
  contextStatusElement = document.getElementById('context-status') || createContextStatusElement();
  contextResetButton = document.getElementById('context-reset-button') || createContextActionButton('Reset Context', handleResetContext);
  contextTrimButton = document.getElementById('context-trim-button') || createContextActionButton('Trim Context', handleTrimContext);
  contextWarningElement = document.getElementById('context-warning') || createContextWarningElement();
  contextProgressBar = document.getElementById('context-progress') || createContextProgressBar();
  contextModeSelector = document.getElementById('context-mode-selector') || createContextModeSelector();
  contextToggleSwitch = document.getElementById('context-toggle-switch') || createContextToggleSwitch();

  // Initially hide or disable elements
  contextWarningElement.style.display = 'none';
  contextTrimButton.disabled = true;

  // Update UI with initial state
  updateContextUI();

  console.log('Context Manager: Initialized');
}

/**
 * Create a status display element if it doesn't exist
 * @returns {HTMLElement} The status element
 */
function createContextStatusElement() {
  const element = document.createElement('div');
  element.id = 'context-status';
  element.classList.add('context-status');
  element.innerHTML = 'Context: <span class="context-size">0</span> / <span class="max-size">32000</span> chars';
  
  // Find a place to insert it in the UI
  const container = document.querySelector('.hub-sidebar') || document.querySelector('.toolbar') || document.body;
  container.appendChild(element);
  
  return element;
}

/**
 * Create an action button for context management
 * @param {string} label - The button label
 * @param {Function} clickHandler - The click event handler
 * @returns {HTMLElement} The button element
 */
function createContextActionButton(label, clickHandler) {
  const button = document.createElement('button');
  button.id = label.toLowerCase().replace(/\s+/g, '-') + '-button';
  button.classList.add('context-action-button');
  button.textContent = label;
  button.addEventListener('click', clickHandler);
  
  // Find the best container for the button
  const container = document.querySelector('.context-actions') || 
                    document.querySelector('.hub-sidebar') || 
                    document.querySelector('.toolbar');
                    
  if (container) {
    container.appendChild(button);
  } else {
    // Create a container if none exists
    const newContainer = document.createElement('div');
    newContainer.classList.add('context-actions');
    newContainer.appendChild(button);
    document.body.appendChild(newContainer);
  }
  
  return button;
}

/**
 * Create a warning element for context limits
 * @returns {HTMLElement} The warning element
 */
function createContextWarningElement() {
  const element = document.createElement('div');
  element.id = 'context-warning';
  element.classList.add('context-warning');
  element.innerHTML = `
    <div class="warning-icon">⚠️</div>
    <div class="warning-message">
      <p>Context limit is approaching. Consider:</p>
      <ul>
        <li>Resetting the context to start fresh</li>
        <li>Trimming the context to remove older messages</li>
      </ul>
    </div>
    <button class="warning-close">×</button>
  `;
  
  // Add close button handler
  element.querySelector('.warning-close').addEventListener('click', () => {
    element.style.display = 'none';
    contextInfo.hasWarningDisplayed = false;
  });
  
  // Add to UI
  document.body.appendChild(element);
  
  return element;
}

/**
 * Create a progress bar for context usage
 * @returns {HTMLElement} The progress bar element
 */
function createContextProgressBar() {
  const container = document.createElement('div');
  container.id = 'context-progress-container';
  container.classList.add('context-progress-container');

  const bar = document.createElement('div');
  bar.id = 'context-progress';
  bar.classList.add('context-progress-bar');

  container.appendChild(bar);

  // Find a place to insert it
  const parent = contextStatusElement?.parentElement || document.querySelector('.hub-sidebar') || document.body;
  parent.appendChild(container);

  return bar;
}

/**
 * Create a selector for context mode
 * @returns {HTMLElement} The select element
 */
function createContextModeSelector() {
  // Create container
  const container = document.createElement('div');
  container.id = 'context-mode-container';
  container.classList.add('context-mode-container');

  // Add label
  const label = document.createElement('label');
  label.htmlFor = 'context-mode-selector';
  label.textContent = 'Context Mode:';
  label.classList.add('context-mode-label');
  container.appendChild(label);

  // Create select element
  const select = document.createElement('select');
  select.id = 'context-mode-selector';
  select.classList.add('context-mode-selector');

  // Add options
  const options = [
    { value: CONTEXT_MODES.NONE, text: 'No Context' },
    { value: CONTEXT_MODES.SUMMARY, text: 'Summary Context' },
    { value: CONTEXT_MODES.FULL, text: 'Full Context' }
  ];

  options.forEach(option => {
    const optElement = document.createElement('option');
    optElement.value = option.value;
    optElement.textContent = option.text;
    select.appendChild(optElement);
  });

  // Set initial value
  select.value = contextInfo.contextMode;

  // Add event listener
  select.addEventListener('change', handleContextModeChange);

  container.appendChild(select);

  // Find a place to insert it
  const parent = document.querySelector('.context-actions') ||
                document.querySelector('.hub-sidebar') ||
                document.querySelector('.toolbar');

  if (parent) {
    parent.appendChild(container);
  } else {
    // If no suitable parent exists, create one
    const newContainer = document.createElement('div');
    newContainer.classList.add('context-actions');
    newContainer.appendChild(container);
    document.body.appendChild(newContainer);
  }

  return select;
}

/**
 * Create a toggle switch for enabling/disabling context
 * @returns {HTMLElement} The toggle switch element
 */
function createContextToggleSwitch() {
  // Create container
  const container = document.createElement('div');
  container.id = 'context-toggle-container';
  container.classList.add('context-toggle-container', 'context-memory-toggle');

  // Create toggle switch
  const toggleLabel = document.createElement('label');
  toggleLabel.classList.add('context-toggle-switch-label');

  // Create input checkbox
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.id = 'context-toggle-switch';
  toggleInput.classList.add('context-toggle-input');
  toggleInput.checked = contextInfo.contextMode !== CONTEXT_MODES.NONE; // Checked if context is enabled

  // Create visual switch element
  const toggleSpan = document.createElement('span');
  toggleSpan.classList.add('context-toggle-slider');

  // Create label text
  const labelText = document.createElement('span');
  labelText.classList.add('context-toggle-text');
  labelText.textContent = 'Context Memory:';

  // Assemble components
  toggleLabel.appendChild(labelText);
  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSpan);
  container.appendChild(toggleLabel);

  // Add event listener for toggle changes - use click instead of change for better compatibility
  toggleLabel.addEventListener('click', function(event) {
    // Prevent the default behavior to handle manually
    event.preventDefault();

    // Toggle the checked state
    toggleInput.checked = !toggleInput.checked;

    // Manually trigger the handler
    handleContextToggle({target: toggleInput});

    // Stop propagation to prevent other listeners
    event.stopPropagation();
  });

  // Find a place to insert it
  const parent = document.querySelector('.context-actions') ||
                document.querySelector('.hub-sidebar') ||
                document.querySelector('.toolbar');

  if (parent) {
    parent.insertBefore(container, parent.firstChild); // Insert at the beginning
  } else {
    // If no suitable parent exists, create one
    const newContainer = document.createElement('div');
    newContainer.classList.add('context-actions');
    newContainer.appendChild(container);
    document.body.appendChild(newContainer);
  }

  return toggleInput;
}

/**
 * Handle context status received from WebSocket
 * @param {Object} data - The context status data
 */
export function handleContextStatus(data) {
  // Update local state with server data
  contextInfo = {
    ...contextInfo,
    sessionId: data.sessionId || contextInfo.sessionId,
    messageCount: data.messageCount || 0,
    contextSize: data.contextSize || 0,
    maxContextSize: data.maxContextSize || contextInfo.maxContextSize,
    percentUsed: data.percentUsed || 0,
    isNearLimit: data.isNearLimit || false,
    contextMode: data.contextMode || contextInfo.contextMode
  };

  // Update UI
  updateContextUI();

  // Show warning if needed
  if (contextInfo.isNearLimit && !contextInfo.hasWarningDisplayed) {
    showContextWarning();
  }

  // Update context mode selector if available
  if (contextModeSelector && contextInfo.contextMode) {
    contextModeSelector.value = contextInfo.contextMode;
  }

  // Update toggle switch if available
  if (contextToggleSwitch) {
    contextToggleSwitch.checked = contextInfo.contextMode !== CONTEXT_MODES.NONE;
  }
}

/**
 * Handle context reset response
 * @param {Object} data - The reset response data
 */
export function handleContextReset(data) {
  // Update local state
  contextInfo = {
    ...contextInfo,
    messageCount: 0,
    contextSize: 0,
    percentUsed: 0,
    isNearLimit: false,
    hasWarningDisplayed: false
  };
  
  // Update UI
  updateContextUI();
  
  // Hide warning if visible
  contextWarningElement.style.display = 'none';
  
  // Show temporary success message
  showTemporaryMessage('Context has been reset');
}

/**
 * Handle context trimmed response
 * @param {Object} data - The trim response data
 */
export function handleContextTrimmed(data) {
  // Update local state
  contextInfo = {
    ...contextInfo,
    percentUsed: data.percentUsed || contextInfo.percentUsed,
    isNearLimit: data.percentUsed >= 80 // Using 80% as warning threshold
  };
  
  // Update UI
  updateContextUI();
  
  // Show message about trimming
  if (data.trimmed) {
    showTemporaryMessage(`Context trimmed. Removed ${data.messagesRemoved} oldest messages.`);
    
    // Hide warning if not near limit anymore
    if (!contextInfo.isNearLimit) {
      contextWarningElement.style.display = 'none';
      contextInfo.hasWarningDisplayed = false;
    }
  } else {
    showTemporaryMessage('Context is within size limits. No trimming needed.');
  }
}

/**
 * Handle context warning from server
 * @param {Object} data - The warning data
 */
export function handleContextWarning(data) {
  // Update state with latest info
  contextInfo = {
    ...contextInfo,
    contextSize: data.contextSize || contextInfo.contextSize,
    maxSize: data.maxSize || contextInfo.maxContextSize,
    percentUsed: data.percentUsed || contextInfo.percentUsed,
    isNearLimit: true
  };
  
  // Update UI and show warning
  updateContextUI();
  showContextWarning();
}

/**
 * Handle max context size updated response
 * @param {Object} data - The update response data
 */
export function handleMaxContextSizeUpdated(data) {
  // Update local state
  contextInfo = {
    ...contextInfo,
    maxContextSize: data.maxSize,
    percentUsed: data.percentUsed
  };
  
  // Update UI
  updateContextUI();
  
  // Show confirmation message
  showTemporaryMessage(data.message || 'Maximum context size updated');
}

/**
 * Process authentication response to capture session ID
 * @param {Object} data - The authentication response data
 */
export function processAuthResponse(data) {
  if (data.sessionId) {
    contextInfo.sessionId = data.sessionId;

    // If we have context info in the response, process it
    if (data.contextInfo) {
      handleContextStatus(data.contextInfo);
    }
  }
}

/**
 * Handle context mode updated response
 * @param {Object} data - The update response data
 */
export function handleContextModeUpdated(data) {
  // Update local state
  contextInfo.contextMode = data.mode;

  // Update UI
  if (contextModeSelector) {
    contextModeSelector.value = data.mode;
  }

  // Update toggle switch
  if (contextToggleSwitch) {
    contextToggleSwitch.checked = data.mode !== CONTEXT_MODES.NONE;
  }

  // Show confirmation message
  showTemporaryMessage(data.message || `Context mode set to ${data.mode}`);
}

/**
 * Handle context mode selection change
 * @param {Event} event - The change event
 */
function handleContextModeChange(event) {
  const newMode = event.target.value;

  if (!contextInfo.sessionId) {
    showTemporaryMessage('No active session to update context mode');
    // Reset selector to current mode
    event.target.value = contextInfo.contextMode;
    return;
  }

  // Update toggle switch state to match the new mode
  if (contextToggleSwitch) {
    contextToggleSwitch.checked = newMode !== CONTEXT_MODES.NONE;
  }

  // Send request to server
  if (window.connectionManager && typeof window.connectionManager.sendMessageToServer === 'function') {
    window.connectionManager.sendMessageToServer({
      type: 'set_context_mode',
      mode: newMode
    });
  } else {
    // Fallback to direct WebSocket
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'set_context_mode',
        mode: newMode
      }));
    } else {
      console.error('Context Manager: Cannot set context mode - no connection available');
      showTemporaryMessage('Cannot set context mode: no connection to server');
      // Reset selector to current mode
      event.target.value = contextInfo.contextMode;
    }
  }
}

/**
 * Handle context toggle switch change
 * @param {Event} event - The change event
 */
function handleContextToggle(event) {
  if (!contextInfo.sessionId) {
    showTemporaryMessage('No active session to toggle context');
    // Reset toggle to previous state
    event.target.checked = contextInfo.contextMode !== CONTEXT_MODES.NONE;
    return;
  }

  // Determine new mode based on toggle state
  const newMode = event.target.checked ?
    (contextInfo.contextMode === CONTEXT_MODES.NONE ? CONTEXT_MODES.SUMMARY : contextInfo.contextMode) :
    CONTEXT_MODES.NONE;

  // Update mode selector
  if (contextModeSelector) {
    contextModeSelector.value = newMode;
  }

  // Send mode update to server
  if (window.connectionManager && typeof window.connectionManager.sendMessageToServer === 'function') {
    window.connectionManager.sendMessageToServer({
      type: 'set_context_mode',
      mode: newMode
    });
  } else {
    // Fallback to direct WebSocket
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'set_context_mode',
        mode: newMode
      }));
    } else {
      console.error('Context Manager: Cannot toggle context - no connection available');
      showTemporaryMessage('Cannot toggle context: no connection to server');
      // Reset toggle to previous state
      event.target.checked = contextInfo.contextMode !== CONTEXT_MODES.NONE;
    }
  }
}

/**
 * Update the UI elements with current context state
 */
function updateContextUI() {
  if (contextStatusElement) {
    const sizeEl = contextStatusElement.querySelector('.context-size');
    const maxEl = contextStatusElement.querySelector('.max-size');
    
    if (sizeEl) sizeEl.textContent = contextInfo.contextSize.toLocaleString();
    if (maxEl) maxEl.textContent = contextInfo.maxContextSize.toLocaleString();
  }
  
  if (contextProgressBar) {
    // Update progress bar width
    contextProgressBar.style.width = `${contextInfo.percentUsed}%`;
    
    // Update color based on usage
    if (contextInfo.percentUsed >= 90) {
      contextProgressBar.style.backgroundColor = '#e74c3c'; // Red
    } else if (contextInfo.percentUsed >= 75) {
      contextProgressBar.style.backgroundColor = '#f39c12'; // Orange
    } else {
      contextProgressBar.style.backgroundColor = '#2ecc71'; // Green
    }
  }
  
  // Enable/disable trim button based on context size
  if (contextTrimButton) {
    contextTrimButton.disabled = contextInfo.contextSize < 1000;
  }
}

/**
 * Show the context warning UI
 */
function showContextWarning() {
  if (contextWarningElement) {
    contextWarningElement.style.display = 'flex'; // Show the warning
    contextInfo.hasWarningDisplayed = true;
  }
}

/**
 * Show a temporary message to the user
 * @param {string} message - The message to display
 * @param {number} duration - How long to show the message (ms)
 */
function showTemporaryMessage(message, duration = 3000) {
  // Create or reuse toast element
  let toast = document.getElementById('context-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'context-toast';
    toast.classList.add('context-toast');
    document.body.appendChild(toast);
  }
  
  // Set message and show
  toast.textContent = message;
  toast.classList.add('visible');
  
  // Hide after duration
  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

/**
 * Handle reset context button click
 */
function handleResetContext() {
  if (!contextInfo.sessionId) {
    showTemporaryMessage('No active session to reset');
    return;
  }
  
  // Send reset request to server
  // This assumes connectionManager is globally available
  if (window.connectionManager && typeof window.connectionManager.sendMessageToServer === 'function') {
    window.connectionManager.sendMessageToServer({
      type: 'reset_context'
    });
  } else {
    // If connectionManager isn't available, try WebSocket directly
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'reset_context'
      }));
    } else {
      console.error('Context Manager: Cannot send reset request - no connection available');
      showTemporaryMessage('Cannot reset context: no connection to server');
    }
  }
}

/**
 * Handle trim context button click
 */
function handleTrimContext() {
  if (!contextInfo.sessionId) {
    showTemporaryMessage('No active session to trim');
    return;
  }
  
  // Send trim request to server via available connection method
  if (window.connectionManager && typeof window.connectionManager.sendMessageToServer === 'function') {
    window.connectionManager.sendMessageToServer({
      type: 'trim_context'
    });
  } else {
    // Fallback to direct WebSocket
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'trim_context'
      }));
    } else {
      console.error('Context Manager: Cannot send trim request - no connection available');
      showTemporaryMessage('Cannot trim context: no connection to server');
    }
  }
}

/**
 * Set a custom maximum context size
 * @param {number} maxSize - The new maximum size in characters
 */
export function setMaxContextSize(maxSize) {
  if (!contextInfo.sessionId) {
    showTemporaryMessage('No active session');
    return false;
  }
  
  if (!maxSize || maxSize < 1000) {
    showTemporaryMessage('Invalid max size. Must be at least 1000 characters.');
    return false;
  }
  
  // Send request to server
  if (window.connectionManager && typeof window.connectionManager.sendMessageToServer === 'function') {
    window.connectionManager.sendMessageToServer({
      type: 'set_max_context_size',
      maxSize
    });
    return true;
  } else {
    // Fallback to direct WebSocket
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({
        type: 'set_max_context_size',
        maxSize
      }));
      return true;
    } else {
      console.error('Context Manager: Cannot set max size - no connection available');
      showTemporaryMessage('Cannot set max context size: no connection to server');
      return false;
    }
  }
}