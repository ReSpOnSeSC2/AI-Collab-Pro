/**
 * AI Collaboration Hub - Main Frontend Logic (Refactored)
 * Entry point for the application, initializes modules and manages state.
 * Version: 8.0.0
 */

import * as UIManager from './uiManager.js';
import * as ConnectionManager from './connectionManager.js';
import * as ModelLoader from './modelLoader.js';
import * as AuthHandler from './authHandler.js';
import * as MCPClient from './mcpClient.js'; // Assuming mcpClient.js exports necessary functions/class
import * as CodePreviewManager from './codePreviewManager.js';
import * as CollaborationControls from './collaborationControls.js';
import * as CollaborationLimits from './collaborationLimits.js';
import LoadingManager from './loadingManager.fixed.js';

console.log('AI Hub Main Module (main.js) Initializing...');

// --- Global State (Managed within this module) ---
const state = {
    uploadedFiles: [],
    currentMessageElements: { claude: null, gemini: null, chatgpt: null, grok: null, deepseek: null, llama: null },
    selectedModels: {}, // Populated by ModelLoader
    defaultModels: {}, // Populated by ModelLoader
    availableModels: {}, // Populated by ModelLoader
    collaboration: { mode: 'individual', style: 'balanced' }, // Style option maintained in UI
    userId: null, // Set by AuthHandler
    mcpClient: null, // MCP Client instance
    isMobile: window.innerWidth <= 768,
    // Add other necessary state properties here
};
window._appState = state; // Expose for debugging ONLY

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Initializing AI Hub App v8.0.1');
    UIManager.initializeUI(); // Cache elements that exist initially
    UIManager.applySavedTheme();
    
    // Initialize code preview manager
    CodePreviewManager.initialize();

    // Wait for layout manager to inject header/footer
    document.addEventListener('layout-ready', async () => {
        console.log('Layout Ready event received. Proceeding with main initialization.');

        // Re-cache elements now that header/footer are injected
        UIManager.cacheDomElements(); // Assuming UIManager has this function

        // --- Continue with steps 2-7 from the previous main.js ---
        // 2. Load Model Configurations
        try {
            const modelConfigs = await ModelLoader.loadAllModelConfigurations();
            if (modelConfigs) {
                state.defaultModels = modelConfigs.defaultModels;
                state.availableModels = modelConfigs.availableModels;
                // Initialize selected models with defaults from loaded config
                Object.keys(state.defaultModels).forEach(provider => {
                    state.selectedModels[provider] = state.defaultModels[provider];
                });
                console.log("Model configurations loaded:", state.selectedModels);
                UIManager.setupModelDropdowns(state.availableModels, state.selectedModels, handleModelSelection);
                UIManager.initializeModelToggleState(); // Set initial column visibility
            } else {
                console.error("Failed to load model configurations. Using hardcoded defaults.");
                // Populate state with hardcoded defaults as a fallback (less ideal)
                // state.defaultModels = { claude: 'claude-3.7-sonnet', ... };
                // state.availableModels = { claude: [{id: 'claude-3.7-sonnet', ...}], ... };
                // state.selectedModels = { ...state.defaultModels };
                UIManager.showError("Failed to load model configurations. Some features might be limited.");
            }
        } catch (error) {
            console.error("Error loading model configurations:", error);
            UIManager.showError("Error loading model configurations.");
            // Handle fallback if necessary
        }

        // 3. Initialize Authentication
        AuthHandler.initialize();
        document.addEventListener('auth:login', handleAuthLogin);
        document.addEventListener('auth:checked', handleAuthChecked);

        // 4. Connection Manager (Connects WebSocket after auth check via event)
        // 5. MCP Client (Initializes after WebSocket connection via event)
        document.addEventListener('websocket-connected', handleWebSocketConnected);
        document.addEventListener('websocket-disconnected', handleWebSocketDisconnected);

        // 6. Setup Core Event Listeners
        UIManager.setupCoreEventListeners(
            handleSendMessage,
            handleCliCommand,
            handleFileUpload,
            handleRemoveFile,
            handleCollabModeChange,
            handleCollabStyleChange,
            handleModelToggleChange,
            handleFullscreenToggle,
            handleToggleCliFullscreen
        );

        // 7. Final UI Setup
        UIManager.loadUIPreferences();
        // Initialize the new collaboration controls
        CollaborationControls.initialize();
        document.addEventListener('collab-mode-change', (e) => handleCollabModeChange(e.detail.mode));
        document.addEventListener('collab-style-change', (e) => handleCollabStyleChange(e.detail.style));

        // Initialize collaboration limits monitoring
        CollaborationLimits.initialize();

        UIManager.setupAccessibility();
        UIManager.updateColumnWidths();
        UIManager.setupMobileColumnActivation(state.isMobile);

        // Initial API status check
        ConnectionManager.checkApiStatus().catch(err => {
            UIManager.showError(`Failed to check API status: ${err.message}`);
        });

        console.log("AI Hub App Initialization Complete (Post Layout).");
    });
});

