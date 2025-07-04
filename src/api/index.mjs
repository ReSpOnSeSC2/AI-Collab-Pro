/**
 * API Router Index
 * Mounts all API route handlers.
 */

import express from 'express';
import mongoose from 'mongoose'; // Import mongoose at the top level
import statusRouter from './status.mjs';
import configRouter from './config.mjs';
import uploadRouter from './upload.mjs';
import responsesRouter from './responses.mjs';
import collaborationRouter from './collaboration.mjs';
import mcpRouter from './mcp.mjs';
import contextRouter from './context.mjs';
import authRouter from './auth-routes.mjs'; // Updated to use new auth routes
import { optionalAuth, authenticateUser } from './auth-routes.mjs'; // Updated import
import adminRouter from './admin.mjs'; // Import admin routes
import votesRouter from './votes.mjs'; // Import votes routes
import feedbackRouter from './feedback.mjs'; // Import feedback routes
import metricsRouter from './metrics.mjs'; // Import metrics routes
import apiKeysRouter from './api-keys.mjs'; // Import API keys routes
import adminMetricsRouter from './admin-metrics.mjs'; // Import admin metrics routes

const router = express.Router();

// Mount auth router
router.use('/auth', authRouter); // Handles /api/auth/*

// Mount other routers
router.use(statusRouter); // Handles /check-api-status, /health (implicitly via status.mjs)
router.use('/model-config', configRouter); // Handles /api/model-config/*
router.use(uploadRouter); // Handles /upload (mounted at /api/upload)
router.use('/responses', responsesRouter); // Handles /api/responses/*
router.use('/collaboration', collaborationRouter); // Handles /api/collaboration/*
router.use('/mcp', mcpRouter); // Handles /api/mcp/*
router.use('/context', contextRouter); // Handles /api/context/*
router.use('/admin', adminRouter); // Handles /api/admin/* - admin routes
router.use('/admin', adminMetricsRouter); // Handles /api/admin/* - admin metrics routes
router.use('/votes', votesRouter); // Handles /api/votes/* - voting routes
router.use('/feedback', feedbackRouter); // Handles /api/feedback/* - feedback routes
router.use('/metrics', metricsRouter); // Handles /api/metrics/* - metrics routes
router.use('/api-keys', apiKeysRouter); // Handles /api/api-keys/* - API key management

