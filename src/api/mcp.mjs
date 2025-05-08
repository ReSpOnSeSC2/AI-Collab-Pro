/**
 * API Route Handler for Model Context Protocol (MCP) Operations
 */

import express from 'express';
// Correctly import functions from the refactored MCP library
import {
    registerContext,
    validateContext,
    listFiles,
    readFile,
    requestWriteFile,
    requestDeleteFile,
    requestCreateDirectory,
    getUserPendingOperations,
    approveOperation,
    rejectOperation
} from '../lib/mcp/index.mjs'; // Adjusted path

const router = express.Router();

// --- Middleware for User ID (Example - Replace with real auth) ---
// This middleware simulates extracting a userId. In a real app,
// this would come from a session, JWT, or other auth mechanism.
const extractUserId = (req, res, next) => {
    // For now, allow userId to be passed in query or body for testing API directly
    req.userId = req.query.userId || req.body.userId;
    if (!req.userId) {
        // If no userId provided, generate a temporary one for API-only interaction
        // This is NOT secure for production.
        req.userId = `api-user-${Date.now()}`;
        console.warn(`MCP API: No userId provided, generated temporary ID: ${req.userId}`);
        // return res.status(403).json({ error: 'Authentication required. User ID missing.' });
    }
    next();
};

// Apply user ID extraction middleware to all MCP routes
router.use(extractUserId);

// --- Route Handlers ---

// POST /api/mcp/register-context
router.post('/register-context', express.json(), async (req, res) => {
    const { directory, projectId, description, permissions, duration } = req.body;
    const userId = req.userId; // Get userId from middleware
    const sessionId = `api-${Date.now()}-${userId}`; // Create a session ID for API context

    if (!directory) {
        return res.status(400).json({ error: 'Directory path is required.' });
    }

    try {
        const token = registerContext(sessionId, directory, userId, { projectId, description, permissions, duration });
        const context = validateContext(token, userId); // Get full context details
        res.status(201).json({
            success: true,
            token,
            directory: context.context?.directory, // Send back resolved path
            expiresAt: context.context?.expiresAt,
            permissions: context.context?.permissions
        });
    } catch (error) {
        console.error(`MCP API Error (registerContext for user ${userId}):`, error);
        res.status(500).json({ error: `Failed to register context: ${error.message}` });
    }
});

// GET /api/mcp/list-files
router.get('/list-files', async (req, res) => {
    const { token, subPath = '' } = req.query;
    const userId = req.userId;

    if (!token) {
        return res.status(400).json({ error: 'Context token (token) is required.' });
    }

    try {
        // listFiles already performs validation internally
        const files = await listFiles(token, userId, subPath);
        const context = validateContext(token, userId); // Get context dir for response clarity
        res.json({
            success: true,
            path: subPath,
            baseDirectory: context.context?.directory, // Optional: inform client of base
            files
        });
    } catch (error) {
        console.error(`MCP API Error (listFiles for user ${userId}, token ${token}):`, error);
        // Handle specific errors like invalid token or path
        if (error.message.includes('Invalid or unknown context token') || error.message.includes('User ID does not match') || error.message.includes('token has expired')) {
            res.status(401).json({ error: `Context validation failed: ${error.message}` });
        } else if (error.message.includes('Path is not a valid directory') || error.message.includes('Path traversal attempt')) {
            res.status(400).json({ error: `Invalid path: ${error.message}` });
        } else {
            res.status(500).json({ error: `Failed to list files: ${error.message}` });
        }
    }
});

// GET /api/mcp/read-file
router.get('/read-file', async (req, res) => {
    const { token, filePath } = req.query;
    const userId = req.userId;

    if (!token || !filePath) {
        return res.status(400).json({ error: 'Context token (token) and file path (filePath) are required.' });
    }

    try {
        // readFile performs validation
        const content = await readFile(token, userId, filePath);
        res.json({ success: true, filePath, content });
    } catch (error) {
        console.error(`MCP API Error (readFile for user ${userId}, path ${filePath}):`, error);
         if (error.message.includes('Invalid or unknown context token') || error.message.includes('User ID does not match') || error.message.includes('token has expired')) {
            res.status(401).json({ error: `Context validation failed: ${error.message}` });
        } else if (error.message.includes('Path is not a valid file') || error.message.includes('Path traversal attempt')) {
            res.status(400).json({ error: `Invalid file path: ${error.message}` });
        } else {
            res.status(500).json({ error: `Failed to read file: ${error.message}` });
        }
    }
});

