/**
 * AI Client Factory
 * Creates AI clients with user-provided or system API keys
 * Version: 1.0.0
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import apiKeyService from '../../services/apiKeyService.mjs';

class AIClientFactory {
  constructor() {
    this.clientCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get or create an AI client for a specific user and provider
   */
  async getClient(userId, provider) {
    console.log(`🏭 ClientFactory.getClient called:`);
    console.log(`  - userId: ${userId}`);
    console.log(`  - provider (input): ${provider}`);
    
    // Normalize provider names to match database schema
    const providerMap = {
      'claude': 'anthropic',
      'gemini': 'google',
      'chatgpt': 'openai',
      'grok': 'grok',
      'deepseek': 'deepseek',
      'llama': 'llama'
    };
    
    const normalizedProvider = providerMap[provider] || provider;
    console.log(`  - provider (normalized): ${normalizedProvider}`);
    
    const cacheKey = `${userId || 'system'}-${provider}`;
    
    // Check cache
    const cached = this.clientCache.get(cacheKey);
    if (cached && cached.timestamp > Date.now() - this.cacheTimeout) {
      console.log(`  ✅ Found cached client for ${cacheKey} (source: ${cached.source})`);
      return cached.client;
    }

    // Get API key using normalized provider name for database lookup
    console.log(`  🔍 Looking up API key for normalized provider: ${normalizedProvider}`);
    const apiKeyInfo = await apiKeyService.getApiKey(userId, normalizedProvider);
    if (!apiKeyInfo) {
      console.log(`  ❌ No API key found for ${provider} (normalized: ${normalizedProvider})`);
      throw new Error(`No API key available for ${provider} (${normalizedProvider})`);
    }

    console.log(`  ✅ Found API key (source: ${apiKeyInfo.source})`);

    // Create client (createClient will normalize again, but that's OK)
    const client = await this.createClient(provider, apiKeyInfo.key);
    
    // Cache it
    this.clientCache.set(cacheKey, {
      client,
      timestamp: Date.now(),
      source: apiKeyInfo.source
    });
    console.log(`  💾 Cached client for ${cacheKey}`);

    return client;
  }

  /**
   * Create a client for a specific provider
   */
  async createClient(provider, apiKey) {
    // Normalize provider names to match database schema
    const providerMap = {
      'claude': 'anthropic',
      'gemini': 'google',
      'chatgpt': 'openai',
      'grok': 'grok',
      'deepseek': 'deepseek',
      'llama': 'llama'
    };
    
    const normalizedProvider = providerMap[provider] || provider;
    console.log(`🔄 ClientFactory: Mapping provider '${provider}' to '${normalizedProvider}'`);
    
    switch (normalizedProvider) {
      case 'anthropic':
        return new Anthropic({ 
          apiKey,
          timeout: 600000 // 10 minutes
        });

      case 'google':
        return new GoogleGenerativeAI(apiKey);

      case 'openai':
      case 'chatgpt':
        return new OpenAI({ 
          apiKey,
          timeout: 600000
        });

      case 'grok':
        return new OpenAI({
          apiKey,
          baseURL: 'https://api.x.ai/v1',
          timeout: 600000
        });

      case 'deepseek':
        return new OpenAI({
          apiKey,
          baseURL: 'https://api.deepseek.com/v1',
          timeout: 600000
        });

      case 'llama':
        return new OpenAI({
          apiKey,
          baseURL: process.env.LLAMA_API_BASE_URL || 'https://api.llama.com/v1',
          timeout: 600000
        });

      default:
        throw new Error(`Unknown provider: ${normalizedProvider}`);
    }
  }

  /**
   * Check if a provider is available for a user
   */
  async isProviderAvailable(userId, provider) {
    try {
      // Normalize provider names to match database schema
      const providerMap = {
        'claude': 'anthropic',
        'gemini': 'google',
        'chatgpt': 'openai',
        'grok': 'grok',
        'deepseek': 'deepseek',
        'llama': 'llama'
      };
      
      const normalizedProvider = providerMap[provider] || provider;
      const apiKeyInfo = await apiKeyService.getApiKey(userId, normalizedProvider);
      return apiKeyInfo !== null;
    } catch (error) {
      console.error(`Error checking provider availability for ${provider}:`, error);
      return false;
    }
  }

  /**
   * Get availability status for all providers for a user
   */
  async getAvailability(userId) {
    const providers = ['anthropic', 'google', 'openai', 'grok', 'deepseek', 'llama'];
    const availability = {};

    for (const provider of providers) {
      availability[provider] = await this.isProviderAvailable(userId, provider);
    }

    // Map variations
    availability.chatgpt = availability.openai;
    availability.claude = availability.anthropic;
    availability.gemini = availability.google;

    return availability;
  }

  /**
   * Clear cache for a specific user (useful when API keys are updated)
   */
  clearUserCache(userId) {
    const prefix = `${userId || 'system'}-`;
    let cleared = 0;
    for (const key of this.clientCache.keys()) {
      if (key.startsWith(prefix)) {
        this.clientCache.delete(key);
        cleared++;
      }
    }
    console.log(`🧹 Cleared ${cleared} cached clients for user: ${userId}`);
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    const size = this.clientCache.size;
    this.clientCache.clear();
    console.log(`🧹 Cleared entire client cache (${size} entries)`);
  }
}

const clientFactory = new AIClientFactory();

// Clear cache on authentication to ensure fresh API key checks
export const clearUserClientCache = (userId) => {
  clientFactory.clearUserCache(userId);
};

export default clientFactory;