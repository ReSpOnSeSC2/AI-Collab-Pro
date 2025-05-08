/**
 * Frontend Debug Utilities (Refactored Module)
 * Provides functions for diagnosing frontend state and connectivity.
 * Version: 8.0.0
 */

// Import necessary modules if they expose needed functions/state directly
// import * as ConnectionManager from './connectionManager.js';
// import * as UIManager from './uiManager.js';
// Or, rely on the global _app object exposed by main.js for debugging

console.log("Debug Utilities: Initializing.");

/**
 * Gets the current application state (use cautiously for debugging).
 * @returns {object | null} A copy of the state object or null.
 */
function getAppState() {
    if (window._app && typeof window._app.getState === 'function') {
        return window._app.getState();
    }
    console.warn("DebugUtils: Cannot access application state via window._app.getState().");
    return null;
}

/**
 * Checks the environment and basic setup.
 */
function checkEnvironment() {
    console.groupCollapsed("Debug: Environment Check");
    console.log("URL:", window.location.href);
    console.log("Path:", window.location.pathname);
    console.log("User Agent:", navigator.userAgent);
    console.log("Window Size:", `${window.innerWidth}x${window.innerHeight}`);
    console.log("Timestamp:", new Date().toISOString());
    console.log("Theme:", document.documentElement.className);
    console.groupEnd();
}

/**
 * Checks the status of the WebSocket connection via ConnectionManager.
 */
function checkWebSocket() {
    console.groupCollapsed("Debug: WebSocket Check");
    if (window._app?.conn && typeof window._app.conn.getWebSocket === 'function') {
        const ws = window._app.conn.getWebSocket();
        if (ws) {
            const states = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
            console.log("Status:", states[ws.readyState] || 'UNKNOWN');
            console.log("URL:", ws.url);
            console.log("Buffered Amount:", ws.bufferedAmount);
            console.log("Extensions:", ws.extensions);
            console.log("Protocol:", ws.protocol);
        } else {
            console.log("Status: Not Initialized / Disconnected (No active WebSocket instance)");
        }
    } else {
        console.warn("DebugUtils: Cannot access ConnectionManager via window._app.conn");
    }
    console.groupEnd();
}

/**
 * Checks the status of loaded models and current selections.
 */
function checkModels() {
    console.groupCollapsed("Debug: Model Check");
    const state = getAppState();
    if (state) {
        console.log("Default Models:", state.defaultModels);
        console.log("Selected Models:", state.selectedModels);
        console.log("Available Models:", state.availableModels);
    } else {
        console.warn("DebugUtils: Cannot check models, state unavailable.");
    }
    console.groupEnd();
}

/**
 * Checks the status of the MCP client.
 */
function checkMCP() {
     console.groupCollapsed("Debug: MCP Client Check");
     const state = getAppState();
     if (state && state.mcpClient) {
         console.log("MCP Client Instance:", state.mcpClient);
         console.log("  User ID:", state.mcpClient.userId);
         console.log("  Token:", state.mcpClient.token ? `${state.mcpClient.token.substring(0, 8)}...` : 'None');
         console.log("  Directory:", state.mcpClient.directory);
         // Optionally trigger a refresh of pending ops for debug view
         window._app?.ui?.refreshPendingOperations();
     } else {
         console.log("MCP Client: Not initialized or state unavailable.");
     }
     console.groupEnd();
}

/**
 * Sends a test ping message via the ConnectionManager.
 */
function testPing() {
    console.log("Debug: Sending test ping...");
    if (window._app?.conn && typeof window._app.conn.sendMessageToServer === 'function') {
        const success = window._app.conn.sendMessageToServer({ type: 'debug_ping', message: 'Debug Utils Test Ping' });
        console.log(`Debug: Ping send attempt ${success ? 'succeeded' : 'failed'}. Check console/network for pong.`);
    } else {
        console.warn("DebugUtils: Cannot send ping, ConnectionManager or sendMessageToServer not available.");
    }
}

/**
 * Attempts to trigger a WebSocket reconnect via ConnectionManager.
 */
function forceReconnect() {
    console.log("Debug: Forcing WebSocket reconnect...");
     if (window._app?.conn && typeof window._app.conn.connectWebSocket === 'function' && typeof window._app.handleWebSocketMessage === 'function' && typeof window._app.handleWebSocketStateChange === 'function') {
        // Need to pass the handlers from main.js again, which isn't ideal from a debug script.
        // A better approach might be for ConnectionManager to store the handlers.
        // For now, we'll rely on the existing handlers if CM stored them, or just call connect.
        console.warn("DebugUtils: Calling connectWebSocket. Ensure main.js handlers are correctly re-registered if CM doesn't store them.");
        window._app.conn.connectWebSocket(window._app.handleWebSocketMessage, window._app.handleWebSocketStateChange); // Assumes main.js handlers are accessible on _app
    } else {
        console.warn("DebugUtils: Cannot force reconnect, ConnectionManager or handlers not available via _app.");
    }
}

/**
 * Runs all diagnostic checks.
 */
export function runAllDiagnostics() {
    console.group("⚙️ AI Hub Frontend Diagnostics ⚙️");
    checkEnvironment();
    checkWebSocket();
    checkModels();
    checkMCP();
    // Add checks for UI elements if UIManager exposes necessary getters
    if (window._app?.ui && typeof window._app.ui.getActiveAndVisibleColumns === 'function') {
        console.log("Visible Columns:", window._app.ui.getActiveAndVisibleColumns().map(c => c.id));
    }
    console.groupEnd();
    console.log("💡 Use window.aiHubDebug for more specific checks (e.g., aiHubDebug.testPing()).");
}

// Expose functions to the window for console access
window.aiHubDebug = {
    runAll: runAllDiagnostics,
    checkEnv: checkEnvironment,
    checkWS: checkWebSocket,
    checkModels: checkModels,
    checkMCP: checkMCP,
    testPing: testPing,
    forceReconnect: forceReconnect,
    getState: getAppState, // Expose state getter
};

// Optionally run diagnostics on load
// runAllDiagnostics();