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

/**
 * Clean up any duplicate context elements that might have been created at the bottom of the page
 */
function cleanupDuplicateContextElements() {
  // Find any context-actions containers that are direct children of body
  const bodyContextActions = document.querySelectorAll('body > .context-actions');
  bodyContextActions.forEach(element => {
    console.log('Context Manager: Removing duplicate context-actions from body');
    element.remove();
  });
  
  // Find any context elements that are after the footer
  const footer = document.querySelector('footer');
  if (footer) {
    let sibling = footer.nextElementSibling;
    while (sibling) {
      const nextSibling = sibling.nextElementSibling;
      if (sibling.classList && (
          sibling.classList.contains('context-actions') ||
          sibling.classList.contains('context-warning') ||
          sibling.id === 'context-status' ||
          sibling.id === 'context-warning' ||
          sibling.id === 'context-progress'
      )) {
        console.log('Context Manager: Removing duplicate context element after footer:', sibling.id || sibling.className);
        sibling.remove();
      }
      sibling = nextSibling;
    }
  }
}

/**
 * Remove all context management UI elements except token displays
 */
function removeContextManagementUI() {
  // Remove all context-actions containers
  document.querySelectorAll('.context-actions').forEach(element => {
    console.log('Context Manager: Removing context-actions container');
    element.remove();
  });
  
  // Remove specific context elements by ID
  const elementsToRemove = [
    'context-status',
    'context-reset-button',
    'context-trim-button',
    'context-warning',
    'context-progress',
    'context-mode-selector',
    'reset-context-button',
    'trim-context-button'
  ];
  
  elementsToRemove.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      console.log(`Context Manager: Removing element with id: ${id}`);
      element.remove();
    }
  });
  
  // Remove any elements with context-related classes
  const classesToRemove = [
    '.context-status',
    '.context-action-button',
    '.context-warning',
    '.context-progress-bar',
    '.context-mode-selector-container'
  ];
  
  classesToRemove.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      console.log(`Context Manager: Removing element with class: ${selector}`);
      element.remove();
    });
  });
}

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
  // First, clean up any duplicate context elements that might be at the bottom of the page
  cleanupDuplicateContextElements();
  
  // Also remove all context management UI elements - we only want the token displays
  removeContextManagementUI();
  
  // Only keep the toggle switch that already exists in HTML
  contextToggleSwitch = document.getElementById('context-toggle-switch');
  
  // Add event listener to existing toggle switch
  if (contextToggleSwitch && !contextToggleSwitch.hasAttribute('data-initialized')) {
    contextToggleSwitch.addEventListener('change', handleContextToggle);
    contextToggleSwitch.setAttribute('data-initialized', 'true');
  }

  console.log('Context Manager: Initialized (UI elements removed, only token displays remain)');
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
  
  // Find proper container for context status - should be in context-window-row
  const container = document.querySelector('.context-windows-wrapper') || 
                    document.querySelector('.context-window-row') || 
                    document.querySelector('.input-area-container');
  if (container) {
    container.appendChild(element);
  } else {
    console.warn('Context Manager: Could not find proper container for context status');
  }
  
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
  
  // Find the best container for the button - should be near context windows
  let container = document.querySelector('.context-actions');
  
  if (!container) {
    // Create context-actions container in the proper location
    container = document.createElement('div');
    container.classList.add('context-actions');
    
    // Insert after context windows
    const contextRow = document.querySelector('.context-window-row') || 
                      document.querySelector('.context-windows-wrapper');
    if (contextRow) {
      contextRow.parentNode.insertBefore(container, contextRow.nextSibling);
    } else {
      console.warn('Context Manager: Could not find proper location for context actions');
      return button; // Don't append to body
    }
  }
  
  container.appendChild(button);
  
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
  
  // Add to proper container - warning should appear near context controls
  const container = document.querySelector('.context-actions') || 
                    document.querySelector('.context-window-row');
  if (container) {
    container.parentNode.insertBefore(element, container.nextSibling);
  } else {
    console.warn('Context Manager: Could not find proper container for context warning');
  }
  
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

  // Find or create context-actions container in proper location
  let parent = document.querySelector('.context-actions');
  
  if (!parent) {
    // Create context-actions container in the proper location
    parent = document.createElement('div');
    parent.classList.add('context-actions');
    
    // Insert after context windows
    const contextRow = document.querySelector('.context-window-row') || 
                      document.querySelector('.context-windows-wrapper');
    if (contextRow) {
      contextRow.parentNode.insertBefore(parent, contextRow.nextSibling);
    } else {
      console.warn('Context Manager: Could not find proper location for context mode selector');
      return select; // Don't append to body
    }
  }
  
  parent.appendChild(container);

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

  // Add event listener for toggle changes - use both click and change events for better compatibility
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
  
  // Also add a direct change listener to the input for when it's toggled via keyboard
  toggleInput.addEventListener('change', function(event) {
    console.log("Context toggle changed via direct input event");
    handleContextToggle(event);
  });

  // Find or create context-actions container in proper location
  let parent = document.querySelector('.context-actions');
  
  if (!parent) {
    // Create context-actions container in the proper location
    parent = document.createElement('div');
    parent.classList.add('context-actions');
    
    // Insert after context windows
    const contextRow = document.querySelector('.context-window-row') || 
                      document.querySelector('.context-windows-wrapper');
    if (contextRow) {
      contextRow.parentNode.insertBefore(parent, contextRow.nextSibling);
    } else {
      console.warn('Context Manager: Could not find proper location for context toggle');
      return toggleInput; // Don't append to body
    }
  }
  
  parent.insertBefore(container, parent.firstChild); // Insert at the beginning

  return toggleInput;
}

