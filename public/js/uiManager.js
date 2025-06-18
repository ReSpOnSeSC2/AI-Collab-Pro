/**
 * UI Manager for AI Collaboration Hub
 * Handles DOM manipulation, UI updates, event listeners setup, and visual state.
 * Version: 8.0.0
 */

// --- Constants ---
const CSS_CLASSES = {
    COMPACT_MODE: 'compact-mode',
    INPUT_AREA_HIDDEN: 'input-area-hidden',
    HIDDEN_COLUMN: 'hidden-column', // This class will now be styled in CSS
    FULLSCREEN_MODE: 'fullscreen-mode',
    CLI_FULLSCREEN_ACTIVE: 'cli-fullscreen-active',
    SHOW: 'show',
    STATUS_CONNECTED: 'status-connected',
    MESSAGE_USER: 'user-message',
    MESSAGE_AI_BASE: 'message', // Base class for AI messages
    TYPING_INDICATOR: 'typing-indicator',
    SYSTEM_MESSAGE: 'system-message',
    CONNECTION_STATUS_MESSAGE: 'connection-status-message',
    SR_ONLY: 'sr-only',
    SHAKE_ANIMATION: 'shake-animation',
    COPIED: 'copied',
    EXPANDED_INPUT: 'expanded-input',
    ACTIVE_COLUMN: 'active-column', // For mobile column activation
    HAS_FULLSCREEN: 'has-fullscreen', // Body class when any column is fullscreen
};

const SELECTORS = {
    // Core Interaction
    MESSAGE_INPUT: '#message-input',
    SEND_BTN: '#send-btn',
    BUILD_BTN: '#build-btn',
    FILE_UPLOAD: '#file-upload',
    FILE_LIST: '#file-list',
    REMOVE_FILE_BTN: '.remove-file', // Event delegation target within FILE_LIST

    // CLI
    CLI_INPUT: '#cli-input',
    CLI_BTN: '#cli-btn',
    CLI_OUTPUT: '#cli-output',
    CLI_ACCORDION: '#cliAccordion',
    CLI_COLLAPSE: '#cliCollapse',
    CLI_FULLSCREEN_BTN: '#cli-fullscreen-btn',
    CLI_ROW: '.cli-row',

    // Header & Controls
    HEADER_ROW: '.header-row',
    THEME_TOGGLE_BTN: '#theme-toggle-btn',
    COMPACT_MODE_BTN: '#compact-mode-btn',
    INPUT_TOGGLE_BTN: '#input-toggle-btn',
    MODEL_TOGGLE: '.model-toggle',
    COLLAB_MODE_COLLABORATIVE: '#collab-mode-collaborative',
    COLLAB_MODE_INDIVIDUAL: '#collab-mode-individual',
    COLLAB_STYLE_SELECT: '#collab-style',
    COLLAB_STYLE_CONTAINER: '#collab-style-container',

    // Model Dropdowns
    MODEL_SELECTED: '.model-selected',
    MODEL_DROPDOWN: '.model-dropdown',
    MODEL_DROPDOWN_WRAPPER: '.model-dropdown-wrapper',
    MODEL_SEARCH_INPUT: '.model-search-input',
    MODEL_OPTION: '.model-option',

    // Chat Areas
    CHAT_AREA_ROW: '.chat-area-row',
    CHAT_COLUMN: '.chat-column', // Generic class for all AI columns
    FULLSCREEN_TOGGLE_BTN: '.fullscreen-toggle-btn',

    // Build Modal
    BUILD_MODAL: '#build-modal',
    BUILD_MODAL_CONTENT_AREA: '#build-modal-content-area',
    CLOSE_BUILD_MODAL: '#close-build-modal',
    CLOSE_BUILD_MODAL_BTN: '#close-build-modal-btn',
    CONFIRM_BUILD_BTN: '#confirm-build-btn',
    COPY_BUILD_CONTENT_BTN: '#copy-build-content',
    CODE_ONLY_OPTION: '#code-only-option', // Added selector

    // Accessibility & Status
    A11Y_LIVE_REGION: '#a11y-live-region',
    CONNECTION_INDICATOR: '.connection-indicator', // From websocket-status-check.js

    // Provider Specific (Generated dynamically in cacheDomElements)
    // e.g., CLAUDE_MESSAGES: '#claude-messages', CLAUDE_COLUMN: '#claude-column', CLAUDE_STATUS: '#claude-status'
};

const AI_PROVIDERS = ['claude', 'gemini', 'chatgpt', 'grok', 'deepseek', 'llama'];

// --- State (Managed by main.js, passed as needed) ---
// This module primarily manipulates the DOM based on state/events.

// --- DOM Element Cache ---
const domCache = {};
let mcpClientInstance = null; // Hold reference to MCP client for UI updates

/**
 * Caches frequently accessed DOM elements.
 */
export function cacheDomElements() {
    console.log("UIManager: Caching DOM elements...");
    for (const key in SELECTORS) {
        try {
            const selector = SELECTORS[key];
            if (!selector) continue;
            // Query all for classes, selectors with spaces, or attribute selectors
            if (selector.startsWith('.') || selector.includes(' ') || selector.includes('[')) {
                domCache[key] = document.querySelectorAll(selector);
            } else if (selector.startsWith('#')) {
                // Query single element for IDs
                domCache[key] = document.getElementById(selector.substring(1));
            }
            // Add specific handling if needed
        } catch (error) {
            console.error(`UIManager: Error caching DOM element for key ${key} with selector ${SELECTORS[key]}:`, error);
            domCache[key] = null; // Assign null or empty NodeList/Array?
        }
    }

    // Cache provider-specific elements dynamically
    AI_PROVIDERS.forEach(provider => {
        const upperProvider = provider.toUpperCase();
        domCache[`${upperProvider}_MESSAGES`] = document.getElementById(`${provider}-messages`);
        domCache[`${upperProvider}_COLUMN`] = document.getElementById(`${provider}-column`);
        domCache[`${upperProvider}_STATUS`] = document.getElementById(`${provider}-status`); // Assuming status indicators exist
        domCache[`${upperProvider}_MODEL_DROPDOWN`] = document.getElementById(`${provider}-model-dropdown`);
        domCache[`${upperProvider}_MODEL_SELECTED_NAME`] = document.querySelector(`.model-selected[data-target="${provider}"] .selected-model-name`);
    });

    console.log("UIManager: DOM Elements Cached:", Object.keys(domCache).length);

    // Basic check for essential elements
    if (!domCache.MESSAGE_INPUT || !domCache.SEND_BTN || !domCache.MODEL_TOGGLE?.length) {
        console.error("UIManager: CRITICAL - Core UI elements (message input, send button, model toggles) not found. UI may not function.");
        showError("Initialization failed: Core UI elements missing.");
    }
    
    // Set up additional event listeners after caching elements
    setupUIEventListeners();
}

// --- Initialization ---

/**
 * Initializes the UI Manager. Caches elements and sets up initial UI state.
 */
export function initializeUI() {
    cacheDomElements();
    // Add any other UI setup needed immediately on load
    if (typeof hljs !== 'undefined') {
        hljs.configure({ ignoreUnescapedHTML: true }); // Configure highlight.js
        console.log("UIManager: highlight.js configured.");
    } else {
        console.warn("UIManager: highlight.js library not found.");
    }
     if (typeof marked === 'undefined') {
        console.warn("UIManager: marked library not found. Markdown rendering disabled.");
    }
    
    // Make sure theme toggle works 
    setupThemeToggleHandlers();
}

/**
 * Applies the saved theme from localStorage
 * @deprecated This implementation is replaced by the second declaration below
 * @private
 */
function _legacyApplySavedTheme() {
    // Let the standalone theme manager handle this
    if (window.themeManager && typeof window.themeManager.applySavedTheme === 'function') {
        window.themeManager.applySavedTheme();
        console.log("UIManager: Applied saved theme using themeManager");
    } else {
        // Fallback implementation if standalone script is not loaded
        const savedTheme = localStorage.getItem('theme') || 'theme-dark';
        document.documentElement.className = savedTheme;
        console.log(`UIManager: Applied saved theme (${savedTheme}) using fallback method`);
        
        // Update highlight.js theme
        const highlightStyle = document.getElementById('highlight-style');
        if (highlightStyle) {
            highlightStyle.href = savedTheme === 'theme-light'
                ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css'
                : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css';
        }
    }
}

/**
 * Ensure theme toggle works by setting up event handlers
 */
function setupThemeToggleHandlers() {
    console.log("UIManager: Theme toggle handlers - using global event delegation");
    
    // We no longer directly attach event listeners to theme toggle buttons
    // Instead we rely on the global event delegation from applySavedTheme.js
    
    // Just update the theme icon if needed
    if (window.themeManager && typeof window.themeManager.updateThemeToggleIcon === 'function') {
        window.themeManager.updateThemeToggleIcon();
        console.log("UIManager: Updated theme icons using themeManager");
    }
    
    // Just update theme icons after layout-ready event
    document.addEventListener('layout-ready', () => {
        console.log("UIManager: Layout ready - updating theme icons");
        if (window.themeManager && typeof window.themeManager.updateThemeToggleIcon === 'function') {
            window.themeManager.updateThemeToggleIcon();
        }
    });
}

/**
 * Set up additional UI event listeners (especially after DOM changes like injected header/footer)
 */
export function setupUIEventListeners() {
    // Note: Model dropdown event listeners are now set up in setupModelDropdowns
    // to ensure they're properly initialized with the current models
    
    // We don't set up fullscreen buttons here anymore - they're handled in setupCoreEventListeners
    // to ensure a single point of configuration for these critical buttons
    
    console.log("UIManager: Additional UI event listeners set up");
}

/**
 * Sets the MCP client instance for UI interactions.
 * @param {object} client - The initialized MCP client instance.
 */
export function setMcpClient(client) {
    mcpClientInstance = client;
    console.log("UIManager: MCP Client instance received.");
    // Setup listeners for MCP events that affect UI
    if (mcpClientInstance) {
        mcpClientInstance.on('pending_operations', updatePendingOperationsList);
        mcpClientInstance.on('operation_approved', (data) => {
            console.log("UIManager: Operation approved", data.operationId);
            // Optionally remove from UI list immediately or wait for refresh
            removeOperationFromList(data.operationId);
        });
         mcpClientInstance.on('operation_rejected', (data) => {
            console.log("UIManager: Operation rejected", data.operationId);
            removeOperationFromList(data.operationId);
        });
    }
}


