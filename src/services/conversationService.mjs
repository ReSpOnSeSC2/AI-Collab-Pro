/**
 * Conversation Service
 * Handles MongoDB operations for conversation contexts
 */

import Conversation from '../models/Conversation.mjs';

/**
 * Get or create a conversation context
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} - The conversation context
 */
export async function getOrCreateConversation(userId, sessionId) {
  try {
    let conversation = await Conversation.findOne({ userId, sessionId });
    
    if (!conversation) {
      conversation = new Conversation({
        userId,
        sessionId,
        contextMode: 'none', // Default to no context
        messages: [],
        summary: ''
      });
      await conversation.save();
    }
    
    return conversation;
  } catch (error) {
    console.error('Error in getOrCreateConversation:', error);
    throw error;
  }
}

/**
 * Get all conversations for a user
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>} - Array of conversation contexts
 */
export async function getUserConversations(userId) {
  try {
    return await Conversation.find({ userId })
      .sort({ lastUpdated: -1 })
      .limit(20);
  } catch (error) {
    console.error('Error in getUserConversations:', error);
    throw error;
  }
}

/**
 * Add a message to a conversation
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {Object} message - The message to add
 * @returns {Promise<Object>} - Updated conversation info
 */
export async function addMessageToConversation(userId, sessionId, message) {
  try {
    const conversation = await getOrCreateConversation(userId, sessionId);
    
    // Add the message to the conversation
    conversation.messages.push(message);
    
    // Update the conversation summary if in summary mode
    if (conversation.contextMode === 'summary' && message.type === 'user') {
      // We'll update the summary when responses are added
      conversation.markModified('messages');
    }
    
    await conversation.save();
    
    // Return info about the updated conversation
    return {
      contextSize: conversation.contextSize,
      maxSize: conversation.maxContextSize,
      messageCount: conversation.messages.length,
      contextMode: conversation.contextMode,
      percentUsed: Math.round((conversation.contextSize / conversation.maxContextSize) * 100),
      isNearLimit: conversation.contextSize >= (conversation.maxContextSize * 0.8)
    };
  } catch (error) {
    console.error('Error in addMessageToConversation:', error);
    throw error;
  }
}

/**
 * Add an AI response to the last message in a conversation
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {string} modelId - The AI model ID
 * @param {string} response - The AI response
 * @returns {Promise<Object>} - Updated conversation info
 */
export async function addResponseToConversation(userId, sessionId, modelId, response) {
  try {
    const conversation = await getOrCreateConversation(userId, sessionId);
    
    if (conversation.messages.length === 0) {
      // No messages to add response to
      return {
        contextSize: conversation.contextSize,
        maxSize: conversation.maxContextSize,
        messageCount: conversation.messages.length
      };
    }
    
    // Add the response to the last message
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    
    if (!lastMessage.responses) {
      lastMessage.responses = new Map();
    }
    
    lastMessage.responses.set(modelId, response);
    conversation.markModified('messages');
    
    // Update summary if in summary mode (after getting AI response)
    if (conversation.contextMode === 'summary') {
      await updateConversationSummary(conversation);
    }
    
    await conversation.save();
    
    // Return info about the updated conversation
    return {
      contextSize: conversation.contextSize,
      maxSize: conversation.maxContextSize,
      messageCount: conversation.messages.length,
      percentUsed: Math.round((conversation.contextSize / conversation.maxContextSize) * 100),
      isNearLimit: conversation.contextSize >= (conversation.maxContextSize * 0.8)
    };
  } catch (error) {
    console.error('Error in addResponseToConversation:', error);
    throw error;
  }
}

/**
 * Update conversation summary using the last message exchange
 * @param {Object} conversation - The conversation document
 * @returns {Promise<void>}
 */
