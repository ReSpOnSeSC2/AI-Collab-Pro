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
    const cacheKey = `${userId || 'system'}-${provider}`;
    
    // Check cache
    const cached = this.clientCache.get(cacheKey);
    if (cached && cached.timestamp > Date.now() - this.cacheTimeout) {
      return cached.client;
    }

    // Get API key
    const apiKeyInfo = await apiKeyService.getApiKey(userId, provider);
    if (!apiKeyInfo) {
      throw new Error(`No API key available for ${provider}`);
    }

    // Create client
    const client = await this.createClient(provider, apiKeyInfo.key);
    
    // Cache it
    this.clientCache.set(cacheKey, {
      client,
      timestamp: Date.now(),
      source: apiKeyInfo.source
    });

    return client;
  }

  /**
   * Create a client for a specific provider
   */
  async createClient(provider, apiKey) {
    switch (provider) {
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
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Check if a provider is available for a user
   */
  async isProviderAvailable(userId, provider) {
    try {
      const apiKeyInfo = await apiKeyService.getApiKey(userId, provider);
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
    for (const key of this.clientCache.keys()) {
      if (key.startsWith(prefix)) {
        this.clientCache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clearCache() {
    this.clientCache.clear();
  }
}

export default new AIClientFactory();