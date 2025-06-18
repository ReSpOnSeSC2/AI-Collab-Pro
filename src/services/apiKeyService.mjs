/**
 * API Key Service
 * Handles retrieval and usage of user-provided or system API keys
 */

import { User } from '../models/User.mjs';

class ApiKeyService {
  /**
   * Get API key for a provider
   * First checks for user-provided key, then falls back to system key
   */
  async getApiKey(userId, provider) {
    try {
      // First, try to get user's API key
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          const userApiKey = user.getApiKey(provider);
          if (userApiKey) {
            return {
              key: userApiKey,
              source: 'user',
              userId: userId
            };
          }
        }
      }

      // Fall back to system API key
      const systemKey = this.getSystemApiKey(provider);
      if (systemKey) {
        return {
          key: systemKey,
          source: 'system'
        };
      }

      // No API key available
      return null;
    } catch (error) {
      console.error(`Error getting API key for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Get system API key from environment
   */
  getSystemApiKey(provider) {
    const keyMap = {
      'openai': process.env.OPENAI_API_KEY,
      'anthropic': process.env.ANTHROPIC_API_KEY,
      'google': process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      'deepseek': process.env.DEEPSEEK_API_KEY,
      'grok': process.env.GROK_API_KEY || process.env.XAI_API_KEY,
      'llama': process.env.LLAMA_API_KEY || process.env.GROQ_API_KEY
    };

    return keyMap[provider] || null;
  }

  /**
   * Check if a provider is available for a user
   */
  async isProviderAvailable(userId, provider) {
    const apiKeyInfo = await this.getApiKey(userId, provider);
    return apiKeyInfo !== null;
  }

  /**
   * Get available providers for a user
   */
  async getAvailableProviders(userId) {
    const providers = ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'];
    const available = [];

    for (const provider of providers) {
      const isAvailable = await this.isProviderAvailable(userId, provider);
      if (isAvailable) {
        available.push(provider);
      }
    }

    return available;
  }

  /**
   * Update usage statistics for a user
   */
  async updateUsageStats(userId, cost, tokenCount) {
    if (!userId) return;

    try {
      await User.findByIdAndUpdate(userId, {
        $inc: {
          'usage.totalRequests': 1,
          'usage.totalCost': cost || 0
        },
        $set: {
          'usage.lastRequestAt': new Date()
        }
      });
    } catch (error) {
      console.error('Error updating usage stats:', error);
    }
  }

  /**
   * Check if user has exceeded cost alert threshold
   */
  async checkCostAlert(userId) {
    if (!userId) return false;

    try {
      const user = await User.findById(userId);
      if (!user) return false;

      const threshold = user.settings?.costAlertThreshold || 10;
      return user.usage.totalCost >= threshold;
    } catch (error) {
      console.error('Error checking cost alert:', error);
      return false;
    }
  }
}

export default new ApiKeyService();