/**
 * Sets up core event listeners for user interactions.
 * Delegates actions to handler functions passed from main.js.
 * @param {Function} onSendMessage - Handler for sending chat messages.
 * @param {Function} onSendCliCommand - Handler for sending CLI commands.
 * @param {Function} onFileUpload - Handler for file selection.
 * @param {Function} onRemoveFile - Handler for removing an uploaded file.
 * @param {Function} onCollabModeChange - Handler for collaboration mode change.
 * @param {Function} onCollabStyleChange - Handler for collaboration style change.
 * @param {Function} onModelToggleChange - Handler for model visibility toggle.
 * @param {Function} onFullscreenToggle - Handler for column fullscreen toggle.
 * @param {Function} onToggleCliFullscreen - Handler for CLI fullscreen toggle.
 */
export function setupCoreEventListeners(
    onSendMessage,
    onSendCliCommand,
    onFileUpload,
    onRemoveFile,
    onCollabModeChange,
    onCollabStyleChange,
    onModelToggleChange,
    onFullscreenToggle,
    onToggleCliFullscreen
) {
    console.log("UIManager: Setting up core event listeners...");

    // Send Button & Message Input Enter Key
    domCache.SEND_BTN?.addEventListener('click', () => {
        if (domCache.MESSAGE_INPUT) onSendMessage(domCache.MESSAGE_INPUT.value);
    });
    domCache.MESSAGE_INPUT?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (domCache.MESSAGE_INPUT) onSendMessage(domCache.MESSAGE_INPUT.value);
        }
    });
    domCache.MESSAGE_INPUT?.addEventListener('input', () => autoResizeTextarea(domCache.MESSAGE_INPUT));

    // CLI Button & Input Enter Key
    domCache.CLI_BTN?.addEventListener('click', () => {
        if (domCache.CLI_INPUT) onSendCliCommand(domCache.CLI_INPUT.value);
    });
    domCache.CLI_INPUT?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (domCache.CLI_INPUT) onSendCliCommand(domCache.CLI_INPUT.value);
        }
    });

    // File Upload & Removal
    domCache.FILE_UPLOAD?.addEventListener('change', (event) => onFileUpload(event.target.files));
    domCache.FILE_LIST?.addEventListener('click', (event) => { // Event delegation
        const removeBtn = event.target.closest(SELECTORS.REMOVE_FILE_BTN);
        if (removeBtn) {
            const index = parseInt(removeBtn.dataset.index, 10);
            if (!isNaN(index)) {
                onRemoveFile(index);
            }
        }
    });

    // Header Controls
    // We no longer attach direct listeners to theme toggle button
    // Event delegation is used in applySavedTheme.js to handle clicks
    console.log("UIManager: Using global theme handler instead of direct listener");
    domCache.COMPACT_MODE_BTN?.addEventListener('click', toggleCompactMode);
    domCache.INPUT_TOGGLE_BTN?.addEventListener('click', toggleInputArea);
    domCache.CLI_FULLSCREEN_BTN?.addEventListener('click', onToggleCliFullscreen);

    // Model Toggles
    domCache.MODEL_TOGGLE?.forEach(toggle => {
        toggle.addEventListener('change', (event) => {
            const modelId = event.target.dataset.model;
            if (modelId) {
                // Update active class on toggle container
                const toggleContainer = event.target.closest('.form-check');
                if (toggleContainer) {
                    toggleContainer.classList.toggle('active', event.target.checked);
                }
                
                // Call the handler
                onModelToggleChange(event.target, modelId);
            }
        });
    });

    // Collaboration Controls
    domCache.COLLAB_MODE_COLLABORATIVE?.addEventListener('change', (event) => onCollabModeChange('collaborative'));
    domCache.COLLAB_MODE_INDIVIDUAL?.addEventListener('change', (event) => onCollabModeChange('individual'));
    domCache.COLLAB_STYLE_SELECT?.addEventListener('change', (event) => onCollabStyleChange(event.target.value));

    // Setup direct event listeners for fullscreen toggle buttons (more reliable than delegation)
    document.querySelectorAll(SELECTORS.FULLSCREEN_TOGGLE_BTN).forEach(btn => {
        // Remove any existing listeners by cloning and replacing
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Add fresh listener
        newBtn.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            const targetId = this.dataset.target;
            if (!targetId) return;
            
            const column = document.getElementById(`${targetId}-column`);
            if (!column) return;
            
            const isEntering = !column.classList.contains(CSS_CLASSES.FULLSCREEN_MODE);
            console.log(`Direct fullscreen toggle click for ${targetId}, entering: ${isEntering}`);
            onFullscreenToggle(targetId, isEntering); // Notify main.js
        });
    });

    // Build Modal
    domCache.BUILD_BTN?.addEventListener('click', openBuildModal);
    domCache.CLOSE_BUILD_MODAL?.addEventListener('click', closeBuildModal);
    domCache.CLOSE_BUILD_MODAL_BTN?.addEventListener('click', closeBuildModal);
    domCache.COPY_BUILD_CONTENT_BTN?.addEventListener('click', copyBuildModalContent);
    domCache.CONFIRM_BUILD_BTN?.addEventListener('click', () => {
        const content = getBuildModalContent(); // Get potentially filtered content
        if (content) {
            onSendCliCommand(`process_build <<<EOF\n${content}\nEOF`); // Example: send content to CLI
            closeBuildModal();
        } else {
            showError("No content selected or available in build modal.");
        }
    });

    // Global listeners for dropdowns
    document.addEventListener('click', handleGlobalClickForDropdowns);
    document.addEventListener('keydown', handleGlobalKeydownForDropdowns);

    console.log("UIManager: Core event listeners setup complete.");
}

// --- UI State Management ---

// Theme management is now handled by applySavedTheme.js
// This function is kept as a wrapper for backward compatibility
export function applySavedTheme() {
    if (window.themeManager && typeof window.themeManager.applySavedTheme === 'function') {
        window.themeManager.applySavedTheme();
    } else {
        // Fallback implementation if themeManager isn't available
        const savedTheme = localStorage.getItem('theme') || 'theme-dark';
        document.documentElement.className = savedTheme;
        updateHighlightJsTheme(savedTheme);
    }
}

export function loadUIPreferences() {
    // Load compact mode preference
    const compactMode = localStorage.getItem('compactMode') === 'true';
    document.body.classList.toggle(CSS_CLASSES.COMPACT_MODE, compactMode);
    updateToggleButtonIcon(domCache.COMPACT_MODE_BTN, compactMode, 'bi-arrows-expand', 'bi-arrows-collapse');


    // Load input area visibility
    const inputHidden = localStorage.getItem('inputHidden') === 'true';
    document.body.classList.toggle(CSS_CLASSES.INPUT_AREA_HIDDEN, inputHidden);
    updateToggleButtonIcon(domCache.INPUT_TOGGLE_BTN, inputHidden, 'bi-chevron-bar-down', 'bi-chevron-bar-up');
}

function updateToggleButtonIcon(button, isActive, activeIconClass, inactiveIconClass) {
    if (!button) return;
    const icon = button.querySelector('i');
    if (icon) {
        icon.className = isActive ? activeIconClass : inactiveIconClass;
    }
}

function toggleTheme() {
    // Always use the window.themeManager to toggle theme
    // This ensures a single source of truth for theme toggling
    if (window.themeManager && typeof window.themeManager.toggleTheme === 'function') {
        window.themeManager.toggleTheme();
    } else {
        console.warn("Theme manager not available for toggling. Using simplified fallback.");
        // Super simple fallback that just swaps the theme class
        const currentTheme = document.documentElement.className.includes('theme-dark') ? 'theme-dark' : 'theme-light';
        const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark';
        document.documentElement.className = newTheme;
        localStorage.setItem('theme', newTheme);
    }
}

function updateHighlightJsTheme(theme) {
    const highlightStyle = document.getElementById('highlight-style');
    if (highlightStyle) {
        highlightStyle.href = theme === 'theme-light'
            ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css'
            : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css';
    }
}

function toggleCompactMode() {
    const isCompact = document.body.classList.toggle(CSS_CLASSES.COMPACT_MODE);
    localStorage.setItem('compactMode', isCompact);
    updateToggleButtonIcon(domCache.COMPACT_MODE_BTN, isCompact, 'bi-arrows-expand', 'bi-arrows-collapse');
}

function toggleInputArea() {
    const isHidden = document.body.classList.toggle(CSS_CLASSES.INPUT_AREA_HIDDEN);
    localStorage.setItem('inputHidden', isHidden);
    updateToggleButtonIcon(domCache.INPUT_TOGGLE_BTN, isHidden, 'bi-chevron-bar-down', 'bi-chevron-bar-up');
}

export function setupCollaborationControls(initialState, onModeChange, onStyleChange) {
    // Set initial state based on passed config
    const collabRadio = document.getElementById(`collab-mode-${initialState.mode}`);
    if (collabRadio) collabRadio.checked = true;

    const styleSelect = domCache.COLLAB_STYLE_SELECT;
    if (styleSelect) styleSelect.value = initialState.style;

    // Style visibility toggle removed

    // Listeners are setup in setupCoreEventListeners, just ensure initial UI matches state
}

export function updateCollaborationModeUI(mode) {
     const collabRadio = document.getElementById(`collab-mode-${mode}`);
     if (collabRadio) collabRadio.checked = true;

     // Toggle enhanced collab container visibility
     const enhancedContainer = document.getElementById('enhanced-collab-container');
     if (enhancedContainer) {
         enhancedContainer.style.display = mode !== 'individual' ? 'block' : 'none';
     }
}

// Collaboration style UI update function removed (no actual backend implementation)

// Collaboration style visibility function removed (no actual backend implementation)


// --- Message Display ---

/**
 * Adds a user message to all visible chat columns.
 * @param {string} message - The message text.
 * @param {Array<object>} attachedFiles - Array of file objects.
 */
export function addUserMessage(message, attachedFiles = []) {
    if (!message && attachedFiles.length === 0) return;

    getActiveAndVisibleColumns().forEach(({ messagesContainer }) => {
        if (!messagesContainer) return;

        const messageEl = document.createElement('div');
        messageEl.className = CSS_CLASSES.MESSAGE_USER;

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content'; // Use consistent class name

        // Render markdown for user messages too
        try {
            contentEl.innerHTML = marked.parse(sanitizeHTML(message || ''));
            contentEl.querySelectorAll('pre code').forEach(highlightElement); // Highlight code if any
        } catch (e) {
            console.warn("Failed to parse user message markdown:", e);
            contentEl.textContent = message || ''; // Fallback to text
        }
        messageEl.appendChild(contentEl);

        // Add file list if files are attached
        if (attachedFiles.length > 0) {
            const filesEl = createAttachedFilesElement(attachedFiles);
            messageEl.appendChild(filesEl);
        }

        messagesContainer.appendChild(messageEl);
        scrollToBottom(messagesContainer);
    });
}

