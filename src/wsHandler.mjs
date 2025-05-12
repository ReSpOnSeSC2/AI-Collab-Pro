/**
 * WebSocket Handler
 * Manages WebSocket connections, message routing, and interactions with AI/MCP/CLI modules.
 * Version: 8.0.0
 */

import { WebSocket } from 'ws';
import { clients, availability, getClient } from './lib/ai/index.mjs';
import { handleCollaborativeDiscussion, setCollaborationStyle, setCollaborationMode, getCollaborationConfig } from './lib/ai/collaboration.mjs';
import { streamClaudeResponse } from './lib/ai/claude.mjs';
import { streamGeminiResponse } from './lib/ai/gemini.mjs';
import { streamOpenAICompatResponse } from './lib/ai/openaiClient.mjs';
import { handleCliCommand } from './lib/cliHandler.mjs'; // Import CLI handler
import * as mcp from './lib/mcp/index.mjs'; // Import MCP library as namespace

// --- Global State (Managed Here or Imported) ---
// In-memory store for latest responses for build/summary features
const latestResponses = { claude: "", gemini: "", chatgpt: "", grok: "", deepseek: "", llama: "", summary: "" };
// Map to track user sessions associated with WebSocket connections
const wsUserSessions = new Map(); // ws -> { userId, sessionId }
const mcpUserSessions = new Map(); // userId -> MCP sessionId (from MCP registration) - Needed? Maybe just use ws session

// Import context manager functionality
import {
  getOrCreateContext,
  addMessageToContext,
  getFormattedContextHistory,
  updateTargetModels,
  trimContextIfNeeded,
  setContextMode,
  getContextModes,
  resetContext
} from './lib/contextManager.mjs';

// --- WebSocket Server Initialization ---
export default function initializeWebSocketHandler(wss) {
    console.log('WebSocket Handler: Initializing...');

    wss.on('connection', (ws, req) => {
        // Extract potential user info if passed via headers/query during connection
        // const userIdFromHeader = req.headers['x-user-id']; // Example
        const connectionId = `ws-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        ws.connectionId = connectionId; // Assign unique ID to the connection
        ws.isAlive = true;
        ws.userId = null; // User ID will be set upon authentication message
        console.log(`🔌 WebSocket client connected: ${connectionId}`);

        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', async (message) => {
            let data;
            try {
                data = JSON.parse(message);
                // Basic logging, avoid logging message content unless debugging
                console.log(`⬇️ WS Received [${ws.connectionId}${ws.userId ? '/' + ws.userId.substring(0, 6) : ''}]: Type=${data.type}`);

                // --- Message Routing ---
                switch (data.type) {
                    case 'authenticate':
                        await handleAuthentication(ws, data);
                        break;
                    case 'chat':
                        await handleChatMessage(ws, data);
                        break;
                    case 'command':
                        await handleCliMessage(ws, data);
                        break;
                    case 'set_collab_style':
                        handleSetCollabStyle(ws, data);
                        break;
                    case 'set_collab_mode':
                        handleSetCollabMode(ws, data);
                        break;
                    case 'cancel_collaboration':
                        handleCancelCollaboration(ws, data);
                        break;
                    case 'context_status':
                        await handleContextStatus(ws, data);
                        break;
                    case 'reset_context':
                        await handleResetContext(ws, data);
                        break;
                    case 'trim_context':
                        await handleTrimContext(ws, data);
                        break;
                    case 'set_max_context_size':
                        await handleSetMaxContextSize(ws, data);
                        break;
                    case 'set_context_mode':
                        await handleSetContextMode(ws, data);
                        break;
                    case 'debug_ping':
                        sendWsMessage(ws, { type: 'debug_pong', timestamp: Date.now(), message: data.message || 'Pong!' });
                        break;
                    case 'ping':
                        // Handle regular ping messages from the client
                        sendWsMessage(ws, { type: 'pong', timestamp: Date.now() });
                        break;
                    // --- MCP Message Routing ---
                    case 'mcp_register_context':
                    case 'mcp_list_files':
                    case 'mcp_read_file':
                    case 'mcp_request_write':
                    case 'mcp_request_delete':
                    case 'mcp_request_create_directory':
                    case 'mcp_get_pending_operations':
                    case 'mcp_approve_operation':
                    case 'mcp_reject_operation':
                        await handleMcpMessage(ws, data);
                        break;
                    default:
                        console.warn(`Unknown WebSocket message type from ${ws.connectionId}: ${data.type}`);
                        sendWsError(ws, `Unknown message type: ${data.type}`);
                }
            } catch (error) {
                console.error(`Error processing WebSocket message from ${ws.connectionId}:`, message.toString(), error);
                sendWsError(ws, `Error processing message: ${error.message}`);
            }
        });

        ws.on('close', (code, reason) => {
            const reasonString = reason ? reason.toString() : 'No reason provided';
            console.log(`🔌 WebSocket client disconnected: ${ws.connectionId} (User: ${ws.userId || 'unknown'}). Code: ${code}, Reason: ${reasonString}`);
            wsUserSessions.delete(ws);
            // Clean up associated MCP contexts? Maybe not automatically.
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for ${ws.connectionId} (User: ${ws.userId || 'unknown'}):`, error);
            // Attempt to close gracefully if possible
             try { ws.close(1011, "WebSocket error occurred"); } catch (e) { /* ignore */ }
             wsUserSessions.delete(ws);
        });
    });

    // --- Heartbeat Interval ---
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((wsInstance) => {
            if (!wsInstance.isAlive) {
                console.log(`Terminating unresponsive WebSocket: ${wsInstance.connectionId} (User: ${wsInstance.userId || 'unknown'})`);
                return wsInstance.terminate();
            }
            wsInstance.isAlive = false;
            if (wsInstance.readyState === WebSocket.OPEN) {
                wsInstance.ping(null, false, (err) => {
                    if (err) console.error(`Ping error for ${wsInstance.connectionId}:`, err);
                });
            }
        });
    }, 30000); // 30 seconds

    wss.on('close', () => {
        console.log('WebSocket Server closing, clearing heartbeat interval.');
        clearInterval(heartbeatInterval);
    });

    console.log('WebSocket Handler: Initialized and listening for connections.');
}

