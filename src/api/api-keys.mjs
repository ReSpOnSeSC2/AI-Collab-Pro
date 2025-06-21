/**
 * API Keys Management Routes
 * Handles user API key storage, validation, and management
 */

import express from 'express';
import { User } from '../models/User.mjs';
import { authenticateUser } from './auth-routes.mjs';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

/**
 * Get user's API keys (masked)
 * GET /api/api-keys
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Return masked API keys
    const apiKeys = user.apiKeys.map(key => ({
      provider: key.provider,
      keyId: key.keyId,
      isValid: key.isValid,
      lastValidated: key.lastValidated,
      addedAt: key.addedAt
    }));

    res.json({
      success: true,
      data: apiKeys
    });
  } catch (error) {
    console.error('Error getting API keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API keys'
    });
  }
});

/**
 * Add or update an API key
 * POST /api/api-keys
 */
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Provider and API key are required'
      });
    }

    const validProviders = ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider'
      });
    }

    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate the API key
    const validation = await validateApiKey(provider, apiKey);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error || 'Invalid API key'
      });
    }

    // Add or update the API key
    await user.addApiKey(provider, apiKey);

    // Clear the client cache for this user to ensure new key is used
    const { clearUserClientCache } = await import('../lib/ai/clientFactory.mjs');
    clearUserClientCache(req.user.userId);
    console.log(`🔄 Cleared client cache for user ${req.user.userId} after saving ${provider} API key`);

    res.json({
      success: true,
      message: 'API key saved successfully',
      data: {
        provider,
        keyId: apiKey.slice(-4),
        isValid: true,
        lastValidated: new Date()
      }
    });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save API key'
    });
  }
});

/**
 * Delete an API key
 * DELETE /api/api-keys/:provider
 */
/**
 * Debug endpoint to check API key retrieval
 * GET /api/api-keys/debug/:provider
 */
router.get('/debug/:provider', authenticateUser, async (req, res) => {
  try {
    const { provider } = req.params;
    const userId = req.user.userId;
    
    console.log(`🔍 DEBUG: API key check for:`);
    console.log(`  - userId: ${userId}`);
    console.log(`  - provider: ${provider}`);
    
    // Import necessary modules
    const apiKeyService = (await import('../services/apiKeyService.mjs')).default;
    const clientFactory = (await import('../lib/ai/clientFactory.mjs')).default;
    
    // Get user document
    const user = await User.findById(userId);
    const storedKey = user?.apiKeys?.find(k => k.provider === provider);
    
    // Check using apiKeyService
    const apiKeyInfo = await apiKeyService.getApiKey(userId, provider);
    console.log(`🔍 ApiKeyService result:`, apiKeyInfo);
    
    // Try to decrypt the key directly
    let decryptedKey = null;
    let decryptError = null;
    if (user && storedKey) {
      try {
        decryptedKey = user.getApiKey(provider);
      } catch (error) {
        decryptError = error.message;
      }
    }
    
    // Try to create a client
    let clientResult = null;
    let clientError = null;
    try {
      const client = await clientFactory.getClient(userId, provider);
      clientResult = client ? 'Client created successfully' : 'No client returned';
    } catch (error) {
      clientError = error.message;
    }
    
    // Try to validate the key if we have it
    let validationResult = null;
    if (decryptedKey) {
      try {
        switch (provider) {
          case 'openai':
            validationResult = await validateOpenAIKey(decryptedKey);
            break;
          case 'anthropic':
            validationResult = await validateAnthropicKey(decryptedKey);
            break;
          case 'google':
            validationResult = await validateGoogleKey(decryptedKey);
            break;
          case 'deepseek':
            validationResult = await validateOpenAICompatibleKey(decryptedKey, 'https://api.deepseek.com/v1');
            break;
          case 'grok':
            validationResult = await validateOpenAICompatibleKey(decryptedKey, 'https://api.x.ai/v1');
            break;
          case 'llama':
            validationResult = { isValid: true, message: 'Llama validation not implemented' };
            break;
        }
      } catch (error) {
        validationResult = { isValid: false, error: error.message };
      }
    }
    
    res.json({
      success: true,
      debug: {
        userId,
        provider,
        storedKey: storedKey ? {
          exists: true,
          keyId: storedKey.keyId,
          isValid: storedKey.isValid,
          hasEncryptedKey: !!storedKey.encryptedKey
        } : null,
        apiKeyFound: !!apiKeyInfo,
        apiKeySource: apiKeyInfo?.source || 'none',
        decryption: {
          attempted: !!storedKey,
          success: !!decryptedKey,
          error: decryptError,
          keyLength: decryptedKey ? decryptedKey.length : 0
        },
        clientCreated: !!clientResult && !clientError,
        clientError,
        validation: validationResult
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.delete('/:provider', authenticateUser, async (req, res) => {
  try {
    const { provider } = req.params;

    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Remove the API key
    user.apiKeys = user.apiKeys.filter(key => key.provider !== provider);
    await user.save();

    // Clear the client cache for this user
    const { clearUserClientCache } = await import('../lib/ai/clientFactory.mjs');
    clearUserClientCache(req.user.userId);
    console.log(`🔄 Cleared client cache for user ${req.user.userId} after deleting ${provider} API key`);

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

/**
 * Validate an API key
 * POST /api/api-keys/validate
 */
router.post('/validate', authenticateUser, async (req, res) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Provider and API key are required'
      });
    }

    const validation = await validateApiKey(provider, apiKey);

    res.json({
      success: validation.isValid,
      data: validation
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate API key'
    });
  }
});

/**
 * Get API key status for all providers
 * GET /api/api-keys/status
 */
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const providers = ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'];
    const status = {};

    for (const provider of providers) {
      const apiKey = user.apiKeys.find(k => k.provider === provider);
      status[provider] = {
        configured: !!apiKey,
        isValid: apiKey?.isValid || false,
        lastValidated: apiKey?.lastValidated || null,
        keyId: apiKey?.keyId || null
      };
    }

    // Check which providers can be used (either user key or system key)
    const systemKeys = {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      grok: !!(process.env.GROK_API_KEY || process.env.XAI_API_KEY),
      llama: !!(process.env.LLAMA_API_KEY || process.env.GROQ_API_KEY)
    };

    for (const provider of providers) {
      status[provider].available = status[provider].configured || systemKeys[provider];
      status[provider].source = status[provider].configured ? 'user' : (systemKeys[provider] ? 'system' : 'none');
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting API key status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API key status'
    });
  }
});

