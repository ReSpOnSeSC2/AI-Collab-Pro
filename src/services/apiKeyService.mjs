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
      console.log(`🔍 ApiKeyService.getApiKey called:`);
      console.log(`  - userId: ${userId}`);
      console.log(`  - provider: ${provider}`);
      console.log(`  - userId type: ${typeof userId}`);
      console.log(`  - userId format: ${userId ? (userId.startsWith('user-') ? 'temporary' : 'permanent') : 'none'}`);
      
      // Check database connection first
      const mongoose = await import('mongoose');
      const connectionState = mongoose.connection.readyState;
      console.log(`  - MongoDB connection state: ${connectionState} (${['disconnected', 'connected', 'connecting', 'disconnecting'][connectionState]})`);
      
      // If database is not connected, only system keys are available
      if (connectionState !== 1) {
        console.log(`⚠️ MongoDB not connected (state: ${connectionState}). Falling back to system keys only.`);
        const systemKey = this.getSystemApiKey(provider);
        if (systemKey) {
          return {
            key: systemKey,
            source: 'system'
          };
        }
        return null;
      }
      
      // First, try to get user's API key
      if (userId) {
        console.log(`🔍 Attempting to find user by ID: ${userId}`);
        
        // Check if this is a temporary user ID (format: user-timestamp-random)
        if (userId.startsWith('user-') && userId.includes('-')) {
          console.log(`⚠️ Temporary user ID detected: ${userId}, skipping database lookup`);
          // For temporary users, only system keys are available
        } else {
          // Validate ObjectId format before querying
          const ObjectId = mongoose.Types.ObjectId;
          const isValidObjectId = userId && userId.length === 24 && /^[0-9a-fA-F]{24}$/.test(userId);
          
          if (!isValidObjectId) {
            console.log(`⚠️ Invalid ObjectId format: ${userId} (length: ${userId?.length})`);
            // Fall through to system keys
          } else {
            // Try to find user in database
            try {
              console.log(`🔍 Looking up user in database with ID: ${userId}`);
              
              let user = null;
              
              // Use a timeout for the database query
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database query timeout')), 5000)
              );
              
              try {
                user = await Promise.race([
                  User.findById(userId).maxTimeMS(5000),
                  timeoutPromise
                ]);
                console.log(`  - findById result: ${user ? 'User found' : 'No user found'}`);
              } catch (queryError) {
                console.log(`  - Database query error: ${queryError.message}`);
                // Don't throw, fall through to system keys
              }
              
              if (user) {
                console.log(`✅ User found in database:`);
                console.log(`  - User._id: ${user._id}`);
                console.log(`  - Email: ${user.email || 'N/A'}`);
                console.log(`  - Name: ${user.name || 'N/A'}`);
                console.log(`  - API keys count: ${user.apiKeys ? user.apiKeys.length : 0}`);
                
                if (user.apiKeys && user.apiKeys.length > 0) {
                  console.log(`  - Stored providers: ${user.apiKeys.map(k => k.provider).join(', ')}`);
                  console.log(`  - Looking for provider: ${provider}`);
                }
                
                try {
                  const userApiKey = user.getApiKey(provider);
                  if (userApiKey) {
                    console.log(`✅ User API key found for provider: ${provider}`);
                    return {
                      key: userApiKey,
                      source: 'user',
                      userId: userId
                    };
                  } else {
                    console.log(`❌ No user API key for provider: ${provider}`);
                  }
                } catch (decryptError) {
                  console.log(`⚠️ Error decrypting API key: ${decryptError.message}`);
                  // Fall through to system keys
                }
              } else {
                console.log(`❌ User not found in database with ID: ${userId}`);
              }
            } catch (dbError) {
              console.log(`⚠️ Database error looking up user:`);
              console.log(`  - Error: ${dbError.message}`);
              
              // Check if this is a connection error
              if (dbError.name === 'MongooseError' || dbError.name === 'MongoNetworkError') {
                console.log(`  - This appears to be a database connection issue`);
              }
              // Don't throw, fall through to system keys
            }
          }
        }
      } else {
        console.log(`⚠️ No userId provided to getApiKey`);
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