/**
 * Handles incoming AI response data and updates the UI.
 * @param {object} data - The WebSocket message data for the response.
 * @param {object} currentMessageElements - State object holding references to ongoing message elements.
 */
export function handleAiResponse(data, currentMessageElements) {
    // Skip ping/pong messages
    if (data.type === 'ping' || data.type === 'pong') {
        return;
    }
    
    const { target, content, start, end, model, error, summary } = data;
    if (!target) { console.error("UIManager: AI response missing target:", data); return; }

    const messagesContainer = getMessageContainer(target);
    if (!messagesContainer) {
        console.warn(`UIManager: Message container not found for target: ${target}`);
        return;
    }

    removeTypingIndicator(messagesContainer); // Remove indicator on any response part

    if (error) {
        addSystemMessage(messagesContainer, `Error from ${target}: ${error}`, 'danger');
        if (currentMessageElements[target]) currentMessageElements[target] = null; // Clear state on error
        return;
    }

    // Handle start of a new message or summary
    if (start) {
        // If it's a summary starting, potentially clear previous non-summary message element for this target
        if (summary && currentMessageElements[target] && !currentMessageElements[target].isSummary) {
            currentMessageElements[target] = null;
        }
        // If it's a regular message starting, clear previous summary element for this target
        if (!summary && currentMessageElements[target] && currentMessageElements[target].isSummary) {
             currentMessageElements[target] = null;
        }

        // Only create a new element if one doesn't exist for this target/summary type
        if (!currentMessageElements[target]) {
            const messageElement = document.createElement('div');
            messageElement.className = `${CSS_CLASSES.MESSAGE_AI_BASE} ${target}-message ${summary ? 'summary-message' : ''}`;

            if (model) {
                const modelInfoEl = document.createElement('div');
                modelInfoEl.className = 'model-indicator';
                modelInfoEl.textContent = model;
                messageElement.appendChild(modelInfoEl);
            }
             if (summary) {
                const summaryTitle = document.createElement('div');
                summaryTitle.className = 'summary-title'; // Add class for styling
                summaryTitle.innerHTML = '<strong>Collaborative Summary:</strong>';
                messageElement.appendChild(summaryTitle);
            }

            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            messageElement.appendChild(contentEl);

            messagesContainer.appendChild(messageElement);

            currentMessageElements[target] = {
                element: messageElement,
                contentElement: contentEl,
                fullContent: '', // Store raw markdown content
                isSummary: !!summary,
            };
            scrollToBottom(messagesContainer);
        }
    }

    // Update message content with streamed tokens
    if (content && currentMessageElements[target]) {
        const current = currentMessageElements[target];
        current.fullContent += content;

        try {
            // Render markdown incrementally
            current.contentElement.innerHTML = marked.parse(current.fullContent);
            // Re-apply highlighting and copy buttons to all code blocks in the updated content
            current.contentElement.querySelectorAll('pre code').forEach(block => {
                // Avoid re-highlighting already processed blocks if possible (check for hljs class)
                if (!block.classList.contains('hljs')) {
                    highlightElement(block);
                }
                // Check if the parent <pre> already has a copy button
                const pre = block.parentElement;
                if (pre && !pre.querySelector('.copy-button')) {
                    addCopyButtonToCodeBlock(pre);
                }
            });
        } catch (e) {
            console.warn("Failed to parse AI response markdown:", e);
            // Just append as text if markdown parsing fails
            current.contentElement.textContent = current.fullContent;
        }

        scrollToBottom(messagesContainer);
    }

    // Handle message end
    if (end && currentMessageElements[target]) {
        // For summary, we might want special handling like highlighting it briefly
        if (currentMessageElements[target].isSummary) {
            currentMessageElements[target].element.classList.add('highlight-summary');
            setTimeout(() => {
                currentMessageElements[target]?.element.classList.remove('highlight-summary');
            }, 2000);
        }

        // Store this message for potential build modal use (if we decide to add that)
        // This would be managed by a state object in main.js that's separate from currentMessageElements
        // For now, we could leverage window._appState for simplicity (defined in main.js)
        if (window._appState && !currentMessageElements[target].isSummary) {
            if (!window._appState.latestResponses) window._appState.latestResponses = {};
            window._appState.latestResponses[target] = currentMessageElements[target].fullContent;
        }

        // Trigger feedback system for collaborative responses
        if (window.feedbackSystem && currentMessageElements[target].isSummary) {
            const conversationId = window._appState?.conversationId || 'unknown';
            const activeModels = getActiveAndVisibleColumns().map(col => col.id);
            window.feedbackSystem.showCollaborationFeedback(conversationId, activeModels, currentMessageElements[target].fullContent);
        }
        
        // Trigger model comparison for individual model responses when multiple models are active
        if (window.feedbackSystem && !currentMessageElements[target].isSummary) {
            const activeModels = getActiveAndVisibleColumns().map(col => col.id);
            if (activeModels.length > 1 && window._appState?.latestResponses) {
                // Collect all responses once all models have responded
                const responses = activeModels
                    .filter(model => window._appState.latestResponses[model])
                    .map(model => ({
                        model: model,
                        content: window._appState.latestResponses[model]
                    }));
                
                if (responses.length === activeModels.length) {
                    const conversationId = window._appState?.conversationId || 'unknown';
                    window.feedbackSystem.showModelComparisonFeedback(conversationId, responses);
                    // Clear responses after showing feedback
                    window._appState.latestResponses = {};
                }
            }
        }

        // Clear reference (set to null rather than delete to avoid undefined check issues)
        currentMessageElements[target] = null;
    }
}

/**
 * Handles CLI command output display.
 * @param {object} data - Command output data.
 */
