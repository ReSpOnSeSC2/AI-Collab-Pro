/**
 * Connection Manager for AI Collaboration Hub
 * Handles WebSocket connection, status, messaging, API checks, and file uploads.
 * Version: 8.0.0
 */

// --- State ---
let ws = null;
let reconnectAttempts = 0;
let onMessageHandler = null;
let onStateChangeHandler = null;
let connectionCheckInterval = null;
let heartbeatInterval = null;

const MAX_RECONNECT_ATTEMPTS = 20; // Increased from 10 to allow more reconnection attempts
const RECONNECT_BASE_DELAY = 3000; // 3 seconds
const CONNECTION_CHECK_INTERVAL = 15000; // Increased from 5 to 15 seconds - check less frequently
const HEARTBEAT_INTERVAL = 120000; // Increased from 25 to 120 seconds (2 minutes) - much more tolerant of network issues

// --- WebSocket URL Construction (Integrated from websocket-path-fixer.js) ---

/**
 * Gets the base path for API/WebSocket endpoints.
 * @returns {string} The base path (usually empty for standalone).
 */
function getBasePath() {
    // Standalone server.js serves APIs at root level (/api)
    return '';
}

/**
 * Constructs the WebSocket URL.
 * @returns {string} The full WebSocket URL (ws:// or wss://).
 */
function getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const basePath = getBasePath();
    // Ensure the path is correct for the server.js WebSocket endpoint
    const wsPath = '/api/ws'; // Assuming server.js WSS is listening on this path
    const url = `${protocol}//${host}${basePath}${wsPath}`;
    console.log('ConnectionManager: WebSocket URL constructed:', url);
    return url;
}

/**
 * Constructs the URL for fetch requests.
 * @param {string} endpoint - The API endpoint (e.g., '/api/check-status').
 * @returns {string} The full fetch URL.
 */
