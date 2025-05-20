/**
 * Gemini AI Client Interaction Logic
 * Handles streaming responses from the Google Generative AI API.
 * Version: 8.0.0
 */

import { clients, availability } from './index.mjs'; // Import shared client and availability
import { HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro-preview-05-06'; // Default to the preview model instead of experimental
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

/**
 * Gets or creates a Gemini model instance.
 * Includes basic caching or retrieval logic if needed, currently just creates.
 * @param {string} modelId The ID of the model to get/create.
 * @returns {import('@google/generative-ai').GenerativeModel} The model instance.
 * @throws {Error} If the Gemini client is unavailable or model creation fails.
 */
function getGeminiModel(modelId) {
    if (!availability.gemini || !clients.gemini) {
        throw new Error("Gemini API client is not available or not configured.");
    }
    try {
        // Directly get model instance using the base client
        return clients.gemini.getGenerativeModel({
            model: modelId,
            safetySettings: SAFETY_SETTINGS,
            generationConfig: {
                maxOutputTokens: 65536, // Gemini 2.5 Pro supports exactly 65,536 tokens output with 1M input context
            }
        });
    } catch (error) {
        console.error(`Gemini: Failed to get model instance for ${modelId}:`, error);
        throw new Error(`Failed to initialize Gemini model ${modelId}: ${error.message}`);
    }
}

/**
 * Streams a response from the Gemini API.
 *
 * @param {string} modelId - The specific Gemini model ID to use.
 * @param {string} prompt - The user's prompt/message.
 * @param {function(string): void} onChunk - Callback function for each received text chunk.
 * @param {function(): void} onComplete - Callback function when the stream is complete.
 * @param {function(Error): void} onError - Callback function for errors.
 */
export async function streamGeminiResponse(modelId, prompt, onChunk, onComplete, onError) {
    const modelToUse = modelId || DEFAULT_GEMINI_MODEL;
    console.log(`Gemini Stream: Using model ${modelToUse}`);

    try {
        const modelInstance = getGeminiModel(modelToUse);
        // For simple text prompts, use generateContentStream
        const result = await modelInstance.generateContentStream(prompt);

        // Process the stream
        for await (const chunk of result.stream) {
            try {
                const chunkText = chunk.text(); // Throws if content is blocked
                onChunk(chunkText);
            } catch (chunkError) {
                 // Handle potential content blocking or other errors within a chunk
                 console.warn(`Gemini Stream: Error processing chunk for model ${modelToUse}:`, chunkError);
                 // Check if it's a safety block
                 if (result.response?.promptFeedback?.blockReason) {
                     const reason = result.response.promptFeedback.blockReason;
                     const safetyRatings = result.response.promptFeedback.safetyRatings;
                     console.warn(`Gemini Stream: Content blocked due to ${reason}. Ratings:`, safetyRatings);
                     onError(new Error(`Content blocked by Gemini safety filters: ${reason}`));
                 } else {
                     onError(new Error(`Error processing Gemini response chunk: ${chunkError.message}`));
                 }
                 // Stop processing further chunks on error? Or just skip the chunk?
                 // For now, we stop the stream by breaking the loop.
                 break;
            }
        }

        // Check for final response status after stream ends
        const finalResponse = await result.response;
        if (finalResponse?.promptFeedback?.blockReason) {
            const reason = finalResponse.promptFeedback.blockReason;
            console.warn(`Gemini Stream: Final response indicates content blocked due to ${reason}.`);
            onError(new Error(`Content blocked by Gemini safety filters: ${reason}`));
        } else {
            console.log(`Gemini Stream: Completed for model ${modelToUse}`);
        }
        onComplete();

    } catch (error) {
        console.error(`Gemini Stream Error (model ${modelToUse}):`, error);
        // Handle specific GoogleGenerativeAI errors if needed
        onError(new Error(`Gemini API Error: ${error.message || 'Unknown error'}`));
        onComplete();
    }
}