/**
 * Validate API key with provider
 */
async function validateApiKey(provider, apiKey) {
  try {
    switch (provider) {
      case 'openai':
        return await validateOpenAIKey(apiKey);
      
      case 'anthropic':
        return await validateAnthropicKey(apiKey);
      
      case 'google':
        return await validateGoogleKey(apiKey);
      
      case 'deepseek':
        // DeepSeek uses OpenAI-compatible API
        return await validateOpenAICompatibleKey(apiKey, 'https://api.deepseek.com');
      
      case 'grok':
        // Grok validation would depend on their API
        return { isValid: true, message: 'Validation not implemented for Grok' };
      
      case 'llama':
        // Llama validation would depend on the deployment
        return { isValid: true, message: 'Validation not implemented for Llama' };
      
      default:
        return { isValid: false, error: 'Unknown provider' };
    }
  } catch (error) {
    console.error(`Error validating ${provider} key:`, error);
    return { 
      isValid: false, 
      error: error.message || 'Validation failed' 
    };
  }
}

/**
 * Validate OpenAI API key
 */
async function validateOpenAIKey(apiKey) {
  try {
    const openai = new OpenAI({ apiKey });
    
    // Try to list models to validate the key
    const models = await openai.models.list();
    
    return {
      isValid: true,
      message: 'Valid OpenAI API key',
      models: models.data.map(m => m.id).slice(0, 5) // Return first 5 models
    };
  } catch (error) {
    if (error.status === 401) {
      return { isValid: false, error: 'Invalid API key' };
    }
    throw error;
  }
}

/**
 * Validate Anthropic API key
 */
async function validateAnthropicKey(apiKey) {
  try {
    const anthropic = new Anthropic({ apiKey });
    
    // Try to create a minimal completion to validate the key
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    });
    
    return {
      isValid: true,
      message: 'Valid Anthropic API key'
    };
  } catch (error) {
    if (error.status === 401) {
      return { isValid: false, error: 'Invalid API key' };
    }
    throw error;
  }
}

/**
 * Validate Google API key
 */
async function validateGoogleKey(apiKey) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-pro which is the latest model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    
    // Try to generate a minimal response
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      generationConfig: { maxOutputTokens: 1 }
    });
    
    return {
      isValid: true,
      message: 'Valid Google API key'
    };
  } catch (error) {
    if (error.message?.includes('API_KEY_INVALID')) {
      return { isValid: false, error: 'Invalid API key' };
    }
    // Check for other common errors
    if (error.message?.includes('is not found')) {
      // Try with another model name
      try {
        const genAI2 = new GoogleGenerativeAI(apiKey);
        const model2 = genAI2.getGenerativeModel({ model: 'gemini-1.0-pro' });
        const result2 = await model2.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 1 }
        });
        return {
          isValid: true,
          message: 'Valid Google API key'
        };
      } catch (error2) {
        if (error2.message?.includes('API_KEY_INVALID')) {
          return { isValid: false, error: 'Invalid API key' };
        }
      }
    }
    throw error;
  }
}

/**
 * Validate OpenAI-compatible API key
 */
async function validateOpenAICompatibleKey(apiKey, baseURL) {
  try {
    const client = new OpenAI({ 
      apiKey,
      baseURL 
    });
    
    // Try to list models
    const models = await client.models.list();
    
    return {
      isValid: true,
      message: 'Valid API key',
      models: models.data.map(m => m.id).slice(0, 5)
    };
  } catch (error) {
    if (error.status === 401) {
      return { isValid: false, error: 'Invalid API key' };
    }
    throw error;
  }
}

export default router;