// Event handler functions (extracted for better readability)
function handleAuthLogin(event) {
    state.userId = event.detail?.id;
    console.log(`User authenticated/identified: ${state.userId}`);
    // Potentially trigger actions requiring user ID, like fetching MCP operations
    if (state.mcpClient && state.userId) {
        state.mcpClient.setUserId(state.userId); // Assuming MCP client has a method to set user ID
        UIManager.refreshPendingOperations(); // Refresh MCP UI if needed
    }
}

function handleAuthChecked(event) {
    console.log("Auth check complete:", event.detail);
    // Now safe to connect WebSocket as we have a user ID (even if default)
    ConnectionManager.connectWebSocket(handleWebSocketMessage, handleWebSocketStateChange);
}

function handleWebSocketConnected(event) {
    const socket = event.detail.socket; // Get socket from event
    if (socket) {
        state.mcpClient = MCPClient.createClient(socket); // Assuming createClient is exported
        console.log("MCP Client initialized.");
        if (state.userId) {
            state.mcpClient.setUserId(state.userId); // Ensure user ID is set
            // Example: Automatically register a default context or fetch pending ops
            UIManager.refreshPendingOperations();
        }
        // Make MCP client accessible to UI Manager for UI updates
        UIManager.setMcpClient(state.mcpClient);
    } else {
        console.error("WebSocket connected event fired, but no socket instance found in event detail.");
    }
}

function handleWebSocketDisconnected() {
    console.log("MCP Client notified of WebSocket disconnection.");
    // Optionally handle MCP state cleanup on disconnect
}

function handleToggleCliFullscreen() {
    UIManager.toggleCliFullscreen();
}

// --- WebSocket Event Handlers ---

function handleWebSocketMessage(data) {
    // Skip all internal protocol messages silently
    if (data.type === 'ping' || data.type === 'pong' || 
        data.type === 'debug_ping' || data.type === 'debug_pong') {
        // Don't do anything with protocol messages
        return;
    }
    
    // Fix for handling unknown message types
    if (!data.type || typeof data.type !== 'string') {
        console.debug('Received message with missing or invalid type:', data);
        return;
    }
    
    switch (data.type) {
        case 'response':
            UIManager.handleAiResponse(data, state.currentMessageElements);
            break;
        case 'model_status':
            // Handle model status updates including phase changes
            if (data.status === 'phase_change') {
                // Get the currently active models from UI as a proxy for models in this phase
                const activeModelsForPhase = UIManager.getActiveAndVisibleColumns().map(col => col.id);
                LoadingManager.updateForPhase(data.message, activeModelsForPhase);
            } else {
                LoadingManager.updateModelStatus(data.model, data.status, data.message);
            }
            break;
        case 'command-output':
            UIManager.handleCommandOutput(data);
            break;
        case 'collaboration_cancelled':
            // Hide loading UI when collaboration is cancelled
            LoadingManager.hide();
            UIManager.showError("Collaboration cancelled: " + data.message);

            // Fire event for collaboration failure monitoring
            const failureEvent = new CustomEvent('collaboration-aborted', {
                detail: { message: data.message || "The collaboration was cancelled. Try using fewer AI models." }
            });
            document.dispatchEvent(failureEvent);
            break;
        case 'collaboration_complete':
            // DON'T hide loading UI yet when collaboration is complete - wait for cost_info
            // This maintains the loading UI until all results are shown in the chat
            console.log("Collaboration complete event received, waiting for final results");
            break;
        case 'error':
            UIManager.showError(data.message, data.target);
            // If error relates to a specific AI, remove typing indicator
            if (data.target && state.currentMessageElements[data.target]) {
                UIManager.removeTypingIndicator(UIManager.getMessageContainer(data.target));
                state.currentMessageElements[data.target] = null;
            }
            // Update loading UI if needed
            if (data.target) {
                LoadingManager.updateModelStatus(data.target, 'failed', data.message);
            }
            break;
        case 'authentication_success':
            console.log("Server confirmed authentication for:", data.userId);
            break;
        case 'mcp_context_registered':
        case 'mcp_files_listed':
        case 'mcp_file_read':
        case 'mcp_write_requested':
        case 'mcp_delete_requested':
        case 'mcp_create_directory_requested':
        case 'mcp_pending_operations':
        case 'mcp_operation_approved':
        case 'mcp_operation_rejected':
            if (state.mcpClient) {
                state.mcpClient.handleWebSocketMessage({ data: JSON.stringify(data) }); // Forward to MCP client
            } else {
                console.warn("Received MCP message but MCP client is not initialized.");
            }
            break;
        // Handle other message types (collab updates, etc.)
        // Collaboration style handling removed (no backend implementation)
        case 'collab_mode_updated':
            state.collaboration.mode = data.mode;
            CollaborationControls.setMode(data.mode);
            UIManager.addSystemMessageToAll(`Collaboration mode set to: ${data.mode === 'individual' ? 'Individual' : CollaborationControls.COLLABORATION_MODES[data.mode]?.name || data.mode}`);
            break;
        case 'cost_info':
            CollaborationControls.showCostInfo(data.cost, data.mode);
            // Only hide loading UI after cost info is received (collaboration complete)
            // This ensures the loading UI stays visible until the complete answer is in the chat
            LoadingManager.hide();
            break;
        default:
            // Silently log unknown message types instead of showing errors
            console.debug(`Unhandled WebSocket message type: ${data.type}`, data);
    }
}