// --- WebSocket Utility Functions ---
function sendWsMessage(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(payload));
            // Avoid logging full content unless debugging specific messages
            // console.log(`⬆️ WS Sent [${ws.connectionId}${ws.userId ? '/'+ws.userId.substring(0,6) : ''}]: Type=${payload.type}`);
        } catch (error) {
            console.error(`Error sending WebSocket message to ${ws.connectionId}:`, error);
        }
    } else {
        console.warn(`Attempted to send message to non-open WebSocket: ${ws.connectionId} (State: ${ws.readyState})`);
    }
}

function sendWsError(ws, message, target = null, isMcpError = false) {
    const payload = { type: 'error', message: message };
    if (target) payload.target = target;
    if (isMcpError) payload.mcp_error = true; // Flag MCP errors specifically if needed by client
    console.error(`Sending WS Error to ${ws.connectionId}: ${message} ${target ? `(Target: ${target})` : ''}`);
    sendWsMessage(ws, payload);
}

// --- Message Handlers ---

async function handleAuthentication(ws, data) {
    if (data.userId && typeof data.userId === 'string') {
        ws.userId = data.userId;
        ws.sessionId = ws.connectionId; // Use connectionId as sessionId

        // Store mapping
        wsUserSessions.set(ws, { userId: ws.userId, sessionId: ws.sessionId });

        try {
            // Initialize a context for this session
            const context = await getOrCreateContext(ws.userId, ws.sessionId);

            // Defensive check: Ensure context and context.messages are defined
            if (!context || !context.messages) {
                console.error(`Failed to retrieve or initialize context properly for userId: ${ws.userId}, sessionId: ${ws.sessionId}. Context:`, context);
                sendWsError(ws, "Internal server error: Could not initialize session context.");
                return;
            }

            // Also, ensure other properties exist or provide defaults
            const contextSize = context.contextSize || 0;
            const maxContextSize = context.maxContextSize || 1; // Avoid division by zero
            const isNearLimit = context.isNearLimit || false;

            sendWsMessage(ws, {
                type: 'authentication_success',
                userId: ws.userId,
                sessionId: ws.sessionId,
                contextInfo: {
                    id: context._id || context.id, // Mongoose documents use _id, or context.id if you have a virtual
                    messageCount: context.messages.length,
                    contextSize: contextSize,
                    maxContextSize: maxContextSize,
                    percentUsed: maxContextSize > 0 ? Math.round((contextSize / maxContextSize) * 100) : 0,
                    isNearLimit: isNearLimit
                }
            });

            console.log(`User ${ws.userId} authenticated for WebSocket session ${ws.sessionId}.`);
        } catch (error) {
            console.error(`Error during authentication for userId: ${ws.userId}, sessionId: ${ws.sessionId}:`, error);
            sendWsError(ws, "Internal server error during authentication.");
        }
    } else {
        sendWsError(ws, "User ID missing or invalid for authentication.");
    }
}

