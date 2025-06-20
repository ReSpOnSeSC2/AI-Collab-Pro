/**
 * Authentication Routes
 * Handles user authentication endpoints using Passport.js
 */

import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Router setup
const router = express.Router();

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'ai_collab';
const USERS_COLLECTION = 'users';

// JWT Configuration
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'ai_collab_auth_secret_key_for_jwt_tokens_and_cookies';
const JWT_EXPIRY = '30d'; // 30 days

// MongoDB connection and collections
let db;
let usersCollection;

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
  try {
    console.log('Auth Routes: Connecting to MongoDB...');
    
    const options = {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true
    };
    
    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    
    db = client.db(DB_NAME);
    usersCollection = db.collection(USERS_COLLECTION);
    
    console.log('Auth Routes: Connected to MongoDB successfully');
    
    // Create indexes for users collection if they don't exist
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    
    return true;
  } catch (error) {
    console.error('Auth Routes: Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

// Connect to MongoDB when the module loads
connectToDatabase().catch(console.error);

/**
 * Create a JWT token for a user
 */
function createToken(user) {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    subscriptionTier: user.subscriptionTier || 'free'
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify JWT token from request
 */
function verifyToken(req) {
  const token = 
    req.cookies?.authToken || 
    req.headers.authorization?.split(' ')[1] || 
    null;
  
  if (!token) return null;
  
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
}

/**
 * Auth Middleware
 */
export const authenticateUser = (req, res, next) => {
  // First check if user is authenticated via session
  if (req.isAuthenticated()) {
    req.user = {
      userId: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      subscriptionTier: req.user.subscriptionTier || 'free'
    };
    return next();
  }
  
  // If not, check JWT token
  const decodedToken = verifyToken(req);
  
  if (!decodedToken) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  req.user = decodedToken;
  next();
};

/**
 * Optional Auth Middleware
 * Does not block requests without authentication
 */
export const optionalAuth = (req, res, next) => {
  // First check if user is authenticated via session
  if (req.isAuthenticated()) {
    req.user = {
      userId: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      subscriptionTier: req.user.subscriptionTier || 'free'
    };
    return next();
  }
  
  // If not, check JWT token
  const decodedToken = verifyToken(req);
  if (decodedToken) {
    req.user = decodedToken;
  }
  next();
};

/**
 * Google OAuth Routes
 */
// Initiates Google OAuth flow
router.get('/google', (req, res, next) => {
  // Determine the actual callback URL based on the request
  let callbackURL;
  
  // Check if we're on Render (production)
  const isRender = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_NAME || req.get('x-forwarded-host') === 'ai-collab-pro.onrender.com';
  
  if (process.env.BACKEND_URL) {
    callbackURL = `${process.env.BACKEND_URL}/api/auth/google/callback`;
  } else if (process.env.NODE_ENV === 'production' || isRender) {
    // Always use production URL in production or on Render
    callbackURL = 'https://ai-collab-pro.onrender.com/api/auth/google/callback';
  } else {
    // Use request headers to build callback URL for local development
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    callbackURL = `${protocol}://${host}/api/auth/google/callback`;
  }
  
  // Final safety check - never use localhost in production
  if ((process.env.NODE_ENV === 'production' || isRender) && callbackURL.includes('localhost')) {
    console.warn('WARNING: Localhost detected in production OAuth callback, forcing production URL');
    callbackURL = 'https://ai-collab-pro.onrender.com/api/auth/google/callback';
  }
  
  console.log('Google OAuth initiated:', {
    NODE_ENV: process.env.NODE_ENV,
    BACKEND_URL: process.env.BACKEND_URL,
    calculatedCallbackURL: callbackURL,
    headers: {
      'x-forwarded-proto': req.get('x-forwarded-proto'),
      'x-forwarded-host': req.get('x-forwarded-host'),
      host: req.get('host')
    }
  });
  
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account',
    callbackURL: callbackURL // Override the callback URL
  })(req, res, next);
});

// Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  // Determine frontend URL for redirects
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' 
    ? 'https://ai-collab-pro.vercel.app' 
    : 'http://localhost:3001');
  
  passport.authenticate('google', { 
    failureRedirect: `${frontendUrl}/login.html?error=Google%20authentication%20failed` 
  })(req, res, next);
}, (req, res) => {
    // Create JWT token for additional client-side auth
    const token = createToken(req.user);
    
    // Set cookie for browser clients (for local development)
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? undefined : 'localhost' // Let browser handle domain in production
    });
    
    // Create user data object for frontend
    const userData = {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email,
      subscriptionTier: req.user.subscriptionTier || 'free'
    };
    
    // Redirect to the main app on frontend with token and user data
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' 
      ? 'https://ai-collab-pro.vercel.app' 
      : 'http://localhost:3001');
    
    // Pass token and user data in URL for cross-domain authentication
    const redirectUrl = `${frontendUrl}/hub.html?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userData))}`;
    
    console.log('OAuth successful, redirecting to:', redirectUrl.substring(0, 50) + '...');
    res.redirect(redirectUrl);
  }
);