export function handleCommandOutput(data) {
    // Skip ping/pong messages
    if (data.type === 'ping' || data.type === 'pong') {
        return;
    }
    
    const { command, output, error } = data;
    const cliOutput = domCache.CLI_OUTPUT;
    if (!cliOutput) return;

    // Create command element
    const commandEl = document.createElement('div');
    commandEl.className = 'cli-command';
    commandEl.innerHTML = `<span class="cli-prompt">$</span> ${sanitizeHTML(command || '')}`;
    
    // Create output element
    const outputEl = document.createElement('div');
    outputEl.className = 'cli-output-line';
    
    if (error) {
        outputEl.classList.add('error');
        outputEl.innerHTML = sanitizeHTML(error);
    } else if (output) {
        // This try/catch allows "safe" HTML in command output (for formatting)
        try {
            // Convert potential markdown code blocks
            const content = output.replace(/```(\w*)([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>');
            outputEl.innerHTML = content;
            // Apply syntax highlighting to any code elements
            outputEl.querySelectorAll('pre code').forEach(block => {
                highlightElement(block);
                addCopyButtonToCodeBlock(block.parentElement);
            });
        } catch (e) {
            console.warn("Failed to parse CLI output:", e);
            outputEl.textContent = output; // Fallback to plain text
        }
    }

    cliOutput.appendChild(commandEl);
    cliOutput.appendChild(outputEl);
    
    // Ensure the output is visible and scrolled
    const cliCollapse = domCache.CLI_COLLAPSE;
    if (cliCollapse && !cliCollapse.classList.contains(CSS_CLASSES.SHOW)) {
        try {
            const bsCollapse = bootstrap.Collapse.getOrCreateInstance(cliCollapse);
            bsCollapse.show();
        } catch (e) { console.error("Error showing CLI collapse:", e); }
    }
    cliOutput.scrollTop = cliOutput.scrollHeight;
}

/**
 * Creates an element to display attached files.
 * @param {Array<object>} files - Array of file objects.
 * @returns {HTMLElement} The file list element.
 */
function createAttachedFilesElement(files) {
    const filesEl = document.createElement('div');
    filesEl.className = 'attached-files';
    
    const filesList = document.createElement('ul');
    filesList.className = 'files-list';
    
    files.forEach(file => {
        const fileItem = document.createElement('li');
        fileItem.className = 'file-item';
        
        // Choose icon based on file type
        let iconClass = 'bi-file-earmark';
        if (file.type.startsWith('image/')) iconClass = 'bi-file-earmark-image';
        else if (file.type.startsWith('text/')) iconClass = 'bi-file-earmark-text';
        else if (file.type.includes('pdf')) iconClass = 'bi-file-earmark-pdf';
        else if (file.type.includes('zip') || file.type.includes('compressed')) iconClass = 'bi-file-earmark-zip';
        
        fileItem.innerHTML = `
            <i class="bi ${iconClass}"></i>
            <span class="file-name">${sanitizeHTML(file.name)}</span>
            <span class="file-size">(${formatFileSize(file.size)})</span>
        `;
        
        filesList.appendChild(fileItem);
    });
    
    filesEl.appendChild(filesList);
    return filesEl;
}

/**
 * Adds a typing indicator to the specified container.
 * @param {HTMLElement} container - The messages container.
 */
export function addTypingIndicator(container) {
    if (!container) return;
    removeTypingIndicator(container); // Ensure no duplicate

    const indicator = document.createElement('div');
    indicator.className = CSS_CLASSES.TYPING_INDICATOR;
    indicator.innerHTML = `
        <div class="typing-dots">
            <span></span><span></span><span></span>
        </div>
        <span class="${CSS_CLASSES.SR_ONLY}">AI is typing...</span>
    `;
    
    container.appendChild(indicator);
    scrollToBottom(container);
}

/**
 * Removes the typing indicator from the specified container.
 * @param {HTMLElement} container - The messages container.
 */
export function removeTypingIndicator(container) {
    if (!container) return;
    const indicator = container.querySelector(`.${CSS_CLASSES.TYPING_INDICATOR}`);
    if (indicator) indicator.remove();
}

/**
 * Adds a system message to a specific messages container.
 * @param {HTMLElement} container - The messages container.
 * @param {string} message - The system message.
 * @param {string} type - Message type (info, success, warning, danger).
 */
export function addSystemMessage(container, message, type = 'info') {
    if (!container) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = `${CSS_CLASSES.SYSTEM_MESSAGE} ${type}`;
    messageEl.innerHTML = sanitizeHTML(message);
    
    container.appendChild(messageEl);
    scrollToBottom(container);
    
    // Also announce to screen readers
    announceToScreenReader(message);
}

/**
 * Adds a system message to all visible AI columns.
 * @param {string} message - The system message.
 * @param {string} type - Message type (info, success, warning, danger).
 */
export function addSystemMessageToAll(message, type = 'info') {
    getActiveAndVisibleColumns().forEach(({ messagesContainer }) => {
        if (messagesContainer) addSystemMessage(messagesContainer, message, type);
    });
}

/**
 * Adds a broadcast system message to all AI columns and the shared messages area.
 * @param {string} message - The message text.
 * @param {string} type - Message type (info, success, warning, danger).
 */
export function broadcastSystemMessage(message, type = 'info') {
    // Add to all AI columns
    addSystemMessageToAll(message, type);
    
    // Add to the connection status area if it exists (non-column specific)
    const statusMessage = document.createElement('div');
    statusMessage.className = `${CSS_CLASSES.CONNECTION_STATUS_MESSAGE} ${type}`;
    statusMessage.textContent = message;
    
    document.body.appendChild(statusMessage);
    
    // Remove after delay
    setTimeout(() => {
        statusMessage.classList.add('fade-out');
        setTimeout(() => statusMessage.remove(), 300);
    }, 5000);
    
    // Announce to screen readers
    announceToScreenReader(message);
}

/**
 * Shows an error message to the user.
 * @param {string} message - The error message.
 * @param {string} target - Optional target for column-specific errors.
 */
export function showError(message, target = null) {
    console.error("UI Error:", message, target ? `(Target: ${target})` : '');
    
    if (target) {
        // Show error in specific column
        const messagesContainer = getMessageContainer(target);
        if (messagesContainer) {
            addSystemMessage(messagesContainer, message, 'danger');
            return;
        }
    }
    
    // Show global error
    broadcastSystemMessage(message, 'danger');
    
    // Shake message input for immediate user feedback if related to input
    if (domCache.MESSAGE_INPUT && message.toLowerCase().includes('message')) {
        domCache.MESSAGE_INPUT.classList.add(CSS_CLASSES.SHAKE_ANIMATION);
        setTimeout(() => domCache.MESSAGE_INPUT.classList.remove(CSS_CLASSES.SHAKE_ANIMATION), 500);
    }
}

/**
 * Shows an error related to the message input specifically.
 * @param {string} message - The error message.
 */
export function showInputError(message) {
    if (domCache.MESSAGE_INPUT) {
        // Add temporary error styling
        domCache.MESSAGE_INPUT.classList.add('is-invalid');
        setTimeout(() => domCache.MESSAGE_INPUT.classList.remove('is-invalid'), 3000);
        
        // Add shake for attention
        domCache.MESSAGE_INPUT.classList.add(CSS_CLASSES.SHAKE_ANIMATION);
        setTimeout(() => domCache.MESSAGE_INPUT.classList.remove(CSS_CLASSES.SHAKE_ANIMATION), 500);
        
        // Focus on the input
        domCache.MESSAGE_INPUT.focus();
    }
    
    // Show toast or use lightweight system message
    broadcastSystemMessage(message, 'danger');
}

/**
 * Updates connection status indicators.
 * @param {boolean} isConnected - Connection status.
 */
export function updateAllStatusIndicators(isConnected) {
    // Update connection indicators in each AI column
    AI_PROVIDERS.forEach(provider => {
        const statusElement = domCache[`${provider.toUpperCase()}_STATUS`];
        if (statusElement) {
            statusElement.classList.toggle(CSS_CLASSES.STATUS_CONNECTED, isConnected);
            statusElement.setAttribute('aria-label', `${provider} ${isConnected ? 'connected' : 'disconnected'}`);
        }
    });
    
    // Update any global connection indicators
    document.querySelectorAll(SELECTORS.CONNECTION_INDICATOR).forEach(indicator => {
        indicator.classList.toggle(CSS_CLASSES.STATUS_CONNECTED, isConnected);
        
        // Update inner text if it exists
        const textElement = indicator.querySelector('.status-text');
        if (textElement) {
            textElement.textContent = isConnected ? 'Connected' : 'Disconnected';
        }
    });
}

/**
 * Announces a message to screen readers using the live region.
 * @param {string} message - The message to announce.
 */
function announceToScreenReader(message) {
    const liveRegion = domCache.A11Y_LIVE_REGION;
    if (!liveRegion) return;
    
    // Set message and clear after announcement (avoid duplicates)
    liveRegion.textContent = message;
    setTimeout(() => { liveRegion.textContent = ''; }, 3000);
}

// --- Column Management ---

/**
 * Shows or hides a specific AI column.
 * @param {string} modelId - The model ID (claude, gemini, etc.).
 * @param {boolean} isVisible - Whether the column should be visible.
 */
export function toggleColumnVisibility(modelId, isVisible) {
    const column = domCache[`${modelId.toUpperCase()}_COLUMN`];
    if (!column) {
        console.error(`UIManager: Column element not found in domCache for ${modelId}`);
        return;
    }
    
    // console.log(`UIManager: Toggling ${modelId} to visible: ${isVisible}`); // Kept for debugging if needed

    if (isVisible) {
        column.classList.remove(CSS_CLASSES.HIDDEN_COLUMN);
        // If the .hidden-column class was the only thing setting display:none,
        // removing it should make the column visible based on its other classes (e.g. Bootstrap col-*)
        // We ensure any direct style.display='none' is also cleared if it was set.
        if (column.style.display === 'none') {
            column.style.display = ''; // Reset to allow stylesheet rules to take effect
        }
    } else {
        column.classList.add(CSS_CLASSES.HIDDEN_COLUMN);
        // The .hidden-column class now has `display: none !important;` in CSS
    }
    
    // Update toggle button appearance
    const toggle = document.querySelector(`.model-toggle[data-model="${modelId}"]`);
    if (toggle) {
        const toggleContainer = toggle.closest('.form-check');
        if (toggleContainer) {
            toggleContainer.classList.toggle('active', isVisible);
        }
    }
    
    column.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    const srAnnouncement = column.querySelector('.screen-reader-announcement');
    if (srAnnouncement) {
        srAnnouncement.textContent = `${modelId} ${isVisible ? 'enabled' : 'disabled'}`;
    }
    
    try {
        const columnPrefs = JSON.parse(localStorage.getItem('columnVisibility') || '{}');
        columnPrefs[modelId] = isVisible;
        localStorage.setItem('columnVisibility', JSON.stringify(columnPrefs));
    } catch (e) {
        console.warn("UIManager: Failed to save column visibility pref:", e);
    }
    
    updateColumnWidths();
}

/**
 * Initializes model toggle switches based on saved preferences.
 */
export function initializeModelToggleState() {
    try {
        const columnPrefs = JSON.parse(localStorage.getItem('columnVisibility') || '{}');
        let someToggleChanged = false; 

        domCache.MODEL_TOGGLE?.forEach(toggle => {
            const modelId = toggle.dataset.model;
            if (!modelId) return;

            const column = domCache[`${modelId.toUpperCase()}_COLUMN`];
            if (!column) return;

            let shouldBeVisible;
            if (columnPrefs.hasOwnProperty(modelId)) {
                shouldBeVisible = columnPrefs[modelId];
            } else {
                // Default to visible if no preference saved
                shouldBeVisible = true;
                columnPrefs[modelId] = true; 
                someToggleChanged = true;  
            }
            
            toggle.checked = shouldBeVisible;
            
            // Update toggle parent container class
            const toggleContainer = toggle.closest('.form-check');
            if (toggleContainer) {
                toggleContainer.classList.toggle('active', shouldBeVisible);
            }
            
            if (shouldBeVisible) {
                column.classList.remove(CSS_CLASSES.HIDDEN_COLUMN);
                if (column.style.display === 'none') { 
                    column.style.display = '';
                }
            } else {
                column.classList.add(CSS_CLASSES.HIDDEN_COLUMN);
            }
            column.setAttribute('aria-hidden', !shouldBeVisible);
        });
        
        if(someToggleChanged){ 
             localStorage.setItem('columnVisibility', JSON.stringify(columnPrefs));
        }

        updateColumnWidths();
        console.log("UIManager: Model toggle state initialized.");
    } catch (e) {
        console.warn("UIManager: Failed to load or apply column visibility prefs:", e);
        // Fallback: make all columns visible if prefs fail
        AI_PROVIDERS.forEach(provider => {
            const column = domCache[`${provider.toUpperCase()}_COLUMN`];
            if (column) {
                column.classList.remove(CSS_CLASSES.HIDDEN_COLUMN);
                if (column.style.display === 'none') column.style.display = '';
                column.setAttribute('aria-hidden', 'false');
                
                // Update toggle state
                const toggle = document.querySelector(`.model-toggle[data-model="${provider}"]`); 
                if (toggle) {
                    toggle.checked = true;
                    const toggleContainer = toggle.closest('.form-check');
                    if (toggleContainer) {
                        toggleContainer.classList.add('active');
                    }
                }
            }
        });
        updateColumnWidths(); // Ensure layout is correct after fallback
    }
}


/**
 * Updates column widths based on how many are visible.
 * Handles responsive design for different column counts.
 */
export function updateColumnWidths() {
    // Filter columns based on their computed display style.
    // This is robust as .hidden-column class now sets display: none !important.
    const columns = Array.from(document.querySelectorAll(SELECTORS.CHAT_COLUMN))
        .filter(col => window.getComputedStyle(col).display !== 'none');
    
    const visibleCount = columns.length;
    // console.log(`UIManager: Updating widths for ${visibleCount} visible columns.`); // Kept for debugging
    
    if (visibleCount === 0) {
        // Optionally hide the parent row or show a "no models active" message
        // For now, just return.
        return;
    }
    
    let colClass = '';
    if (visibleCount === 1) {
        colClass = 'col-12'; 
    } else if (visibleCount === 2) {
        colClass = 'col-md-6'; 
    } else if (visibleCount === 3) {
        colClass = 'col-md-4'; 
    } else if (visibleCount === 4) {
        colClass = 'col-md-3'; 
    } else if (visibleCount === 5) {
        colClass = 'col-md-4 col-lg-20'; 
    } else if (visibleCount === 6) {
        colClass = 'col-lg-2 col-md-4'; 
    } else {
        // Fallback for > 6, though UI might not be designed for this many
        colClass = 'col'; 
    }
    
    columns.forEach(column => {
        // More robustly remove old Bootstrap column sizing classes
        const classesToRemove = [];
        for (const cls of column.classList) {
            // Regex to match col-, col-sm-, col-md-, col-lg-, col-xl-, col-xxl-
            // and also col-N, col-sm-N etc.
            if (/^col(-\w*)?(-\d+)?$/.test(cls) && cls !== 'chat-column') {
                 // Specifically keep 'chat-column' and our custom 'col-lg-20' if it's part of the new colClass
                if (cls === 'col-lg-20' && colClass.includes('col-lg-20')) {
                    // do nothing, it's needed
                } else {
                    classesToRemove.push(cls);
                }
            }
        }
        classesToRemove.forEach(cls => column.classList.remove(cls));
        
        // Add the new classes, ensuring no empty strings from split
        const newColClasses = colClass.split(' ').filter(c => c.length > 0);
        column.classList.add(...newColClasses);
        
        // Ensure the base 'chat-column' class is present (should be if initial HTML is correct)
        if (!column.classList.contains('chat-column')) {
            column.classList.add('chat-column');
        }
    });
    
    // console.log(`UIManager: Applied ${colClass} to visible columns.`); // Kept for debugging
}

/**
 * Sets up event listeners for mobile column activation (tap to focus).
 * @param {boolean} isMobile - Whether the current view is considered mobile.
 */
export function setupMobileColumnActivation(isMobile) {
    const columns = domCache.CHAT_COLUMN; // This is a NodeList
    if (!columns || columns.length === 0) return;

    const handleColumnTap = function(event) {
        // Ignore taps on interactive elements within the column
        if (event.target.closest('button, a, input, select, textarea, .model-selected')) {
            return;
        }
        // Ignore if a column is already fullscreen
        if (document.body.classList.contains(CSS_CLASSES.HAS_FULLSCREEN) || document.body.classList.contains(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE)) {
            return;
        }

        // Remove active class from all other columns
        columns.forEach(col => {
            if (col !== this) col.classList.remove(CSS_CLASSES.ACTIVE_COLUMN);
        });
        // Add active class to the tapped column
        this.classList.add(CSS_CLASSES.ACTIVE_COLUMN);
    };

    columns.forEach(column => {
        // Remove previous listener to avoid duplicates
        column.removeEventListener('click', handleColumnTap);
        // Add listener only if mobile
        if (isMobile) {
            column.addEventListener('click', handleColumnTap);
        } else {
            // Ensure active class is removed when not mobile
            column.classList.remove(CSS_CLASSES.ACTIVE_COLUMN);
        }
    });
     console.log(`UIManager: Mobile column activation ${isMobile ? 'enabled' : 'disabled'}.`);
}

// --- Fullscreen Mode ---

/**
 * Handles the visual effects of entering fullscreen for a column.
 * @param {string} targetId - The ID of the column entering fullscreen.
 * @param {Function} onSendMessage - Callback to send messages from the fullscreen input.
 */
export function enterFullscreenEffect(targetId, onSendMessage) {
    console.log(`Entering fullscreen for ${targetId}...`);
    
    // Find the column by direct ID to avoid caching issues
    const column = document.getElementById(`${targetId}-column`);
    if (!column) {
        console.error(`Column not found for ${targetId}`);
        return;
    }

    // Ensure we exit other fullscreen modes first
    exitAllFullscreenModes(false); 

    // Hide other columns and UI elements visually (CSS handles this via body class)
    document.body.classList.add(CSS_CLASSES.HAS_FULLSCREEN);
    document.body.classList.remove(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE); // Ensure CLI fullscreen is off

    // Add fullscreen class to the target column
    column.classList.add(CSS_CLASSES.FULLSCREEN_MODE);

    // Update the toggle button icon
    const toggleBtn = column.querySelector(SELECTORS.FULLSCREEN_TOGGLE_BTN);
    updateToggleButtonIcon(toggleBtn, true, 'bi-fullscreen-exit', 'bi-arrows-fullscreen');

    // Create and focus the dedicated fullscreen input
    createFullscreenInput(column, targetId, onSendMessage);

    // Scroll to bottom of messages
    const messagesContainer = column.querySelector('.chat-messages');
    if (messagesContainer) {
        // Allow the DOM to update before scrolling
        setTimeout(() => scrollToBottom(messagesContainer), 50);
    }
    
    console.log(`Fullscreen mode enabled for ${targetId}`);
}

/**
 * Handles the visual effects of exiting fullscreen for a column.
 * @param {string} targetId - The ID of the column exiting fullscreen.
 */
export function exitFullscreenEffect(targetId) {
    console.log(`Exiting fullscreen for ${targetId}...`);
    
    // Find the column by direct ID to avoid caching issues
    const column = document.getElementById(`${targetId}-column`);
    if (!column) {
        console.error(`Column not found for ${targetId}`);
        return;
    }

    // Remove fullscreen class
    column.classList.remove(CSS_CLASSES.FULLSCREEN_MODE);

    // Remove body class *if* no other column is fullscreen
    if (!document.querySelector(`${SELECTORS.CHAT_COLUMN}.${CSS_CLASSES.FULLSCREEN_MODE}`)) {
        document.body.classList.remove(CSS_CLASSES.HAS_FULLSCREEN);
    }

    // Update the toggle button icon
    const toggleBtn = column.querySelector(SELECTORS.FULLSCREEN_TOGGLE_BTN);
    updateToggleButtonIcon(toggleBtn, false, 'bi-fullscreen-exit', 'bi-arrows-fullscreen');

    // Remove the dedicated input
    const fullscreenInput = column.querySelector('.fullscreen-input-container');
    if (fullscreenInput) fullscreenInput.remove();

    // Reset any inline styles that might have been applied
    column.style.position = '';
    column.style.top = '';
    column.style.left = '';
    column.style.width = '';
    column.style.height = '';
    column.style.zIndex = '';
    
    // Re-calculate column widths
    updateColumnWidths(); 
    
    console.log(`Fullscreen mode disabled for ${targetId}`);
}

/**
 * Toggles fullscreen mode for the CLI area.
 */
export function toggleCliFullscreen() {
    const cliRow = domCache.CLI_ROW?.[0] || document.querySelector(SELECTORS.CLI_ROW); // Fallback query
    const cliCollapse = domCache.CLI_COLLAPSE;
    const cliAccordion = domCache.CLI_ACCORDION;
    
    if (!cliRow) return;

    const isEntering = !document.body.classList.contains(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE);

    if (isEntering) {
        // Exit any column fullscreen first
        exitAllFullscreenModes(true); // Pass true to indicate CLI is the target
        
        // Add fullscreen class to body and adjust CLI layout
        document.body.classList.add(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE);

        // Ensure CLI accordion is expanded
        if (cliCollapse && !cliCollapse.classList.contains(CSS_CLASSES.SHOW)) {
            try {
                const bsCollapse = bootstrap.Collapse.getOrCreateInstance(cliCollapse);
                bsCollapse.show();
            } catch (e) { console.error("Error showing CLI collapse:", e); }
        }
        
        // Apply fullscreen styling
        if (cliAccordion) {
            cliAccordion.style.height = 'calc(100vh - 40px)';
            cliAccordion.style.display = 'flex';
            cliAccordion.style.flexDirection = 'column';
        }
        
        // Ensure the CLI output area takes the available space
        const cliOutput = domCache.CLI_OUTPUT;
        if (cliOutput) {
            cliOutput.style.flexGrow = '1';
            cliOutput.style.height = 'auto';
            cliOutput.style.maxHeight = 'calc(100vh - 140px)';
        }
        
        // Focus CLI input after a short delay for transition
        setTimeout(() => {
            domCache.CLI_INPUT?.focus();
            
            // Scroll CLI output to bottom
            if (domCache.CLI_OUTPUT) {
                domCache.CLI_OUTPUT.scrollTop = domCache.CLI_OUTPUT.scrollHeight;
            }
        }, 150);
    } else {
        // Exit fullscreen mode
        document.body.classList.remove(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE);
        
        // Restore original styles
        if (cliAccordion) {
            cliAccordion.style.height = '';
            cliAccordion.style.display = '';
            cliAccordion.style.flexDirection = '';
        }
        
        const cliOutput = domCache.CLI_OUTPUT;
        if (cliOutput) {
            cliOutput.style.flexGrow = '';
            cliOutput.style.height = '';
            cliOutput.style.maxHeight = '';
        }
    }

    // Update button icon
    updateToggleButtonIcon(domCache.CLI_FULLSCREEN_BTN, isEntering, 'bi-fullscreen-exit', 'bi-arrows-fullscreen');
}

/**
 * Exits all fullscreen modes (both column and CLI).
 * @param {boolean} isCliBecomingFullscreen - If true, don't remove the CLI fullscreen body class.
 */
function exitAllFullscreenModes(isCliBecomingFullscreen = false) {
    // Exit column fullscreen
    document.querySelectorAll(`${SELECTORS.CHAT_COLUMN}.${CSS_CLASSES.FULLSCREEN_MODE}`).forEach(col => {
        const targetId = col.id.replace('-column', '');
        exitFullscreenEffect(targetId);
    });

    // Exit CLI fullscreen unless it's the one being entered
    if (!isCliBecomingFullscreen && document.body.classList.contains(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE)) {
        document.body.classList.remove(CSS_CLASSES.CLI_FULLSCREEN_ACTIVE);
        updateToggleButtonIcon(domCache.CLI_FULLSCREEN_BTN, false, 'bi-fullscreen-exit', 'bi-arrows-fullscreen');
    }

    // Always remove the general fullscreen body class if CLI isn't becoming fullscreen
    if (!isCliBecomingFullscreen) {
        document.body.classList.remove(CSS_CLASSES.HAS_FULLSCREEN);
    }
}


/**
 * Creates the dedicated input area for fullscreen mode.
 * @param {HTMLElement} column - The column element entering fullscreen.
 * @param {string} targetId - The ID of the target AI.
 * @param {Function} onSendMessage - Callback to send messages.
 */
function createFullscreenInput(column, targetId, onSendMessage) {
    if (column.querySelector('.fullscreen-input-container')) return; // Already exists

    const container = document.createElement('div');
    container.className = 'fullscreen-input-container';

    // Create a more compact file upload button
    const fileUploadContainer = document.createElement('div');
    fileUploadContainer.className = 'd-flex align-items-center me-1'; // Reduced margin
    fileUploadContainer.style.flexShrink = '0'; // Prevent shrinking
    
    const fileUploadLabel = document.createElement('label');
    fileUploadLabel.className = 'btn file-upload-btn mb-0';
    fileUploadLabel.innerHTML = '<i class="bi bi-paperclip"></i>';
    fileUploadLabel.setAttribute('aria-label', 'Attach Files');
    fileUploadLabel.setAttribute('title', 'Attach files');
    fileUploadLabel.setAttribute('for', `fullscreen-${targetId}-file-upload`);
    fileUploadLabel.style.minWidth = '32px'; // Set minimum width
    fileUploadLabel.style.padding = '8px'; // Compact padding
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = `fullscreen-${targetId}-file-upload`;
    fileInput.multiple = true;
    fileInput.className = 'd-none';
    
    fileUploadContainer.appendChild(fileUploadLabel);
    fileUploadContainer.appendChild(fileInput);

    // Create the textarea input
    const inputContainer = document.createElement('div');
    inputContainer.className = 'flex-grow-1 position-relative';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'fullscreen-input';
    textarea.placeholder = `Message ${targetId}... (Enter to send, Shift+Enter for newline)`;
    textarea.rows = 1;
    textarea.setAttribute('aria-label', `Message input for ${targetId} in fullscreen`);
    
    const fileList = document.createElement('div');
    fileList.className = 'fullscreen-file-list mt-1';
    
    inputContainer.appendChild(textarea);
    inputContainer.appendChild(fileList);

    // Create a more compact send button
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'd-flex align-items-center ms-1'; // Reduced margin
    buttonsContainer.style.flexShrink = '0'; // Prevent shrinking
    
    const sendBtn = document.createElement('button');
    sendBtn.className = 'fullscreen-send-btn';
    sendBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
    sendBtn.setAttribute('aria-label', `Send message to ${targetId}`);
    sendBtn.style.minWidth = '40px'; // Minimum width
    sendBtn.style.height = '40px'; // Make it more compact but still clickable
    
    buttonsContainer.appendChild(sendBtn);

    // Create a wrapper for the input area that spans the full width
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'fullscreen-input-wrapper';
    inputWrapper.style.width = '100%';
    inputWrapper.style.display = 'flex';
    inputWrapper.style.alignItems = 'flex-start';
    
    // Assemble the container
    inputWrapper.appendChild(fileUploadContainer);
    inputWrapper.appendChild(inputContainer);
    inputWrapper.appendChild(buttonsContainer);
    
    container.appendChild(inputWrapper);
    column.appendChild(container);

    // Setup message sending functionality
    const sendMessageAction = () => {
        const text = textarea.value.trim();
        if (text) {
            onSendMessage(text); // Use the passed handler
            textarea.value = '';
            autoResizeTextarea(textarea); // Reset height
        }
        textarea.focus(); // Keep focus
    };

    // Event listeners
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessageAction();
        }
        autoResizeTextarea(textarea); // Resize on keydown too
    });
    
    textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    sendBtn.addEventListener('click', sendMessageAction);
    
    // File upload handling (should connect to same handler as main interface)
    fileInput.addEventListener('change', (event) => {
        // If there's a global file upload handler, we should use it
        if (window._appState && window._appState.onFileUpload) {
            window._appState.onFileUpload(event.target.files);
        } else {
            // Fallback - add visual indicator that files were selected
            const files = event.target.files;
            if (files.length > 0) {
                fileList.innerHTML = '';
                Array.from(files).forEach(file => {
                    fileList.innerHTML += `<div class="selected-file">${file.name}</div>`;
                });
            }
        }
    });

    setTimeout(() => textarea.focus(), 100); // Focus after render
}

// --- Model Dropdowns ---

/**
 * Populates and sets up model selection dropdowns.
 * @param {Record<string, Array<any>>} availableModels - Models loaded from config.
 * @param {Record<string, string>} selectedModels - Current selections.
 * @param {Function} onModelSelect - Callback when a model is selected (provider, modelId).
 */
export function setupModelDropdowns(availableModels, selectedModels, onModelSelect) {
    console.log("Setting up model dropdowns with:", { availableModels, selectedModels });
    
    AI_PROVIDERS.forEach(provider => {
        const dropdownElement = document.getElementById(`${provider}-model-dropdown`);
        const optionsContainer = dropdownElement?.querySelector('.model-dropdown-options');
        const searchInput = dropdownElement?.querySelector('.model-search-input');
        const selectedNameElement = document.querySelector(`.model-selected[data-target="${provider}"] .selected-model-name`);
        const models = availableModels[provider] || [];

        if (!optionsContainer || !selectedNameElement) {
            console.warn(`UIManager: Dropdown elements not found for provider: ${provider}`);
            return;
        }

        optionsContainer.innerHTML = ''; // Clear existing
        
        // Check for currently selected model
        const currentlySelectedModel = selectedModels[provider];
        console.log(`Provider ${provider} currently selected model:`, currentlySelectedModel);

        if (models.length === 0) {
            optionsContainer.innerHTML = '<div class="model-option disabled">No models loaded</div>';
            selectedNameElement.textContent = 'No Models Available';
            return;
        }

        // Find the selected model's details
        const selectedModelObj = models.find(model => model.id === currentlySelectedModel);
        if (selectedModelObj) {
            // Update the selected model display name
            selectedNameElement.textContent = selectedModelObj.name;
            console.log(`Setting ${provider} selected model display to:`, selectedModelObj.name);
        } else {
            // If no matching model found, use default or first model
            const defaultModel = models.find(model => model.id === availableModels[provider]?.defaultModel) || models[0];
            selectedNameElement.textContent = defaultModel.name;
            console.log(`No matching model found, using default for ${provider}:`, defaultModel.name);
        }

        // Populate options
        models.forEach(model => {
            const option = document.createElement('div');
            option.className = 'model-option';
            option.setAttribute('data-value', model.id);
            option.setAttribute('role', 'option');
            option.setAttribute('tabindex', '-1'); // Make focusable via script/arrow keys
            option.innerHTML = `
                <div class="model-name">${sanitizeHTML(model.name)}</div>
                <div class="model-price">${sanitizeHTML(model.price)}</div>
                ${model.description ? `<div class="model-option-description small text-muted mt-1">${sanitizeHTML(model.description)}</div>` : ''}
            `;

            if (selectedModels[provider] === model.id) {
                option.classList.add('selected');
                option.setAttribute('aria-selected', 'true');
            } else {
                option.setAttribute('aria-selected', 'false');
            }

            option.addEventListener('click', () => {
                handleDropdownSelection(provider, model.id, model.name, optionsContainer, selectedNameElement, onModelSelect);
                closeAllModelDropdowns();
            });
             option.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleDropdownSelection(provider, model.id, model.name, optionsContainer, selectedNameElement, onModelSelect);
                    closeAllModelDropdowns();
                    // Return focus to the trigger button
                    document.querySelector(`.model-selected[data-target="${provider}"]`)?.focus();
                }
            });

            optionsContainer.appendChild(option);
        });

        // Setup search filtering
        if (searchInput) {
            searchInput.addEventListener('keyup', () => {
                filterModelOptions(searchInput.value, optionsContainer);
            });
             searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { // Select first visible option on Enter
                    const firstVisible = optionsContainer.querySelector('.model-option:not([style*="display: none"])');
                    if (firstVisible) {
                        firstVisible.click(); // Simulate click to select
                    }
                } else if (e.key === 'ArrowDown') {
                     e.preventDefault();
                     focusNextOption(optionsContainer, 1);
                } else if (e.key === 'ArrowUp') {
                     e.preventDefault();
                     focusNextOption(optionsContainer, -1);
                }
            });
        }
    });

    // Remove existing event listeners before adding new ones to avoid duplicates
    document.querySelectorAll(SELECTORS.MODEL_SELECTED).forEach(toggler => {
        const newToggler = toggler.cloneNode(true);
        toggler.parentNode.replaceChild(newToggler, toggler);
        
        newToggler.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            const targetProvider = this.dataset.target;
            const dropdown = document.getElementById(`${targetProvider}-model-dropdown`);
            if (dropdown) {
                console.log(`${targetProvider} model selector clicked, toggling dropdown`);
                toggleModelDropdown(dropdown);
            } else {
                console.warn(`Dropdown not found for ${targetProvider}`);
            }
        });
        
        newToggler.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const targetProvider = this.dataset.target;
                const dropdown = document.getElementById(`${targetProvider}-model-dropdown`);
                if (dropdown) {
                    toggleModelDropdown(dropdown);
                }
            }
        });
    });
}

function handleDropdownSelection(provider, modelId, modelName, optionsContainer, selectedNameElement, onModelSelect) {
    onModelSelect(provider, modelId); // Notify main.js
    selectedNameElement.textContent = modelName; // Update display
    // Update selected class in dropdown
    optionsContainer.querySelectorAll('.model-option').forEach(opt => {
        const isSelected = opt.dataset.value === modelId;
        opt.classList.toggle('selected', isSelected);
        opt.setAttribute('aria-selected', isSelected);
    });
    
    // Trigger model-selected event for context window display
    document.dispatchEvent(new CustomEvent('model-selected', {
        detail: { modelType: provider, modelName: modelId }
    }));
    
    // Show visual feedback that selection is done
    const providerContainer = document.getElementById(`${provider}-column`);
    if (providerContainer) {
        const modelSelector = providerContainer.querySelector('.model-selected');
        if (modelSelector) {
            modelSelector.classList.add('selection-confirmed');
            setTimeout(() => {
                modelSelector.classList.remove('selection-confirmed');
            }, 1000);
        }
    }
}

function filterModelOptions(searchTerm, optionsContainer) {
    const term = searchTerm.toLowerCase().trim();
    optionsContainer.querySelectorAll('.model-option').forEach(option => {
        const modelName = option.querySelector('.model-name')?.textContent.toLowerCase() || '';
        const modelDesc = option.querySelector('.model-option-description')?.textContent.toLowerCase() || '';
        const isVisible = modelName.includes(term) || modelDesc.includes(term);
        option.style.display = isVisible ? '' : 'none';
    });
}

function focusNextOption(optionsContainer, direction) {
    const options = Array.from(optionsContainer.querySelectorAll('.model-option:not([style*="display: none"])'));
    if (options.length === 0) return;
    const currentFocus = document.activeElement;
    let currentIndex = options.findIndex(opt => opt === currentFocus);

    if (currentIndex === -1 && direction === -1) { // If focus is outside and moving up, focus last
        currentIndex = 0; // Start from top when moving up from search
    } else if (currentIndex === -1 && direction === 1) { // If focus is outside and moving down, focus first
         currentIndex = -1; // Start before first when moving down from search
    }


    let nextIndex = currentIndex + direction;

    if (nextIndex >= options.length) {
        nextIndex = 0; // Wrap around to top
    } else if (nextIndex < 0) {
        nextIndex = options.length - 1; // Wrap around to bottom
    }

    options[nextIndex]?.focus();
}


export function toggleModelDropdown(dropdown) {
    // Just check if dropdown is visible in the DOM
    const isShown = window.getComputedStyle(dropdown).display !== 'none';
    closeAllModelDropdowns(); // Close others first
    
    if (!isShown) {
        // Position dropdown relative to its trigger
        const providerId = dropdown.id.replace('-model-dropdown', '');
        const selector = document.querySelector(`.model-selected[data-target="${providerId}"]`);
        
        if (selector) {
            // Get the position of the selector button
            const rect = selector.getBoundingClientRect();
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            
            // Position dropdown below the selector
            dropdown.style.position = 'absolute';
            dropdown.style.top = (rect.bottom + scrollTop) + 'px';
            dropdown.style.left = rect.left + 'px';
            
            // Make it wider than the selector for better usability
            dropdown.style.minWidth = Math.max(280, rect.width) + 'px';
            
            // Set expanded state on selector
            selector.setAttribute('aria-expanded', 'true');
            selector.classList.add('expanded');
        }
        
        // Make the dropdown visible with specific styles and overrides
        dropdown.style.display = 'block';
        dropdown.style.opacity = '1';
        dropdown.style.visibility = 'visible';
        dropdown.style.zIndex = '9000';
        dropdown.classList.add('show');
        dropdown.setAttribute('aria-hidden', 'false');
        dropdown.setAttribute('aria-expanded', 'true');
        
        console.log(`Opening dropdown: ${dropdown.id} (DOM visible: ${window.getComputedStyle(dropdown).display !== 'none'})`);
        
        // Focus search input or first option
        const searchInput = dropdown.querySelector('.model-search-input');
        if (searchInput) {
            searchInput.value = ''; // Clear search on open
            filterModelOptions('', dropdown.querySelector('.model-dropdown-options')); // Reset filter
            setTimeout(() => searchInput.focus(), 50); // Delay focus slightly
        } else {
             setTimeout(() => dropdown.querySelector('.model-option')?.focus(), 50);
        }
        
        // Move dropdown to body for better z-index stacking
        if (!dropdown.parentNode.isSameNode(document.body)) {
            // Capture the position first
            const dropdownPos = {
                top: dropdown.style.top,
                left: dropdown.style.left,
                width: dropdown.style.minWidth
            };
            
            // Move to body
            document.body.appendChild(dropdown);
            
            // Restore position
            dropdown.style.top = dropdownPos.top;
            dropdown.style.left = dropdownPos.left;
            dropdown.style.minWidth = dropdownPos.width;
        }
    }
}

function closeAllModelDropdowns() {
    document.querySelectorAll(SELECTORS.MODEL_DROPDOWN).forEach(dropdown => {
        // Reset all display properties
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
        dropdown.style.opacity = '';
        dropdown.style.visibility = '';
        dropdown.style.zIndex = '';
        dropdown.setAttribute('aria-hidden', 'true');
        dropdown.setAttribute('aria-expanded', 'false');
        
        // Reset the corresponding selector
        const providerId = dropdown.id.replace('-model-dropdown', '');
        const selector = document.querySelector(`.model-selected[data-target="${providerId}"]`);
        if (selector) {
            selector.setAttribute('aria-expanded', 'false');
            selector.classList.remove('expanded');
        }
        
        console.log(`Closing dropdown: ${dropdown.id}`);
    });
}

function handleGlobalClickForDropdowns(event) {
    // Close dropdown if click is outside its wrapper
    if (!event.target.closest(SELECTORS.MODEL_DROPDOWN_WRAPPER)) {
        closeAllModelDropdowns();
    }
}

function handleGlobalKeydownForDropdowns(event) {
    if (event.key === 'Escape') {
        const openDropdown = document.querySelector(`${SELECTORS.MODEL_DROPDOWN}.${CSS_CLASSES.SHOW}`);
        if (openDropdown) {
            closeAllModelDropdowns();
            // Return focus to the trigger button
             const provider = openDropdown.id.replace('-model-dropdown', '');
             document.querySelector(`.model-selected[data-target="${provider}"]`)?.focus();
        }
    }
}

// --- Build Modal ---

function openBuildModal() {
    const modal = domCache.BUILD_MODAL;
    const contentArea = domCache.BUILD_MODAL_CONTENT_AREA;
    if (!modal || !contentArea) return;

    contentArea.innerHTML = ''; // Clear previous
    let hasContent = false;

    // Get content from latest responses (assuming main.js manages this state)
    const latestResponses = window._appState?.latestResponses || {}; // Accessing debug state for now
    const visibleColumns = getActiveAndVisibleColumns().map(col => col.id);

    let html = '';
    visibleColumns.forEach(provider => {
        const response = latestResponses[provider];
        if (response && response.trim()) {
            hasContent = true;
            html += `
                <div class="build-content-section">
                    <h4>${provider.charAt(0).toUpperCase() + provider.slice(1)} Response</h4>
                    <div class="build-content">
                        ${marked.parse(response)}
                    </div>
                </div>
            `;
        }
    });

    if (hasContent) {
        html += `
            <div class="build-options">
                <h4>Extract Options</h4>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="code-only-option">
                    <label class="form-check-label" for="code-only-option">Code blocks only</label>
                </div>
            </div>
        `;
    } else {
        html = '<div class="alert alert-info">No content available from active models.</div>';
    }

    contentArea.innerHTML = html;

    // Highlight code and add copy buttons
    contentArea.querySelectorAll('pre code').forEach(block => {
        highlightElement(block);
        addCopyButtonToCodeBlock(block.parentElement);
    });

    // Setup code-only filtering listener
    const codeOnlyOption = contentArea.querySelector('#code-only-option');
    if (codeOnlyOption) {
        codeOnlyOption.addEventListener('change', filterBuildModalContent);
    }

    // Show modal with proper CSS class
    modal.classList.add('show');
    modal.style.display = 'flex'; // Ensure it's displayed as flex
    modal.style.opacity = '1';
    modal.setAttribute('aria-hidden', 'false');
    
    // Add a body class to prevent scrolling
    document.body.classList.add('modal-open');
    
    // Focus modal body for accessibility
    setTimeout(() => contentArea.focus(), 100);
    
    console.log("Build modal opened");
}

function closeBuildModal() {
    const modal = domCache.BUILD_MODAL;
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.style.opacity = '0';
        modal.setAttribute('aria-hidden', 'true');
        
        // Remove body class to allow scrolling again
        document.body.classList.remove('modal-open');
        
        console.log("Build modal closed");
    }
}

function filterBuildModalContent() {
    const contentArea = domCache.BUILD_MODAL_CONTENT_AREA;
    const codeOnly = domCache.CODE_ONLY_OPTION?.checked;
    if (!contentArea) return;

    contentArea.querySelectorAll('.build-content').forEach(section => {
        Array.from(section.children).forEach(child => {
            // Hide non-PRE elements if codeOnly is checked
            child.style.display = (codeOnly && child.tagName !== 'PRE') ? 'none' : '';
        });
    });
}

function getBuildModalContent() {
    const contentArea = domCache.BUILD_MODAL_CONTENT_AREA;
    const codeOnly = domCache.CODE_ONLY_OPTION?.checked;
    if (!contentArea) return '';

    // If code-only is checked, only return the code blocks
    if (codeOnly) {
        let codeContent = '';
        contentArea.querySelectorAll('pre code').forEach(block => {
            codeContent += block.textContent + '\n\n';
        });
        return codeContent.trim();
    }

    // Otherwise return all content
    let content = '';
    contentArea.querySelectorAll('.build-content-section').forEach(section => {
        const title = section.querySelector('h4')?.textContent;
        if (title) content += `## ${title}\n\n`;
        // Directly use the HTML as it's already marked up
        content += section.querySelector('.build-content').innerHTML
            .replace(/<\/p>/g, '</p>\n\n')  // Add newlines after paragraphs
            .replace(/<br>/g, '\n')         // Convert <br> to newlines
            .replace(/<\/?[^>]+(>|$)/g, '') // Strip other HTML tags
            .trim() + '\n\n';
    });
    return content.trim();
}

function copyBuildModalContent() {
    const content = getBuildModalContent();
    if (!content) {
        showError("No content available to copy.");
        return;
    }

    // Use clipboard API to copy
    navigator.clipboard.writeText(content).then(() => {
        const copyBtn = domCache.COPY_BUILD_CONTENT_BTN;
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add(CSS_CLASSES.COPIED);
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove(CSS_CLASSES.COPIED);
            }, 2000);
        }
    }).catch(error => {
        console.error("Failed to copy build content:", error);
        showError("Failed to copy to clipboard.");
    });
}

