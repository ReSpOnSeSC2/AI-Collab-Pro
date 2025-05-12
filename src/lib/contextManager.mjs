/**
 * Context Manager for AI Collaboration Hub
 * Manages conversation context across multiple messages using MongoDB
 */

import * as ConversationService from '../services/conversationService.mjs';
import Conversation from '../models/Conversation.mjs';

// Context modes
export const CONTEXT_MODES = {
  NONE: 'none',        // No context included in prompts
  SUMMARY: 'summary',  // Only a brief summary of context
  FULL: 'full'         // Full conversation history
};

/**
 * Get or create a user's context
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The user's session ID
 * @returns {Promise<Object>} The context object
 */
export async function getOrCreateContext(userId, sessionId) {
  return await ConversationService.getOrCreateConversation(userId, sessionId);
}

/**
 * Get all active contexts for a user
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>} Array of context objects
 */
export async function getUserContexts(userId) {
  return await ConversationService.getUserConversations(userId);
}

/**
 * Add a message to the conversation context
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {Object} message - The message to add
 * @returns {Promise<Object>} Updated context info
 */
export async function addMessageToContext(userId, sessionId, message) {
  return await ConversationService.addMessageToConversation(userId, sessionId, message);
}

/**
 * Add an AI response to a conversation
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {string} modelId - The AI model ID
 * @param {string} response - The AI response
 * @returns {Promise<Object>} Updated context info
 */
export async function addResponseToContext(userId, sessionId, modelId, response) {
  return await ConversationService.addResponseToConversation(userId, sessionId, modelId, response);
}

/**
 * Update target models for a context
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {Array} models - Array of model IDs
 * @returns {Promise<void>}
 */
export async function updateTargetModels(userId, sessionId, models) {
  // This is now handled in the addMessageToContext function
  // Just making it a no-op for backward compatibility
  return;
}

/**
 * Get the current context as a formatted string for AI prompting
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<string>} Formatted context history
 */
export async function getFormattedContextHistory(userId, sessionId) {
  return await ConversationService.getFormattedContextHistory(userId, sessionId);
}

/**
 * Reset context for a user session
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} The new empty context
 */
export async function resetContext(userId, sessionId) {
  return await ConversationService.resetConversation(userId, sessionId);
}

/**
 * Trim context if it exceeds the maximum size
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} Information about the trimmed context
 */
export async function trimContextIfNeeded(userId, sessionId) {
  return await ConversationService.trimConversationIfNeeded(userId, sessionId);
}

/**
 * Set a custom maximum context size
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {number} maxSize - The new maximum context size
 * @returns {Promise<Object>} Updated context info
 */
export async function setMaxContextSize(userId, sessionId, maxSize) {
  return await ConversationService.setConversationMaxSize(userId, sessionId, maxSize);
}

/**
 * Set the context mode for a user session
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {string} mode - The context mode (none, summary, full)
 * @returns {Promise<Object>} Updated context info
 */
export async function setContextMode(userId, sessionId, mode) {
  return await ConversationService.setConversationContextMode(userId, sessionId, mode);
}

/**
 * Get available context modes
 * @returns {Object} The available context modes
 */
export function getContextModes() {
  return CONTEXT_MODES;
}

/**
 * List all contexts (admin function)
 * @param {number} limit - Maximum number of contexts to return
 * @returns {Promise<Array>} - Array of all contexts
 */
export async function listAllContexts(limit = 100) {
  try {
    const contexts = await Conversation.find({})
      .sort({ lastUpdated: -1 })
      .limit(limit)
      .lean();

    return contexts.map(ctx => ({
      id: ctx._id,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      created: ctx.createdAt,
      lastUpdated: ctx.updatedAt,
      messageCount: ctx.messages?.length || 0,
      contextSize: ctx.contextSize || 0,
      maxContextSize: ctx.maxContextSize || 0,
      contextMode: ctx.contextMode || 'none',
      percentUsed: Math.round(((ctx.contextSize || 0) / (ctx.maxContextSize || 1)) * 100)
    }));
  } catch (error) {
    console.error('Error in listAllContexts:', error);
    throw error;
  }
}