function handleWebSocketStateChange(isConnected) {
    console.log(`WebSocket State Changed: ${isConnected ? 'Connected' : 'Disconnected'}`);
    UIManager.updateAllStatusIndicators(isConnected);
    if (!isConnected) {
        // Reset any ongoing AI responses on disconnect
        Object.keys(state.currentMessageElements).forEach(target => {
            if (state.currentMessageElements[target]) {
                UIManager.removeTypingIndicator(UIManager.getMessageContainer(target));
                state.currentMessageElements[target] = null;
            }
        });
        UIManager.broadcastSystemMessage('Connection lost. Attempting to reconnect...', 'warning');
    } else {
        UIManager.broadcastSystemMessage('Connection established.', 'success');
        // Re-authenticate or send user ID upon reconnection if needed
        if (state.userId) {
            ConnectionManager.sendMessageToServer({ type: 'authenticate', userId: state.userId });
        }
         // Update MCP client with new socket if necessary
        if (state.mcpClient && ConnectionManager.getWebSocket()) {
            state.mcpClient.updateWebsocket(ConnectionManager.getWebSocket());
        }
    }
}

// --- Action Handlers ---

function handleSendMessage(messageText) {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage && state.uploadedFiles.length === 0) {
        UIManager.showInputError('Message cannot be empty.');
        return;
    }

    const activeColumnsData = UIManager.getActiveAndVisibleColumns();
    const activeAISystems = activeColumnsData.map(colData => colData.id);
    
    // Show loading screen for round-table collaboration if multiple models are selected
    if (activeAISystems.length > 1 && state.collaboration.mode !== 'individual') {
        console.log("Starting collaboration with multiple models - showing loading screen");

        // Show warning if too many models selected
        CollaborationLimits.showTimeoutWarning(activeAISystems);

        // Create an initialization script to ensure the loading screen is available
        // and fix any potential timing issues with DOM availability
        const ensureLoadingScreen = () => {
            // Force create the loading overlay
            LoadingManager.createLoadingOverlay();
            
            // Show the loading screen with the active AI systems
            const abortSignal = LoadingManager.show(activeAISystems, () => {
                // This callback is invoked when user clicks the cancel button
                ConnectionManager.sendMessageToServer({
                    type: 'cancel_collaboration',
                    userId: state.userId,
                    models: activeAISystems
                });
                console.log("User cancelled collaboration");
            });
            
            // Extra safety: manually ensure the overlay is visible with inline styles
            const loadingOverlay = document.getElementById('collaboration-loading');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'flex';
                loadingOverlay.style.opacity = '1';
                loadingOverlay.style.visibility = 'visible';
                loadingOverlay.classList.remove('hidden');
                console.log("Collaboration loading screen manually forced to display");
            } else {
                console.error("Loading overlay element still not found after creation attempt");
            }
            
            return abortSignal;
        };
        
        // Call the initialization function
        ensureLoadingScreen();
    }

    if (activeAISystems.length === 0) {
        UIManager.showError("No active AI models selected or visible.");
        // Optionally, try to auto-enable one
        const firstToggle = document.querySelector('.model-toggle');
        if (firstToggle && !firstToggle.checked) {
            firstToggle.checked = true;
            handleModelToggleChange(firstToggle, firstToggle.dataset.model);
            UIManager.showError(`Automatically enabled ${firstToggle.dataset.model}. Please try sending again.`);
        }
        return;
    }

    // Add user message to UI
    UIManager.addUserMessage(trimmedMessage, state.uploadedFiles);

    // Show typing indicators
    activeColumnsData.forEach(colData => {
        if (colData.messagesContainer) UIManager.addTypingIndicator(colData.messagesContainer);
    });

    // Prepare model info payload (ensure array format)
    const modelInfoPayload = {};
    activeAISystems.forEach(aiSystem => {
        const selectedModelId = state.selectedModels[aiSystem] || state.defaultModels[aiSystem];
        modelInfoPayload[aiSystem] = [selectedModelId]; // Always send as array
    });

    // Check if collaboration toggles are checked
    const enhancedCollabToggle = document.getElementById('enhanced-collab-toggle');
    const ignoreFailuresToggle = document.getElementById('ignore-failures-toggle');
    
    const payload = {
        type: 'chat',
        target: activeAISystems.length > 1 ? 'collab' : activeAISystems[0],
        message: trimmedMessage,
        filePaths: state.uploadedFiles.map(file => file.path).filter(Boolean),
        models: modelInfoPayload,
        collaborationMode: state.collaboration.mode,
        userId: state.userId, // Include user ID
        useEnhancedCollab: enhancedCollabToggle && enhancedCollabToggle.checked, // Add enhanced collab flag based on toggle state
        ignoreFailingModels: ignoreFailuresToggle && ignoreFailuresToggle.checked // Add ignore failures flag based on toggle state
    };

    const success = ConnectionManager.sendMessageToServer(payload);

    if (success) {
        UIManager.clearMessageInput();
        state.uploadedFiles = []; // Clear files after sending
        UIManager.updateFileListUI(state.uploadedFiles, handleRemoveFile);
    } else {
        // Remove typing indicators if send failed immediately
        activeColumnsData.forEach(colData => {
            if (colData.messagesContainer) UIManager.removeTypingIndicator(colData.messagesContainer);
        });
        UIManager.showError("Failed to send message. Check connection.");
    }
}