async function handleChatMessage(ws, data) {
    if (!ws.userId) { // Require authentication for chat
        return sendWsError(ws, 'Authentication required to chat.');
    }

    const {
        message,
        content,
        filePaths = [],
        models = {},
        target,
        collaborationMode = null,
        sequentialStyle = null
    } = data;
    const messageText = message || content || '';

    if (!target) return sendWsError(ws, "Missing 'target' in chat message.");
    if (!messageText && (!filePaths || filePaths.length === 0)) return sendWsError(ws, "Cannot send empty message without files.");

    // Update collaboration settings if provided
    if (collaborationMode) {
      // For backwards compatibility, map 'collaborative' to 'individual'
      if (collaborationMode === 'collaborative') {
        collaborationMode = 'individual';
      }
      setCollaborationMode(collaborationMode);
    }
    // Note: Collaboration style is set via a separate message type

    // Determine which models to query based on target and availability
    const modelsToQuery = [];
    if (target === 'collab') {
        modelsToQuery.push(...Object.keys(models).filter(id => availability[id]));
    } else if (availability[target]) {
        modelsToQuery.push(target);
    } else {
        return sendWsError(ws, `Target AI '${target}' is not available or supported.`);
    }

    if (modelsToQuery.length === 0) {
        return sendWsError(ws, "No available AI models selected for this request.");
    }

    // --- Prepare context (including files and conversation history) ---
    // Get file context
    const fileContext = await prepareFileContextForAI(filePaths);

    // Get conversation history from context manager
    let historyContext = '';
    if (ws.sessionId) {
      try {
        historyContext = await getFormattedContextHistory(ws.userId, ws.sessionId);

        // Update target models in the context
        if (modelsToQuery.length > 0) {
          await updateTargetModels(ws.userId, ws.sessionId, modelsToQuery);
        }
      } catch (error) {
        console.error(`Error retrieving context history: ${error.message}`);
        // Continue without context if there's an error
      }
    }

    // Combine all context elements
    const fullPrompt = `${historyContext}${fileContext ? `${fileContext}\n\n` : ''}User Query:\n${messageText}`;

    // --- Define Callbacks for Streaming ---
    const onChunk = (aiTarget, chunkText) => {
        sendWsMessage(ws, { type: 'response', target: aiTarget, content: chunkText, start: !latestResponses[aiTarget] }); // Indicate start on first chunk
        latestResponses[aiTarget] += chunkText; // Accumulate for summary/build
    };
    const onComplete = async (aiTarget) => {
        sendWsMessage(ws, { type: 'response', target: aiTarget, end: true });
        console.log(`Streaming complete for ${aiTarget}`);

        // Store the complete response in the context
        if (ws.sessionId && latestResponses[aiTarget]) {
            try {
                const contextResponse = latestResponses[aiTarget];

                // Add response to conversation context
                const result = await addResponseToContext(ws.userId, ws.sessionId, aiTarget, contextResponse);

                // Check if we need to notify about context limits
                if (result.isNearLimit) {
                    // Notify the client that context is near limit
                    sendWsMessage(ws, {
                        type: 'context_warning',
                        percentUsed: result.percentUsed,
                        contextSize: result.contextSize,
                        maxSize: result.maxContextSize
                    });
                }
            } catch (error) {
                console.error(`Error storing response in context: ${error.message}`);
                // Continue even if there's an error with the context
            }
        }
    };
    const onError = async (aiTarget, error) => {
        sendWsError(ws, `Error from ${aiTarget}: ${error.message}`, aiTarget);
        sendWsMessage(ws, { type: 'response', target: aiTarget, end: true }); // Ensure stream ends on client
        latestResponses[aiTarget] = `Error: ${error.message}`; // Store error

        // Store the error in context
        if (ws.sessionId) {
            try {
                const errorMsg = `Error: ${error.message}`;

                // Add error response to context
                await addResponseToContext(ws.userId, ws.sessionId, aiTarget, errorMsg);
            } catch (contextError) {
                console.error(`Error storing error response in context: ${contextError.message}`);
                // Continue even if there's an error with the context
            }
        }
    };
    const onSummaryChunk = (chunkText) => {
        // Send summary chunk to all involved models' UIs
        modelsToQuery.forEach(aiTarget => {
            sendWsMessage(ws, { type: 'response', target: aiTarget, content: chunkText, summary: true, start: !latestResponses.summary });
        });
        latestResponses.summary += chunkText;
    };
     const onSummaryComplete = () => {
        modelsToQuery.forEach(aiTarget => {
            sendWsMessage(ws, { type: 'response', target: aiTarget, end: true, summary: true });
        });
        console.log("Collaboration summary streaming complete.");
    };
     const onSummaryError = (error) => {
        const errorMsg = `Error generating summary: ${error.message}`;
        modelsToQuery.forEach(aiTarget => {
            sendWsError(ws, errorMsg, aiTarget, false); // Send as regular error
            sendWsMessage(ws, { type: 'response', target: aiTarget, end: true, summary: true }); // End summary part
        });
        latestResponses.summary = errorMsg;
    };


    // --- Execute AI Request ---
    // Reset responses for this turn
    modelsToQuery.forEach(id => { latestResponses[id] = ''; });
    latestResponses.summary = '';

    // Create a new message entry in the context
    if (ws.sessionId) {
      try {
        const userMessage = {
          type: 'user',
          content: messageText,
          timestamp: new Date(),
          models: modelsToQuery,
          responses: {}
        };

        // Add the message to context
        const contextInfo = await addMessageToContext(ws.userId, ws.sessionId, userMessage);

        // If context is near limit, send warning to client
        if (contextInfo.isNearLimit) {
          sendWsMessage(ws, {
            type: 'context_warning',
            percentUsed: contextInfo.percentUsed,
            contextSize: contextInfo.contextSize,
            maxSize: contextInfo.maxSize
          });
        }
      } catch (error) {
        console.error(`Error adding message to context: ${error.message}`);
        // Continue even if there's an error with the context
      }
    }

    // Send initial "Thinking..." message to relevant UIs
    modelsToQuery.forEach(id => {
        sendWsMessage(ws, { type: 'response', target: id, start: true, model: models[id]?.[0] || `Default ${id}` }); // Show model being used
    });


    if (modelsToQuery.length === 1) {
        const singleTarget = modelsToQuery[0];
        const modelId = models[singleTarget]?.[0]; // Get the specific requested model
        console.log(`📋 Single target request using model ID: ${modelId} for ${singleTarget}`);
        const streamFn = getStreamFunctionForProvider(singleTarget);
        if (streamFn) {
            await streamFn(modelId, fullPrompt,
                (chunk) => onChunk(singleTarget, chunk),
                () => onComplete(singleTarget),
                (err) => onError(singleTarget, err)
            );
        } else {
            onError(singleTarget, new Error(`No stream function found for ${singleTarget}`));
        }
    } else {
        // Use collaboration mode from config (updated by set_collab_mode message)
        if (getCollaborationConfig().mode !== 'individual') {
            console.log(`📋 Using models for collaboration:`, JSON.stringify(models));
            // Send status update message for loading UI
            modelsToQuery.forEach(model => {
                sendWsMessage(ws, { 
                    type: 'model_status', 
                    model: model, 
                    status: 'processing',
                    message: 'Starting collaboration'
                });
            });
            
            // Use the new collaboration engine with configuration
            const collaborationResult = await handleCollaborativeDiscussion({
                prompt: fullPrompt,
                mode: getCollaborationConfig().mode,
                agents: modelsToQuery,
                models: models,
                ignoreFailingModels: true, // Continue even if some models fail
                skipSynthesisIfAllFailed: true, // Skip synthesis phase if all models fail
                continueWithAvailableModels: true, // Continue with available models when some timeout
                costCapDollars: 100.0, // Higher cost cap (effectively unlimited)
                maxSeconds: 180, // 3 minute timeout
                keepLoadingUntilComplete: true, // Keep loading indicators active until all phases complete
                sequentialStyle: sequentialStyle, // Add the sequential style option if provided
                onModelStatusChange: (model, status, message) => {
                    // Send status updates to client for loading UI
                    // Always ensure UI updates are sent for loading indicators
                    sendWsMessage(ws, {
                        type: 'model_status',
                        model,
                        status,
                        message,
                        timestamp: new Date().toISOString()
                    });

                    // Log status changes for debugging
                    console.log(`📊 Model status update: ${model} → ${status} ${message ? `(${message})` : ''}`);
                }
            });
            
            // Handle the response
            if (collaborationResult && collaborationResult.final) {
                // Check if this is an error message (collaborationResult.final will contain the error message)
                const isErrorResult = collaborationResult.final.startsWith('Error in ');
                
                if (isErrorResult) {
                    console.error(`❌ Collaboration error response:`, collaborationResult.final);
                    onSummaryError(new Error(collaborationResult.final));
                } else {
                    // Send summary response to all model UIs
                    onSummaryChunk(collaborationResult.final);
                    if (collaborationResult.rationale) {
                        onSummaryChunk("\n\n## Rationale\n\n" + collaborationResult.rationale);
                    }
                    onSummaryComplete();
                    
                    // Log the cost
                    console.log(`Collaboration complete. Cost: $${collaborationResult.spentUSD.toFixed(4)}`);
                    
                    // Send cost information to client
                    sendWsMessage(ws, { 
                        type: 'cost_info', 
                        cost: collaborationResult.spentUSD.toFixed(4),
                        mode: getCollaborationConfig().mode
                    });
                }
            } else {
                console.error("❌ Collaboration returned empty or null result");
                onSummaryError(new Error("Collaboration returned empty result. Please check server logs."));
            }
        } else { // Individual mode
            await Promise.all(modelsToQuery.map(async (aiTarget) => {
                const modelId = models[aiTarget]?.[0];
                const streamFn = getStreamFunctionForProvider(aiTarget);
                 if (streamFn) {
                    await streamFn(modelId, fullPrompt,
                        (chunk) => onChunk(aiTarget, chunk),
                        () => onComplete(aiTarget),
                        (err) => onError(aiTarget, err)
                    );
                } else {
                    onError(aiTarget, new Error(`No stream function found for ${aiTarget}`));
                }
            }));
        }
    }
}

