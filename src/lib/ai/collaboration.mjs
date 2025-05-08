/**
 * AI Collaboration Logic
 * Orchestrates multi-AI responses based on selected style and mode.
 * Version: 8.0.0
 */

import { streamClaudeResponse } from './claude.mjs';
import { streamGeminiResponse } from './gemini.mjs';
import { streamOpenAICompatResponse } from './openaiClient.mjs';
import { availability, clients } from './index.mjs'; // Need clients for summary generation

// --- Collaboration Configuration (Potentially move to a shared config/state module) ---
const collaborationConfig = {
    styles: {
        balanced: { name: "Balanced", description: "AIs provide diverse perspectives with equal emphasis on agreements and differences.", promptDirective: "Provide your balanced perspective, noting both agreements and unique insights." },
        contrasting: { name: "Contrasting", description: "AIs emphasize different approaches and unique insights.", promptDirective: "Emphasize your unique perspective and reasoning approach, highlighting where you might differ from other AIs." },
        harmonious: { name: "Harmonious", description: "AIs work toward consensus while preserving some unique insights.", promptDirective: "While maintaining your unique voice, try to find common ground with other perspectives." }
    },
    // These should be updated by wsHandler based on client messages
    currentStyle: "balanced",
    mode: "collaborative",
    // Default order, can be customized
    collaborationOrder: ["claude", "gemini", "chatgpt", "grok", "deepseek", "llama"]
};

// Default models for summary generation if not specified
const DEFAULT_SUMMARY_MODELS = {
    chatgpt: 'gpt-4.1', // Use a cheaper, fast model for summary
    claude: 'claude-3-7-sonnet-20250219',
    gemini: 'gemini-2.5-pro-preview-05-06',
};

// --- Public Functions ---

/**
 * Updates the current collaboration style.
 * @param {string} newStyle - The new style ('balanced', 'contrasting', 'harmonious').
 * @returns {boolean} True if successful, false otherwise.
 */
export function setCollaborationStyle(newStyle) {
    if (collaborationConfig.styles[newStyle]) {
        collaborationConfig.currentStyle = newStyle;
        console.log(`Collaboration style set to: ${newStyle}`);
        return true;
    }
    console.warn(`Attempted to set invalid collaboration style: ${newStyle}`);
    return false;
}

/**
 * Updates the current collaboration mode.
 * @param {string} newMode - The new mode ('collaborative', 'individual').
 * @returns {boolean} True if successful, false otherwise.
 */
export function setCollaborationMode(newMode) {
    if (['collaborative', 'individual'].includes(newMode)) {
        collaborationConfig.mode = newMode;
        console.log(`Collaboration mode set to: ${newMode}`);
        return true;
    }
    console.warn(`Attempted to set invalid collaboration mode: ${newMode}`);
    return false;
}

/**
 * Gets the current collaboration configuration.
 * @returns {object} The current configuration.
 */
export function getCollaborationConfig() {
    // Return a copy to prevent direct modification
    return JSON.parse(JSON.stringify(collaborationConfig));
}


/**
 * Handles a collaborative chat request involving multiple AIs.
 *
 * @param {string} initialPrompt - The original user prompt.
 * @param {string[]} modelsToQuery - Array of provider IDs to include (e.g., ['claude', 'gemini']).
 * @param {Record<string, string[]>} requestedModels - Object mapping provider ID to specific model ID array (e.g., {claude: ['claude-3.7-sonnet']}).
 * @param {function(string, string): void} onChunk - Callback for individual AI response chunks (target, chunkText).
 * @param {function(string): void} onComplete - Callback when an individual AI finishes (target).
 * @param {function(string, Error): void} onError - Callback for errors from individual AIs (target, error).
 * @param {function(string): void} onSummaryChunk - Callback for summary response chunks.
 * @param {function(): void} onSummaryComplete - Callback when summary generation is complete.
 * @param {function(Error): void} onSummaryError - Callback for errors during summary generation.
 */
