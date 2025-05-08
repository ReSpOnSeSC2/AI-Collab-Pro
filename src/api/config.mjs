/**
 * API Route Handler for Model Configurations
 * Handles GET and POST requests for managing AI model JSON configurations.
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
// Navigate up two levels from src/api to the project root, then to public/config
const CONFIG_BASE_PATH = path.join(path.dirname(__filename), '../../public/config');

// --- Basic Authentication Middleware (Placeholder) ---
// In production, replace this with a robust authentication system (e.g., JWT, OAuth)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // Use environment variables!

function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    try {
        const encoded = authHeader.split(' ')[1];
        const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
        const [username, password] = decoded.split(':');

        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            next(); // Authenticated
        } else {
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials.' });
        }
    } catch (err) {
        res.status(400).json({ error: 'Bad Request', message: 'Invalid authentication header format.' });
    }
}

// --- Helper Functions ---

/**
 * Validates the provider name to prevent path traversal.
 * Allows only lowercase letters.
 * @param {string} provider
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidProviderName(provider) {
    return /^[a-z]+$/.test(provider);
}

/**
 * Validates the structure of the model configuration object.
 * @param {object} config - The configuration object to validate.
 * @param {string} expectedProvider - The provider name expected based on the URL.
 * @returns {{isValid: boolean, error?: string}} Validation result.
 */
function validateConfigStructure(config, expectedProvider) {
    if (!config || typeof config !== 'object') {
        return { isValid: false, error: 'Invalid configuration format - must be a JSON object.' };
    }
    if (config.provider !== expectedProvider) {
        return { isValid: false, error: `Provider mismatch: URL expects "${expectedProvider}" but config contains "${config.provider}".` };
    }
    if (!config.defaultModel || typeof config.defaultModel !== 'string') {
        return { isValid: false, error: 'Missing or invalid "defaultModel" (must be a string).' };
    }
    if (!Array.isArray(config.models)) {
        return { isValid: false, error: 'Missing or invalid "models" (must be an array).' };
    }
    // Optional: Check if models array is empty, depending on requirements
    // if (config.models.length === 0) {
    //     return { isValid: false, error: '"models" array cannot be empty.' };
    // }
    const modelIds = config.models.map(model => model?.id).filter(Boolean);
    if (config.models.length > 0 && !modelIds.includes(config.defaultModel)) {
         // Allow saving even if default isn't present, but maybe warn?
         console.warn(`Config Validation Warning: defaultModel "${config.defaultModel}" not found in models array for provider "${expectedProvider}".`);
         // If strict validation is needed, return:
         // return { isValid: false, error: `Invalid configuration: defaultModel "${config.defaultModel}" not found in models array.` };
    }
    // Add more checks for individual model structure if needed
    for (const model of config.models) {
        if (!model || typeof model !== 'object' || !model.id || !model.name || !model.price || !model.contextLength || !model.description || !Array.isArray(model.features)) {
             return { isValid: false, error: `Invalid model structure found in models array (missing required fields like id, name, price, etc.). Problematic model: ${JSON.stringify(model)}` };
        }
    }

    return { isValid: true };
}


// --- Route Handlers ---

// GET /api/model-config (List available providers/files) - Inherited from index.mjs mounting point
router.get('/', async (req, res) => {
    try {
        const files = await fs.readdir(CONFIG_BASE_PATH);
        const modelFiles = files.filter(file => file.startsWith('models-') && file.endsWith('.json'));
        const providers = modelFiles.map(file => file.replace(/^models-|\.json$/g, ''));

        res.json({ success: true, providers, files: modelFiles });
    } catch (error) {
        console.error('API Error (GET /model-config): Failed to list config files:', error);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve model configurations.' });
    }
});

// GET /api/model-config/:provider (Get specific config)
router.get('/:provider', async (req, res) => {
    const { provider } = req.params;

    if (!isValidProviderName(provider)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid provider name format.' });
    }

    const filePath = path.join(CONFIG_BASE_PATH, `models-${provider}.json`);

    try {
        const fileData = await fs.readFile(filePath, 'utf8');
        const config = JSON.parse(fileData); // Ensure JSON is parsed before sending
        res.json(config);
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Not Found', message: `Configuration for provider "${provider}" not found.` });
        } else if (error instanceof SyntaxError) {
            console.error(`API Error (GET /model-config/${provider}): Invalid JSON in file ${filePath}:`, error);
            res.status(500).json({ error: 'Internal Server Error', message: `Configuration file for ${provider} is corrupted.` });
        } else {
            console.error(`API Error (GET /model-config/${provider}): Failed to read config:`, error);
            res.status(500).json({ error: 'Internal Server Error', message: 'Failed to retrieve model configuration.' });
        }
    }
});

// POST /api/model-config/:provider (Save specific config)
router.post('/:provider', adminAuth, async (req, res) => {
    const { provider } = req.params;
    const config = req.body;

    if (!isValidProviderName(provider)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid provider name format.' });
    }

    const validation = validateConfigStructure(config, provider);
    if (!validation.isValid) {
        return res.status(400).json({ error: 'Bad Request', message: validation.error });
    }

    const filePath = path.join(CONFIG_BASE_PATH, `models-${provider}.json`);
    const backupFilePath = path.join(CONFIG_BASE_PATH, `models-${provider}.backup-${Date.now()}.json`);

    try {
        // Attempt to read existing file for backup
        try {
            const existingData = await fs.readFile(filePath, 'utf8');
            await fs.writeFile(backupFilePath, existingData, 'utf8');
            console.log(`Config backup created: ${backupFilePath}`);
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                throw new Error(`Failed to read existing file for backup: ${readError.message}`); // Throw if it's not a "file not found" error
            }
            // If file doesn't exist, no backup needed, proceed.
            console.log(`No existing config file found for ${provider}, creating new one.`);
        }

        // Write the new configuration (pretty-printed JSON)
        await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');

        res.json({
            success: true,
            message: `Configuration for ${provider} updated successfully.`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`API Error (POST /model-config/${provider}): Failed to save config:`, error);
        res.status(500).json({ error: 'Internal Server Error', message: 'Failed to save model configuration.' });
    }
});

// DELETE /api/model-config/:provider (Delete specific config)
router.delete('/:provider', adminAuth, async (req, res) => {
    const { provider } = req.params;

    if (!isValidProviderName(provider)) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid provider name format.' });
    }

    const filePath = path.join(CONFIG_BASE_PATH, `models-${provider}.json`);
    const backupFilePath = path.join(CONFIG_BASE_PATH, `models-${provider}.backup-${Date.now()}.json`);

    try {
        // Ensure file exists before trying to backup/delete
        await fs.access(filePath, fs.constants.F_OK);

        // Backup before deletion
        await fs.copyFile(filePath, backupFilePath);
        console.log(`Config backup created before deletion: ${backupFilePath}`);

        // Delete the file
        await fs.unlink(filePath);

        res.json({
            success: true,
            message: `Configuration for ${provider} deleted successfully (backup created).`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Not Found', message: `Configuration for provider "${provider}" not found.` });
        } else {
            console.error(`API Error (DELETE /model-config/${provider}): Failed to delete config:`, error);
            res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete model configuration.' });
        }
    }
});

export default router;