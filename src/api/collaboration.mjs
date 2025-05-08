/**
 * API Route Handler for Collaboration Settings
 */

import express from 'express';

const router = express.Router();

// --- Shared State (Import or Access) ---
// Assuming collaborationConfig is managed elsewhere (e.g., wsHandler or shared state)
// import { collaborationConfig, updateCollaborationStyle, updateCollaborationMode } from '../stateManager.mjs';
// Mocking for now:
const collaborationConfig = {
    styles: {
        balanced: { name: "Balanced", description: "...", promptDirective: "..." },
        contrasting: { name: "Contrasting", description: "...", promptDirective: "..." },
        harmonious: { name: "Harmonious", description: "...", promptDirective: "..." }
    },
    currentStyle: "balanced",
    mode: "collaborative",
    collaborationOrder: ["claude", "gemini", "chatgpt", "grok", "deepseek", "llama"]
};
const updateCollaborationStyle = (newStyle) => {
    if (collaborationConfig.styles[newStyle]) {
        collaborationConfig.currentStyle = newStyle;
        console.log(`API: Collaboration style updated to ${newStyle}`);
        // TODO: Broadcast change via WebSocket if needed
        return true;
    }
    return false;
};
const updateCollaborationMode = (newMode) => {
     if (['collaborative', 'individual'].includes(newMode)) {
        collaborationConfig.mode = newMode;
        console.log(`API: Collaboration mode updated to ${newMode}`);
        // TODO: Broadcast change via WebSocket if needed
        return true;
    }
    return false;
};
// --- End Mock ---

// GET /api/collaboration/config (Get current config)
router.get('/config', (req, res) => {
    try {
        res.json({
            currentStyle: collaborationConfig.currentStyle,
            mode: collaborationConfig.mode,
            collaborationOrder: collaborationConfig.collaborationOrder,
            availableStyles: Object.entries(collaborationConfig.styles).map(([id, style]) => ({ id, name: style.name, description: style.description })),
            availableModes: ['collaborative', 'individual']
        });
    } catch (error) {
        console.error("API Error (GET /collaboration/config):", error);
        res.status(500).json({ error: "Failed to retrieve collaboration config." });
    }
});

// POST /api/collaboration/style (Set collaboration style)
router.post('/style', express.json(), (req, res) => {
    const { style } = req.body;

    if (!style || !collaborationConfig.styles[style]) {
        return res.status(400).json({
            error: 'Invalid collaboration style provided.',
            availableStyles: Object.keys(collaborationConfig.styles)
        });
    }

    try {
        const updated = updateCollaborationStyle(style); // Use the shared update function
        if (updated) {
            res.json({
                success: true,
                currentStyle: collaborationConfig.currentStyle,
                message: `Collaboration style set to ${style}.`
            });
        } else {
             // Should not happen if validation passes, but good practice
             res.status(500).json({ error: "Failed to update collaboration style." });
        }
    } catch (error) {
        console.error("API Error (POST /collaboration/style):", error);
        res.status(500).json({ error: "Failed to update collaboration style." });
    }
});

// POST /api/collaboration/mode (Set collaboration mode)
router.post('/mode', express.json(), (req, res) => {
    const { mode } = req.body;

    if (!mode || !['collaborative', 'individual'].includes(mode)) {
        return res.status(400).json({
            error: 'Invalid collaboration mode provided.',
            availableModes: ['collaborative', 'individual']
        });
    }

    try {
        const updated = updateCollaborationMode(mode); // Use the shared update function
         if (updated) {
            res.json({
                success: true,
                mode: collaborationConfig.mode,
                message: `Collaboration mode set to ${mode}.`
            });
        } else {
             res.status(500).json({ error: "Failed to update collaboration mode." });
        }
    } catch (error) {
        console.error("API Error (POST /collaboration/mode):", error);
        res.status(500).json({ error: "Failed to update collaboration mode." });
    }
});

export default router;