// --- MCP UI Interaction ---

/**
 * Refreshes the pending operations list by requesting updates from the MCP client.
 */
export function refreshPendingOperations() {
    if (mcpClientInstance) {
        mcpClientInstance.fetchPendingOperations();
        console.log("UIManager: Requested updated pending operations list.");
    } else {
        console.warn("UIManager: Can't refresh operations - MCP client not initialized.");
    }
}

/**
 * Updates the UI list of pending MCP operations.
 * @param {Array<Object>} operations - Array of pending operation objects.
 */
function updatePendingOperationsList(operations) {
    // This would update a UI element showing pending operations
    console.log("UIManager: MCP pending operations updated:", operations.length, "operations");
    
    // Example - if we have a list container defined in SELECTORS and domCache
    const container = document.getElementById('mcp-pending-operations'); // Or from domCache
    if (!container) return;
    
    if (operations.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No pending operations</div>';
        return;
    }
    
    let html = '<ul class="list-group">';
    operations.forEach(op => {
        html += `
            <li class="list-group-item" data-operation-id="${op.id}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${op.type}</strong>: ${op.path}
                        <div class="small text-muted">${op.requestedBy} at ${new Date(op.createdAt).toLocaleString()}</div>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-success approve-op-btn" data-id="${op.id}">Approve</button>
                        <button class="btn btn-sm btn-danger reject-op-btn" data-id="${op.id}">Reject</button>
                    </div>
                </div>
            </li>
        `;
    });
    html += '</ul>';
    container.innerHTML = html;
    
    // Add event listeners for approve/reject buttons
    container.querySelectorAll('.approve-op-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (mcpClientInstance) {
                mcpClientInstance.approveOperation(btn.dataset.id);
            }
        });
    });
    container.querySelectorAll('.reject-op-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (mcpClientInstance) {
                mcpClientInstance.rejectOperation(btn.dataset.id);
            }
        });
    });
}

