/**
 * Cost Control and Usage Tracking System
 * Tracks real-time costs for AI model usage with actual provider pricing
 * Version: 1.0.0
 */

'use strict';

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-collab';
let db = null;
let usageCollection = null;

// Initialize MongoDB connection
async function initializeDatabase() {
  if (!db) {
    try {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      db = client.db('ai_collab');
      usageCollection = db.collection('usage_tracking');
      
      // Create indexes for efficient queries
      await usageCollection.createIndex({ userId: 1, timestamp: -1 });
      await usageCollection.createIndex({ sessionId: 1 });
      await usageCollection.createIndex({ userId: 1, provider: 1, model: 1 });
      
      console.log('Cost control database initialized');
    } catch (error) {
      console.error('Failed to initialize cost control database:', error);
      throw error;
    }
  }
  return { db, usageCollection };
}

// Initialize on module load
initializeDatabase().catch(console.error);

// Comprehensive pricing table based on actual provider rates
const MODEL_PRICING = {
  gemini: {
    'gemini-2.5-pro-preview': { input: 8.00, output: 24.00, contextLength: 1000000 },
    'gemini-2.5-flash-preview': { input: 0.40, output: 1.20, contextLength: 1000000 },
    'gemini-2.0-flash': { input: 0.70, output: 2.10, contextLength: 1000000 },
    'gemini-2.0-flash-image': { input: 0.70, output: 2.10, contextLength: 1000000 },
    'gemini-2.0-flash-lite': { input: 0.50, output: 1.50, contextLength: 1000000 },
    'gemini-1.5-flash': { input: 0.35, output: 1.05, contextLength: 1000000 },
    'gemini-1.5-flash-8b': { input: 0.15, output: 0.45, contextLength: 1000000 },
    'gemini-1.5-pro': { input: 7.00, output: 21.00, contextLength: 1000000 },
    'gemini-embedding': { input: 0.25, output: 0, contextLength: 0 },
    'imagen-3': { input: 0, output: 0.04, perImage: true },
    'veo-2': { input: 0.08, output: 0.08, perVideo: true },
    'gemini-2.0-flash-live': { input: 0.70, output: 2.10, contextLength: 1000000 }
  },
  claude: {
    'claude-4-opus': { input: 15.00, output: 75.00, contextLength: 200000 },
    'claude-4-sonnet': { input: 3.00, output: 15.00, contextLength: 200000 },
    'claude-3.7-sonnet': { input: 3.00, output: 15.00, contextLength: 200000 },
    'claude-3.5-haiku': { input: 0.80, output: 4.00, contextLength: 200000 },
    'claude-3.5-sonnet-v2': { input: 3.00, output: 15.00, contextLength: 200000 },
    'claude-3.5-sonnet': { input: 3.00, output: 15.00, contextLength: 200000 },
    'claude-3-opus': { input: 15.00, output: 75.00, contextLength: 200000 },
    'claude-3-sonnet': { input: 3.00, output: 15.00, contextLength: 200000 },
    'claude-3-haiku': { input: 0.25, output: 1.25, contextLength: 200000 }
  },
  chatgpt: {
    'gpt-4.1': { input: 2.00, output: 8.00, contextLength: 131072 },
    'gpt-4.1-2025-04-14': { input: 2.00, output: 8.00, contextLength: 131072 },
    'gpt-4.1-fine-tuning': { input: 4.00, output: 16.00, contextLength: 131072 },
    'gpt-4.1-mini': { input: 0.40, output: 1.60, contextLength: 131072 },
    'gpt-4.1-mini-2025-04-14': { input: 0.40, output: 1.60, contextLength: 131072 },
    'gpt-4.1-mini-fine-tuning': { input: 0.80, output: 3.20, contextLength: 131072 },
    'gpt-4.1-nano': { input: 0.10, output: 0.40, contextLength: 131072 },
    'gpt-4.1-nano-2025-04-14': { input: 0.10, output: 0.40, contextLength: 131072 },
    'gpt-4.5-preview': { input: 75.00, output: 150.00, contextLength: 128000 },
    'gpt-4.5-preview-2025-02-27': { input: 75.00, output: 150.00, contextLength: 128000 },
    'gpt-4o': { input: 2.50, output: 10.00, contextLength: 128000 },
    'gpt-4o-2024-08-06': { input: 2.50, output: 10.00, contextLength: 128000 },
    'gpt-4o-fine-tuning': { input: 5.00, output: 20.00, contextLength: 128000 },
    'gpt-4o-audio-preview': { input: 40.00, output: 80.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-audio-preview-2024-12-17': { input: 40.00, output: 80.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-realtime-preview': { input: 40.00, output: 80.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-realtime-preview-2024-12-17': { input: 40.00, output: 80.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-mini': { input: 0.15, output: 0.60, contextLength: 128000 },
    'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60, contextLength: 128000 },
    'gpt-4o-mini-fine-tuning': { input: 0.30, output: 1.20, contextLength: 128000 },
    'gpt-4o-mini-audio-preview': { input: 10.00, output: 20.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-mini-audio-preview-2024-12-17': { input: 10.00, output: 20.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-mini-realtime-preview': { input: 10.00, output: 20.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-mini-realtime-preview-2024-12-17': { input: 10.00, output: 20.00, contextLength: 128000, audioPrice: true },
    'gpt-4o-mini-search-preview': { input: 0.15, output: 0.60, contextLength: 128000 },
    'gpt-4o-mini-search-preview-2025-03-11': { input: 0.15, output: 0.60, contextLength: 128000 },
    'gpt-4o-search-preview': { input: 2.50, output: 10.00, contextLength: 128000 },
    'gpt-4o-search-preview-2025-03-11': { input: 2.50, output: 10.00, contextLength: 128000 },
    'o1': { input: 15.00, output: 60.00, contextLength: 128000 },
    'o1-2024-12-17': { input: 15.00, output: 60.00, contextLength: 128000 },
    'o1-pro': { input: 150.00, output: 600.00, contextLength: 128000 },
    'o1-pro-2025-03-19': { input: 150.00, output: 600.00, contextLength: 128000 },
    'o3': { input: 10.00, output: 40.00, contextLength: 128000 },
    'o3-2025-04-16': { input: 10.00, output: 40.00, contextLength: 128000 },
    'o3-mini': { input: 1.10, output: 4.40, contextLength: 128000 },
    'o3-mini-2025-01-31': { input: 1.10, output: 4.40, contextLength: 128000 },
    'o4-mini': { input: 1.10, output: 4.40, contextLength: 128000 },
    'o4-mini-2025-04-16': { input: 1.10, output: 4.40, contextLength: 128000 },
    'o1-mini': { input: 1.10, output: 4.40, contextLength: 128000 },
    'o1-mini-2024-09-12': { input: 1.10, output: 4.40, contextLength: 128000 },
    'gpt-image-1': { input: 5.00, output: 10.00 },
    'gpt-4o-mini-tts': { input: 12.00, output: 0 },
    'gpt-4o-transcribe': { input: 6.00, output: 0 },
    'gpt-4o-mini-transcribe': { input: 3.00, output: 0 },
    'text-embedding-3-small': { input: 0.02, output: 0.02, contextLength: 8192 },
    'text-embedding-3-large': { input: 0.13, output: 0.13, contextLength: 8192 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50, contextLength: 16384 },
    'gpt-3.5-turbo-fine-tuning': { input: 1.00, output: 3.00, contextLength: 16384 }
  },
  grok: {
    'grok-3': { input: 3.00, output: 15.00, contextLength: 131072 },
    'grok-3-fast': { input: 5.00, output: 25.00, contextLength: 131072 },
    'grok-3-mini': { input: 0.30, output: 0.50, contextLength: 131072 },
    'grok-2-vision': { input: 2.00, output: 10.00, contextLength: 8192 }
  },
  deepseek: {
    'deepseek-chat': { input: 0.27, output: 1.10, contextLength: 65536 },
    'deepseek-reasoner': { input: 0.55, output: 2.19, contextLength: 65536 }
  },
  llama: {
    'llama-4-maverick-17b': { input: 0, output: 0, contextLength: 128000 },
    'llama-4-scout-17b': { input: 0, output: 0, contextLength: 128000 },
    'llama-3.3-70b-instruct': { input: 0, output: 0, contextLength: 128000 },
    'llama-3.3-8b-instruct': { input: 0, output: 0, contextLength: 128000 }
  }
};

// Active sessions for real-time tracking
const activeSessions = new Map();

// User budget limits cache
const userBudgetLimits = new Map();

/**
 * Estimate cost for a model usage
 * @param {string} provider - Provider name (gemini, claude, chatgpt, etc.)
 * @param {string} model - Model identifier
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {Object} Cost breakdown and total
 */
export function estimateCost(provider, model, inputTokens, outputTokens) {
  try {
    // Validate inputs
    if (!provider || !model) {
      throw new Error('Provider and model are required');
    }
    
    // Get pricing for the specific model
    const providerPricing = MODEL_PRICING[provider.toLowerCase()];
    if (!providerPricing) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    
    const modelPricing = providerPricing[model.toLowerCase()];
    if (!modelPricing) {
      throw new Error(`Unknown model ${model} for provider ${provider}`);
    }
    
    // Calculate costs (prices are per million tokens)
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;
    const totalCost = inputCost + outputCost;
    
    return {
      success: true,
      provider: provider,
      model: model,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      inputCost: Math.round(inputCost * 10000) / 10000, // Round to 4 decimal places
      outputCost: Math.round(outputCost * 10000) / 10000,
      totalCost: Math.round(totalCost * 10000) / 10000,
      pricing: {
        inputPricePerMillion: modelPricing.input,
        outputPricePerMillion: modelPricing.output
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Track usage for a session
 * @param {string} sessionId - Unique session identifier
 * @param {string} provider - Provider name
 * @param {string} model - Model identifier
 * @param {Object} usage - Usage details {inputTokens, outputTokens, userId}
 * @returns {Object} Tracking result
 */
export async function trackUsage(sessionId, provider, model, usage) {
  try {
    // Ensure database connection
    await initializeDatabase();
    
    const { inputTokens = 0, outputTokens = 0, userId } = usage;
    
    // Calculate cost
    const costEstimate = estimateCost(provider, model, inputTokens, outputTokens);
    if (!costEstimate.success) {
      throw new Error(costEstimate.error);
    }
    
    // Create usage record
    const usageRecord = {
      sessionId: sessionId,
      userId: userId,
      provider: provider,
      model: model,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      inputCost: costEstimate.inputCost,
      outputCost: costEstimate.outputCost,
      totalCost: costEstimate.totalCost,
      timestamp: new Date(),
      metadata: {
        pricing: costEstimate.pricing
      }
    };
    
    // Store in database
    await usageCollection.insertOne(usageRecord);
    
    // Update session tracking
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, {
        userId: userId,
        startTime: new Date(),
        totalCost: 0,
        usage: {}
      });
    }
    
    const session = activeSessions.get(sessionId);
    session.totalCost += costEstimate.totalCost;
    
    // Initialize provider/model tracking if needed
    if (!session.usage[provider]) {
      session.usage[provider] = {};
    }
    if (!session.usage[provider][model]) {
      session.usage[provider][model] = {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0
      };
    }
    
    // Update session usage
    session.usage[provider][model].inputTokens += inputTokens;
    session.usage[provider][model].outputTokens += outputTokens;
    session.usage[provider][model].cost += costEstimate.totalCost;
    
    // Check budget limit if userId provided
    if (userId) {
      const budgetCheck = await checkBudgetLimit(userId);
      if (budgetCheck.exceeded) {
        return {
          success: true,
          cost: costEstimate.totalCost,
          totalSessionCost: session.totalCost,
          budgetExceeded: true,
          budgetInfo: budgetCheck
        };
      }
    }
    
    return {
      success: true,
      cost: costEstimate.totalCost,
      totalSessionCost: session.totalCost,
      budgetExceeded: false
    };
    
  } catch (error) {
    console.error('Error tracking usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get total cost for a session
 * @param {string} sessionId - Session identifier
 * @returns {Object} Session cost details
 */
export async function getSessionCost(sessionId) {
  try {
    await initializeDatabase();
    
    // Check active sessions first
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      return {
        success: true,
        sessionId: sessionId,
        userId: session.userId,
        startTime: session.startTime,
        totalCost: session.totalCost,
        usage: session.usage,
        isActive: true
      };
    }
    
    // Query database for historical data
    const records = await usageCollection.find({ sessionId: sessionId }).toArray();
    
    if (records.length === 0) {
      return {
        success: false,
        error: 'Session not found'
      };
    }
    
    // Aggregate costs
    let totalCost = 0;
    const usage = {};
    let userId = null;
    let startTime = null;
    
    records.forEach(function(record) {
      totalCost += record.totalCost;
      if (!userId) userId = record.userId;
      if (!startTime || record.timestamp < startTime) {
        startTime = record.timestamp;
      }
      
      // Aggregate by provider and model
      if (!usage[record.provider]) {
        usage[record.provider] = {};
      }
      if (!usage[record.provider][record.model]) {
        usage[record.provider][record.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cost: 0
        };
      }
      
      usage[record.provider][record.model].inputTokens += record.inputTokens;
      usage[record.provider][record.model].outputTokens += record.outputTokens;
      usage[record.provider][record.model].cost += record.totalCost;
    });
    
    return {
      success: true,
      sessionId: sessionId,
      userId: userId,
      startTime: startTime,
      totalCost: Math.round(totalCost * 10000) / 10000,
      usage: usage,
      isActive: false
    };
    
  } catch (error) {
    console.error('Error getting session cost:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get user's daily cost
 * @param {string} userId - User identifier
 * @param {Date} date - Date to check (defaults to today)
 * @returns {Object} Daily cost breakdown
 */
export async function getUserDailyCost(userId, date) {
  try {
    await initializeDatabase();
    
    // Default to today if no date provided
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Query usage records for the day
    const records = await usageCollection.find({
      userId: userId,
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).toArray();
    
    // Aggregate costs by provider and model
    let totalCost = 0;
    const breakdown = {};
    const sessions = new Set();
    
    records.forEach(function(record) {
      totalCost += record.totalCost;
      sessions.add(record.sessionId);
      
      // Aggregate by provider
      if (!breakdown[record.provider]) {
        breakdown[record.provider] = {
          totalCost: 0,
          models: {}
        };
      }
      
      breakdown[record.provider].totalCost += record.totalCost;
      
      // Aggregate by model
      if (!breakdown[record.provider].models[record.model]) {
        breakdown[record.provider].models[record.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          requests: 0
        };
      }
      
      const modelStats = breakdown[record.provider].models[record.model];
      modelStats.inputTokens += record.inputTokens;
      modelStats.outputTokens += record.outputTokens;
      modelStats.cost += record.totalCost;
      modelStats.requests += 1;
    });
    
    return {
      success: true,
      userId: userId,
      date: targetDate,
      totalCost: Math.round(totalCost * 10000) / 10000,
      sessionCount: sessions.size,
      requestCount: records.length,
      breakdown: breakdown
    };
    
  } catch (error) {
    console.error('Error getting user daily cost:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Enforce budget limit for a user
 * @param {string} userId - User identifier
 * @param {number} limit - Daily budget limit in USD
 * @returns {Object} Budget enforcement result
 */
export async function enforceBudgetLimit(userId, limit) {
  try {
    // Validate limit
    if (typeof limit !== 'number' || limit <= 0) {
      throw new Error('Invalid budget limit');
    }
    
    // Store in cache
    userBudgetLimits.set(userId, {
      limit: limit,
      setAt: new Date()
    });
    
    // Store in database for persistence
    await initializeDatabase();
    await db.collection('user_budget_limits').updateOne(
      { userId: userId },
      {
        $set: {
          dailyLimit: limit,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    // Check current usage
    const currentUsage = await getUserDailyCost(userId);
    const exceeded = currentUsage.success && currentUsage.totalCost >= limit;
    
    return {
      success: true,
      userId: userId,
      limit: limit,
      currentUsage: currentUsage.totalCost || 0,
      remaining: Math.max(0, limit - (currentUsage.totalCost || 0)),
      exceeded: exceeded
    };
    
  } catch (error) {
    console.error('Error enforcing budget limit:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if user has exceeded budget limit
 * @param {string} userId - User identifier
 * @returns {Object} Budget check result
 */
async function checkBudgetLimit(userId) {
  try {
    // Check cache first
    let budgetInfo = userBudgetLimits.get(userId);
    
    // If not in cache, check database
    if (!budgetInfo) {
      await initializeDatabase();
      const dbLimit = await db.collection('user_budget_limits').findOne({ userId: userId });
      if (dbLimit) {
        budgetInfo = {
          limit: dbLimit.dailyLimit,
          setAt: dbLimit.updatedAt
        };
        userBudgetLimits.set(userId, budgetInfo);
      }
    }
    
    // No limit set
    if (!budgetInfo) {
      return {
        hasLimit: false,
        exceeded: false
      };
    }
    
    // Get current usage
    const currentUsage = await getUserDailyCost(userId);
    const exceeded = currentUsage.success && currentUsage.totalCost >= budgetInfo.limit;
    
    return {
      hasLimit: true,
      limit: budgetInfo.limit,
      currentUsage: currentUsage.totalCost || 0,
      remaining: Math.max(0, budgetInfo.limit - (currentUsage.totalCost || 0)),
      exceeded: exceeded
    };
    
  } catch (error) {
    console.error('Error checking budget limit:', error);
    return {
      hasLimit: false,
      exceeded: false,
      error: error.message
    };
  }
}

/**
 * Clean up inactive sessions
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 */
export function cleanupSessions(maxAgeMs) {
  const maxAge = maxAgeMs || 24 * 60 * 60 * 1000; // 24 hours default
  const now = Date.now();
  
  activeSessions.forEach(function(session, sessionId) {
    const age = now - session.startTime.getTime();
    if (age > maxAge) {
      activeSessions.delete(sessionId);
    }
  });
}

// Schedule periodic cleanup
setInterval(function() {
  cleanupSessions();
}, 60 * 60 * 1000); // Run every hour

/**
 * Export all cost data for a user (for billing/reporting)
 * @param {string} userId - User identifier
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Object} Exported cost data
 */
export async function exportUserCosts(userId, startDate, endDate) {
  try {
    await initializeDatabase();
    
    const records = await usageCollection.find({
      userId: userId,
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ timestamp: 1 }).toArray();
    
    // Aggregate by day
    const dailyCosts = {};
    let totalCost = 0;
    
    records.forEach(function(record) {
      const dateKey = record.timestamp.toISOString().split('T')[0];
      
      if (!dailyCosts[dateKey]) {
        dailyCosts[dateKey] = {
          date: dateKey,
          cost: 0,
          requests: 0,
          providers: {}
        };
      }
      
      dailyCosts[dateKey].cost += record.totalCost;
      dailyCosts[dateKey].requests += 1;
      totalCost += record.totalCost;
      
      // Track by provider
      if (!dailyCosts[dateKey].providers[record.provider]) {
        dailyCosts[dateKey].providers[record.provider] = 0;
      }
      dailyCosts[dateKey].providers[record.provider] += record.totalCost;
    });
    
    return {
      success: true,
      userId: userId,
      period: {
        start: startDate,
        end: endDate
      },
      totalCost: Math.round(totalCost * 10000) / 10000,
      totalRequests: records.length,
      dailyCosts: Object.values(dailyCosts),
      rawRecords: records
    };
    
  } catch (error) {
    console.error('Error exporting user costs:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// WebSocket integration for real-time updates
let wsHandler = null;

/**
 * Set WebSocket handler for real-time cost updates
 * @param {Object} handler - WebSocket handler with broadcast method
 */
export function setWebSocketHandler(handler) {
  wsHandler = handler;
}

/**
 * Broadcast cost update to user via WebSocket
 * @param {string} userId - User identifier
 * @param {Object} costUpdate - Cost update information
 */
function broadcastCostUpdate(userId, costUpdate) {
  if (wsHandler && wsHandler.broadcast) {
    wsHandler.broadcast(userId, {
      type: 'cost_update',
      data: costUpdate
    });
  }
}

// Export main functions
export default {
  estimateCost,
  trackUsage,
  getSessionCost,
  getUserDailyCost,
  enforceBudgetLimit,
  cleanupSessions,
  exportUserCosts,
  setWebSocketHandler
};