export async function handleCollaborativeDiscussion(
    initialPrompt,
    modelsToQuery,
    requestedModels,
    onChunk,
    onComplete,
    onError,
    onSummaryChunk,
    onSummaryComplete,
    onSummaryError
) {
    console.log(`Collaboration: Starting discussion for ${modelsToQuery.join(', ')}. Style: ${collaborationConfig.currentStyle}`);

    const orderedModels = [...modelsToQuery].sort(
        (a, b) => collaborationConfig.collaborationOrder.indexOf(a) - collaborationConfig.collaborationOrder.indexOf(b)
    );

    const responses = {};
    let accumulatedResponses = {}; // Store full response text for summary

    // Helper to stream response for a single AI
    const streamSingleAI = async (target, contextPrompt) => {
        const modelId = requestedModels[target]?.[0]; // Get the specific model requested
        accumulatedResponses[target] = ''; // Reset accumulator

        const streamFn = getStreamFunction(target);
        if (!streamFn) {
            onError(target, new Error(`No streaming function found for provider: ${target}`));
            onComplete(target);
            return;
        }

        await streamFn(
            modelId, // Pass specific model ID
            contextPrompt,
            (chunkText) => {
                onChunk(target, chunkText);
                accumulatedResponses[target] += chunkText;
            },
            () => onComplete(target),
            (error) => onError(target, error)
        );
    };

    // Execute AI responses sequentially
    let previousResponsesText = "";
    for (const target of orderedModels) {
        const style = collaborationConfig.styles[collaborationConfig.currentStyle] || collaborationConfig.styles.balanced;
        const contextPrompt = `You are ${target.toUpperCase()} in a collaborative AI discussion. The original user query was: "${initialPrompt}"\n${previousResponsesText}\nIt is now your turn. Based on the collaboration style '${style.name}' (${style.description}), ${style.promptDirective}. Provide your response.`;

        console.log(`Collaboration: ${target}'s turn. Prompt length: ${contextPrompt.length}`);
        await streamSingleAI(target, contextPrompt);

        // Update context for the next AI
        if (accumulatedResponses[target]) {
            previousResponsesText += `\n--- ${target.toUpperCase()} RESPONSE ---\n${accumulatedResponses[target]}\n`;
        } else {
             previousResponsesText += `\n--- ${target.toUpperCase()} RESPONSE ---\n*No response or error occurred.*\n`;
        }
    }

    console.log("Collaboration: Individual responses complete. Generating summary...");

    // --- Generate Summary ---
    try {
        let summaryPrompt = `Original User Query:\n${initialPrompt}\n\nAI Responses:\n`;
        summaryPrompt += previousResponsesText; // Use the accumulated text
        const styleName = collaborationConfig.styles[collaborationConfig.currentStyle]?.name || "Balanced";
        summaryPrompt += `\n\n--- TASK ---\nBased on the collaboration style '${styleName}', synthesize the key insights, agreements, and significant disagreements from the AI responses above. Provide a concise summary.`;

        // Choose a model for summary (prioritize available, cheaper models)
        let summaryProvider = null;
        let summaryModelId = null;

        if (availability.chatgpt) {
            summaryProvider = 'chatgpt';
            summaryModelId = DEFAULT_SUMMARY_MODELS.chatgpt;
        } else if (availability.claude) {
            summaryProvider = 'claude';
            summaryModelId = DEFAULT_SUMMARY_MODELS.claude;
        } else if (availability.gemini) {
            summaryProvider = 'gemini';
            summaryModelId = DEFAULT_SUMMARY_MODELS.gemini;
        } // Add other providers if suitable for summary

        if (!summaryProvider || !summaryModelId) {
            throw new Error("No suitable AI model available for generating the collaboration summary.");
        }

        console.log(`Collaboration: Generating summary using ${summaryProvider} model ${summaryModelId}`);

        const summaryStreamFn = getStreamFunction(summaryProvider);
        await summaryStreamFn(
            summaryModelId,
            summaryPrompt,
            onSummaryChunk, // Use dedicated summary chunk callback
            onSummaryComplete,
            onSummaryError
        );

    } catch (error) {
        console.error("Collaboration: Error generating summary:", error);
        onSummaryError(error);
        onSummaryComplete(); // Ensure completion is called even on error
    }
}

/**
 * Selects the appropriate streaming function based on the provider.
 * @param {string} provider - The AI provider ID.
 * @returns {Function|null} The streaming function or null if not found.
 */
function getStreamFunction(provider) {
    switch (provider) {
        case 'claude': return streamClaudeResponse;
        case 'gemini': return streamGeminiResponse;
        case 'chatgpt':
        case 'grok':
        case 'deepseek':
        case 'llama':
            // Curry the function to pass the provider name
            return (modelId, prompt, onChunk, onComplete, onError) =>
                streamOpenAICompatResponse(provider, modelId, prompt, onChunk, onComplete, onError);
        default:
            console.error(`Collaboration: No stream function found for provider ${provider}`);
            return null;
    }
}