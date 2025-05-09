/**
 * Cost Control System
 * Manages and tracks token usage and costs for AI model interactions
 * Version: 9.0.0
 */

// Token cost rates per million tokens (in USD)
var TOKEN_COSTS = {
  claude: {
    input: 8.00,   // $8.00 per million input tokens
    output: 24.00  // $24.00 per million output tokens
  },
  gemini: {
    input: 3.50,   // $3.50 per million input tokens
    output: 10.50  // $10.50 per million output tokens
  },
  chatgpt: {
    input: 10.00,  // $10.00 per million input tokens
    output: 30.00  // $30.00 per million output tokens
  },
  grok: {
    input: 2.00,   // $2.00 per million input tokens
    output: 6.00   // $6.00 per million output tokens
  },
  deepseek: {
    input: 0.27,   // $0.27 per million input tokens
    output: 1.10   // $1.10 per million output tokens
  },
  llama: {
    input: 1.00,   // $1.00 per million input tokens
    output: 3.00   // $3.00 per million output tokens
  }
};

// Token counts by mode multipliers (for estimation)
var MODE_TOKEN_MULTIPLIERS = {
  round_table: 2.5,
  sequential_critique_chain: 2.0,
  validated_consensus: 3.0,
  creative_brainstorm_swarm: 2.5,
  hybrid_guarded_braintrust: 3.5
};

// Map of active cost tracking sessions
var activeSessions = {};

/**
 * Estimates cost based on prompt length, models, and mode
 * @param {Object} options - Estimation options
 * @param {Array<string>} options.agents - List of agent provider names
 * @param {number} options.promptLength - Length of prompt in characters
 * @param {string} options.mode - Collaboration mode
 * @returns {number} - Estimated cost in USD
 */
export function estimateCost(options) {
  var agents = options.agents || [];
  var promptLength = options.promptLength || 0;
  var mode = options.mode || 'round_table';
  
  // Estimate token count (very rough approximation)
  var estimatedTokens = Math.ceil(promptLength / 4) * agents.length;
  
  // Apply mode multiplier
  var modeMultiplier = MODE_TOKEN_MULTIPLIERS[mode] || 2.0;
  estimatedTokens = estimatedTokens * modeMultiplier;
  
  // Calculate input and output costs
  var totalCost = 0;
  agents.forEach(function(agent) {
    var costs = TOKEN_COSTS[agent] || TOKEN_COSTS.chatgpt; // Default to chatgpt costs
    
    // Assume 1:3 input:output token ratio
    var inputTokens = estimatedTokens;
    var outputTokens = estimatedTokens * 3;
    
    // Calculate costs (convert to millions of tokens)
    var inputCost = (inputTokens / 1000000) * costs.input;
    var outputCost = (outputTokens / 1000000) * costs.output;
    
    totalCost += inputCost + outputCost;
  });
  
  return totalCost;
}

/**
 * Creates a cost tracking session
 * @param {string} sessionId - Unique session identifier
 * @param {number} budgetLimit - Maximum budget in USD
 * @returns {Object} - Cost tracker object with methods
 */
export function initializeSession(sessionId, budgetLimit) {
  var session = {
    id: sessionId,
    budgetLimit: budgetLimit || 1.0,
    startTime: Date.now(),
    usage: {},
    totalCost: 0
  };
  
  // Initialize usage counters for all providers
  Object.keys(TOKEN_COSTS).forEach(function(provider) {
    session.usage[provider] = {
      inputTokens: 0,
      outputTokens: 0,
      cost: 0
    };
  });
  
  // Store session
  activeSessions[sessionId] = session;
  
  return {
    /**
     * Add input tokens to the session
     * @param {string} provider - Provider name
     * @param {number} tokens - Number of tokens
     */
    addInputTokens: function(provider, tokens) {
      if (!session.usage[provider]) {
        session.usage[provider] = { inputTokens: 0, outputTokens: 0, cost: 0 };
      }
      
      session.usage[provider].inputTokens += tokens;
      
      // Calculate and add cost
      var costs = TOKEN_COSTS[provider] || TOKEN_COSTS.chatgpt;
      var additionalCost = (tokens / 1000000) * costs.input;
      
      session.usage[provider].cost += additionalCost;
      session.totalCost += additionalCost;
    },
    
    /**
     * Add output tokens to the session
     * @param {string} provider - Provider name
     * @param {number} tokens - Number of tokens
     */
    addOutputTokens: function(provider, tokens) {
      if (!session.usage[provider]) {
        session.usage[provider] = { inputTokens: 0, outputTokens: 0, cost: 0 };
      }
      
      session.usage[provider].outputTokens += tokens;
      
      // Calculate and add cost
      var costs = TOKEN_COSTS[provider] || TOKEN_COSTS.chatgpt;
      var additionalCost = (tokens / 1000000) * costs.output;
      
      session.usage[provider].cost += additionalCost;
      session.totalCost += additionalCost;
    },
    
    /**
     * Check if the session should abort due to exceeding budget
     * @returns {boolean} - True if should abort, false otherwise
     */
    shouldAbort: function() {
      return session.totalCost >= session.budgetLimit;
    },
    
    /**
     * Get the total cost for the session
     * @returns {number} - Total cost in USD
     */
    getTotalCost: function() {
      return session.totalCost;
    },
    
    /**
     * Get detailed usage information for the session
     * @returns {Object} - Usage information
     */
    getUsageDetails: function() {
      return {
        sessionId: session.id,
        startTime: session.startTime,
        duration: Date.now() - session.startTime,
        usage: session.usage,
        totalCost: session.totalCost,
        budgetLimit: session.budgetLimit,
        remaining: Math.max(0, session.budgetLimit - session.totalCost)
      };
    }
  };
}

/**
 * Get information about an active session
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} - Session information or null if not found
 */
export function getSessionInfo(sessionId) {
  var session = activeSessions[sessionId];
  if (!session) {
    return null;
  }
  
  return {
    sessionId: session.id,
    startTime: session.startTime,
    duration: Date.now() - session.startTime,
    totalCost: session.totalCost,
    budgetLimit: session.budgetLimit,
    remaining: Math.max(0, session.budgetLimit - session.totalCost)
  };
}

/**
 * Clean up completed sessions to prevent memory leaks
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
export function cleanupSessions(maxAgeMs) {
  var maxAge = maxAgeMs || 3600000; // Default: 1 hour
  var now = Date.now();
  
  Object.keys(activeSessions).forEach(function(sessionId) {
    var session = activeSessions[sessionId];
    if (now - session.startTime > maxAge) {
      delete activeSessions[sessionId];
    }
  });
}

// Schedule automatic cleanup every hour
setInterval(cleanupSessions, 3600000);

export const trackCost = {
  initializeSession
};

export default {
  estimateCost,
  trackCost,
  getSessionInfo,
  cleanupSessions
};