/**
 * Removes an operation from the UI list after approval/rejection.
 * @param {string} operationId - The ID of the operation to remove.
 */
function removeOperationFromList(operationId) {
    const item = document.querySelector(`[data-operation-id="${operationId}"]`);
    if (item) {
        item.classList.add('fade-out');
        setTimeout(() => item.remove(), 300);
    }
}

// --- Utility Functions ---

/**
 * Auto-resizes a textarea based on its content.
 * @param {HTMLTextAreaElement} textarea - The textarea to resize.
 */
function autoResizeTextarea(textarea) {
    if (!textarea) return;
    
    // Reset height to auto to get correct scroll height
    textarea.style.height = 'auto';
    
    // Apply min-height, max-height limits from CSS (converted to px)
    const computedStyle = window.getComputedStyle(textarea);
    const minHeight = parseInt(computedStyle.getPropertyValue('min-height'), 10);
    const maxHeight = parseInt(computedStyle.getPropertyValue('max-height'), 10);
    
    // Get target height based on content
    let targetHeight = textarea.scrollHeight;
    if (!isNaN(minHeight)) targetHeight = Math.max(targetHeight, minHeight);
    if (!isNaN(maxHeight)) targetHeight = Math.min(targetHeight, maxHeight);
    
    // Apply final calculated height and toggle expanded class
    textarea.style.height = `${targetHeight}px`;
    textarea.classList.toggle(CSS_CLASSES.EXPANDED_INPUT, targetHeight > 80); // Arbitrary expanded threshold
}