function getFetchUrl(endpoint) {
    const basePath = getBasePath();
    // Ensure endpoint starts with a slash if basePath is empty
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${basePath}${cleanEndpoint}`;
}

// --- WebSocket Management ---

/**
 * Establishes the WebSocket connection.
 * @param {Function} onMessage - Callback for incoming messages.
 * @param {Function} onStateChange - Callback for connection state changes (true for connected, false for disconnected).
 */
window.connectWebSocket = function(onMessage, onStateChange) {
    onMessageHandler = onMessage;
    onStateChangeHandler = onStateChange;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log('ConnectionManager: WebSocket already connected or connecting.');
        return;
    }

    const wsUrl = getWebSocketUrl();
    console.log('ConnectionManager: Attempting to connect WebSocket to:', wsUrl);
    updateState(false, 'connecting'); // Notify UI about connecting state

    try {
        // Use the original WebSocket if available (bypassing potential bridges if they exist)
        const WebSocketConstructor = window.WebSocket?.Original || window.WebSocket;
        ws = new WebSocketConstructor(wsUrl);

        ws.onopen = () => {
            console.log('ConnectionManager: WebSocket connected successfully.');
            reconnectAttempts = 0; // Reset attempts on successful connection
            ws.isAlive = true; // For heartbeat
            ws.missedHeartbeats = 0; // Initialize missed heartbeats counter
            updateState(true);
            startHeartbeat();
            startConnectionChecker(); // Start checking connection after successful open
            // Dispatch event for other modules (like MCPClient)
            dispatchConnectionEvent('websocket-connected', ws);
        };

        ws.onclose = (event) => {
            console.log(`ConnectionManager: WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason || 'N/A'}`);
            const wasConnected = ws?.readyState === WebSocket.OPEN || reconnectAttempts === 0; // Check if it was previously open
            ws = null;
            stopHeartbeat();
            stopConnectionChecker(); // Stop checking when definitively closed
            updateState(false);
            dispatchConnectionEvent('websocket-disconnected');
            // Schedule reconnect only if not closed cleanly or intentionally
            if (event.code !== 1000 && event.code !== 1005) { // 1000 = Normal, 1005 = No Status Recvd
                scheduleReconnect();
            }
        };

        ws.onerror = (errorEvent) => {
            console.error('ConnectionManager: WebSocket error:', errorEvent);
            // onclose will likely be called after error, triggering reconnect logic
            // updateState(false); // Update state immediately on error too
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle all forms of ping/pong messages
                if (data.type === 'ping' || data.type === 'debug_ping') {
                    console.log("ConnectionManager: Received ping, sending pong");
                    sendMessageToServer({ 
                        type: data.type === 'ping' ? 'pong' : 'debug_pong', 
                        timestamp: Date.now() 
                    });
                    return; // Don't forward ping messages
                }
                
                if (data.type === 'pong' || data.type === 'debug_pong') {
                    console.log("ConnectionManager: Received pong, connection alive");
                    ws.isAlive = true; // Server responded to our ping
                    ws.missedHeartbeats = 0; // Reset missed heartbeats counter
                    return; // Don't forward pong messages
                }
                
                // Pass non-heartbeat messages to the main handler
                if (onMessageHandler) {
                    // Filter out ping/pong messages before passing to handler
                    if (data.type !== 'ping' && 
                        data.type !== 'pong' && 
                        data.type !== 'debug_ping' && 
                        data.type !== 'debug_pong') {
                        onMessageHandler(data);
                    } else {
                        // Just log ping/pong messages at debug level
                        console.debug(`WebSocket ${data.type} message received (ignored)`);
                    }
                }
            } catch (parseError) {
                console.error('ConnectionManager: Error parsing WebSocket message:', event.data, parseError);
                // Optionally notify the main handler about the parse error
                if (onMessageHandler) {
                    onMessageHandler({ type: 'error', message: `Failed to parse server message: ${parseError.message}` });
                }
            }
        };

    } catch (error) {
        console.error("ConnectionManager: Failed to create WebSocket:", error);
        updateState(false);
        scheduleReconnect(); // Attempt to reconnect even if creation fails
    }
}

/**
 * Schedules a WebSocket reconnection attempt with exponential backoff.
 */
function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`ConnectionManager: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection attempts.`);
        updateState(false, 'failed'); // Indicate permanent failure state
        return;
    }

    const delay = Math.min(30000, RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts)); // Exponential backoff up to 30s
    reconnectAttempts++;
    console.log(`ConnectionManager: Scheduling reconnect attempt ${reconnectAttempts} in ${delay / 1000} seconds...`);

    setTimeout(() => {
        // Check if already connected before attempting reconnect
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            connectWebSocket(onMessageHandler, onStateChangeHandler);
        } else {
             console.log("ConnectionManager: Reconnect attempt skipped, connection already established or in progress.");
             reconnectAttempts = 0; // Reset if connection was restored elsewhere
        }
    }, delay);
}

/**
 * Sends a message payload to the server via WebSocket.
 * @param {object} payload - The JSON payload to send.
 * @returns {boolean} True if the message was sent successfully, false otherwise.
 */
window.sendMessageToServer = function(payload) {
    // Skip messaging completely for non-critical message types to avoid console spam
    if (payload.type === 'ping' || payload.type === 'pong' || payload.type === 'debug_ping' || payload.type === 'debug_pong') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            // Don't even log errors for heartbeat messages if socket is closed
            return false;
        }
    }

    if (!ws) {
        console.warn('ConnectionManager: WebSocket not initialized. Message sending skipped.');
        // Trigger a reconnect attempt
        connectWebSocket(onMessageHandler, onStateChangeHandler);
        return false;
    }
    
    if (ws.readyState !== WebSocket.OPEN) {
        // Use different log levels based on message importance
        const isHeartbeat = payload.type === 'ping' || payload.type === 'pong' || 
                           payload.type === 'debug_ping' || payload.type === 'debug_pong';
        
        if (!isHeartbeat) {
            // Only log errors for non-heartbeat messages
            const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
            const stateName = stateNames[ws.readyState] || 'UNKNOWN';
            console.warn(`ConnectionManager: Cannot send message (${payload.type}). WebSocket state: ${stateName}`);
        }
        
        // Trigger reconnect only if socket is closed, not if it's connecting or closing
        if (ws.readyState === WebSocket.CLOSED) {
            connectWebSocket(onMessageHandler, onStateChangeHandler);
        }
        return false;
    }
    
    try {
        ws.send(JSON.stringify(payload));
        return true;
    } catch (sendError) {
        console.error('ConnectionManager: Error sending WebSocket message:', sendError, payload);
        return false;
    }
}

/**
 * Updates the connection state and notifies the main application.
 * @param {boolean} isConnected - Whether the WebSocket is connected.
 * @param {'connecting' | 'failed' | null} [status=null] - Optional specific status.
 */
function updateState(isConnected, status = null) {
    // Update body classes for global CSS styling
    document.body.classList.toggle('ws-connected', isConnected);
    document.body.classList.toggle('ws-disconnected', !isConnected && status !== 'connecting');
    document.body.classList.toggle('ws-connecting', status === 'connecting');

    // Notify the main application state handler
    if (onStateChangeHandler) {
        onStateChangeHandler(isConnected);
    }
}

/**
 * Dispatches a custom event related to WebSocket connection status.
 * @param {string} eventName - The name of the event (e.g., 'websocket-connected').
 * @param {WebSocket} [socketInstance=null] - The WebSocket instance (optional).
 */
function dispatchConnectionEvent(eventName, socketInstance = null) {
    try {
        const detail = socketInstance ? { socket: socketInstance } : {};
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
    } catch (e) {
        console.error(`Error dispatching ${eventName} event:`, e);
    }
}

/**
 * Starts a periodic check to ensure the WebSocket connection is alive.
 */
function startConnectionChecker() {
    if (connectionCheckInterval) clearInterval(connectionCheckInterval);
    connectionCheckInterval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn("ConnectionManager: Connection check failed (WebSocket not open). Triggering reconnect logic.");
            updateState(false);
            stopConnectionChecker(); // Stop checking until reconnected
            scheduleReconnect();
        }
         // Optional: Send a ping if heartbeat isn't running or as an additional check
         // else if (ws.isAlive === false) { // Requires heartbeat logic to set isAlive
         //     console.warn("ConnectionManager: Heartbeat missed. Terminating and reconnecting.");
         //     ws.terminate(); // Force close unresponsive socket
         // }
    }, CONNECTION_CHECK_INTERVAL);
     console.log("ConnectionManager: Periodic connection checker started.");
}

/**
 * Stops the periodic connection check.
 */
function stopConnectionChecker() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
        console.log("ConnectionManager: Periodic connection checker stopped.");
    }
}

/**
 * Starts sending periodic pings to keep the connection alive and check responsiveness.
 * Now tolerates up to 3 missed heartbeats before closing the connection.
 */
function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    // Define max allowed missed heartbeats before closing connection
    const MAX_MISSED_HEARTBEATS = 3;
    
    heartbeatInterval = setInterval(() => {
        // Check not just if ws exists, but also its properties
        if (!ws) {
            console.warn("ConnectionManager: WebSocket object is null during heartbeat check. Stopping heartbeat.");
            stopHeartbeat();
            return;
        }
        
        // Only proceed with heartbeat checks if the connection is fully open
        if (ws.readyState === WebSocket.OPEN) {
            // Check alive status (updated by pong responses)
            if (ws.isAlive === false) {
                // Increment missed heartbeats counter
                ws.missedHeartbeats = (ws.missedHeartbeats || 0) + 1;
                
                // Check if we've exceeded max allowed missed heartbeats
                if (ws.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
                    console.warn(`ConnectionManager: ${ws.missedHeartbeats} heartbeat pongs missed. Closing connection.`);
                    
                    try {
                        ws.close(1000, "Heartbeat timeout after multiple misses");
                    } catch (closeError) {
                        console.error("ConnectionManager: Error closing WebSocket:", closeError);
                        // Force cleanup if close fails
                        ws = null;
                        updateState(false);
                        scheduleReconnect();
                    }
                    stopHeartbeat();
                    return;
                } else {
                    console.warn(`ConnectionManager: Heartbeat pong missed (${ws.missedHeartbeats}/${MAX_MISSED_HEARTBEATS}). Still waiting...`);
                }
            } else {
                // Reset missed heartbeats counter if we got a response
                ws.missedHeartbeats = 0;
            }
            
            // Mark as not alive until we get a pong response
            ws.isAlive = false;
            
            // Send ping (this calls our updated sendMessageToServer that handles closed sockets)
            sendMessageToServer({ type: 'ping', timestamp: Date.now() });
        } else if (ws.readyState === WebSocket.CLOSED) {
            // Connection is fully closed
            console.warn("ConnectionManager: WebSocket is closed during heartbeat check. Stopping heartbeat.");
            stopHeartbeat();
            // Schedule a reconnect attempt
            scheduleReconnect();
        } else {
            // Connection is either connecting or closing
            console.debug(`ConnectionManager: WebSocket is in transition state (${ws.readyState}) during heartbeat check. Skipping ping.`);
            // Don't stop the heartbeat for transition states, just skip this cycle
        }
    }, HEARTBEAT_INTERVAL);
    console.log("ConnectionManager: Heartbeat started with increased tolerance.");
}

/**
 * Stops the heartbeat interval.
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log("ConnectionManager: Heartbeat stopped.");
    }
}

/**
 * Gets the current WebSocket instance.
 * @returns {WebSocket | null} The WebSocket instance or null.
 */
window.getWebSocket = function() {
    return ws;
}


// --- API Interaction ---

/**
 * Checks the backend API status.
 * @returns {Promise<object>} A promise resolving with the API status data.
 */
async function checkApiStatus() {
    const url = getFetchUrl('/api/check-api-status');
    console.log("ConnectionManager: Checking API status at", url);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API status check failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('ConnectionManager: API Status:', data);
        // Optionally dispatch an event with the status
        window.dispatchEvent(new CustomEvent('api-status-checked', { detail: data }));
        return data;
    } catch (error) {
        console.error('ConnectionManager: Failed to check API status:', error);
        window.dispatchEvent(new CustomEvent('api-status-error', { detail: { error: error.message } }));
        throw error; // Re-throw for main.js or caller to handle
    }
}

// Also expose to window for backward compatibility
window.checkApiStatus = checkApiStatus;

/**
 * Uploads files to the server.
 * @param {FormData} formData - The FormData object containing files.
 * @returns {Promise<Array<object>>} A promise resolving with the data of uploaded files.
 */
window.uploadFiles = async function(formData) {
    const url = getFetchUrl('/api/upload');
    console.log("ConnectionManager: Uploading files to", url);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            // Headers are automatically set by fetch for FormData
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `File upload failed with status ${response.status}`);
        }
        console.log('ConnectionManager: Files uploaded successfully:', data.files);
        return data.files; // Return the array of uploaded file data
    } catch (error) {
        console.error('ConnectionManager: File upload failed:', error);
        throw error; // Re-throw for the caller (main.js) to handle UI updates
    }
}

// Create references to window functions for export
const connectWebSocket = window.connectWebSocket;
const sendMessageToServer = window.sendMessageToServer;
const uploadFiles = window.uploadFiles;
const getWebSocket = window.getWebSocket;

// Make functions globally available (not using ES6 modules)
window.connectWebSocket = connectWebSocket;
window.sendMessageToServer = sendMessageToServer;
window.checkApiStatus = checkApiStatus;
window.uploadFiles = uploadFiles;
window.getWebSocket = getWebSocket;