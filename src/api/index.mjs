/**
 * API Router Index
 * Mounts all API route handlers.
 */

import express from 'express';
import statusRouter from './status.mjs';
import configRouter from './config.mjs';
import uploadRouter from './upload.mjs';
import responsesRouter from './responses.mjs';
import collaborationRouter from './collaboration.mjs';
import mcpRouter from './mcp.mjs';
import contextRouter from './context.mjs';
import authRouter from './auth-routes.mjs'; // Updated to use new auth routes
import { optionalAuth, authenticateUser } from './auth-routes.mjs'; // Updated import

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

// Optional: Add a root API route for discovery
router.get('/', optionalAuth, (req, res) => {
    res.json({
        message: 'AI Collaboration Hub API v8.0.0',
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