function handleCliCommand(command) {
    if (!command) return;
    UIManager.addCliCommandToOutput(command); // Show command in output
    ConnectionManager.sendMessageToServer({
        type: 'command',
        command: command,
        userId: state.userId // Include user ID
    });
    UIManager.clearCliInput();
}

function handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    Array.from(files).forEach(file => {
        formData.append('files', file);
        // Add to state immediately for UI update
        state.uploadedFiles.push({
            name: file.name,
            size: file.size,
            type: file.type,
            uploading: true, // Mark as uploading
            path: null // Path will be updated on success
        });
    });
    UIManager.updateFileListUI(state.uploadedFiles, handleRemoveFile); // Show uploading state

    // Use ConnectionManager or a dedicated API module for fetch
    ConnectionManager.uploadFiles(formData)
        .then(uploadedFilesData => {
            // Update state with server paths and mark as not uploading
            state.uploadedFiles = state.uploadedFiles.map(localFile => {
                const serverFile = uploadedFilesData.find(f => f.originalName === localFile.name);
                if (serverFile) {
                    return { ...localFile, uploading: false, path: serverFile.path };
                }
                // Keep files that failed upload marked or remove them
                return localFile.uploading ? null : localFile; // Remove if still marked as uploading (means it failed)
            }).filter(Boolean); // Remove nulls
            UIManager.updateFileListUI(state.uploadedFiles, handleRemoveFile);
        })
        .catch(error => {
            console.error('File upload error in main.js:', error);
            UIManager.showError(`File upload failed: ${error.message}`);
            // Remove files marked as uploading from state
            state.uploadedFiles = state.uploadedFiles.filter(file => !file.uploading);
            UIManager.updateFileListUI(state.uploadedFiles, handleRemoveFile);
        });
}

