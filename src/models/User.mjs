/**
 * User Model for MongoDB
 * Stores user information, authentication, and encrypted API keys
 */

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Schema for encrypted API keys
const ApiKeySchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'],
    required: true
  },
  encryptedKey: {
    type: String, // Encrypted API key
    required: true
  },
  keyId: {
    type: String, // Last 4 characters of the key for identification
    required: true
  },
  isValid: {
    type: Boolean,
    default: true
  },
  lastValidated: {
    type: Date,
    default: Date.now
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password required only if not using Google auth
    }
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['user', 'premium', 'admin'],
    default: 'user'
  },
  subscriptionTier: {
    type: String,
    enum: ['free', 'basic', 'pro', 'enterprise'],
    default: 'free'
  },
  // OAuth fields
  googleId: {
    type: String,
    sparse: true,
    index: true
  },
  picture: {
    type: String,
    default: null
  },
  // API Keys (encrypted)
  apiKeys: {
    type: [ApiKeySchema],
    default: []
  },
  // Usage tracking
  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    },
    lastRequestAt: {
      type: Date,
      default: null
    }
  },
  // Settings
  settings: {
    defaultModels: {
      type: [String],
      default: []
    },
    preferredCollaborationType: {
      type: String,
      enum: ['parallel', 'sequential', 'voting', 'critique', 'small-team'],
      default: 'parallel'
    },
    costAlertThreshold: {
      type: Number, // USD
      default: 10
    }
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Encryption key for API keys (should be stored securely in environment)
const getEncryptionKey = () => {
  const key = process.env.API_KEY_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('API_KEY_ENCRYPTION_KEY not set in environment');
  }
  return crypto.createHash('sha256').update(key).digest();
};

// Encrypt API key
UserSchema.methods.encryptApiKey = function(apiKey) {
  const algorithm = 'aes-256-gcm';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Store IV and authTag with the encrypted data
  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

// Decrypt API key
UserSchema.methods.decryptApiKey = function(encryptedData) {
  try {
    const algorithm = 'aes-256-gcm';
    const key = getEncryptionKey();
    
    // Parse the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [encrypted, ivHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
};

// Add API key method
UserSchema.methods.addApiKey = function(provider, apiKey) {
  const encryptedData = this.encryptApiKey(apiKey);
  const encryptedKey = `${encryptedData.encrypted}:${encryptedData.iv}:${encryptedData.authTag}`;
  
  // Remove existing key for the provider
  this.apiKeys = this.apiKeys.filter(k => k.provider !== provider);
  
  // Add new key
  this.apiKeys.push({
    provider,
    encryptedKey,
    keyId: apiKey.slice(-4), // Last 4 characters
    isValid: true,
    lastValidated: new Date()
  });
  
  return this.save();
};

// Get decrypted API key
UserSchema.methods.getApiKey = function(provider) {
  console.log(`🔑 User.getApiKey called for provider: ${provider}`);
  console.log(`🔑 User has ${this.apiKeys ? this.apiKeys.length : 0} API keys stored`);
  
  if (this.apiKeys) {
    console.log(`🔑 Stored API key providers:`, this.apiKeys.map(k => k.provider));
  }
  
  const apiKeyEntry = this.apiKeys.find(k => k.provider === provider);
  if (!apiKeyEntry) {
    console.log(`❌ No API key found for provider: ${provider}`);
    return null;
  }
  
  console.log(`✅ Found API key entry for ${provider}, decrypting...`);
  return this.decryptApiKey(apiKeyEntry.encryptedKey);
};

// Password hashing middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Password verification method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Clean sensitive data before sending to client
UserSchema.methods.toClientObject = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  
  // Only show key IDs, not encrypted keys
  if (obj.apiKeys) {
    obj.apiKeys = obj.apiKeys.map(k => ({
      provider: k.provider,
      keyId: k.keyId,
      isValid: k.isValid,
      lastValidated: k.lastValidated,
      addedAt: k.addedAt
    }));
  }
  
  return obj;
};

export const User = mongoose.model('User', UserSchema);

export default User;