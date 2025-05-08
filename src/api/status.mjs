/**
 * API Status Endpoint Handler
 * Provides information about the server and AI service availability.
 */

import express from 'express';
import dotenv from 'dotenv';

dotenv.config(); // Ensure environment variables are loaded

const router = express.Router();

// Helper to check if an API key seems present (basic check)
const checkApiKey = (value) => {
    return !!value && value.length > 5; // Simple check for non-empty string > 5 chars
};

// Function to get the current status
export function getApiStatus() {
    // Check environment variables for API keys
    const claudeAvailable = checkApiKey(process.env.ANTHROPIC_API_KEY);
    const geminiAvailable = checkApiKey(process.env.GEMINI_API_KEY);
    const openaiAvailable = checkApiKey(process.env.OPENAI_API_KEY);
    const grokAvailable = checkApiKey(process.env.XAI_API_KEY);
    const deepseekAvailable = checkApiKey(process.env.DEEPSEEK_API_KEY);
    const llamaAvailable = checkApiKey(process.env.LLAMA_API_KEY);

    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: {
            version: '8.0.0', // Match package.json version
            uptime: process.uptime() // Server uptime in seconds
        },
        ai_status: {
            claude: claudeAvailable,
            gemini: geminiAvailable,
            chatgpt: openaiAvailable, // Keep 'chatgpt' key for frontend compatibility
            grok: grokAvailable,
            deepseek: deepseekAvailable,
            llama: llamaAvailable
        }
    };
}

// GET /api/check-api-status
router.get('/check-api-status', (req, res) => {
    try {
        const status = getApiStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting API status:', error);
        res.status(500).json({
            status: 'error',
            error: 'Internal server error while checking API status.',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/health (often used by load balancers/orchestrators)
router.get('/health', (req, res) => {
    try {
        // Simple health check - can be expanded later
        const status = getApiStatus();
        // Check if at least one AI service seems available (optional)
        const anyAiAvailable = Object.values(status.ai_status).some(available => available);

        res.json({
            status: 'ok', // Basic health is ok if server is running
            timestamp: status.timestamp,
            ai_services_configured: anyAiAvailable // Indicate if any keys are set
        });
    } catch (error) {
        console.error('Error handling /health endpoint:', error);
        res.status(500).json({
            status: 'error',
            error: 'Internal server error during health check.',
            timestamp: new Date().toISOString()
        });
    }
});


export default router;