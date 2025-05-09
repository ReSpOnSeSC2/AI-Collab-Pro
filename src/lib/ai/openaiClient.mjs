/**
 * OpenAI Compatible Client Interaction Logic
 * Handles streaming responses for OpenAI (ChatGPT), Grok, DeepSeek, Llama.
 * Version: 8.0.0
 */

import { clients, availability, getClient } from './index.mjs'; // Import shared clients/availability

// Default models for each provider using this client
const DEFAULT_MODELS = {
    chatgpt: 'gpt-4.1', // Default to GPT-4.1
    grok: 'grok-3-mini',
    deepseek: 'deepseek-chat', // Default - alternative is 'deepseek-reasoner'
    llama: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
};

/**
 * Streams a response from an OpenAI-compatible API.
 *
 * @param {'chatgpt' | 'grok' | 'deepseek' | 'llama'} provider - The provider name.
 * @param {string} modelId - The specific model ID to use.
 * @param {string} prompt - The user's prompt/message.
 * @param {function(string): void} onChunk - Callback function for each received text chunk.
 * @param {function(): void} onComplete - Callback function when the stream is complete.
 * @param {function(Error): void} onError - Callback function for errors.
 */
export async function streamOpenAICompatResponse(provider, modelId, prompt, onChunk, onComplete, onError) {
    const client = getClient(provider);
    const providerAvailable = availability[provider];

    if (!providerAvailable || !client) {
        onError(new Error(`${provider} API client is not available or not configured.`));
        onComplete();
        return;
    }

    const modelToUse = modelId || DEFAULT_MODELS[provider];
    if (!modelToUse) {
         onError(new Error(`No default model configured for provider: ${provider}`));
         onComplete();
         return;
    }

    console.log(`${provider} Stream: Using model ${modelToUse}`);

    // Construct messages array - potentially add system prompt based on provider
    const messages = [];
    if (provider === 'grok') {
        messages.push({ role: 'system', content: 'You are Grok, a helpful AI from xAI.' });
    } else if (provider === 'deepseek') {
         messages.push({ role: 'system', content: 'You are a helpful assistant from DeepSeek.' });
    }
    // Add other system prompts if needed for llama or specific chatgpt models
    messages.push({ role: 'user', content: prompt });

    try {
        // Set appropriate max_tokens based on provider
        let maxTokens = 32000; // Default for most models
        
        // DeepSeek has a lower max_tokens limit
        if (provider === 'deepseek') {
            maxTokens = 8000; // DeepSeek supports up to 8k tokens output
        }
        
        const stream = await client.chat.completions.create({
            model: modelToUse,
            messages: messages,
            stream: true,
            max_tokens: maxTokens,
            // Add other provider-specific parameters if needed
            // temperature: 0.7,
        });

        for await (const chunk of stream) {
            const chunkContent = chunk.choices[0]?.delta?.content || '';
            if (chunkContent) {
                onChunk(chunkContent);
            }
            // Check for finish reason if needed (e.g., length, stop sequence)
            // if (chunk.choices[0]?.finish_reason) {
            //     console.log(`${provider} Stream: Finish reason: ${chunk.choices[0].finish_reason}`);
            // }
        }
        console.log(`${provider} Stream: Completed for model ${modelToUse}`);
        onComplete();

    } catch (error) {
        console.error(`${provider} Stream Error (model ${modelToUse}):`, error);
        // Check for specific OpenAI APIError types
        // if (error instanceof OpenAI.APIError) { ... }
        onError(new Error(`${provider} API Error: ${error.message || 'Unknown error'}`));
        onComplete();
    }
}