async function prepareFileContextForAI(filePaths) {
    // This function needs access to the file system, likely via MCP
    // It should read the content of allowed files and format them for the AI prompt.
    // For now, return a placeholder. Replace with actual MCP readFile calls.
    if (!filePaths || filePaths.length === 0) return '';

    let context = "\n\n--- Attached Files Context ---\n";
    // WARNING: This assumes filePaths are relative paths within an *allowed* context.
    // Direct file system access based on client paths is insecure.
    // This MUST be replaced with MCP validation and reading.
    for (const filePath of filePaths) {
        context += `[Content for ${path.basename(filePath)} would be included here via MCP]\n`;
        // Example using MCP (requires token and userId):
        // try {
        //     const validation = mcp.validateContext(token, userId, 'read'); // Need token/userId here
        //     if (!validation.valid) continue;
        //     const content = await mcp.readFile(token, userId, filePath);
        //     context += `\nFile: ${path.basename(filePath)}\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\`\n`; // Limit context size
        // } catch (err) { context += `\n[Error reading file ${path.basename(filePath)}: ${err.message}]\n`; }
    }
    context += "--- End Attached Files ---\n";
    return context;
}


function getStreamFunctionForProvider(provider) {
    // Maps provider ID to the correct streaming function from AI libs
    switch (provider) {
        case 'claude': return streamClaudeResponse;
        case 'gemini': return streamGeminiResponse;
        case 'chatgpt':
        case 'grok':
        case 'deepseek':
        case 'llama':
            // Curry the function to pass the provider name
            return (modelId, prompt, onChunk, onComplete, onError) =>
                streamOpenAICompatResponse(provider, modelId, prompt, onChunk, onComplete, onError);
        default: return null;
    }
}


