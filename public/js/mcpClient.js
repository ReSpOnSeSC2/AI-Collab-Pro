/**
 * MCP Client - JavaScript client for the Model Context Protocol (Refactored Module)
 * Allows AI models to safely access and modify files on the user's system via WebSocket.
 * Version: 8.0.0
 */

/**
 * Represents an MCP client connected via a WebSocket.
 */
class MCPClient {
    #ws = null;
    #token = null;
    #userId = null;
    #directory = null;
    #eventHandlers = {};
    #pendingPromises = new Map(); // Track requests awaiting responses

    /**
     * Creates an instance of MCPClient.
     * @param {WebSocket} websocket - The WebSocket instance to use for communication.
     */
    constructor(websocket) {
        if (!websocket) {
            throw new Error("MCPClient: WebSocket instance is required.");
        }
        this.#ws = websocket;
        this.#initializeEventHandlers();
        this.#setupMessageHandler();
        console.log("MCPClient: Instance created.");
    }

    /**
     * Initializes the event handler structure.
     */
    #initializeEventHandlers() {
        const events = [
            'context_registered', 'files_listed', 'file_read',
            'write_requested', 'delete_requested', 'create_directory_requested',
            'pending_operations', 'operation_approved', 'operation_rejected',
            'error'
        ];
        events.forEach(event => { this.#eventHandlers[event] = new Set(); });
    }

    /**
     * Sets up the WebSocket message handler to process MCP messages.
     */
    #setupMessageHandler() {
        if (!this.#ws) return;
        // Add a listener specific to this MCP client instance
        this.#ws.addEventListener('message', this.#handleWebSocketMessage);
        console.log("MCPClient: Message handler attached to WebSocket.");
    }

    /**
     * Handles incoming WebSocket messages relevant to MCP.
     * Bound arrow function to maintain 'this' context.
     * @param {MessageEvent} event - The WebSocket message event.
     */
    #handleWebSocketMessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // Check if it's an MCP message
            if (data.type && data.type.startsWith('mcp_')) {
                const mcpEventType = data.type.substring(4); // e.g., "context_registered"

                // Resolve pending promises based on message type or a request ID if available
                // (Requires server to include request IDs in responses for robust handling)
                // Simple type-based resolution for now:
                const promiseInfo = this.#pendingPromises.get(data.type);
                if (promiseInfo) {
                    if (data.error) {
                        promiseInfo.reject(new Error(data.error || `MCP operation ${mcpEventType} failed.`));
                    } else {
                        promiseInfo.resolve(data);
                    }
                    this.#pendingPromises.delete(data.type); // Remove promise once resolved/rejected
                }

                // Trigger general event handlers
                this.#trigger(mcpEventType, data);

            } else if (data.type === 'error' && data.mcp_error) { // Specific MCP error
                this.#trigger('error', data);
            }
        } catch (e) {
            // Ignore non-JSON messages or messages not relevant to MCP
        }
    };

    /**
     * Registers a callback for MCP events.
     * @param {string} event - Event name (e.g., 'files_listed').
     * @param {Function} callback - Callback function.
     * @returns {MCPClient} The client instance for chaining.
     */
    on(event, callback) {
        if (this.#eventHandlers[event]) {
            this.#eventHandlers[event].add(callback);
        } else {
            console.warn(`MCPClient: Unsupported event type "${event}".`);
        }
        return this;
    }

    /**
     * Unregisters a callback for MCP events.
     * @param {string} event - Event name.
     * @param {Function} callback - Callback function to remove.
     * @returns {MCPClient} The client instance for chaining.
     */
    off(event, callback) {
        if (this.#eventHandlers[event]) {
            this.#eventHandlers[event].delete(callback);
        }
        return this;
    }

    /**
     * Triggers registered event handlers for a given event.
     * @param {string} event - Event name.
     * @param {*} data - Event data.
     */
    #trigger(event, data) {
        if (this.#eventHandlers[event]) {
            // console.log(`MCPClient: Triggering event '${event}' with data:`, data); // Debug log
            this.#eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (e) {
                    console.error(`MCPClient: Error in event handler for ${event}:`, e);
                }
            });
        }
    }

    /**
     * Sends a message payload through the WebSocket connection.
     * @param {object} payload - The JSON payload to send.
     * @returns {boolean} True if sent successfully, false otherwise.
     */
    #sendMessage(payload) {
        if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
            console.error('MCPClient: WebSocket not connected.');
            return false;
        }
        try {
            this.#ws.send(JSON.stringify(payload));
            return true;
        } catch (error) {
            console.error('MCPClient: Error sending WebSocket message:', error);
            return false;
        }
    }

    /**
     * Sends a request and returns a Promise that resolves/rejects with the response.
     * Uses a simple type-based tracking for pending promises.
     * @param {object} payload - The request payload.
     * @param {string} responseType - The expected response message type (e.g., 'mcp_context_registered').
     * @returns {Promise<any>}
     */
    #sendRequest(payload, responseType) {
        return new Promise((resolve, reject) => {
            if (this.#pendingPromises.has(responseType)) {
                // Handle case where a request of the same type is already pending
                // For simplicity, reject the new one or queue it. Rejecting for now.
                return reject(new Error(`MCPClient: Request of type ${payload.type} already pending.`));
            }
            if (this.#sendMessage(payload)) {
                this.#pendingPromises.set(responseType, { resolve, reject });
                // Optional: Add a timeout for the promise
                // setTimeout(() => {
                //     if (this.#pendingPromises.has(responseType)) {
                //         this.#pendingPromises.get(responseType).reject(new Error(`MCP request ${payload.type} timed out.`));
                //         this.#pendingPromises.delete(responseType);
                //     }
                // }, 15000); // 15 second timeout
            } else {
                reject(new Error('MCPClient: Failed to send request via WebSocket.'));
            }
        });
    }

    /**
     * Updates the WebSocket instance, e.g., after a reconnect.
     * @param {WebSocket} newWebsocket - The new WebSocket instance.
     */
    updateWebsocket(newWebsocket) {
        if (this.#ws) {
            this.#ws.removeEventListener('message', this.#handleWebSocketMessage);
        }
        this.#ws = newWebsocket;
        if (this.#ws) {
            this.#setupMessageHandler(); // Re-attach listener
            console.log("MCPClient: WebSocket instance updated.");
            // Clear pending promises on reconnect? Or try to re-send? Clearing for now.
            this.#pendingPromises.forEach(p => p.reject(new Error("WebSocket reconnected, cancelling pending request.")));
            this.#pendingPromises.clear();
        } else {
            console.error("MCPClient: Attempted to update with invalid WebSocket instance.");
        }
    }

    /**
     * Sets the User ID for subsequent operations.
     * @param {string} userId - The user ID.
     */
    setUserId(userId) {
        if (userId && typeof userId === 'string') {
            this.#userId = userId;
            console.log(`MCPClient: User ID set to ${this.#userId}`);
        } else {
            console.warn("MCPClient: Invalid User ID provided.");
        }
    }

    /**
     * Registers an approved context for file operations.
     * @param {string} directory - Directory path.
     * @param {object} [options] - Additional options (permissions, duration, etc.).
     * @returns {Promise<object>} Promise resolving with registration details (token, etc.).
     */
    registerContext(directory, options = {}) {
        if (!this.#userId) {
            return Promise.reject(new Error('MCPClient: User ID not set. Call setUserId first.'));
        }
        const payload = {
            type: 'mcp_register_context',
            userId: this.#userId,
            directory,
            ...options
        };
        return this.#sendRequest(payload, 'mcp_context_registered')
            .then(data => {
                if (data.success !== false && data.token) {
                    this.#token = data.token;
                    this.#directory = data.directory; // Store resolved directory
                    console.log(`MCPClient: Context registered successfully. Token: ${this.#token.substring(0, 8)}...`);
                } else {
                     throw new Error(data.error || 'Context registration failed.');
                }
                return data; // Return full response data
            });
    }

    // --- File Operation Methods ---

    listFiles(subPath = '') {
        if (!this.#token) return Promise.reject(new Error('MCPClient: No active context token. Call registerContext first.'));
        const payload = { type: 'mcp_list_files', token: this.#token, userId: this.#userId, subPath };
        return this.#sendRequest(payload, 'mcp_files_listed');
    }

    readFile(filePath) {
        if (!this.#token) return Promise.reject(new Error('MCPClient: No active context token.'));
        if (!filePath) return Promise.reject(new Error('MCPClient: filePath is required for readFile.'));
        const payload = { type: 'mcp_read_file', token: this.#token, userId: this.#userId, filePath };
        return this.#sendRequest(payload, 'mcp_file_read');
    }

    requestWriteFile(filePath, content, description = '') {
        if (!this.#token) return Promise.reject(new Error('MCPClient: No active context token.'));
        if (!filePath || content === undefined) return Promise.reject(new Error('MCPClient: filePath and content are required for requestWriteFile.'));
        const payload = { type: 'mcp_request_write', token: this.#token, userId: this.#userId, filePath, content, description };
        return this.#sendRequest(payload, 'mcp_write_requested');
    }

    requestDeleteFile(filePath, description = '') {
        if (!this.#token) return Promise.reject(new Error('MCPClient: No active context token.'));
        if (!filePath) return Promise.reject(new Error('MCPClient: filePath is required for requestDeleteFile.'));
        const payload = { type: 'mcp_request_delete', token: this.#token, userId: this.#userId, filePath, description };
        return this.#sendRequest(payload, 'mcp_delete_requested');
    }

    requestCreateDirectory(dirPath, description = '') {
        if (!this.#token) return Promise.reject(new Error('MCPClient: No active context token.'));
        if (!dirPath) return Promise.reject(new Error('MCPClient: dirPath is required for requestCreateDirectory.'));
        const payload = { type: 'mcp_request_create_directory', token: this.#token, userId: this.#userId, dirPath, description };
        return this.#sendRequest(payload, 'mcp_create_directory_requested');
    }

    // --- Operation Management Methods ---

    getPendingOperations() {
        if (!this.#userId) return Promise.reject(new Error('MCPClient: User ID not set.'));
        const payload = { type: 'mcp_get_pending_operations', userId: this.#userId };
        return this.#sendRequest(payload, 'mcp_pending_operations');
    }

    approveOperation(operationId) {
        if (!this.#userId) return Promise.reject(new Error('MCPClient: User ID not set.'));
        if (!operationId) return Promise.reject(new Error('MCPClient: operationId is required for approveOperation.'));
        const payload = { type: 'mcp_approve_operation', userId: this.#userId, operationId };
        return this.#sendRequest(payload, 'mcp_operation_approved');
    }

    rejectOperation(operationId, reason = '') {
        if (!this.#userId) return Promise.reject(new Error('MCPClient: User ID not set.'));
        if (!operationId) return Promise.reject(new Error('MCPClient: operationId is required for rejectOperation.'));
        const payload = { type: 'mcp_reject_operation', userId: this.#userId, operationId, reason };
        return this.#sendRequest(payload, 'mcp_operation_rejected');
    }

    /**
     * Cleans up resources, removes listeners.
     */
    destroy() {
        if (this.#ws) {
            this.#ws.removeEventListener('message', this.#handleWebSocketMessage);
        }
        this.#eventHandlers = {};
        this.#pendingPromises.clear();
        this.#ws = null;
        this.#token = null;
        console.log("MCPClient: Instance destroyed.");
    }

    // --- Getters ---
    get token() { return this.#token; }
    get userId() { return this.#userId; }
    get directory() { return this.#directory; }
}

/**
 * Factory function to create a new MCPClient instance.
 * @param {WebSocket} websocket - The WebSocket instance.
 * @returns {MCPClient} A new MCPClient instance.
 */
export function createClient(websocket) {
    return new MCPClient(websocket);
}