/**
 * Adds copy and preview buttons to a code block.
 * @param {HTMLElement} preElement - The <pre> element containing the code.
 */
function addCopyButtonToCodeBlock(preElement) {
    if (!preElement || preElement.querySelector('.code-buttons')) return; // Skip if already has buttons
    
    const codeElement = preElement.querySelector('code');
    if (!codeElement) return;
    
    // Create a container for buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'code-buttons';
    
    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
    copyButton.setAttribute('aria-label', 'Copy code to clipboard');
    copyButton.title = 'Copy to clipboard';
    
    copyButton.addEventListener('click', () => {
        const code = codeElement.textContent;
        navigator.clipboard.writeText(code).then(() => {
            // Show copied indicator
            copyButton.innerHTML = '<i class="bi bi-check-lg"></i>';
            copyButton.classList.add(CSS_CLASSES.COPIED);
            setTimeout(() => {
                copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
                copyButton.classList.remove(CSS_CLASSES.COPIED);
            }, 2000);
        }).catch(error => {
            console.error("Failed to copy code:", error);
            copyButton.innerHTML = '<i class="bi bi-x-lg"></i>';
            setTimeout(() => {
                copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
            }, 2000);
        });
    });
    
    // Add copy button to container
    buttonContainer.appendChild(copyButton);
    
    // Get code content and check if it's previewable
    const code = codeElement.textContent;
    const language = codeElement.className.replace('language-', '').trim();
    
    // Check if the code is HTML, CSS, or JavaScript
    const isPreviewable = 
        ['html', 'css', 'js', 'javascript', 'jsx', 'tsx', 'vue'].includes(language) || 
        (code.includes('<html') || code.includes('<body') || code.includes('<div') || 
         code.includes('function') || code.includes('const ') || code.includes('var ') || 
         code.includes('let ') || code.includes('class=') || code.includes('id='));
    
    // Add preview button for previewable code
    if (isPreviewable) {
        const previewButton = document.createElement('button');
        previewButton.className = 'preview-button';
        previewButton.innerHTML = '<i class="bi bi-eye"></i>';
        previewButton.setAttribute('aria-label', 'Preview code');
        previewButton.title = 'Preview code';
        
        previewButton.addEventListener('click', () => {
            // Import the CodePreviewManager dynamically
            import('./codePreviewManager.js').then(module => {
                // Show the preview
                module.showCodePreview(code, `Code Preview (${language || 'auto-detected'})`);
            }).catch(err => {
                console.error('Failed to load code preview manager:', err);
                alert('Code preview is not available. Please try again later.');
            });
        });
        
        // Add preview button to container
        buttonContainer.appendChild(previewButton);
    }
    
    // Add the button container to the pre element
    preElement.appendChild(buttonContainer);
}

