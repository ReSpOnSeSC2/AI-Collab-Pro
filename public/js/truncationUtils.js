/**
 * Client-side truncation utilities
 * Contains functions for managing and calculating optimal context sizes
 */

/**
 * Get max safe context size for a given provider
 * @param {string} provider - AI provider name
 * @returns {number} - Safe context size in tokens
 */
export function getMaxContextSize(provider) {
  // Provider-specific token limits based on 2025 model capabilities
  // These should match values in server-side truncation-utils.mjs
  const contextSizes = {
    'claude': 200000,  // Claude 3.7 Sonnet has 200K tokens
    'gemini': 1000000, // Gemini 2.5 Pro has 1M tokens
    'chatgpt': 128000, // Most GPT-4o/GPT-4.1 models have 128K-131K tokens
    'grok': 131000,    // Grok 3 has 131K tokens
    'deepseek': 64000, // DeepSeek Chat has 64K tokens
    'llama': 128000,   // Llama 4 models have 128K tokens
    'default': 64000   // Conservative default
  };

  return contextSizes[provider.toLowerCase()] || contextSizes.default;
}

/**
 * Calculate the optimal context size based on selected models
 * @param {Array<string>} selectedModels - Array of selected model providers
 * @returns {number} - The optimal context size (determined by the lowest of the selected models)
 */
export function calculateOptimalContextSize(selectedModels) {
  // If no models are selected, use a default size
  if (!selectedModels || selectedModels.length === 0) {
    return 32000; // Conservative default
  }
  
  // Get the max context size for each selected model
  const contextSizes = selectedModels.map(model => getMaxContextSize(model));
  
  // Find the minimum size among selected models
  const minContextSize = Math.min(...contextSizes);
  
  // Round to nearest thousand for readability
  return Math.floor(minContextSize / 1000) * 1000;
}