/**
 * User Registration Endpoint
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, subscriptionPlan = 'free' } = req.body;
    
    // Check MongoDB connection
    if (!db || !usersCollection) {
      const connected = await connectToDatabase();
      if (!connected) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }
    }
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create user document
    const newUser = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      subscriptionTier: subscriptionPlan,
      createdAt: new Date(),
      lastLogin: new Date()
    };
    
    // Insert user into database
    const result = await usersCollection.insertOne(newUser);
    
    if (!result.insertedId) {
      throw new Error('Failed to create user');
    }
    
    // Create user object without password
    const user = {
      _id: result.insertedId,
      name: newUser.name,
      email: newUser.email,
      subscriptionTier: newUser.subscriptionTier,
      createdAt: newUser.createdAt
    };
    
    // Log in the user (establish session)
    req.login(user, (err) => {
      if (err) {
        console.error('Login error after signup:', err);
        // Continue anyway since we'll also set JWT
      }
      
      // Generate JWT token
      const token = createToken(user);
      
      // Set cookie for browser clients
      res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
        path: '/'
      });
      
      // Send response
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          subscriptionTier: user.subscriptionTier
        },
        token
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during registration'
    });
  }
});

/**
 * User Login Endpoint
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe = false } = req.body;
    
    // Check MongoDB connection
    if (!db || !usersCollection) {
      const connected = await connectToDatabase();
      if (!connected) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }
    }
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find user
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Update last login timestamp
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );
    
    // Log in the user (establish session)
    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        // Continue anyway since we'll also set JWT
      }
      
      // Generate JWT token
      const token = createToken(user);
      
      // Token expiry
      const cookieMaxAge = rememberMe
        ? 30 * 24 * 60 * 60 * 1000 // 30 days
        : 7 * 24 * 60 * 60 * 1000; // 7 days
      
      // Set cookie for browser clients
      res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: cookieMaxAge,
        sameSite: 'lax',
        path: '/'
      });
      
      // Send response
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          subscriptionTier: user.subscriptionTier
        },
        token
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during login'
    });
  }
});

/**
 * User Logout Endpoint
 */
router.post('/logout', (req, res) => {
  // Clear session
  req.logout((err) => {
    if (err) {
      console.error('Error during logout:', err);
    }
    
    // Clear auth cookie
    res.clearCookie('authToken');
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  });
});

/**
 * Get Current Session
 */
router.get('/session', optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.json({
      authenticated: false,
      user: null
    });
  }
  
  try {
    // Get the user's API key status
    const userId = req.user.userId;
    console.log(`📍 Session check for user: ${userId}`);
    
    // Import the User model to check API keys
    const { User } = await import('../models/User.mjs');
    const user = await User.findById(userId);
    
    let apiKeysConfigured = {};
    if (user && user.apiKeys) {
      // Check which providers have API keys configured
      const providers = ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'];
      providers.forEach(provider => {
        apiKeysConfigured[provider] = user.apiKeys.some(k => k.provider === provider && k.isValid);
      });
      
      // Also add the frontend names for convenience
      apiKeysConfigured.chatgpt = apiKeysConfigured.openai;
      apiKeysConfigured.claude = apiKeysConfigured.anthropic;
      apiKeysConfigured.gemini = apiKeysConfigured.google;
    }
    
    // User is authenticated
    res.json({
      authenticated: true,
      user: {
        id: req.user.userId,
        _id: req.user.userId, // Include both formats
        name: req.user.name,
        email: req.user.email,
        subscriptionTier: req.user.subscriptionTier,
        apiKeysConfigured: apiKeysConfigured
      }
    });
  } catch (error) {
    console.error('Error in session endpoint:', error);
    // Still return basic user info even if API key check fails
    res.json({
      authenticated: true,
      user: {
        id: req.user.userId,
        _id: req.user.userId,
        name: req.user.name,
        email: req.user.email,
        subscriptionTier: req.user.subscriptionTier
      }
    });
  }
});

/**
 * Debug endpoint to check API keys for authenticated user
 */
router.get('/debug/api-keys', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`🔍 Debug API keys for user: ${userId}`);
    
    // Import necessary modules
    const { User } = await import('../models/User.mjs');
    const apiKeyService = (await import('../services/apiKeyService.mjs')).default;
    
    // Get user from database
    const user = await User.findById(userId);
    
    if (!user) {
      return res.json({
        success: false,
        message: 'User not found in database',
        userId: userId
      });
    }
    
    // Check each provider
    const providers = ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'];
    const apiKeyStatus = {};
    
    for (const provider of providers) {
      const apiKeyInfo = await apiKeyService.getApiKey(userId, provider);
      apiKeyStatus[provider] = {
        hasKey: !!apiKeyInfo,
        source: apiKeyInfo?.source || 'none',
        isValid: user.apiKeys?.some(k => k.provider === provider && k.isValid) || false
      };
    }
    
    // Also check with frontend names
    const frontendNames = {
      'claude': 'anthropic',
      'gemini': 'google',
      'chatgpt': 'openai'
    };
    
    for (const [frontend, backend] of Object.entries(frontendNames)) {
      const apiKeyInfo = await apiKeyService.getApiKey(userId, backend);
      apiKeyStatus[frontend] = {
        hasKey: !!apiKeyInfo,
        source: apiKeyInfo?.source || 'none',
        mapsTo: backend,
        isValid: user.apiKeys?.some(k => k.provider === backend && k.isValid) || false
      };
    }
    
    res.json({
      success: true,
      userId: userId,
      userEmail: user.email,
      apiKeysCount: user.apiKeys?.length || 0,
      apiKeyStatus: apiKeyStatus,
      rawApiKeys: user.apiKeys?.map(k => ({
        provider: k.provider,
        isValid: k.isValid,
        keyId: k.keyId,
        lastValidated: k.lastValidated
      }))
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking API keys',
      error: error.message
    });
  }
});

/**
 * Additional routes for Google OAuth signin
 */
router.get('/signin', (req, res) => {
  const { mode = 'login', redirect_uri } = req.query;
  
  // Store the redirect URI and mode in session for use after authentication
  req.session.authRedirectUri = redirect_uri;
  req.session.authMode = mode;
  
  // Redirect to Google OAuth
  res.redirect('/api/auth/google');
});

export default router;