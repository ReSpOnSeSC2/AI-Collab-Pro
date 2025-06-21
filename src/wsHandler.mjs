/**
 * WebSocket Handler
 * Manages WebSocket connections, message routing, and interactions with AI/MCP/CLI modules.
 * Version: 8.0.0
 */

import { WebSocket } from 'ws';
import mongoose from 'mongoose';
import { clients, availability, getClient } from './lib/ai/index.mjs';
import clientFactory, { clearUserClientCache } from './lib/ai/clientFactory.mjs';
import { handleCollaborativeDiscussion, setCollaborationStyle, setCollaborationMode, getCollaborationConfig } from './lib/ai/collaboration.mjs';
import { streamClaudeResponse } from './lib/ai/claude.mjs';
import { streamGeminiResponse } from './lib/ai/gemini.mjs';
import { streamOpenAICompatResponse } from './lib/ai/openaiClient.mjs';
import { handleCliCommand } from './lib/cliHandler.mjs'; // Import CLI handler
import * as mcp from './lib/mcp/index.mjs'; // Import MCP library as namespace
import { subscribeToChannel } from './lib/messaging/redis.mjs'; // Import Redis subscription
import { addResponseToContext } from './lib/contextManager.mjs'; // Import context management
import { trackUsage, getSessionCost, getUserDailyCost, setWebSocketHandler } from './lib/ai/costControl.mjs'; // Import cost tracking

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
    
    // Set up WebSocket handler for cost control real-time updates
    setWebSocketHandler({
        broadcast: (userId, message) => {
            // Find all WebSocket connections for this user
            wss.clients.forEach((ws) => {
                if (ws.userId === userId && ws.readyState === WebSocket.OPEN) {
                    sendWsMessage(ws, message);
                }
            });
        }
    });

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
                    case 'debug_user_info':
                        await handleDebugUserInfo(ws, data);
                        break;
                    case 'ping':
                        // Handle regular ping messages from the client
                        sendWsMessage(ws, { type: 'pong', timestamp: Date.now() });
                        break;
                    // --- Cost Control Message Routing ---
                    case 'get_session_cost':
                        await handleGetSessionCost(ws, data);
                        break;
                    case 'get_daily_cost':
                        await handleGetDailyCost(ws, data);
                        break;
                    case 'set_budget_limit':
                        await handleSetBudgetLimit(ws, data);
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
        const previousUserId = ws.userId;
        ws.userId = data.userId;
        ws.sessionId = ws.connectionId; // Use connectionId as sessionId

        console.log(`🔐 Authenticating WebSocket for user: ${ws.userId}`);
        console.log(`🔍 User ID format check:`);
        console.log(`  - Is temporary format: ${ws.userId.startsWith('user-') && ws.userId.includes('-')}`);
        console.log(`  - Is MongoDB ObjectId format: ${/^[0-9a-fA-F]{24}$/.test(ws.userId)}`);
        console.log(`  - Previous userId: ${previousUserId || 'none'}`);
        
        if (previousUserId && previousUserId !== ws.userId) {
            console.log(`🔄 User ID changed from ${previousUserId} to ${ws.userId}`);
        }

        // Clear any cached API clients for this user to ensure fresh checks
        clearUserClientCache(ws.userId);

        // Store mapping
        wsUserSessions.set(ws, { userId: ws.userId, sessionId: ws.sessionId });

        try {
            // Check MongoDB connection state first
            const mongoState = mongoose.connection.readyState;
            console.log(`🔍 MongoDB connection state: ${mongoState} (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)`);
            
            if (mongoState !== 1) {
                console.error(`❌ MongoDB is not connected. State: ${mongoState}`);
                console.log(`🔄 Using fallback authentication without database context...`);
                
                // Check API keys availability even without database
                let apiKeyStatus = {};
                let providers = [];
                
                try {
                    // Import mongoose to check connection
                    console.log(`🔑 Checking API keys availability for user ${ws.userId}...`);
                    
                    // Get available providers from environment variables
                    const envProviders = {
                        'anthropic': process.env.ANTHROPIC_API_KEY,
                        'google': process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
                        'openai': process.env.OPENAI_API_KEY,
                        'grok': process.env.XAI_API_KEY || process.env.GROK_API_KEY,
                        'deepseek': process.env.DEEPSEEK_API_KEY,
                        'llama': process.env.LLAMA_API_KEY
                    };
                    
                    providers = Object.entries(envProviders)
                        .filter(([provider, key]) => key && key.trim() !== '')
                        .map(([provider]) => provider);
                    
                    console.log(`✅ Available providers from environment: ${providers.join(', ')}`);
                    
                    // Map to frontend names
                    const providerMapping = {
                        'anthropic': 'claude',
                        'google': 'gemini',
                        'openai': 'chatgpt',
                        'grok': 'grok',
                        'deepseek': 'deepseek',
                        'llama': 'llama'
                    };
                    
                    providers.forEach(provider => {
                        const frontendName = providerMapping[provider] || provider;
                        apiKeyStatus[frontendName] = true;
                    });
                    
                } catch (checkError) {
                    console.error(`Error checking API availability:`, checkError);
                }
                
                // Authenticate without context when database is unavailable
                sendWsMessage(ws, {
                    type: 'authentication_success',
                    userId: ws.userId,
                    sessionId: ws.sessionId,
                    contextInfo: {
                        id: 'no-db-fallback',
                        messageCount: 0,
                        contextSize: 0,
                        maxContextSize: 32000,
                        percentUsed: 0,
                        isNearLimit: false,
                        warning: 'Database unavailable - running without context'
                    },
                    apiKeys: apiKeyStatus
                });
                
                console.log(`✅ Fallback authentication sent for user ${ws.userId} with API keys:`, apiKeyStatus);
                
                return;
            }
            
            // Initialize a context for this session
            console.log(`🔍 Attempting to get/create context for userId: ${ws.userId}, sessionId: ${ws.sessionId}`);
            
            let context;
            try {
                context = await getOrCreateContext(ws.userId, ws.sessionId);
                console.log(`✅ Context retrieved/created successfully`);
            } catch (contextError) {
                console.error(`❌ Error creating/retrieving context:`, contextError);
                console.error(`  - Error name: ${contextError.name}`);
                console.error(`  - Error message: ${contextError.message}`);
                console.error(`  - Stack:`, contextError.stack);
                
                // Check if it's a MongoDB connection error
                if (contextError.name === 'MongooseError' || 
                    contextError.message.includes('buffering timed out') ||
                    contextError.message.includes('MongooseServerSelectionError') ||
                    contextError.message.includes('connect ECONNREFUSED')) {
                    sendWsError(ws, "Database connection error. Please try again later.");
                } else {
                    sendWsError(ws, "Internal server error: Could not initialize session context.");
                }
                return;
            }

            // Defensive check: Ensure context and context.messages are defined
            if (!context || !context.messages) {
                console.error(`Failed to retrieve or initialize context properly for userId: ${ws.userId}, sessionId: ${ws.sessionId}. Context:`, context);
                sendWsError(ws, "Internal server error: Invalid context structure.");
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
            
            // Check which API keys are available for this user
            try {
                const availabilityCheck = await clientFactory.getAvailability(ws.userId);
                console.log(`🔑 API keys available for user ${ws.userId}:`, availabilityCheck);
            } catch (checkError) {
                console.error(`Error checking API availability:`, checkError);
            }
        } catch (error) {
            console.error(`Error during authentication for userId: ${ws.userId}, sessionId: ${ws.sessionId}:`, error);
            console.error(`Error details:`, {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // Try to authenticate without context as a fallback
            console.log(`🔄 Attempting authentication without context...`);
            try {
                sendWsMessage(ws, {
                    type: 'authentication_success',
                    userId: ws.userId,
                    sessionId: ws.sessionId,
                    contextInfo: {
                        id: 'fallback',
                        messageCount: 0,
                        contextSize: 0,
                        maxContextSize: 32000,
                        percentUsed: 0,
                        isNearLimit: false,
                        error: 'Context unavailable'
                    }
                });
                console.log(`✅ Fallback authentication successful`);
                
                // Still try to check API keys
                try {
                    const availabilityCheck = await clientFactory.getAvailability(ws.userId);
                    console.log(`🔑 API keys available for user ${ws.userId}:`, availabilityCheck);
                } catch (checkError) {
                    console.error(`Error checking API availability:`, checkError);
                }
            } catch (fallbackError) {
                console.error(`❌ Fallback authentication also failed:`, fallbackError);
                sendWsError(ws, "Internal server error during authentication.");
            }
        }
    } else {
        sendWsError(ws, "User ID missing or invalid for authentication.");
    }
}

async function handleChatMessage(ws, data) {
    // Debug logging
    console.log(`📩 handleChatMessage: ws.userId=${ws.userId}, data.userId=${data.userId}`);
    
    // Use userId from data if ws.userId is not set (for backwards compatibility)
    if (!ws.userId && data.userId) {
        console.log(`🔄 Using userId from message data: ${data.userId}`);
        ws.userId = data.userId;
        
        // Also clear the cache for this user to ensure fresh API key checks
        clearUserClientCache(data.userId);
    }
    
    if (!ws.userId) { // Require authentication for chat
        return sendWsError(ws, 'Authentication required to chat.');
    }
    
    // Additional debugging for user ID format
    console.log(`🔍 User ID validation:`);
    console.log(`  - ws.userId: ${ws.userId}`);
    console.log(`  - data.userId: ${data.userId}`);
    console.log(`  - Is temporary format: ${ws.userId.startsWith('user-') && ws.userId.includes('-')}`);
    console.log(`  - Is MongoDB ObjectId: ${/^[0-9a-fA-F]{24}$/.test(ws.userId)}`)

    const {
        message,
        content,
        filePaths = [],
        models = {},
        target,
        collaborationMode = null,
        sequentialStyle = null,
        userId: dataUserId = null
    } = data;
    
    console.log(`📦 Chat message data - userId from data: ${dataUserId}, models:`, models);
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
    const userId = ws.userId || data.userId; // Get user ID
    let providers = []; // Declare providers at a higher scope to avoid reference errors
    
    console.log(`🔍 Checking models for userId: ${userId}, target: ${target}, models:`, Object.keys(models));
    
    // Force clear the client cache to ensure fresh API key checks
    clearUserClientCache(userId);
    console.log(`🧹 Cleared client cache for userId: ${userId}`);
    
    if (target === 'collab') {
        // Check which models the user has API keys for
        // The frontend sends provider names as keys (claude, gemini, chatgpt, etc.)
        providers = Object.keys(models);
        console.log(`🔍 Providers from frontend:`, providers);
        
        // Check API keys for each provider
        for (const provider of providers) {
            try {
                console.log(`🔑 Checking API key for provider: ${provider}, userId: ${userId}`);
                
                // The clientFactory will handle provider name normalization internally
                const client = await clientFactory.getClient(userId, provider);
                if (client) {
                    console.log(`✅ API key found for ${provider}`);
                    modelsToQuery.push(provider);
                } else {
                    console.log(`❌ No client returned for ${provider}`);
                }
            } catch (error) {
                console.log(`❌ No API key available for ${provider}: ${error.message}`);
            }
        }
    } else {
        // Single model request
        try {
            // The clientFactory will normalize the provider name internally
            const client = await clientFactory.getClient(userId, target);
            if (client) {
                modelsToQuery.push(target);
            }
        } catch (error) {
            return sendWsError(ws, `Target AI '${target}' is not available: ${error.message}`);
        }
    }
    
    console.log(`📊 Models to query after checking: ${modelsToQuery.length} models:`, modelsToQuery);

    if (modelsToQuery.length === 0) {
        console.error(`❌ No models available for userId: ${userId}`);
        console.error(`  - Models requested:`, Object.keys(models));
        console.error(`  - Providers extracted:`, Array.from(providers || []));
        console.error(`  - User ID format: ${userId && userId.startsWith('user-') && userId.includes('-') ? 'temporary' : 'permanent'}`);
        
        // Check database connection state
        const mongoose = await import('mongoose');
        const connectionState = mongoose.connection.readyState;
        console.error(`  - MongoDB connection state: ${connectionState} (${['disconnected', 'connected', 'connecting', 'disconnecting'][connectionState]})`);
        
        // Check if this is a temporary user
        if (userId && userId.startsWith('user-') && userId.includes('-')) {
            return sendWsError(ws, "No AI models available. You are using a temporary session. Please log in with Google to use your saved API keys.");
        }
        
        // For authenticated users, provide more specific guidance
        const requestedProviders = Array.from(providers || []).join(', ');
        
        // Check if database is disconnected
        if (connectionState !== 1) {
            return sendWsError(ws, `Database connection issue detected. The server cannot access your stored API keys. Please try refreshing the page in a moment. If the issue persists, contact support.`);
        }
        
        // Check if this is likely a database query issue
        if (userId && /^[0-9a-fA-F]{24}$/.test(userId)) {
            console.error(`❌ Valid MongoDB ObjectId but no API keys found. This may indicate:`);
            console.error(`  - No API keys configured for these providers`);
            console.error(`  - API keys may need to be re-entered in Settings`);
            
            return sendWsError(ws, `No API keys found for the requested models (${requestedProviders}). Please go to Settings and ensure your API keys are configured for: ${requestedProviders}.`);
        }
        
        return sendWsError(ws, `No valid AI clients available. Please configure your API keys in Settings for: ${requestedProviders || 'the selected models'}.`);
    }

    // --- Prepare context (including files and conversation history) ---
    // Get file context
    const fileContext = await prepareFileContextForAI(filePaths);

    // Get conversation history from context manager
    let historyContext = '';
    if (ws.sessionId) {
      try {
        // Check MongoDB connection state before trying to get context
        const mongoose = await import('mongoose');
        if (mongoose.connection.readyState === 1) {
          historyContext = await getFormattedContextHistory(ws.userId, ws.sessionId);

          // Update target models in the context
          if (modelsToQuery.length > 0) {
            await updateTargetModels(ws.userId, ws.sessionId, modelsToQuery);
          }
        } else {
          console.log('⚠️ MongoDB not connected - proceeding without context history');
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
    const onComplete = async (aiTarget, modelUsed) => {
        sendWsMessage(ws, { type: 'response', target: aiTarget, end: true });
        console.log(`Streaming complete for ${aiTarget}`);

        // Store the complete response in the context
        if (ws.sessionId && latestResponses[aiTarget]) {
            try {
                // Check MongoDB connection state before trying to save context
                const mongoose = await import('mongoose');
                if (mongoose.connection.readyState === 1) {
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
                
                // Track token usage and cost
                if (ws.userId && modelUsed) {
                    // Estimate token counts (rough approximation)
                    const inputTokens = Math.ceil((fullPrompt || '').length / 4);
                    const outputTokens = Math.ceil(contextResponse.length / 4);
                    
                    const costResult = await trackUsage(ws.sessionId, aiTarget, modelUsed, {
                        inputTokens: inputTokens,
                        outputTokens: outputTokens,
                        userId: ws.userId
                    });
                    
                    if (costResult.success) {
                        // Send cost update to user
                        sendWsMessage(ws, {
                            type: 'cost_update',
                            sessionCost: costResult.totalSessionCost,
                            requestCost: costResult.cost,
                            budgetExceeded: costResult.budgetExceeded,
                            budgetInfo: costResult.budgetInfo
                        });
                        
                        // If budget exceeded, send warning
                        if (costResult.budgetExceeded) {
                            sendWsMessage(ws, {
                                type: 'budget_exceeded',
                                message: 'Daily budget limit exceeded. Further requests may be blocked.',
                                budgetInfo: costResult.budgetInfo
                            });
                        }
                    }
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
                () => onComplete(singleTarget, modelId),
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
            
            // Generate session ID for this collaboration
            const collaborationSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const redisChannel = `collab:${collaborationSessionId}`;
            
            // Subscribe to Redis events for this collaboration session
            console.log(`📡 Subscribing to Redis channel: ${redisChannel}`);
            const unsubscribe = subscribeToChannel(redisChannel, (event) => {
                console.log(`📡 Received Redis event on ${redisChannel}:`, event.type);
                
                // Forward agent_thought events as model_status updates
                if (event.type === 'agent_thought') {
                    // Safely handle event.text which might not be a string
                    let thoughtText = '';
                    if (event.text && typeof event.text === 'string') {
                        thoughtText = event.text.substring(0, 50);
                    } else if (event.text && typeof event.text === 'object') {
                        thoughtText = JSON.stringify(event.text).substring(0, 50);
                    }
                    
                    sendWsMessage(ws, {
                        type: 'model_status',
                        model: event.agent || 'unknown',
                        status: 'processing',
                        message: thoughtText ? `Processing: ${thoughtText}...` : 'Processing thoughts...',
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded agent_thought from ${event.agent} to WebSocket`);
                } 
                // Forward agent_vote events as model_status updates
                else if (event.type === 'agent_vote') {
                    sendWsMessage(ws, {
                        type: 'model_status',
                        model: event.agent || 'unknown',
                        status: 'processing',
                        message: 'Voting on responses...',
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded agent_vote from ${event.agent} to WebSocket`);
                }
                // Forward agent_thinking events as model_status updates
                else if (event.type === 'agent_thinking') {
                    sendWsMessage(ws, {
                        type: 'model_status',
                        model: event.agent || 'unknown',
                        status: 'processing',
                        message: 'Deep thinking...',
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded agent_thinking from ${event.agent} to WebSocket`);
                }
                // Forward agent_response_complete events as completed status
                else if (event.type === 'agent_response_complete') {
                    sendWsMessage(ws, {
                        type: 'model_status',
                        model: event.agent || 'unknown',
                        status: 'completed',
                        message: `Response complete (${event.responseLength || 0} chars)`,
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded agent_response_complete from ${event.agent} to WebSocket`);
                }
                // Forward phase_start events
                else if (event.type === 'phase_start') {
                    sendWsMessage(ws, {
                        type: 'model_status',
                        model: 'system',
                        status: 'phase_change',
                        message: event.phase || 'New phase starting...',
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded phase_start to WebSocket: ${event.phase}`);
                }
                // Forward progress_update events
                else if (event.type === 'progress_update') {
                    sendWsMessage(ws, {
                        type: 'progress_update',
                        phase: event.phase,
                        currentStep: event.currentStep,
                        totalSteps: event.totalSteps,
                        percentage: event.percentage,
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded progress_update to WebSocket: ${event.phase} ${event.percentage}%`);
                }
                // Forward collaboration_complete events
                else if (event.type === 'collaboration_complete') {
                    sendWsMessage(ws, {
                        type: 'collaboration_complete',
                        timestamp: event.timestamp || new Date().toISOString()
                    });
                    console.log(`📡 Forwarded collaboration_complete to WebSocket`);
                    
                    // Clean up subscription
                    unsubscribe();
                    console.log(`📡 Unsubscribed from Redis channel: ${redisChannel}`);
                }
            });
            
            // Use the new collaboration engine with configuration
            const collaborationResult = await handleCollaborativeDiscussion({
                prompt: fullPrompt,
                mode: getCollaborationConfig().mode,
                agents: modelsToQuery,
                models: models,
                sessionId: collaborationSessionId, // Pass session ID to collaboration
                userId: userId, // Pass user ID for dynamic API key checking
                ignoreFailingModels: true, // Continue even if some models fail
                skipSynthesisIfAllFailed: true, // Skip synthesis phase if all models fail
                continueWithAvailableModels: true, // Continue with available models when some timeout
                costCapDollars: 100.0, // Higher cost cap (effectively unlimited)
                maxSeconds: 600, // 10 minute timeout for complex prompts
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
                    
                    // Clean up Redis subscription on error
                    if (typeof unsubscribe === 'function') {
                        unsubscribe();
                        console.log(`🔌 Cleaned up Redis subscription due to collaboration error`);
                    }
                    
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
                    
                    // Clean up Redis subscription after successful completion
                    if (typeof unsubscribe === 'function') {
                        unsubscribe();
                        console.log(`🔌 Cleaned up Redis subscription after successful completion`);
                    }
                }
            } else {
                console.error("❌ Collaboration returned empty or null result");
                
                // Clean up Redis subscription on empty result
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                    console.log(`🔌 Cleaned up Redis subscription due to empty result`);
                }
                
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

// --- Debug Handler ---

/**
 * Handles debug request for user info and API key status
 */
async function handleDebugUserInfo(ws, data) {
    try {
        const { User } = await import('./models/User.mjs');
        const mongoose = await import('mongoose');
        const apiKeyService = (await import('./services/apiKeyService.mjs')).default;
        const clientFactory = (await import('./lib/ai/clientFactory.mjs')).default;
        
        const userId = ws.userId || data.userId;
        
        // MongoDB connection status
        const mongoStatus = {
            connected: mongoose.connection.readyState === 1,
            state: mongoose.connection.readyState,
            stateDesc: ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'][mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            db: mongoose.connection.name
        };
        
        // User lookup
        let userInfo = null;
        if (userId) {
            try {
                const user = await User.findById(userId);
                if (user) {
                    userInfo = {
                        found: true,
                        _id: user._id.toString(),
                        email: user.email,
                        name: user.name,
                        apiKeysCount: user.apiKeys ? user.apiKeys.length : 0,
                        apiKeys: user.apiKeys ? user.apiKeys.map(k => ({
                            provider: k.provider,
                            keyId: k.keyId,
                            isValid: k.isValid
                        })) : []
                    };
                } else {
                    userInfo = { found: false, error: 'User not found in database' };
                }
            } catch (error) {
                userInfo = { found: false, error: error.message };
            }
        }
        
        // Check API key availability
        const providers = ['anthropic', 'google', 'openai', 'grok', 'deepseek', 'llama'];
        const availability = {};
        
        for (const provider of providers) {
            try {
                const keyInfo = await apiKeyService.getApiKey(userId, provider);
                availability[provider] = {
                    available: !!keyInfo,
                    source: keyInfo?.source || 'none'
                };
            } catch (error) {
                availability[provider] = {
                    available: false,
                    error: error.message
                };
            }
        }
        
        // Also check frontend names
        availability.claude = availability.anthropic;
        availability.gemini = availability.google;
        availability.chatgpt = availability.openai;
        
        // Check client factory availability
        let clientFactoryStatus = {};
        try {
            clientFactoryStatus = await clientFactory.getAvailability(userId);
        } catch (error) {
            clientFactoryStatus.error = error.message;
        }
        
        sendWsMessage(ws, {
            type: 'debug_user_info',
            userId,
            userIdFormat: {
                isTemporary: userId && userId.startsWith('user-') && userId.includes('-'),
                isObjectId: userId && /^[0-9a-fA-F]{24}$/.test(userId),
                length: userId ? userId.length : 0
            },
            wsInfo: {
                connectionId: ws.connectionId,
                sessionId: ws.sessionId,
                userId: ws.userId,
                isAuthenticated: !!ws.userId
            },
            mongoStatus,
            userInfo,
            apiKeyAvailability: availability,
            clientFactoryStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in handleDebugUserInfo:', error);
        sendWsError(ws, 'Debug error: ' + error.message);
    }
}

// --- Cost Control Handlers ---

/**
 * Handles a request to get session cost information
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleGetSessionCost(ws, data) {
    if (!ws.userId || !ws.sessionId) {
        return sendWsError(ws, 'Authentication required to get session cost.');
    }

    try {
        const sessionId = data.sessionId || ws.sessionId;
        const costInfo = await getSessionCost(sessionId);
        
        if (costInfo.success) {
            sendWsMessage(ws, {
                type: 'session_cost',
                ...costInfo
            });
        } else {
            sendWsError(ws, costInfo.error || 'Failed to retrieve session cost');
        }
    } catch (error) {
        console.error('Error in handleGetSessionCost:', error);
        sendWsError(ws, 'Error retrieving session cost: ' + error.message);
    }
}

/**
 * Handles a request to get daily cost information
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleGetDailyCost(ws, data) {
    if (!ws.userId) {
        return sendWsError(ws, 'Authentication required to get daily cost.');
    }

    try {
        const date = data.date ? new Date(data.date) : new Date();
        const costInfo = await getUserDailyCost(ws.userId, date);
        
        if (costInfo.success) {
            sendWsMessage(ws, {
                type: 'daily_cost',
                ...costInfo
            });
        } else {
            sendWsError(ws, costInfo.error || 'Failed to retrieve daily cost');
        }
    } catch (error) {
        console.error('Error in handleGetDailyCost:', error);
        sendWsError(ws, 'Error retrieving daily cost: ' + error.message);
    }
}

/**
 * Handles a request to set budget limit
 * @param {WebSocket} ws - The WebSocket connection
 * @param {Object} data - The message data
 */
async function handleSetBudgetLimit(ws, data) {
    if (!ws.userId) {
        return sendWsError(ws, 'Authentication required to set budget limit.');
    }

    try {
        const { limit } = data;
        
        if (typeof limit !== 'number' || limit <= 0) {
            return sendWsError(ws, 'Invalid budget limit. Must be a positive number.');
        }
        
        const { enforceBudgetLimit } = await import('./lib/ai/costControl.mjs');
        const result = await enforceBudgetLimit(ws.userId, limit);
        
        if (result.success) {
            sendWsMessage(ws, {
                type: 'budget_limit_set',
                ...result
            });
        } else {
            sendWsError(ws, result.error || 'Failed to set budget limit');
        }
    } catch (error) {
        console.error('Error in handleSetBudgetLimit:', error);
        sendWsError(ws, 'Error setting budget limit: ' + error.message);
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