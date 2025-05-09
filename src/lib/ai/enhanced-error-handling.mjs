/**
 * Enhanced error handling utilities for the AI collaboration system.
 * This module provides standardized error types, context preservation,
 * and error recovery mechanisms.
 */

/**
 * Create a standardized abort error with context
 * @param {string|null} provider - The AI provider that encountered the error, or null if phase-level
 * @param {string} phase - The collaboration phase (draft, critique, vote, synthesis, or custom like draft_completion)
 * @param {Error} originalError - The original error object or a new Error
 * @returns {Error} - Enhanced error with context
 */
export function createContextualAbortError(provider, phase, originalError) {
  const abortError = new Error(originalError.message || 'Operation Aborted');

  // Use GlobalAbortError for phase-level aborts, AbortError for model-specific
  abortError.name = originalError.name === 'GlobalAbortError' ? 'GlobalAbortError' : 'AbortError';

  abortError.provider = provider;
  abortError.phase = phase;
  abortError.originalError = originalError;
  abortError.isRetryable = abortError.name === 'GlobalAbortError' ? false : true;
  return abortError;
}

/**
 * Create a standardized cost limit error with context
 * @param {string} provider - The AI provider that encountered the error
 * @param {string} phase - The collaboration phase
 * @param {Error} originalError - The original error object
 * @returns {Error} - Enhanced error with context
 */
export function createContextualCostError(provider, phase, originalError) {
  const costError = new Error('CostLimitExceededError');
  costError.name = 'CostLimitExceededError';
  costError.provider = provider;
  costError.phase = phase;
  costError.originalError = originalError;
  return costError;
}

/**
 * Create a standardized context limit error with context
 * @param {string} provider - The AI provider that encountered the error
 * @param {string} phase - The collaboration phase
 * @param {number} contentSize - Size of the content that exceeded limits
 * @returns {Error} - Enhanced error with context
 */
export function createContextLimitError(provider, phase, contentSize) {
  const contextError = new Error('ContextLimitExceededError');
  contextError.name = 'ContextLimitExceededError';
  contextError.provider = provider;
  contextError.phase = phase;
  contextError.contentSize = contentSize;
  return contextError;
}

/**
 * Check if an error is related to timeouts or aborts
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's a timeout/abort related error
 */
export function isTimeoutOrAbortError(error) {
  if (!error) return false;
  
  // Check for direct abort errors
  if (error.name === 'AbortError' || error.message === 'AbortError') {
    return true;
  }
  
  // Check for timeout errors which might have different patterns
  const timeoutPatterns = [
    /timeout/i,
    /timed out/i,
    /deadline exceeded/i,
    /request timed out/i,
    /operation cancelled/i,
    /operation canceled/i,
    /operation aborted/i,
    /request aborted/i
  ];
  
  return timeoutPatterns.some(pattern => 
    pattern.test(error.message) || (error.stack && pattern.test(error.stack))
  );
}

/**
 * Create a fallback response when errors occur
 * @param {Error} error - The error that occurred
 * @param {string} phase - The collaboration phase
 * @param {string} provider - The AI provider
 * @returns {object} - Standardized error response object
 */
export function createErrorResponse(error, phase, provider) {
  let errorType = 'unknown';
  let errorMessage = error?.message || 'Unknown error';
  
  if (isTimeoutOrAbortError(error)) {
    errorType = 'timeout';
    errorMessage = `The ${provider} model timed out during the ${phase} phase`;
  } else if (error?.name === 'CostLimitExceededError' || error?.message === 'CostLimitExceededError') {
    errorType = 'cost';
    errorMessage = `Cost limit exceeded for ${provider} during ${phase} phase`;
  } else if (error?.name === 'ContextLimitExceededError') {
    errorType = 'context';
    errorMessage = `Context limit exceeded for ${provider} (${error.contentSize} chars) during ${phase} phase`;
  }
  
  return {
    error: true,
    errorType,
    message: errorMessage,
    provider,
    phase,
    timestamp: new Date().toISOString()
  };
}