/**
 * Authentication API Endpoints
 * Handles user registration, login, session management, and OAuth flows
 */

import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config();

// Router setup
const router = express.Router();

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'ai_collab';
const USERS_COLLECTION = 'users';

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Determine the callback URL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = process.env.BACKEND_URL || (isProduction 
    ? 'https://ai-collab-pro.onrender.com' 
    : (process.env.NEXTAUTH_URL || 'http://localhost:3001'));
const GOOGLE_CALLBACK_URL = `${baseUrl}/api/auth/google/callback`;

console.log('Google OAuth Configuration:', {
    NODE_ENV: process.env.NODE_ENV,
    isProduction,
    baseUrl,
    GOOGLE_CALLBACK_URL
});

// JWT Configuration
const JWT_SECRET = 'ai_collab_auth_secret_key_for_jwt_tokens_and_cookies';
const JWT_EXPIRY = '30d'; // Extend expiry to 30 days

// Create Google OAuth client
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL);

// MongoDB connection and collections
let db;
let usersCollection;

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        
        // MongoDB connection options with retries and timeout
        const options = {
            serverSelectionTimeoutMS: 30000, // 30 seconds
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            retryWrites: true,
            retryReads: true
        };
        
        // Connect to MongoDB with improved error handling
        const client = new MongoClient(MONGODB_URI, options);
        await client.connect();
        
        db = client.db(DB_NAME);
        usersCollection = db.collection(USERS_COLLECTION);
        
        console.log('Connected to MongoDB for authentication');
        
        // Create indexes for users collection if they don't exist
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        
        // Test the connection with a simple query
        await usersCollection.findOne({});
        console.log('MongoDB connection verified with a test query');
        
        return true;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        throw new Error(`MongoDB connection failed: ${error.message}`);
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
    const decodedToken = verifyToken(req);
    if (decodedToken) {
        req.user = decodedToken;
    }
    next();
};

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
        
        // Generate JWT token
        const token = createToken(user);
        
        // Set cookie for browser clients with stronger settings
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
        
        // Generate JWT token
        const token = createToken(user);
        
        // Token expiry
        const cookieMaxAge = rememberMe
            ? 30 * 24 * 60 * 60 * 1000 // 30 days
            : 1 * 24 * 60 * 60 * 1000; // 1 day
        
        // Set cookie for browser clients
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: cookieMaxAge
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
    // Clear auth cookie
    res.clearCookie('authToken');
    
    res.json({
        success: true,
        message: 'Logout successful'
    });
});

/**
 * Get Current Session
 */
router.get('/session', optionalAuth, (req, res) => {
    if (!req.user) {
        return res.json({
            authenticated: false,
            user: null
        });
    }
    
    // User is authenticated
    res.json({
        authenticated: true,
        user: {
            id: req.user.userId,
            name: req.user.name,
            email: req.user.email,
            subscriptionTier: req.user.subscriptionTier
        }
    });
});

/**
 * Google OAuth Redirect Handler
 * Used for popup window authentication flow
 */
router.get('/google', (req, res) => {
    const { mode = 'login' } = req.query;
    
    // In production behind proxy, use the actual callback URL
    let actualCallbackUrl = GOOGLE_CALLBACK_URL;
    if (process.env.NODE_ENV === 'production' && req.get('x-forwarded-host')) {
        const protocol = req.get('x-forwarded-proto') || 'https';
        const host = req.get('x-forwarded-host') || req.get('host');
        actualCallbackUrl = `${protocol}://${host}/api/auth/google/callback`;
        console.log('Using forwarded callback URL:', actualCallbackUrl);
    }
    
    // Construct Google OAuth URL with correct scopes
    const authUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: ['profile', 'email'],
        state: JSON.stringify({ mode }),
        prompt: 'consent',
        redirect_uri: actualCallbackUrl
    });
    
    res.redirect(authUrl);
});

/**
 * Google OAuth Callback
 */
router.get('/google/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        if (!code) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
            return res.redirect(`${frontendUrl}/login.html?auth_error=Google%20authentication%20failed`);
        }
        
        // Parse state parameter
        const { mode = 'login' } = JSON.parse(state || '{}');
        
        // Exchange code for tokens
        const { tokens } = await googleClient.getToken(code);
        
        // Get user info from ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, picture: profileImage, sub: googleId } = payload;
        
        // Check MongoDB connection
        if (!db || !usersCollection) {
            const connected = await connectToDatabase();
            if (!connected) {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
                return res.redirect(`${frontendUrl}/login.html?auth_error=Database%20connection%20error`);
            }
        }
        
        // Check if user exists
        let user = await usersCollection.findOne({ email: email.toLowerCase() });
        
        // If user doesn't exist and this is a login request, create account
        if (!user) {
            if (mode === 'login') {
                // Auto-create account for Google login
                const newUser = {
                    name,
                    email: email.toLowerCase(),
                    googleId,
                    profileImage,
                    subscriptionTier: 'free',
                    createdAt: new Date(),
                    lastLogin: new Date()
                };
                
                const result = await usersCollection.insertOne(newUser);
                
                if (!result.insertedId) {
                    throw new Error('Failed to create user');
                }
                
                user = {
                    ...newUser,
                    _id: result.insertedId
                };
            } else {
                // For signup mode, explicitly create the account
                const newUser = {
                    name,
                    email: email.toLowerCase(),
                    googleId,
                    profileImage,
                    subscriptionTier: 'free',
                    createdAt: new Date(),
                    lastLogin: new Date()
                };
                
                const result = await usersCollection.insertOne(newUser);
                
                if (!result.insertedId) {
                    throw new Error('Failed to create user');
                }
                
                user = {
                    ...newUser,
                    _id: result.insertedId
                };
            }
        } else {
            // Update existing user's Google ID if not set
            if (!user.googleId) {
                await usersCollection.updateOne(
                    { _id: user._id },
                    { 
                        $set: { 
                            googleId,
                            profileImage,
                            lastLogin: new Date()
                        } 
                    }
                );
                
                // Update local user object
                user.googleId = googleId;
                user.profileImage = profileImage;
            } else {
                // Just update last login timestamp
                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: { lastLogin: new Date() } }
                );
            }
        }
        
        // Generate JWT token
        const token = createToken(user);
        
        // Set cookie for browser clients with stronger settings
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            sameSite: 'lax',
            path: '/'
        });
        
        // Close popup window and send message to parent window
        const script = `
            <script>
                window.opener.postMessage({
                    type: 'AUTH_SUCCESS',
                    token: '${token}',
                    user: ${JSON.stringify({
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        subscriptionTier: user.subscriptionTier,
                        profileImage: user.profileImage
                    })}
                }, window.location.origin);
                window.close();
            </script>
        `;
        
        res.send(script);
    } catch (error) {
        console.error('Google callback error:', error);
        
        // Close popup with error
        const script = `
            <script>
                window.opener.postMessage({
                    type: 'AUTH_ERROR',
                    error: 'Authentication failed: ${error.message}'
                }, window.location.origin);
                window.close();
            </script>
        `;
        
        res.send(script);
    }
});

export default router;