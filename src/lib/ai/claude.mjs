/**
 * Claude AI Client Interaction Logic
 * Handles streaming responses from the Anthropic API.
 * Version: 8.0.0
 */

import { clients, availability } from './index.mjs'; // Import shared client and availability

export const DEFAULT_CLAUDE_MODEL = 'claude-4-sonnet-20250514'; // Default to Claude 4 Sonnet with extended thinking capabilities

/**
 * Streams a response from the Claude API.
 *
 * @param {string} modelId - The specific Claude model ID to use.
 * @param {string} prompt - The user's prompt/message.
 * @param {function(string): void} onChunk - Callback function for each received text chunk.
 * @param {function(): void} onComplete - Callback function when the stream is complete.
 * @param {function(Error): void} onError - Callback function for errors.
 */
export async function streamClaudeResponse(modelId, prompt, onChunk, onComplete, onError) {
    if (!availability.claude || !clients.anthropic) {
        onError(new Error("Claude API client is not available or not configured."));
        onComplete(); // Ensure completion is called even on error
        return;
    }

    const modelToUse = modelId || DEFAULT_CLAUDE_MODEL;
    console.log(`Claude Stream: Using model ${modelToUse}`);

    try {
        const stream = await clients.anthropic.messages.create({
            model: modelToUse,
            max_tokens: 64000, // Claude 3.7 Sonnet has a 64k token output limit
            messages: [{ role: 'user', content: prompt }],
            stream: true,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
                onChunk(chunk.delta.text);
            } else if (chunk.type === 'message_stop') {
                // Stream finished successfully
                console.log(`Claude Stream: Completed for model ${modelToUse}`);
            } else if (chunk.type === 'error') {
                 console.error(`Claude Stream Error (type ${chunk.error?.type}): ${chunk.error?.message}`);
                 // Don't throw here, let the main catch handle it after loop finishes or stream breaks
            }
        }
        onComplete();

    } catch (error) {
        console.error(`Claude Stream Error (model ${modelToUse}):`, error);
        // Check for specific Anthropic error types if needed
        // e.g., if (error instanceof Anthropic.APIError) { ... }
        onError(new Error(`Claude API Error: ${error.message || 'Unknown error'}`));
        onComplete(); // Ensure completion is called
    }
}