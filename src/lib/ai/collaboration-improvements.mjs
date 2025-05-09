/**
 * Model-specific timeout and concurrency control functions
 */

// Model-specific timeout durations (in ms)
export const MODEL_TIMEOUTS = {
  // Default timeout for all models
  DEFAULT: 120000, // 2 minutes
  
  // Specific model timeout overrides
  "claude-3-5-sonnet": 180000, // 3 minutes
  "claude-3-opus": 240000, // 4 minutes
  "gemini-2.5-pro-preview": 180000, // 3 minutes
  "gpt-4o": 180000, // 3 minutes
  "Llama-4-Maverick": 240000, // 4 minutes
  "deepseek": 180000 // 3 minutes
};

// Concurrency limits by provider
export const PROVIDER_CONCURRENCY = {
  // Default limits
  DEFAULT: 3,
  
  // Provider-specific limits
  claude: 2,
  gemini: 2,
  chatgpt: 2,
  grok: 1,
  deepseek: 1,
  llama: 1
};

// Create model-specific timeouts based on model ID
export function getModelTimeout(modelId) {
  if (!modelId) return MODEL_TIMEOUTS.DEFAULT;
  
  // Check if any known model ID pattern matches
  for (const [pattern, timeout] of Object.entries(MODEL_TIMEOUTS)) {
    if (pattern === 'DEFAULT') continue;
    if (modelId.includes(pattern)) return timeout;
  }
  
  return MODEL_TIMEOUTS.DEFAULT;
}

// Throttling and concurrency management
export class ConcurrencyManager {
  constructor() {
    this.activeRequests = {
      claude: 0,
      gemini: 0,
      chatgpt: 0,
      grok: 0,
      deepseek: 0,
      llama: 0
    };
    this.queue = [];
    this.waitingResolvers = {};
  }
  
  canProcessRequest(provider) {
    const limit = PROVIDER_CONCURRENCY[provider] || PROVIDER_CONCURRENCY.DEFAULT;
    return this.activeRequests[provider] < limit;
  }
  
  // Track a request start
  async acquireSlot(provider) {
    if (this.canProcessRequest(provider)) {
      this.activeRequests[provider]++;
      return true;
    }
    
    // Return a promise that resolves when a slot becomes available
    return new Promise(resolve => {
      if (!this.waitingResolvers[provider]) {
        this.waitingResolvers[provider] = [];
      }
      this.waitingResolvers[provider].push(resolve);
    });
  }
  
  // Release a slot when request completes
  releaseSlot(provider) {
    if (this.activeRequests[provider] > 0) {
      this.activeRequests[provider]--;
    }
    
    // Check if there are waiting resolvers to notify
    if (this.waitingResolvers[provider] && this.waitingResolvers[provider].length > 0 && 
        this.canProcessRequest(provider)) {
      const nextResolver = this.waitingResolvers[provider].shift();
      this.activeRequests[provider]++;
      nextResolver(true);
    }
  }
}

// Single instance of the concurrency manager
export const concurrencyManager = new ConcurrencyManager();

/**
 * Create a model-specific abort controller with appropriate timeout
 */
export function createModelAbortController(provider, modelId) {
  const controller = new AbortController();
  const timeout = getModelTimeout(modelId);
  
  const timeoutId = setTimeout(() => {
    console.log(`⏱️ Timeout reached (${timeout}ms) for ${provider}${modelId ? ` (${modelId})` : ''}`);
    controller.abort();
  }, timeout);
  
  // Add clearTimeout method to clean up when done
  controller.clear = () => clearTimeout(timeoutId);
  
  return controller;
}

/**
 * Enhanced error recovery for collaboration
 */
export function recoverFromError(error, phase, agent) {
  // Extract error details for better reporting
  const errorName = error.name || 'Unknown';
  const errorMessage = error.message || 'Unknown error';
  const errorPhase = error.phase || phase;
  const errorProvider = error.provider || agent;
  const errorReason = error.reason || '';

  // Generate appropriate error description based on error type
  let errorDescription = '';

  if (errorName === 'AbortError') {
    if (errorReason === 'TIMEOUT') {
      errorDescription = `request timed out`;
    } else {
      errorDescription = `operation was aborted`;
    }
  } else if (errorName === 'CostLimitExceededError') {
    errorDescription = `cost limit was exceeded`;
  } else {
    errorDescription = `error: ${errorMessage}`;
  }

  // Create appropriate fallback content based on the phase
  switch (phase) {
    case 'draft':
      return {
        agent,
        content: `[${agent} was unable to provide a draft - ${errorDescription}]`,
        error: true,
        errorName,
        errorMessage,
        errorPhase,
        errorProvider,
        errorReason
      };
    case 'critique':
      return {
        agent,
        content: `[${agent} was unable to provide critique - ${errorDescription}]`,
        targets: [],
        error: true,
        errorName,
        errorMessage,
        errorPhase,
        errorProvider,
        errorReason
      };
    case 'vote':
      return {
        voter: agent,
        votedFor: null,
        reasoning: `[${agent} was unable to vote - ${errorDescription}]`,
        error: true,
        errorName,
        errorMessage,
        errorPhase,
        errorProvider,
        errorReason
      };
    case 'synthesis':
      return {
        agent,
        content: `[${agent} was unable to synthesize a final answer - ${errorDescription}]`,
        error: true,
        errorName,
        errorMessage,
        errorPhase,
        errorProvider,
        errorReason
      };
    default:
      return {
        agent,
        content: `[${agent} encountered an error during ${phase} - ${errorDescription}]`,
        error: true,
        errorName,
        errorMessage,
        errorPhase,
        errorProvider,
        errorReason
      };
  }
}

/**
 * Run tasks in parallel with proper concurrency management
 * @param {Array} tasks - Array of task functions that return promises
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} - Results from all tasks
 */
export async function runParallelWithConcurrency(tasks, options = {}) {
  const results = Array(tasks.length).fill(null);
  const pendingTasks = [...tasks];
  const maxConcurrent = options.maxConcurrent || 3;
  
  // Processing function
  async function processNext() {
    if (pendingTasks.length === 0) return;
    
    const taskIndex = tasks.length - pendingTasks.length;
    const task = pendingTasks.shift();
    
    try {
      results[taskIndex] = await task();
    } catch (error) {
      console.error(`Error in parallel task ${taskIndex}:`, error);
      if (options.errorHandler) {
        results[taskIndex] = options.errorHandler(error, taskIndex);
      } else {
        results[taskIndex] = { error: true, message: error.message };
      }
    }
    
    // Process next task if any remaining
    return processNext();
  }
  
  // Start initial batch of tasks
  const initialBatch = Math.min(maxConcurrent, tasks.length);
  const initialPromises = [];
  
  for (let i = 0; i < initialBatch; i++) {
    initialPromises.push(processNext());
  }
  
  // Wait for all tasks to complete
  await Promise.all(initialPromises);
  return results;
}