async function handleCliMessage(ws, data) {
     if (!ws.userId) { // Require authentication for CLI
        return sendWsError(ws, 'Authentication required to use CLI.');
    }
    const command = data.command;
    if (!command) return sendWsError(ws, "Missing 'command' in command message.");

    // Use the dedicated CLI handler module
    await handleCliCommand(
        command,
        ws.userId, // Pass userId for context/permissions if needed
        (output) => sendWsMessage(ws, { type: 'command-output', output }),
        (output, code) => sendWsMessage(ws, { type: 'command-output', output, exitCode: code, end: true }),
        (error) => sendWsError(ws, `CLI Error: ${error.message}`)
    );
}

function handleSetCollabStyle(ws, data) {
    const { style } = data;
    const success = setCollaborationStyle(style); // Update shared config
    if (success) {
        const config = getCollaborationConfig();
        sendWsMessage(ws, { type: 'collab_style_updated', style: config.currentStyle, name: config.styles[config.currentStyle]?.name });
        // Optionally broadcast to other clients if needed
    } else {
        sendWsError(ws, `Invalid collaboration style: ${style}`);
    }
}

/**
 * Handles a cancel collaboration request
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
function handleCancelCollaboration(ws, data) {
    if (!ws.userId) {
        return sendWsError(ws, 'Authentication required to cancel collaboration.');
    }
    
    console.log(`User ${ws.userId} cancelled collaboration operation`);
    
    // TODO: Implement actual cancellation of in-progress operations
    // This would involve:
    // 1. Creating a way to track current operations by user
    // 2. Having a mechanism to interrupt/abort them 
    // 3. Cleaning up resources
    
    // Send confirmation to all active models
    // This message will be picked up by the client to close the loading UI
    const models = data.models || [];
    models.forEach(model => {
        sendWsMessage(ws, {
            type: 'model_status',
            model,
            status: 'cancelled',
            message: 'Operation cancelled by user'
        });
    });
    
    // Confirm cancellation
    sendWsMessage(ws, { 
        type: 'collaboration_cancelled', 
        message: 'Collaboration cancelled by user' 
    });
}

function handleSetCollabMode(ws, data) {
    const { mode } = data;
    const success = setCollaborationMode(mode); // Update shared config
    if (success) {
        sendWsMessage(ws, { type: 'collab_mode_updated', mode: getCollaborationConfig().mode });
        // Optionally broadcast to other clients
    } else {
        sendWsError(ws, `Invalid collaboration mode: ${mode}`);
    }
}

// --- Context Management Handlers ---

/**
 * Handles a request for context status
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleContextStatus(ws, data) {
    if (!ws.userId || !ws.sessionId) {
        return sendWsError(ws, 'Authentication required to check context status.');
    }

    try {
        const context = await getOrCreateContext(ws.userId, ws.sessionId);

        sendWsMessage(ws, {
            type: 'context_status',
            messageCount: context.messages.length,
            contextSize: context.contextSize,
            maxContextSize: context.maxContextSize,
            percentUsed: Math.round((context.contextSize / context.maxContextSize) * 100),
            isNearLimit: context.contextSize >= (context.maxContextSize * 0.8),
            contextMode: context.contextMode,
            created: context.created,
            lastUpdated: context.lastUpdated
        });
    } catch (error) {
        console.error('Error in handleContextStatus:', error);
        sendWsError(ws, 'Error retrieving context status: ' + error.message);
    }
}

/**
 * Handles a request to reset the conversation context
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleResetContext(ws, data) {
    if (!ws.userId || !ws.sessionId) {
        return sendWsError(ws, 'Authentication required to reset context.');
    }

    try {
        const newContext = await resetContext(ws.userId, ws.sessionId);

        sendWsMessage(ws, {
            type: 'context_reset',
            messageCount: 0,
            contextSize: 0,
            maxContextSize: newContext.maxContextSize,
            contextMode: newContext.contextMode,
            percentUsed: 0,
            message: 'Conversation context has been reset.'
        });

        console.log(`User ${ws.userId} reset context for session ${ws.sessionId}`);
    } catch (error) {
        console.error('Error in handleResetContext:', error);
        sendWsError(ws, 'Error resetting context: ' + error.message);
    }
}

/**
 * Handles a request to trim the context if it's too large
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleTrimContext(ws, data) {
    if (!ws.userId || !ws.sessionId) {
        return sendWsError(ws, 'Authentication required to trim context.');
    }

    try {
        const trimInfo = await trimContextIfNeeded(ws.userId, ws.sessionId);

        sendWsMessage(ws, {
            type: 'context_trimmed',
            trimmed: trimInfo.trimmed,
            messagesRemoved: trimInfo.removed || 0,
            percentUsed: trimInfo.percentUsed,
            message: trimInfo.trimmed
                ? `Context trimmed. Removed ${trimInfo.removed} oldest messages.`
                : 'Context is within size limits. No trimming needed.'
        });
    } catch (error) {
        console.error('Error in handleTrimContext:', error);
        sendWsError(ws, 'Error trimming context: ' + error.message);
    }
}

/**
 * Handles a request to set the maximum context size
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleSetMaxContextSize(ws, data) {
    if (!ws.userId || !ws.sessionId) {
        return sendWsError(ws, 'Authentication required to set max context size.');
    }

    const { maxSize } = data;

    if (!maxSize || typeof maxSize !== 'number' || maxSize < 1000) {
        return sendWsError(ws, 'Valid max size is required (at least 1000 characters).');
    }

    try {
        const result = await setMaxContextSize(ws.userId, ws.sessionId, maxSize);

        sendWsMessage(ws, {
            type: 'max_context_size_updated',
            maxSize: result.maxSize,
            currentSize: result.currentSize,
            percentUsed: result.percentUsed,
            message: `Maximum context size updated to ${maxSize} characters.`
        });
    } catch (error) {
        console.error('Error in handleSetMaxContextSize:', error);
        sendWsError(ws, error.message || 'Failed to set max context size.');
    }
}

/**
 * Handles a request to set the context mode
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleSetContextMode(ws, data) {
    if (!ws.userId || !ws.sessionId) {
        return sendWsError(ws, 'Authentication required to set context mode.');
    }

    const { mode } = data;

    if (!mode) {
        return sendWsError(ws, 'Context mode is required.');
    }

    try {
        // Get available modes
        const availableModes = getContextModes();
        // Validate mode is one of the available ones
        if (!Object.values(availableModes).includes(mode)) {
            return sendWsError(ws, `Invalid context mode: ${mode}. Valid modes are: ${Object.values(availableModes).join(', ')}`);
        }

        const result = await setContextMode(ws.userId, ws.sessionId, mode);

        sendWsMessage(ws, {
            type: 'context_mode_updated',
            mode: result.mode,
            messageCount: result.messageCount,
            contextSize: result.contextSize,
            percentUsed: result.percentUsed,
            message: `Context mode updated to ${mode}.`
        });

        // Also send a system message to all columns to indicate the mode change
        const modeDescriptions = {
            [availableModes.NONE]: "No context (each message treated independently)",
            [availableModes.SUMMARY]: "Summary context (condensed history)",
            [availableModes.FULL]: "Full context (complete conversation history)"
        };

        sendWsMessage(ws, {
            type: 'system_message',
            message: `Context mode set to: ${modeDescriptions[mode] || mode}`
        });

    } catch (error) {
        console.error('Error in handleSetContextMode:', error);
        sendWsError(ws, error.message || 'Failed to set context mode.');
    }
}

// --- MCP Message Handler ---
async function handleMcpMessage(ws, data) {
    if (!ws.userId) {
        return sendWsError(ws, 'Authentication required for MCP operations.', null, true);
    }
    const userId = ws.userId;
    const sessionId = ws.connectionId; // Use WebSocket connection ID as MCP session ID

    try {
        switch (data.type) {
            case 'mcp_register_context':
                const { directory, description, permissions, duration, projectId } = data;
                if (!directory) throw new Error('Directory is required.');
                const token = await mcp.registerContext(sessionId, directory, userId, { description, permissions, duration, projectId });
                const context = mcp.validateContext(token, userId); // Get details to send back
                sendWsMessage(ws, {
                    type: 'mcp_context_registered', success: true, token,
                    directory: context.context?.directory, expiresAt: context.context?.expiresAt, permissions: context.context?.permissions
                });
                break;
            case 'mcp_list_files':
                if (!data.token) throw new Error('Context token is required.');
                const files = await mcp.listFiles(data.token, userId, data.subPath || '');
                sendWsMessage(ws, { type: 'mcp_files_listed', files, path: data.subPath || '' });
                break;
            case 'mcp_read_file':
                 if (!data.token || !data.filePath) throw new Error('Context token and file path required.');
                const content = await mcp.readFile(data.token, userId, data.filePath);
                sendWsMessage(ws, { type: 'mcp_file_read', filePath: data.filePath, content });
                break;
            case 'mcp_request_write':
                 if (!data.token || !data.filePath || data.content === undefined) throw new Error('Token, filePath, and content required.');
                const writeOpId = await mcp.requestWriteFile(data.token, userId, data.filePath, data.content, { description: data.description });
                sendWsMessage(ws, { type: 'mcp_write_requested', operationId: writeOpId, filePath: data.filePath, status: 'pending' });
                break;
            case 'mcp_request_delete':
                 if (!data.token || !data.filePath) throw new Error('Token and filePath required.');
                const deleteOpId = await mcp.requestDeleteFile(data.token, userId, data.filePath, { description: data.description });
                sendWsMessage(ws, { type: 'mcp_delete_requested', operationId: deleteOpId, filePath: data.filePath, status: 'pending' });
                break;
            case 'mcp_request_create_directory':
                 if (!data.token || !data.dirPath) throw new Error('Token and dirPath required.');
                const createDirOpId = await mcp.requestCreateDirectory(data.token, userId, data.dirPath, { description: data.description });
                sendWsMessage(ws, { type: 'mcp_create_directory_requested', operationId: createDirOpId, dirPath: data.dirPath, status: 'pending' });
                break;
            case 'mcp_get_pending_operations':
                const operations = mcp.getUserPendingOperations(userId);
                sendWsMessage(ws, { type: 'mcp_pending_operations', operations });
                break;
            case 'mcp_approve_operation':
                 if (!data.operationId) throw new Error('Operation ID required.');
                const approveResult = await mcp.approveOperation(data.operationId, userId);
                sendWsMessage(ws, { type: 'mcp_operation_approved', operationId: data.operationId, result: approveResult });
                break;
            case 'mcp_reject_operation':
                 if (!data.operationId) throw new Error('Operation ID required.');
                const rejectResult = mcp.rejectOperation(data.operationId, userId, data.reason || '');
                sendWsMessage(ws, { type: 'mcp_operation_rejected', operationId: data.operationId, result: rejectResult });
                break;
            default:
                // Should not happen due to outer switch, but good practice
                throw new Error(`Unknown MCP message type: ${data.type}`);
        }
    } catch (error) {
        console.error(`MCP Error for User ${userId} (Type: ${data.type}):`, error);
        sendWsError(ws, `MCP Error: ${error.message}`, null, true); // Flag as MCP error
    }
}