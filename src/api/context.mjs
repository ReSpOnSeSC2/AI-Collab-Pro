/**
 * API Route Handler for Conversation Context Management
 */

import express from 'express';
import {
  getOrCreateContext,
  getUserContexts,
  resetContext,
  trimContextIfNeeded,
  setMaxContextSize,
  setContextMode,
  getContextModes,
  listAllContexts
} from '../lib/contextManager.mjs';

const router = express.Router();

// GET /api/context/list - Get all contexts for a user
router.get('/list', async (req, res) => {
  try {
    // Get user ID from session (assumes authenticated)
    const userId = req.user?.id || req.session?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to access context.' });
    }

    const contexts = await getUserContexts(userId);
    res.json({
      success: true,
      contexts: contexts.map(ctx => ({
        id: ctx._id || ctx.id,
        sessionId: ctx.sessionId,
        created: ctx.createdAt || ctx.created,
        lastUpdated: ctx.updatedAt || ctx.lastUpdated,
        messageCount: ctx.messages?.length || 0,
        contextSize: ctx.contextSize || 0,
        maxContextSize: ctx.maxContextSize || 8000,
        percentUsed: Math.round(((ctx.contextSize || 0) / (ctx.maxContextSize || 8000)) * 100),
        isNearLimit: (ctx.contextSize || 0) >= ((ctx.maxContextSize || 8000) * 0.8)
      }))
    });
  } catch (error) {
    console.error("API Error (GET /context/list):", error);
    res.status(500).json({ error: "Failed to retrieve contexts." });
  }
});

// GET /api/context/status - Get status for a specific context
router.get('/status', async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const { sessionId } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to access context.' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const context = await getOrCreateContext(userId, sessionId);
    res.json({
      success: true,
      status: {
        id: context._id || context.id,
        created: context.createdAt || context.created,
        lastUpdated: context.updatedAt || context.lastUpdated,
        messageCount: context.messages?.length || 0,
        contextSize: context.contextSize || 0,
        maxContextSize: context.maxContextSize || 8000,
        percentUsed: Math.round(((context.contextSize || 0) / (context.maxContextSize || 8000)) * 100),
        isNearLimit: (context.contextSize || 0) >= ((context.maxContextSize || 8000) * 0.8),
        contextMode: context.contextMode || 'none'
      }
    });
  } catch (error) {
    console.error("API Error (GET /context/status):", error);
    res.status(500).json({ error: "Failed to retrieve context status." });
  }
});

// GET /api/context/modes - Get available context modes
router.get('/modes', async (req, res) => {
  try {
    const modes = getContextModes();
    res.json({
      success: true,
      modes
    });
  } catch (error) {
    console.error("API Error (GET /context/modes):", error);
    res.status(500).json({ error: "Failed to retrieve context modes." });
  }
});

// POST /api/context/reset - Reset a context
router.post('/reset', express.json(), async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const { sessionId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to reset context.' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const newContext = await resetContext(userId, sessionId);
    res.json({
      success: true,
      message: 'Context has been reset.',
      status: {
        id: newContext.id,
        created: newContext.created,
        messageCount: 0,
        contextSize: 0,
        maxContextSize: newContext.maxContextSize
      }
    });
  } catch (error) {
    console.error("API Error (POST /context/reset):", error);
    res.status(500).json({ error: "Failed to reset context." });
  }
});

// POST /api/context/trim - Trim a context if needed
router.post('/trim', express.json(), async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const { sessionId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to trim context.' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    const trimResult = await trimContextIfNeeded(userId, sessionId);
    res.json({
      success: true,
      trimmed: trimResult.trimmed,
      message: trimResult.trimmed
        ? `Context trimmed. Removed ${trimResult.removed} oldest messages.`
        : 'Context is within size limits. No trimming needed.',
      status: {
        trimmed: trimResult.trimmed,
        messagesRemoved: trimResult.removed || 0,
        newSizePercent: trimResult.percentUsed
      }
    });
  } catch (error) {
    console.error("API Error (POST /context/trim):", error);
    res.status(500).json({ error: "Failed to trim context." });
  }
});

// POST /api/context/max-size - Set max context size
router.post('/max-size', express.json(), async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const { sessionId, maxSize } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to set max context size.' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    if (!maxSize || typeof maxSize !== 'number' || maxSize < 1000) {
      return res.status(400).json({ error: 'Valid max size is required (at least 1000 characters).' });
    }

    const result = await setMaxContextSize(userId, sessionId, maxSize);
    res.json({
      success: true,
      message: `Maximum context size updated to ${maxSize} characters.`,
      status: {
        maxSize: result.maxSize,
        currentSize: result.currentSize,
        percentUsed: result.percentUsed
      }
    });
  } catch (error) {
    console.error("API Error (POST /context/max-size):", error);
    res.status(500).json({ error: error.message || "Failed to set max context size." });
  }
});

// POST /api/context/mode - Set context mode
router.post('/mode', express.json(), async (req, res) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    const { sessionId, mode } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to set context mode.' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required.' });
    }

    if (!mode) {
      return res.status(400).json({ error: 'Mode is required.' });
    }

    const result = await setContextMode(userId, sessionId, mode);
    res.json({
      success: true,
      message: `Context mode set to ${mode}.`,
      status: {
        mode: result.mode,
        messageCount: result.messageCount,
        contextSize: result.contextSize,
        maxContextSize: result.maxContextSize,
        percentUsed: result.percentUsed
      }
    });
  } catch (error) {
    console.error("API Error (POST /context/mode):", error);
    res.status(500).json({ error: error.message || "Failed to set context mode." });
  }
});

// Admin only routes (requires additional middleware to check admin status)

// GET /api/context/admin/all - List all contexts (admin only)
router.get('/admin/all', async (req, res) => {
  try {
    // Simple admin check (should be replaced with proper middleware)
    const isAdmin = req.user?.isAdmin || req.session?.isAdmin || false;

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const contexts = await listAllContexts(100);
    res.json({
      success: true,
      count: contexts.length,
      contexts
    });
  } catch (error) {
    console.error("API Error (GET /context/admin/all):", error);
    res.status(500).json({ error: "Failed to retrieve all contexts." });
  }
});

export default router;