async function updateConversationSummary(conversation) {
  try {
    if (conversation.messages.length === 0) return;
    
    // Get the last message exchange
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    
    // If this is the first message, start the summary
    if (conversation.messages.length === 1) {
      conversation.summary = `Conversation about: ${extractTopics(lastMessage.content)}`;
      return;
    }
    
    // For subsequent messages, append to the summary
    // This is a simple approach - in a production system you might use an AI model to generate a better summary
    const newTopics = extractTopics(lastMessage.content);
    
    // Only add new topics if they're not already in the summary
    if (newTopics && !conversation.summary.includes(newTopics)) {
      conversation.summary += `, ${newTopics}`;
    }
    
    // Limit summary length
    if (conversation.summary.length > 500) {
      conversation.summary = conversation.summary.substring(0, 500) + '...';
    }
  } catch (error) {
    console.error('Error updating conversation summary:', error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Extract topics from a message
 * @param {string} content - The message content
 * @returns {string} - Extracted topics
 */
function extractTopics(content) {
  if (!content) return '';
  
  // Extract potential keywords (simple approach)
  const words = content.split(/\s+/)
    .filter(w => w.length > 4)  // Only words longer than 4 chars
    .filter(w => !['about', 'these', 'those', 'their', 'there'].includes(w.toLowerCase()))
    .slice(0, 5);  // Take first 5 words
    
  return words.join(', ');
}

/**
 * Set the context mode for a conversation
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {string} mode - The context mode (none, summary, full)
 * @returns {Promise<Object>} - Updated conversation info
 */
export async function setConversationContextMode(userId, sessionId, mode) {
  try {
    if (!['none', 'summary', 'full'].includes(mode)) {
      throw new Error(`Invalid context mode: ${mode}`);
    }
    
    const conversation = await getOrCreateConversation(userId, sessionId);
    conversation.contextMode = mode;
    
    // If switching to summary mode, make sure we have a summary
    if (mode === 'summary' && !conversation.summary && conversation.messages.length > 0) {
      await updateConversationSummary(conversation);
    }
    
    await conversation.save();
    
    return {
      mode: conversation.contextMode,
      messageCount: conversation.messages.length,
      contextSize: conversation.contextSize,
      maxContextSize: conversation.maxContextSize,
      percentUsed: Math.round((conversation.contextSize / conversation.maxContextSize) * 100)
    };
  } catch (error) {
    console.error('Error in setConversationContextMode:', error);
    throw error;
  }
}

/**
 * Set maximum context size for a conversation
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @param {number} maxSize - The maximum context size
 * @returns {Promise<Object>} - Updated conversation info
 */
export async function setConversationMaxSize(userId, sessionId, maxSize) {
  try {
    if (!maxSize || maxSize < 1000) {
      throw new Error('Invalid max context size. Must be at least 1000 characters.');
    }
    
    const conversation = await getOrCreateConversation(userId, sessionId);
    conversation.maxContextSize = maxSize;
    await conversation.save();
    
    return {
      maxSize: conversation.maxContextSize,
      currentSize: conversation.contextSize,
      percentUsed: Math.round((conversation.contextSize / conversation.maxContextSize) * 100)
    };
  } catch (error) {
    console.error('Error in setConversationMaxSize:', error);
    throw error;
  }
}

/**
 * Reset a conversation context
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} - The new empty context
 */
export async function resetConversation(userId, sessionId) {
  try {
    const conversation = await getOrCreateConversation(userId, sessionId);
    
    // Save the context mode and max size
    const { contextMode, maxContextSize } = conversation;
    
    // Reset the conversation
    conversation.messages = [];
    conversation.summary = '';
    
    // Keep the same context mode and max size
    conversation.contextMode = contextMode;
    conversation.maxContextSize = maxContextSize;
    
    await conversation.save();
    
    return {
      id: conversation._id,
      messageCount: 0,
      contextSize: 0,
      maxContextSize: conversation.maxContextSize,
      contextMode: conversation.contextMode,
      percentUsed: 0
    };
  } catch (error) {
    console.error('Error in resetConversation:', error);
    throw error;
  }
}

/**
 * Trim conversation if it exceeds the maximum size
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} - Info about the trimmed conversation
 */
export async function trimConversationIfNeeded(userId, sessionId) {
  try {
    const conversation = await getOrCreateConversation(userId, sessionId);
    
    if (conversation.contextSize <= conversation.maxContextSize) {
      return {
        trimmed: false,
        removed: 0,
        percentUsed: Math.round((conversation.contextSize / conversation.maxContextSize) * 100)
      };
    }
    
    // Need to trim - remove oldest messages until under limit
    let removed = 0;
    while (conversation.contextSize > conversation.maxContextSize * 0.7 && conversation.messages.length > 1) {
      // Always keep at least the most recent exchange
      conversation.messages.shift();
      removed++;
      
      // Recalculate context size
      let size = 0;
      for (const message of conversation.messages) {
        if (message.content) {
          size += message.content.length;
        }
        
        if (message.responses) {
          for (const [_, responseText] of message.responses.entries()) {
            size += responseText.length;
          }
        }
      }
      conversation.contextSize = size;
    }
    
    // If we're in summary mode and trimmed messages, update the summary
    if (conversation.contextMode === 'summary' && removed > 0) {
      await updateConversationSummary(conversation);
    }
    
    await conversation.save();
    
    return {
      trimmed: true,
      removed,
      newSize: conversation.contextSize,
      percentUsed: Math.round((conversation.contextSize / conversation.maxContextSize) * 100)
    };
  } catch (error) {
    console.error('Error in trimConversationIfNeeded:', error);
    throw error;
  }
}

/**
 * Get formatted context history based on context mode
 * @param {string} userId - The user's ID
 * @param {string} sessionId - The session ID
 * @returns {Promise<string>} - Formatted context history
 */
export async function getFormattedContextHistory(userId, sessionId) {
  try {
    const conversation = await getOrCreateConversation(userId, sessionId);
    
    // If no messages or context mode is 'none', return empty string
    if (conversation.messages.length === 0 || conversation.contextMode === 'none') {
      return '';
    }
    
    // For summary mode, return the summary
    if (conversation.contextMode === 'summary') {
      if (!conversation.summary) {
        await updateConversationSummary(conversation);
        await conversation.save();
      }
      
      let summaryContext = "--- Conversation Summary ---\n\n";
      summaryContext += conversation.summary || 'New conversation';
      
      // Include the most recent exchange for continuity
      if (conversation.messages.length > 0) {
        const lastMsg = conversation.messages[conversation.messages.length - 1];
        summaryContext += "\n\nMost recent exchange:\n";
        
        if (lastMsg.content) {
          summaryContext += `User: ${lastMsg.content}\n\n`;
        }
        
        if (lastMsg.responses && lastMsg.responses.size > 0) {
          for (const [modelId, response] of lastMsg.responses.entries()) {
            // Include truncated response
            const truncated = response.length > 200 ? response.substring(0, 200) + "..." : response;
            summaryContext += `${modelId.charAt(0).toUpperCase() + modelId.slice(1)}: ${truncated}\n\n`;
          }
        }
      }
      
      summaryContext += "--- End of Summary ---\n\n";
      return summaryContext;
    }
    
    // For full context mode, include complete conversation
    let fullContext = "--- Previous Conversation History ---\n\n";
    
    for (const message of conversation.messages) {
      // Format user message
      if (message.content) {
        fullContext += `User: ${message.content}\n\n`;
      }
      
      // Format AI responses
      if (message.responses && message.responses.size > 0) {
        for (const [modelId, response] of message.responses.entries()) {
          fullContext += `${modelId.charAt(0).toUpperCase() + modelId.slice(1)}: ${response}\n\n`;
        }
      }
    }
    
    fullContext += "--- End of Conversation History ---\n\n";
    return fullContext;
  } catch (error) {
    console.error('Error in getFormattedContextHistory:', error);
    // In case of error, return empty context to avoid breaking the conversation
    return '';
  }
}