/**
 * Improved error handling for AI model responses with retry logic
 * Specifically designed to handle AbortError more gracefully
 */

/**
 * Check if an error is retryable based on its type and properties
 * @param {Error} error - The error to check
 * @returns {boolean} - Whether the error can be retried
 */
export function isRetryableError(error) {
  if (!error) return false;

  // Do not retry GlobalAbortError
  if (error.name === 'GlobalAbortError') {
    console.log("GlobalAbortError detected, not retryable.");
    return false;
  }

  // Errors that are explicitly marked as retryable
  if (error.isRetryable === true) return true;

  // Check common retryable error patterns
  const retryableErrors = [
    'TimeoutError',
    'ConnectionError',
    'NetworkError',
    'ECONNRESET',
    'ETIMEDOUT',
    'socket hang up',
    'network error',
    'connection closed',
  ];

  // Check if the error name or message includes any of the patterns
  const errorText = `${error.name || ''} ${error.message || ''}`.toLowerCase();

  // Http status errors that are retryable
  if (error.status) {
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    if (retryableStatusCodes.includes(error.status)) {
      return true;
    }
  }

  // Check general AbortError here if not GlobalAbortError
  if (error.name === 'AbortError' && errorText.includes('abort')) {
    return true; // Retry model-specific aborts
  }

  return retryableErrors.some(pattern =>
    errorText.includes(pattern.toLowerCase())
  );
}

/**
 * Calculate backoff delay for retries with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} - The delay in milliseconds to wait before retrying
 */
export function calculateBackoffDelay(attempt, initialDelay = 1000, maxDelay = 30000) {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelay * Math.pow(2, attempt);
  
  // Add jitter (random value between 0-1000ms) to prevent thundering herd
  const jitter = Math.random() * 1000;
  
  // Cap the delay at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Create a structured error object with context
 * @param {string} errorType - The type of error (e.g., 'AbortError')
 * @param {string} message - Error message
 * @param {Object} context - Additional context (provider, phase, etc.)
 * @returns {Error} - Enhanced error object
 */
export function createError(errorType, message, context = {}) {
  const error = new Error(message);
  error.name = errorType;
  
  // Add all context properties to the error
  Object.assign(error, context);
  
  // Add retryable flag based on error type
  error.isRetryable = isRetryableError(error);
  
  return error;
}

/**
 * Wrap an async function with retry logic
 * @param {Function} asyncFn - The async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Promise that resolves with the result or rejects with the last error
 */
export async function withRetry(asyncFn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    retryCondition = isRetryableError,
    onRetry = (error, attempt) => console.log(`Retrying (${attempt}): ${error.message}`)
  } = options;
  
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      return await asyncFn(attempt);
    } catch (error) {
      // If this is the last attempt, or the error is not retryable, rethrow
      if (attempt >= maxRetries || !retryCondition(error)) {
        throw error;
      }
      
      // Call the onRetry callback
      onRetry(error, attempt + 1);
      
      // Calculate backoff delay
      const delay = calculateBackoffDelay(attempt, initialDelay, maxDelay);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increment attempt counter
      attempt++;
    }
  }
  
  // This should never be reached, but just in case
  throw new Error(`Max retries (${maxRetries}) exceeded`);
}

/**
 * Process the results of multiple promises that may succeed or fail
 * Similar to Promise.allSettled but with more context
 * @param {Array} results - Array of results from Promise.all with .then/.catch
 * @returns {Object} - Object with successes and failures
 */
export function processResults(results) {
  const successes = [];
  const failures = [];
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      successes.push({
        provider: result.provider,
        value: result.value
      });
    } else {
      failures.push({
        provider: result.provider,
        error: result.reason
      });
    }
  }
  
  return {
    successes,
    failures,
    allSucceeded: failures.length === 0,
    allFailed: successes.length === 0,
    partialSuccess: successes.length > 0 && failures.length > 0
  };
}