function handleRemoveFile(fileIndex) {
    if (fileIndex >= 0 && fileIndex < state.uploadedFiles.length) {
        // TODO: Optionally, send request to server to delete uploaded file if needed
        state.uploadedFiles.splice(fileIndex, 1);
        UIManager.updateFileListUI(state.uploadedFiles, handleRemoveFile);
    }
}

function handleCollabModeChange(newMode) {
    if (state.collaboration.mode !== newMode) {
        state.collaboration.mode = newMode;
        console.log(`Collaboration mode changed to: ${newMode}`);
        ConnectionManager.sendMessageToServer({ type: 'set_collab_mode', mode: newMode });
        // Using individual mode turns off enhanced collab toggle
        const isCollaborative = newMode !== 'individual';
    }
}

function handleCollabStyleChange(newStyle) {
    if (state.collaboration.style !== newStyle) {
        state.collaboration.style = newStyle;
        console.log(`Collaboration style changed to: ${newStyle}`);
        // UI is updated through CollaborationControls.setStyle()
        // No server message needed since there's no backend implementation
    }
}

function handleModelToggleChange(toggleElement, modelId) {
    UIManager.toggleColumnVisibility(modelId, toggleElement.checked);
    UIManager.updateColumnWidths();

    // Check if we should show a warning about too many active models
    const activeModels = UIManager.getActiveAndVisibleColumns().map(col => col.id);
    CollaborationLimits.showTimeoutWarning(activeModels);
}

function handleModelSelection(provider, modelId) {
    if (state.selectedModels[provider] !== modelId) {
        const previousModel = state.selectedModels[provider];
        state.selectedModels[provider] = modelId;
        console.log(`Selected model for ${provider}: ${modelId}`);
        
        // Find the model name for display
        const modelName = state.availableModels[provider]?.find(m => m.id === modelId)?.name || modelId;
        
        // Show confirmation notification to user
        UIManager.showModelChangeNotification(provider, modelName);
        
        // Optionally notify server of model change
        ConnectionManager.sendMessageToServer({ 
            type: 'model_selection', 
            provider: provider, 
            modelId: modelId 
        });
    }
}

function handleFullscreenToggle(targetId, isEnteringFullscreen) {
    // UIManager handles the visual toggling
    console.log(`Fullscreen toggled for ${targetId}: ${isEnteringFullscreen ? 'ON' : 'OFF'}`);
    if (isEnteringFullscreen) {
        UIManager.enterFullscreenEffect(targetId, handleSendMessage); // Pass send handler
    } else {
        UIManager.exitFullscreenEffect(targetId);
    }
}

function toggleCliFullscreen() {
    UIManager.toggleCliFullscreen();
}

// --- Resize Listener ---
window.addEventListener('resize', UIManager.debounce(() => {
    const wasMobile = state.isMobile;
    state.isMobile = window.innerWidth <= 768;
    if (wasMobile !== state.isMobile) {
        UIManager.setupMobileColumnActivation(state.isMobile); // Re-setup mobile interactions if breakpoint crossed
    }
    UIManager.updateColumnWidths();
}, 250));

// --- Expose limited functionality for debugging ---
window._app = {
    getState: () => ({ ...state }), // Return a copy
    sendMessage: handleSendMessage,
    sendCliCommand: handleCliCommand,
    checkConnection: () => ConnectionManager.checkConnectionStatus(),
    reconnect: () => ConnectionManager.connectWebSocket(handleWebSocketMessage, handleWebSocketStateChange),
    checkApi: () => ConnectionManager.checkApiStatus(),
    getMcpClient: () => state.mcpClient,
    showCodePreview: (code, title) => CodePreviewManager.showCodePreview(code, title),
};

// Make CodePreviewManager globally available for easier access
window.CodePreviewManager = CodePreviewManager;

// Make state available to other modules (like LoadingManager) through window
window._appState = state;