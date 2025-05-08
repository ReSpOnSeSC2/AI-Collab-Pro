/**
 * API Route Handler for AI Responses
 * Handles retrieving and managing saved AI conversation responses.
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
// Navigate up two levels from src/api to the project root, then to responses
const RESPONSES_DIR = path.join(path.dirname(__filename), '../../responses');

// Ensure responses directory exists
fs.mkdir(RESPONSES_DIR, { recursive: true })
    .then(() => console.log(`Responses directory ensured at: ${RESPONSES_DIR}`))
    .catch(err => console.error(`Error creating responses directory ${RESPONSES_DIR}:`, err));

// --- Global State (Import or Access Shared State if needed) ---
// Assuming latestResponses might be managed elsewhere (e.g., in wsHandler or a dedicated state module)
// For now, we'll mock it here if direct access isn't feasible.
// In a real scenario, import it: import { latestResponses } from '../stateManager.mjs';
const getLatestResponses = () => {
    // Placeholder: Replace with actual access to the shared latestResponses object
    // This might involve importing from wsHandler or a shared state module.
    // If wsHandler manages it, this API might need refactoring or wsHandler needs to expose it.
    console.warn("API responses.mjs: Using mocked latestResponses. Integrate with actual state.");
    return { claude: "Mock Claude Response", gemini: "Mock Gemini Response", summary: "Mock Summary" };
};

// --- Route Handlers ---

// GET /api/responses (Get latest in-memory responses)
router.get('/', (req, res) => {
    const latest = getLatestResponses(); // Access the actual latest responses
    res.json({
        timestamp: new Date().toISOString(),
        responses: latest,
        collaborativeSummary: latest.summary || null
    });
});

// GET /api/responses/markdown (Get latest as Markdown, save to file)
router.get('/markdown', async (req, res) => {
    const latest = getLatestResponses();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `responses_${timestamp}.md`;
    const filepath = path.join(RESPONSES_DIR, filename);

    let markdownResponse = `# Latest AI Responses (${new Date().toISOString()})\n\n`;
    markdownResponse += Object.entries(latest)
        .filter(([key]) => key !== 'summary') // Exclude summary from individual sections
        .map(([key, value]) =>
            `## ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n${value || "*No response recorded*"}\n`
        ).join("\n---\n\n"); // Add separator

    if (latest.summary) {
        markdownResponse += `\n---\n\n## Collaborative Summary\n\n${latest.summary}\n`;
    }

    try {
        await fs.writeFile(filepath, markdownResponse, 'utf8');
        console.log(`Saved responses to ${filepath}`);
        res.type('text/markdown').send(markdownResponse);
    } catch (err) {
        console.error('API Error (GET /responses/markdown): Error saving markdown file:', err);
        // Still send the markdown content even if saving failed
        res.type('text/markdown').status(500).send(`# Error Saving File\n\n${err.message}\n\n---\n\n${markdownResponse}`);
    }
});

// GET /api/responses/saved (List saved response files)
router.get('/saved', async (req, res) => {
    try {
        const files = await fs.readdir(RESPONSES_DIR);
        const mdFiles = await Promise.all(
            files
                .filter(file => file.startsWith('responses_') && file.endsWith('.md'))
                .map(async (file) => {
                    const fullPath = path.join(RESPONSES_DIR, file);
                    try {
                        const stats = await fs.stat(fullPath);
                        return {
                            filename: file,
                            // Provide a relative URL for the client to fetch the content
                            url: `/api/responses/saved/${encodeURIComponent(file)}`,
                            created: stats.birthtime,
                            modified: stats.mtime,
                            size: stats.size
                        };
                    } catch (statError) {
                        console.error(`Error stating file ${file}:`, statError);
                        return null; // Skip files that can't be stated
                    }
                })
        );

        const validFiles = mdFiles.filter(Boolean).sort((a, b) => b.created.getTime() - a.created.getTime()); // Sort newest first

        res.json({ success: true, count: validFiles.length, responses: validFiles });
    } catch (err) {
        console.error('API Error (GET /responses/saved): Error listing saved responses:', err);
        // If the directory doesn't exist, return an empty list gracefully
        if (err.code === 'ENOENT') {
            return res.json({ success: true, count: 0, responses: [] });
        }
        res.status(500).json({ success: false, error: 'Failed to list saved responses', details: err.message });
    }
});

// GET /api/responses/saved/:filename (Get content of a specific saved file)
router.get('/saved/:filename', async (req, res) => {
    const { filename } = req.params;

    // Basic validation/sanitization
    if (!filename || typeof filename !== 'string' || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename format.' });
    }
    // Ensure it matches expected pattern
    if (!/^responses_.*\.md$/.test(filename)) {
         return res.status(400).json({ error: 'Filename does not match expected pattern.' });
    }

    const filepath = path.join(RESPONSES_DIR, filename);

    try {
        // Check if file exists before reading
        await fs.access(filepath, fs.constants.R_OK);
        const contentText = await fs.readFile(filepath, 'utf8');
        res.type('text/markdown').send(contentText);
    } catch (err) {
        console.error(`API Error (GET /responses/saved/${filename}): Error reading file:`, err);
        if (err.code === 'ENOENT') {
            res.status(404).json({ error: 'File not found.' });
        } else if (err.code === 'EACCES') {
            res.status(403).json({ error: 'Permission denied.' });
        } else {
            res.status(500).json({ error: 'Failed to read saved response.', details: err.message });
        }
    }
});

export default router;