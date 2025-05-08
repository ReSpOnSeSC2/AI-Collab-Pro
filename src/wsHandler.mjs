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
                        handleAuthentication(ws, data);
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
                    case 'debug_ping':
                        sendWsMessage(ws, { type: 'debug_pong', timestamp: Date.now(), message: data.message || 'Pong!' });
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

function handleAuthentication(ws, data) {
    if (data.userId && typeof data.userId === 'string') {
        ws.userId = data.userId;
        wsUserSessions.set(ws, { userId: ws.userId, sessionId: ws.connectionId }); // Store mapping
        sendWsMessage(ws, { type: 'authentication_success', userId: ws.userId });
        console.log(`User ${ws.userId} authenticated for WebSocket session ${ws.connectionId}.`);
    } else {
        sendWsError(ws, "User ID missing or invalid for authentication.");
    }
}

async function handleChatMessage(ws, data) {
    if (!ws.userId) { // Require authentication for chat
        return sendWsError(ws, 'Authentication required to chat.');
    }

    const { message, content, filePaths = [], models = {}, target, collaborationMode = null } = data;
    const messageText = message || content || '';

    if (!target) return sendWsError(ws, "Missing 'target' in chat message.");
    if (!messageText && (!filePaths || filePaths.length === 0)) return sendWsError(ws, "Cannot send empty message without files.");

    // Update collaboration settings if provided
    if (collaborationMode) setCollaborationMode(collaborationMode);
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

    // --- Prepare context (including files) ---
    // TODO: Integrate file reading logic here or call a helper
    const fileContext = await prepareFileContextForAI(filePaths); // Implement this function
    const fullPrompt = fileContext ? `${fileContext}\n\nUser Query:\n${messageText}` : messageText;

    // --- Define Callbacks for Streaming ---
    const onChunk = (aiTarget, chunkText) => {
        sendWsMessage(ws, { type: 'response', target: aiTarget, content: chunkText, start: !latestResponses[aiTarget] }); // Indicate start on first chunk
        latestResponses[aiTarget] += chunkText; // Accumulate for summary/build
    };
    const onComplete = (aiTarget) => {
        sendWsMessage(ws, { type: 'response', target: aiTarget, end: true });
        console.log(`Streaming complete for ${aiTarget}`);
    };
    const onError = (aiTarget, error) => {
        sendWsError(ws, `Error from ${aiTarget}: ${error.message}`, aiTarget);
        sendWsMessage(ws, { type: 'response', target: aiTarget, end: true }); // Ensure stream ends on client
        latestResponses[aiTarget] = `Error: ${error.message}`; // Store error
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

    // Send initial "Thinking..." message to relevant UIs
     modelsToQuery.forEach(id => {
         sendWsMessage(ws, { type: 'response', target: id, start: true, model: models[id]?.[0] || `Default ${id}` }); // Show model being used
     });


    if (modelsToQuery.length === 1) {
        const singleTarget = modelsToQuery[0];
        const modelId = models[singleTarget]?.[0]; // Get the specific requested model
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
        if (getCollaborationConfig().mode === 'collaborative') {
            await handleCollaborativeDiscussion(
                messageText, // Pass original text, context added inside
                modelsToQuery,
                models, // Pass requested models map
                onChunk,
                onComplete,
                onError,
                onSummaryChunk,
                onSummaryComplete,
                onSummaryError
            );
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