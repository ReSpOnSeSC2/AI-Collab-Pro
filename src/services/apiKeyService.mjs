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
      
      // First, try to get user's API key
      if (userId) {
        console.log(`🔍 Attempting to find user by ID: ${userId}`);
        
        // Check if this is a temporary user ID (format: user-timestamp-random)
        if (userId.startsWith('user-') && userId.includes('-')) {
          console.log(`⚠️ Temporary user ID detected: ${userId}, skipping database lookup`);
          // For temporary users, only system keys are available
        } else {
          // Try to find user in database
          try {
            console.log(`🔍 Looking up user in database with ID: ${userId}`);
            console.log(`  - MongoDB ObjectId format: ${/^[0-9a-fA-F]{24}$/.test(userId)}`);
            console.log(`  - Is valid ObjectId: ${userId && userId.length === 24 && /^[0-9a-fA-F]{24}$/.test(userId)}`);
            
            // Try different approaches to find the user
            let user = null;
            
            // First, try direct findById
            try {
              console.log(`  - Attempting User.findById(${userId})`);
              user = await User.findById(userId);
              console.log(`  - findById result: ${user ? 'User found' : 'No user found'}`);
            } catch (findByIdError) {
              console.log(`  - findById error: ${findByIdError.message}`);
              
              // If findById fails, try with explicit ObjectId conversion
              try {
                const mongoose = await import('mongoose');
                const ObjectId = mongoose.Types.ObjectId;
                
                if (ObjectId.isValid(userId)) {
                  console.log(`  - Attempting User.findById with ObjectId conversion`);
                  const objectId = new ObjectId(userId);
                  user = await User.findById(objectId);
                  console.log(`  - ObjectId query result: ${user ? 'User found' : 'No user found'}`);
                } else {
                  console.log(`  - Invalid ObjectId format: ${userId}`);
                }
              } catch (objectIdError) {
                console.log(`  - ObjectId conversion error: ${objectIdError.message}`);
              }
            }
            
            // Additional debug: try finding by _id directly
            if (!user) {
              try {
                console.log(`  - Attempting User.findOne({ _id: "${userId}" })`);
                user = await User.findOne({ _id: userId });
                console.log(`  - findOne result: ${user ? 'User found' : 'No user found'}`);
              } catch (findOneError) {
                console.log(`  - findOne error: ${findOneError.message}`);
              }
            }
            
            // Log database connection status
            const mongoose = await import('mongoose');
            console.log(`  - MongoDB connection state: ${mongoose.connection.readyState}`);
            console.log(`  - MongoDB connected to: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
            
            // Additional debug: Check if we can query the database at all
            if (!user) {
              try {
                const testUser = await User.findOne({});
                if (testUser) {
                  console.log(`  - Database accessible, found test user with ID: ${testUser._id}`);
                  console.log(`  - Test user ID type: ${typeof testUser._id}`);
                  console.log(`  - Comparing with requested ID: ${userId} === ${testUser._id.toString()}`)
                } else {
                  console.log(`  - Database accessible but no users found`);
                }
              } catch (testErr) {
                console.log(`  - Database query test failed: ${testErr.message}`);
              }
            }
            
            if (user) {
              console.log(`✅ User found in database:`);
              console.log(`  - User._id: ${user._id}`);
              console.log(`  - User._id type: ${typeof user._id}`);
              console.log(`  - Email: ${user.email || 'N/A'}`);
              console.log(`  - Name: ${user.name || 'N/A'}`);
              console.log(`  - API keys count: ${user.apiKeys ? user.apiKeys.length : 0}`);
              
              if (user.apiKeys && user.apiKeys.length > 0) {
                console.log(`  - Stored providers: ${user.apiKeys.map(k => k.provider).join(', ')}`);
                console.log(`  - Looking for provider: ${provider}`);
              }
              
              const userApiKey = user.getApiKey(provider);
              if (userApiKey) {
                console.log(`✅ User API key found for provider: ${provider}`);
                console.log(`  - Key exists: ${!!userApiKey}`);
                console.log(`  - Key length: ${userApiKey ? userApiKey.length : 0}`);
                return {
                  key: userApiKey,
                  source: 'user',
                  userId: userId
                };
              } else {
                console.log(`❌ No user API key for provider: ${provider}`);
                console.log(`  - user.getApiKey returned: ${userApiKey}`);
              }
            } else {
              console.log(`❌ User not found in database with ID: ${userId}`);
              
              // Additional debug: List a few users to verify database access
              try {
                const userCount = await User.countDocuments();
                console.log(`  - Total users in database: ${userCount}`);
                
                if (userCount > 0) {
                  const sampleUser = await User.findOne({}, { _id: 1, email: 1 });
                  console.log(`  - Sample user _id: ${sampleUser?._id}`);
                  console.log(`  - Sample user _id type: ${typeof sampleUser?._id}`);
                }
              } catch (countError) {
                console.log(`  - Error counting users: ${countError.message}`);
              }
            }
          } catch (dbError) {
            console.log(`⚠️ Database error looking up user:`);
            console.log(`  - Error: ${dbError.message}`);
            console.log(`  - Error name: ${dbError.name}`);
            console.log(`  - Error stack: ${dbError.stack}`);
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