// Debug route for database connection test
router.get('/debug/db-test', async (req, res) => {
    try {
        // Use the top-level imported mongoose
        const User = (await import('../models/User.mjs')).default;
        
        // Check if mongoose is even imported properly
        if (!mongoose || !mongoose.connection) {
            return res.json({
                error: 'Mongoose not initialized',
                mongooseExists: !!mongoose,
                connectionExists: !!(mongoose && mongoose.connection),
                mongoUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set',
                nodeEnv: process.env.NODE_ENV
            });
        }
        
        const dbInfo = {
            connected: mongoose.connection.readyState === 1,
            state: mongoose.connection.readyState,
            stateDesc: ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'][mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host || 'not connected',
            port: mongoose.connection.port || 'not connected',
            db: mongoose.connection.name || 'not connected',
            collections: [],
            mongoUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set'
        };
        
        // Try to list collections
        if (dbInfo.connected) {
            try {
                const collections = await mongoose.connection.db.listCollections().toArray();
                dbInfo.collections = collections.map(c => c.name);
            } catch (collErr) {
                dbInfo.collectionsError = collErr.message;
            }
        }
        
        // Try to count users
        let userStats = {};
        try {
            userStats.count = await User.countDocuments();
            
            // Get a sample user
            if (userStats.count > 0) {
                const sampleUser = await User.findOne({}, { _id: 1, email: 1, name: 1, apiKeys: 1 });
                if (sampleUser) {
                    userStats.sample = {
                        _id: sampleUser._id.toString(),
                        _idType: typeof sampleUser._id,
                        email: sampleUser.email,
                        name: sampleUser.name,
                        apiKeysCount: sampleUser.apiKeys ? sampleUser.apiKeys.length : 0,
                        apiKeyProviders: sampleUser.apiKeys ? sampleUser.apiKeys.map(k => k.provider) : []
                    };
                }
            }
        } catch (userErr) {
            userStats.error = userErr.message;
        }
        
        res.json({
            dbInfo,
            userStats,
            mongooseVersion: mongoose.version,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('DB test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug route for checking API key availability
router.get('/debug/api-keys/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const apiKeyService = await import('../services/apiKeyService.mjs');
        const User = (await import('../models/User.mjs')).default;
        // Use the top-level imported mongoose
        
        console.log(`🔍 Debug API keys endpoint called for userId: ${userId}`);
        
        // Check if mongoose is initialized
        if (!mongoose || !mongoose.connection) {
            return res.json({
                error: 'Mongoose not initialized',
                mongooseExists: !!mongoose,
                connectionExists: !!(mongoose && mongoose.connection),
                mongoUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set',
                nodeEnv: process.env.NODE_ENV,
                userId
            });
        }
        
        // Check MongoDB connection
        const mongoStatus = {
            connected: mongoose.connection.readyState === 1,
            state: mongoose.connection.readyState,
            host: mongoose.connection.host || 'not connected',
            port: mongoose.connection.port || 'not connected',
            db: mongoose.connection.name || 'not connected',
            mongoUri: process.env.MONGODB_URI ? 'Set (hidden)' : 'Not set'
        };
        
        // Try to find the user
        let user = null;
        let userLookupError = null;
        try {
            user = await User.findById(userId);
            if (!user) {
                // Try alternative lookups
                console.log(`Direct findById failed, trying alternative lookups...`);
                
                // Try with ObjectId conversion
                if (mongoose.Types.ObjectId.isValid(userId)) {
                    const objectId = new mongoose.Types.ObjectId(userId);
                    user = await User.findById(objectId);
                }
                
                // Try findOne
                if (!user) {
                    user = await User.findOne({ _id: userId });
                }
            }
        } catch (error) {
            userLookupError = error.message;
            console.error(`User lookup error: ${error.message}`);
        }
        
        // Get user info if found
        let userInfo = null;
        if (user) {
            userInfo = {
                found: true,
                _id: user._id.toString(),
                email: user.email,
                name: user.name,
                apiKeysCount: user.apiKeys ? user.apiKeys.length : 0,
                apiKeys: user.apiKeys ? user.apiKeys.map(k => ({
                    provider: k.provider,
                    keyId: k.keyId,
                    isValid: k.isValid,
                    hasEncryptedKey: !!k.encryptedKey
                })) : []
            };
        } else {
            userInfo = {
                found: false,
                error: userLookupError || 'User not found'
            };
        }
        
        // Check availability for all providers
        const providers = ['anthropic', 'google', 'openai', 'grok', 'deepseek', 'llama'];
        const availability = {};
        
        for (const provider of providers) {
            try {
                const keyInfo = await apiKeyService.default.getApiKey(userId, provider);
                availability[provider] = {
                    available: !!keyInfo,
                    source: keyInfo?.source || 'none'
                };
            } catch (error) {
                availability[provider] = {
                    available: false,
                    error: error.message
                };
            }
        }
        
        // Also check variations
        availability.claude = availability.anthropic;
        availability.gemini = availability.google;
        availability.chatgpt = availability.openai;
        
        res.json({
            userId,
            userIdFormat: {
                isTemporary: userId.startsWith('user-') && userId.includes('-'),
                isObjectId: /^[0-9a-fA-F]{24}$/.test(userId),
                length: userId.length
            },
            mongoStatus,
            userInfo,
            availability,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Debug endpoint error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test MongoDB connection directly
router.get('/debug/test-mongo-connection', async (req, res) => {
    try {
        const { MongoClient } = await import('mongodb');
        const uri = process.env.MONGODB_URI;
        
        if (!uri) {
            return res.json({ error: 'MONGODB_URI not set in environment' });
        }
        
        const client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000
        });
        
        const startTime = Date.now();
        
        try {
            await client.connect();
            const admin = client.db().admin();
            const result = await admin.ping();
            
            await client.close();
            
            res.json({
                success: true,
                pingResult: result,
                connectionTime: Date.now() - startTime,
                message: 'Successfully connected to MongoDB'
            });
        } catch (connectError) {
            res.json({
                success: false,
                error: connectError.message,
                errorName: connectError.name,
                connectionTime: Date.now() - startTime
            });
        }
    } catch (error) {
        res.json({
            error: 'Failed to test connection',
            message: error.message
        });
    }
});

// Test MongoDB models
router.get('/debug/test-models', async (req, res) => {
    try {
        const User = (await import('../models/User.mjs')).default;
        const Conversation = (await import('../models/Conversation.mjs')).default;
        
        const results = {
            mongodb: {
                connected: mongoose.connection.readyState === 1,
                state: mongoose.connection.readyState
            },
            models: {}
        };
        
        // Test User model
        try {
            const userCount = await User.countDocuments();
            results.models.User = {
                success: true,
                count: userCount
            };
        } catch (error) {
            results.models.User = {
                success: false,
                error: error.message
            };
        }
        
        // Test Conversation model
        try {
            const convCount = await Conversation.countDocuments();
            results.models.Conversation = {
                success: true,
                count: convCount
            };
            
            // Try to create a test conversation
            const testConv = new Conversation({
                userId: 'test-user',
                sessionId: 'test-session',
                messages: []
            });
            
            // Validate without saving
            await testConv.validate();
            results.models.ConversationValidation = {
                success: true,
                message: 'Model validation passed'
            };
        } catch (error) {
            results.models.Conversation = {
                success: false,
                error: error.message
            };
        }
        
        res.json(results);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Simple MongoDB connection check
router.get('/debug/mongo-status', (req, res) => {
    try {
        // Use the imported mongoose instance
        const states = ['disconnected', 'connected', 'connecting', 'disconnecting', 'uninitialized'];
        const state = mongoose.connection ? mongoose.connection.readyState : -1;
        
        res.json({
            mongooseLoaded: !!mongoose,
            connectionExists: !!(mongoose && mongoose.connection),
            connectionState: state,
            connectionStateDesc: states[state] || 'unknown',
            mongoUriSet: !!process.env.MONGODB_URI,
            connectionProperties: mongoose.connection ? {
                host: mongoose.connection.host || 'not set',
                port: mongoose.connection.port || 'not set',
                name: mongoose.connection.name || 'not set'
            } : null,
            error: null
        });
    } catch (error) {
        res.json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Debug route for testing encryption/decryption
router.get('/debug/test-encryption', async (req, res) => {
    try {
        const crypto = await import('crypto');
        const encKey = process.env.API_KEY_ENCRYPTION_KEY;
        
        if (!encKey) {
            return res.json({ error: 'API_KEY_ENCRYPTION_KEY not set' });
        }
        
        // Test encryption/decryption
        const testString = 'test-api-key-12345';
        const algorithm = 'aes-256-gcm';
        const key = crypto.createHash('sha256').update(encKey).digest();
        const iv = crypto.randomBytes(16);
        
        // Encrypt
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(testString, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        // Decrypt
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        res.json({
            encryptionKeySet: true,
            encryptionKeyLength: encKey.length,
            testEncryption: {
                original: testString,
                encrypted: encrypted.substring(0, 20) + '...',
                decrypted: decrypted,
                success: testString === decrypted
            },
            message: 'Encryption/decryption is working correctly'
        });
    } catch (error) {
        res.json({
            error: 'Encryption test failed',
            message: error.message,
            stack: error.stack
        });
    }
});

// Debug route for environment variables
router.get('/debug/env', (req, res) => {
    res.json({
        nodeEnv: process.env.NODE_ENV,
        mongodbUri: process.env.MONGODB_URI ? 'Set' : 'Not set',
        backendUrl: process.env.BACKEND_URL,
        frontendUrl: process.env.FRONTEND_URL,
        port: process.env.PORT,
        googleClientId: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
        apiKeyEncryption: process.env.API_KEY_ENCRYPTION_KEY ? 'Set' : 'Not set',
        systemApiKeys: {
            openai: process.env.OPENAI_API_KEY ? 'Set' : 'Not set',
            anthropic: process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set',
            gemini: process.env.GEMINI_API_KEY ? 'Set' : 'Not set',
            grok: process.env.GROK_API_KEY ? 'Set' : 'Not set',
            deepseek: process.env.DEEPSEEK_API_KEY ? 'Set' : 'Not set',
            llama: process.env.LLAMA_API_KEY ? 'Set' : 'Not set'
        },
        timestamp: new Date().toISOString()
    });
});

// Optional: Add a root API route for discovery
router.get('/', optionalAuth, (req, res) => {
    res.json({
        message: 'AI Collaboration Hub API v8.0.1',
        authenticated: !!req.user,
        user: req.user ? {
            id: req.user.userId,
            name: req.user.name,
            subscriptionTier: req.user.subscriptionTier
        } : null,
        endpoints: [
            '/check-api-status',
            '/health',
            '/auth/login',
            '/auth/signup',
            '/auth/google',
            '/auth/session',
            '/auth/logout',
            '/model-config',
            '/model-config/:provider',
            '/upload',
            '/responses',
            '/responses/markdown',
            '/responses/saved',
            '/responses/saved/:filename',
            '/collaboration/config',
            '/collaboration/style',
            '/collaboration/mode',
            '/mcp/register-context',
            '/mcp/list-files',
            '/mcp/read-file',
            '/mcp/request-write',
            '/mcp/pending-operations',
            '/mcp/approve-operation',
            '/mcp/reject-operation',
            // Context management endpoints
            '/context/list',
            '/context/status',
            '/context/reset',
            '/context/trim',
            '/context/max-size',
        ]
    });
});

export default router;