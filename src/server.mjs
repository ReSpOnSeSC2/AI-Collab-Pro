/**
 * AI Collaboration Hub Backend Server - Main Entry Point
 * Sets up Express server, WebSocket server, middleware, and API routes.
 * Version: 8.0.1
 * 
 * Changes in 8.0.1:
 * - Fixed admin sidebar structure in admin-models.html
 * - Added admin and votes routes to API router
 * - Fixed MongoDB database access for admin routes
 * - Temporarily disabled auth requirements for demo purposes
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import mongoose from 'mongoose';

import { initializePassport } from './config/passport.mjs';
import initializeWebSocketHandler from './wsHandler.mjs';
import apiRouter from './api/index.mjs';
import { initializeUploads } from './api/upload.mjs'; // Import initialization function

// --- Configuration & Setup ---
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, '../public');
const uploadsPath = path.join(__dirname, '../uploads'); // Define uploads path

const PORT = process.env.PORT || 3001;
const NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3002'; // For Next.js proxy if used

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-collab';

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    // Store the database connection for use in routes
    app.locals.db = mongoose.connection.db;
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });

// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Get allowed origins from environment variable
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3001',
      'http://localhost:3000'
    ];
    
    // Check if the origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // 24 hours
};

// --- Middleware ---
// Apply CORS before other middleware
if (process.env.NODE_ENV === 'production') {
  // Dynamic import for production
  import('cors').then(({ default: cors }) => {
    app.use(cors(corsOptions));
  });
} else {
  // For development, allow all origins
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
}

app.use(express.json()); // Parse JSON request bodies
app.use(cookieParser()); // Parse cookies for authentication

// --- Security Headers ---
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // HTTPS redirect
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' wss: ws:");
    
    next();
  });
}

app.use(express.static(publicPath)); // Serve static files from 'public'

// --- Session Configuration ---
const SESSION_SECRET = process.env.NEXTAUTH_SECRET || 'ai_collab_session_secret_key';

// Configure session with MongoDB store
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60, // 14 days
    autoRemove: 'native' // Use MongoDB's TTL index
  }),
  cookie: {
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Initialize Passport.js
app.use(passport.initialize());
app.use(passport.session());

// Initialize Passport strategies
initializePassport().catch(err => {
  console.error('Failed to initialize Passport:', err);
});

// --- Proxy for Next.js App (Optional) ---
// If you run a separate Next.js frontend, this proxies requests to it.
// Adjust the path and target URL as needed.
if (NEXT_APP_URL) {
    app.use('/next-app', createProxyMiddleware({
        target: NEXT_APP_URL,
        changeOrigin: true,
        pathRewrite: { '^/next-app': '' }, // Remove /next-app prefix when forwarding
        ws: true, // Proxy WebSocket connections as well if needed for Next.js features
        onError: (err, req, res) => {
            console.error('Proxy error:', err);
            if (res && !res.headersSent) {
                res.status(500).send('Next.js app proxy error');
            }
        },
        onProxyReqWs: (proxyReq, req, socket) => {
            console.log(`[WebSocket Proxy] Proxying WS request for ${req.url}`);
        },
        onOpen: (proxySocket) => {
            console.log('[WebSocket Proxy] WS Connection opened.');
        },
        onClose: (res, socket, head) => {
            console.log('[WebSocket Proxy] WS Connection closed.');
        },
    }));
    console.log(`Proxying /next-app requests to ${NEXT_APP_URL}`);
}

// --- API Routes ---
app.use('/api', apiRouter); // Mount all API routes under /api

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });
initializeWebSocketHandler(wss); // Initialize WebSocket logic

// --- File Uploads Initialization ---
initializeUploads(uploadsPath); // Ensure uploads directory exists

// --- Default Route (Serve index.html for SPA behavior) ---
// This should come after API routes and static files
app.get('*', (req, res) => {
    // Check if the request accepts HTML, otherwise it might be an API call missing /api prefix
    if (req.accepts('html')) {
        const indexPath = path.join(publicPath, 'index.html');
        res.sendFile(indexPath, (err) => {
            if (err) {
                console.error(`Error sending index.html: ${err.message}`);
                res.status(500).send('Error loading application.');
            }
        });
    } else {
        // Respond with 404 for non-HTML requests that didn't match other routes
        res.status(404).json({ error: 'Not Found' });
    }
});

// --- Error Handling Middleware ---
// Basic error handler
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack || err);
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: err.message || 'An unexpected error occurred.',
    });
});

// --- Server Startup ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AI Collaboration Hub Server v8.0.1 running on http://localhost:${PORT}`);
    console.log(`📂 Serving static files from: ${publicPath}`);
    console.log(`📂 Uploads directory: ${uploadsPath}`);
    console.log(`🔧 Admin routes enabled (demo mode - auth disabled)`);
    // Add other startup logs as needed (e.g., default project path from cliHandler)
});

// --- Graceful Shutdown ---
const shutdown = (signal) => {
    console.log(`\n${signal} signal received: closing HTTP server`);
    server.close(() => {
        console.log('HTTP server closed');
        // Close WebSocket connections gracefully
        wss.clients.forEach(client => client.terminate());
        console.log('WebSocket connections terminated');
        // Add any other cleanup logic here (e.g., database connections)
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Handle Ctrl+C

export default server; // Export for potential testing