/**
 * Handle context status received from WebSocket
 * @param {Object} data - The context status data
 */
export function handleContextStatus(data) {
  console.log('Context Status Update:', data);
  
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

  console.log('Updated Context Info:', JSON.stringify(contextInfo));

  // Update UI
  updateContextUI();

  // Show warning if needed
  if (contextInfo.isNearLimit && !contextInfo.hasWarningDisplayed) {
    showContextWarning();
  }

  // Update context mode selector if available
  if (contextModeSelector && contextInfo.contextMode) {
    contextModeSelector.value = contextInfo.contextMode;
    console.log('Updated context mode selector to:', contextInfo.contextMode);
  }

  // Update toggle switch if available
  if (contextToggleSwitch) {
    const shouldBeChecked = contextInfo.contextMode !== CONTEXT_MODES.NONE;
    contextToggleSwitch.checked = shouldBeChecked;
    console.log('Updated context toggle switch to:', shouldBeChecked ? 'ON' : 'OFF');
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
  console.log('Processing auth response for context:', data);
  
  if (data.sessionId) {
    contextInfo.sessionId = data.sessionId;
    console.log('Set session ID:', data.sessionId);

    // If we have context info in the response, process it
    if (data.contextInfo) {
      console.log('Processing context info from auth:', data.contextInfo);
      handleContextStatus(data.contextInfo);
      
      // Also show status message to user
      if (data.contextInfo.contextMode && data.contextInfo.contextMode !== 'none') {
        showTemporaryMessage(`Context enabled (mode: ${data.contextInfo.contextMode})`);
      }
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
  if (window.sendMessageToServer && typeof window.sendMessageToServer === 'function') {
    window.sendMessageToServer({
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

  // Log for debugging
  console.log('Context Manager: Toggle context to:', newMode, 'Previous mode:', contextInfo.contextMode);

  // Send mode update to server
  if (window.sendMessageToServer && typeof window.sendMessageToServer === 'function') {
    // Update internal state before sending to ensure UI stays consistent
    contextInfo.contextMode = newMode;
    
    window.sendMessageToServer({
      type: 'set_context_mode',
      mode: newMode
    });
    
    // Show temporary visual feedback
    showTemporaryMessage(`Context ${newMode === CONTEXT_MODES.NONE ? 'disabled' : 'enabled - mode: ' + newMode}`);
  } else {
    // Try to get WebSocket from window.getWebSocket
    const ws = window.getWebSocket?.() || window.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Update internal state before sending to ensure UI stays consistent
      contextInfo.contextMode = newMode;
      
      ws.send(JSON.stringify({
        type: 'set_context_mode',
        mode: newMode
      }));
      
      // Show temporary visual feedback
      showTemporaryMessage(`Context ${newMode === CONTEXT_MODES.NONE ? 'disabled' : 'enabled - mode: ' + newMode}`);
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
  // This function is now empty since we've removed all context UI elements
  // Only the token displays remain, which are updated elsewhere
}

/**
 * Show the context warning UI
 */
function showContextWarning() {
  // Warning UI has been removed - this function is now a no-op
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
  if (window.sendMessageToServer && typeof window.sendMessageToServer === 'function') {
    window.sendMessageToServer({
      type: 'reset_context'
    });
  } else {
    // If sendMessageToServer isn't available, try WebSocket directly
    const ws = window.getWebSocket?.() || window.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
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
  if (window.sendMessageToServer && typeof window.sendMessageToServer === 'function') {
    window.sendMessageToServer({
      type: 'trim_context'
    });
  } else {
    // Fallback to direct WebSocket
    const ws = window.getWebSocket?.() || window.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
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
  if (window.sendMessageToServer && typeof window.sendMessageToServer === 'function') {
    window.sendMessageToServer({
      type: 'set_max_context_size',
      maxSize
    });
    return true;
  } else {
    // Fallback to direct WebSocket
    const ws = window.getWebSocket?.() || window.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
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