/**
 * Formats a file size in bytes into a human-readable format.
 * @param {number} bytes - The file size in bytes.
 * @returns {string} Formatted file size (e.g., "2.5 MB").
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Scrolls a container to the bottom.
 * @param {HTMLElement} container - The container to scroll.
 */
function scrollToBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
}

/**
 * Sanitizes HTML to prevent XSS.
 * @param {string} html - The HTML string to sanitize.
 * @returns {string} The sanitized HTML.
 */
function sanitizeHTML(html) {
    if (!html) return '';
    let text = String(html);
    text = text.replace(/&/g, '&');
    text = text.replace(/</g, '<');
    text = text.replace(/>/g, '>');
    text = text.replace(/"/g, '"');
    text = text.replace(/'/g, '\'');
    return text;
}

/**
 * Debounces a function to limit how often it's called.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The milliseconds to wait.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Gets all active and visible AI columns.
 * @returns {Array<{id: string, column: HTMLElement, messagesContainer: HTMLElement}>} Array of column objects.
 */
export function getActiveAndVisibleColumns() {
    const results = [];
    
    AI_PROVIDERS.forEach(provider => {
        const column = domCache[`${provider.toUpperCase()}_COLUMN`];
        // Check if the column exists and is not marked as hidden by our class
        // The computed style check is robust.
        if (column && window.getComputedStyle(column).display !== 'none') {
            const messagesContainer = domCache[`${provider.toUpperCase()}_MESSAGES`];
            if (messagesContainer) {
                results.push({
                    id: provider,
                    column: column,
                    messagesContainer: messagesContainer
                });
            }
        }
    });
    
    // console.log(`UIManager: Found ${results.length} active and visible columns`); // Kept for debugging
    return results;
}

/**
 * Gets the messages container for a specific AI target.
 * @param {string} target - The target ID (claude, gemini, etc.) or 'collab'.
 * @returns {HTMLElement|null} The messages container or null if not found.
 */
export function getMessageContainer(target) {
    // Special case for collaborative summary
    if (target === 'collab') {
        // For collaboration summary, show in the first visible column
        const firstColumn = getActiveAndVisibleColumns()[0];
        return firstColumn ? firstColumn.messagesContainer : null;
    }
    
    // Normal case - get specific target's container
    return domCache[`${target.toUpperCase()}_MESSAGES`];
}

/**
 * Clears the message input field.
 */
export function clearMessageInput() {
    if (domCache.MESSAGE_INPUT) {
        domCache.MESSAGE_INPUT.value = '';
        autoResizeTextarea(domCache.MESSAGE_INPUT);
        domCache.MESSAGE_INPUT.focus();
    }
}

/**
 * Clears the CLI input field.
 */
export function clearCliInput() {
    if (domCache.CLI_INPUT) {
        domCache.CLI_INPUT.value = '';
    }
}

/**
 * Adds a CLI command to the output area.
 * @param {string} command - The command text.
 */
export function addCliCommandToOutput(command) {
    handleCommandOutput({ command, output: 'Executing...' });
}

/**
 * Updates the file list UI.
 * @param {Array<object>} files - Array of file objects.
 * @param {Function} onRemove - Handler for file removal.
 */
export function updateFileListUI(files, onRemove) {
    const fileList = domCache.FILE_LIST;
    if (!fileList) return;
    
    fileList.innerHTML = '';
    if (files.length === 0) {
        fileList.innerHTML = '<div class="no-files">No files attached</div>';
        return;
    }
    
    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item d-flex justify-content-between align-items-center';
        
        // Choose icon based on file type
        let iconClass = 'bi-file-earmark';
        if (file.type?.startsWith('image/')) iconClass = 'bi-file-earmark-image';
        else if (file.type?.startsWith('text/')) iconClass = 'bi-file-earmark-text';
        else if (file.type?.includes('pdf')) iconClass = 'bi-file-earmark-pdf';
        
        fileItem.innerHTML = `
            <div class="file-info">
                <i class="bi ${iconClass}"></i>
                <span class="file-name">${sanitizeHTML(file.name)}</span>
                <span class="file-size">(${formatFileSize(file.size)})</span>
                ${file.uploading ? '<span class="uploading-indicator">Uploading...</span>' : ''}
            </div>
            <button type="button" class="btn btn-sm btn-link remove-file" data-index="${index}" title="Remove file">
                <i class="bi bi-x-circle"></i><span class="sr-only">Remove</span>
            </button>
        `;
        
        fileList.appendChild(fileItem);
    });
}

/**
 * Highlights a code element using highlight.js.
 * @param {HTMLElement} codeElement - The code element to highlight.
 */
function highlightElement(codeElement) {
    if (!codeElement || typeof hljs === 'undefined') return;
    try {
        hljs.highlightElement(codeElement);
    } catch (e) {
        console.warn("Error highlighting code:", e);
    }
}

// --- Accessibility Setup ---

/**
 * Sets up accessibility features for the interface.
 */
export function setupAccessibility() {
    // Create a live region if it doesn't exist
    if (!document.getElementById('a11y-live-region')) {
        const liveRegion = document.createElement('div');
        liveRegion.id = 'a11y-live-region';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.className = CSS_CLASSES.SR_ONLY;
        document.body.appendChild(liveRegion);
    }
    
    // Add screen reader announcements for each column
    AI_PROVIDERS.forEach(provider => {
        const column = domCache[`${provider.toUpperCase()}_COLUMN`];
        if (column && !column.querySelector('.screen-reader-announcement')) {
            const srElement = document.createElement('div');
            srElement.className = 'screen-reader-announcement sr-only';
            srElement.setAttribute('aria-live', 'polite');
            column.appendChild(srElement);
        }
    });
    
    console.log("UIManager: Accessibility features setup complete.");
}

// --- Public exports (in addition to the ones throughout the file) ---

/**
 * Shows a notification when a model is changed.
 * @param {string} provider - The AI provider ID (e.g., 'claude', 'gemini').
 * @param {string} modelName - The name of the selected model.
 */
export function showModelChangeNotification(provider, modelName) {
    // First add a system message in the provider's message area
    const messagesContainer = getMessageContainer(provider);
    if (messagesContainer) {
        addSystemMessage(messagesContainer, `Model changed to: ${modelName}`, 'success');
    }
    
    // Then show a temporary toast notification
    const notification = document.createElement('div');
    notification.className = 'model-change-notification';
    notification.innerHTML = `
        <div class="notification-icon"><i class="bi bi-check-circle-fill"></i></div>
        <div class="notification-content">
            <div class="notification-title">${provider.charAt(0).toUpperCase() + provider.slice(1)} Model Changed</div>
            <div class="notification-message">Now using: ${modelName}</div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Remove after a delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300); // Remove after fade out
    }, 3000);
}

// --- Public exports (in addition to the ones throughout the file) ---

/**
 * Makes exported methods available to main.js.
 */