// POST /api/mcp/request-write
router.post('/request-write', express.json(), async (req, res) => {
    const { token, filePath, content, description } = req.body;
    const userId = req.userId;

    if (!token || !filePath || content === undefined) {
        return res.status(400).json({ error: 'Context token (token), file path (filePath), and content are required.' });
    }

    try {
        // requestWriteFile performs validation
        const operationId = await requestWriteFile(token, userId, filePath, content, {
            description: description || `API request to write file: ${filePath}`,
            requestedBy: `API User ${userId}`,
            timestamp: Date.now()
        });
        res.status(202).json({ success: true, operationId, filePath, status: 'pending', message: 'Write operation requested, pending approval.' });
    } catch (error) {
        console.error(`MCP API Error (requestWrite for user ${userId}, path ${filePath}):`, error);
         if (error.message.includes('Invalid or unknown context token') || error.message.includes('User ID does not match') || error.message.includes('token has expired') || error.message.includes('Permission denied')) {
            res.status(401).json({ error: `Context validation or permission failed: ${error.message}` });
        } else {
            res.status(500).json({ error: `Failed to request file write: ${error.message}` });
        }
    }
});

// POST /api/mcp/request-delete
router.post('/request-delete', express.json(), async (req, res) => {
    const { token, filePath, description } = req.body;
    const userId = req.userId;

    if (!token || !filePath) {
        return res.status(400).json({ error: 'Context token (token) and file path (filePath) are required.' });
    }

    try {
        const operationId = await requestDeleteFile(token, userId, filePath, {
            description: description || `API request to delete: ${filePath}`,
            requestedBy: `API User ${userId}`,
            timestamp: Date.now()
        });
        res.status(202).json({ success: true, operationId, filePath, status: 'pending', message: 'Delete operation requested, pending approval.' });
    } catch (error) {
        console.error(`MCP API Error (requestDelete for user ${userId}, path ${filePath}):`, error);
        if (error.message.includes('Invalid or unknown context token') || error.message.includes('User ID does not match') || error.message.includes('token has expired') || error.message.includes('Permission denied')) {
            res.status(401).json({ error: `Context validation or permission failed: ${error.message}` });
        } else {
            res.status(500).json({ error: `Failed to request deletion: ${error.message}` });
        }
    }
});

// POST /api/mcp/request-create-directory
router.post('/request-create-directory', express.json(), async (req, res) => {
    const { token, dirPath, description } = req.body;
    const userId = req.userId;

    if (!token || !dirPath) {
        return res.status(400).json({ error: 'Context token (token) and directory path (dirPath) are required.' });
    }

    try {
        const operationId = await requestCreateDirectory(token, userId, dirPath, {
            description: description || `API request to create directory: ${dirPath}`,
            requestedBy: `API User ${userId}`,
            timestamp: Date.now()
        });
        res.status(202).json({ success: true, operationId, dirPath, status: 'pending', message: 'Create directory operation requested, pending approval.' });
    } catch (error) {
        console.error(`MCP API Error (requestCreateDirectory for user ${userId}, path ${dirPath}):`, error);
        if (error.message.includes('Invalid or unknown context token') || error.message.includes('User ID does not match') || error.message.includes('token has expired') || error.message.includes('Permission denied')) {
            res.status(401).json({ error: `Context validation or permission failed: ${error.message}` });
        } else {
            res.status(500).json({ error: `Failed to request directory creation: ${error.message}` });
        }
    }
});


// GET /api/mcp/pending-operations
router.get('/pending-operations', async (req, res) => {
    const userId = req.userId; // User ID from middleware

    try {
        const operations = getUserPendingOperations(userId);
        res.json({ success: true, operations });
    } catch (error) {
        console.error(`MCP API Error (getPendingOperations for user ${userId}):`, error);
        res.status(500).json({ error: `Failed to get pending operations: ${error.message}` });
    }
});

// POST /api/mcp/approve-operation
router.post('/approve-operation', express.json(), async (req, res) => {
    const { operationId } = req.body;
    const userId = req.userId;

    if (!operationId) {
        return res.status(400).json({ error: 'Operation ID (operationId) is required.' });
    }

    try {
        const result = await approveOperation(operationId, userId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error(`MCP API Error (approveOperation for user ${userId}, op ${operationId}):`, error);
        // Handle specific errors like not found, user mismatch, already processed
        if (error.message.includes('Operation not found') || error.message.includes('not pending')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('User mismatch')) {
            res.status(403).json({ error: error.message });
        } else if (error.message.includes('Context for operation is no longer valid')) {
             res.status(410).json({ error: error.message }); // Gone
        } else if (error.message.startsWith('Execution failed')) {
             res.status(409).json({ error: error.message }); // Conflict or execution error
        } else {
            res.status(500).json({ error: `Failed to approve operation: ${error.message}` });
        }
    }
});

// POST /api/mcp/reject-operation
router.post('/reject-operation', express.json(), async (req, res) => {
    const { operationId, reason = '' } = req.body;
    const userId = req.userId;

    if (!operationId) {
        return res.status(400).json({ error: 'Operation ID (operationId) is required.' });
    }

    try {
        // rejectOperation is synchronous in the current mcp lib
        const result = rejectOperation(operationId, userId, reason);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error(`MCP API Error (rejectOperation for user ${userId}, op ${operationId}):`, error);
        if (error.message.includes('Operation not found') || error.message.includes('not pending')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('User mismatch')) {
            res.status(403).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Failed to reject operation: ${error.message}` });
        }
    }
});

export default router;