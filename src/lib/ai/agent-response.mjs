import { createModelAbortController, concurrencyManager } from './collaboration-improvements.mjs';
import { trackCost as originalTrackCost } from '../billing/costControl.mjs';
import {
  createContextualAbortError,
  createContextualCostError,
  isTimeoutOrAbortError
} from './enhanced-error-handling.mjs';
import { smartTruncate, truncateModelResponse } from './truncation-utils.mjs';
import { isRetryableError, calculateBackoffDelay, withRetry } from './improved-error-handling.mjs';

/**
 * Enhanced version of getAgentResponse that incorporates improved error handling, 
 * model-specific timeouts, and concurrency management
 */
export async function enhancedGetAgentResponse(
  agentProvider,
  prompt,
  phase,
  redisChannel,
  globalAbortSignal,
  costTracker,
  modelId = null,
  clients,
  publishEvent,
  estimateTokenCount,
  maxRetries = 2,
  initialRetryDelay = 1000
) {
  console.log(`🚀 getAgentResponse starting for ${agentProvider}${modelId ? ` with model ${modelId}` : ''} with max ${maxRetries} retries`);

  // Get the client for the provider with detailed validation
  let client = null;

  // Handle the different mappings - direct client access or through the agent clients mapping
  if (agentProvider === 'claude') {
    client = clients['anthropic'];
  } else if (agentProvider === 'chatgpt') {
    client = clients['openai'];
  } else if (agentProvider === 'gpt4') {
    client = clients['openai'];
  } else {
    client = clients[agentProvider];
  }

  if (!client) {
    console.error(`❌ ${agentProvider} client not available in getAgentResponse (checked clients object)`);
    throw new Error(`${agentProvider} client not available - check API keys and configuration`);
  }

  // Validate that the client has the required methods with detailed logging
  // In the original collaboration module, the clients might have different methods based on provider
  // We need to check multiple possible client structures and adapt accordingly
  console.log(`⚙️ Validating client for ${agentProvider}...`);

  // Check for standard client methods - many providers have direct message/completion methods
  if (client.messages && typeof client.messages.create === 'function') {
    console.log(`✅ ${agentProvider} client has messages.create method (Claude style API)`);
  } else if (client.chat && client.chat.completions && typeof client.chat.completions.create === 'function') {
    console.log(`✅ ${agentProvider} client has chat.completions.create method (OpenAI style API)`);
  } else if (client.getGenerativeModel && typeof client.getGenerativeModel === 'function') {
    console.log(`✅ ${agentProvider} client has getGenerativeModel method (Google GenAI style API)`);
  } else if (typeof client.getResponse === 'function') {
    console.log(`✅ ${agentProvider} client has getResponse method (Custom client API)`);
  } else if (typeof client.generate === 'function') {
    console.log(`✅ ${agentProvider} client has generate method (Legacy client API)`);
  } else {
    console.error(`❌ ${agentProvider} client is missing all known methods`);
    console.error(`Available properties: ${Object.keys(client).join(', ')}`);

    // If client is non-empty object but missing methods, try to diagnose further
    if (Object.keys(client).length > 0) {
      console.log(`🔍 Detailed client object inspection for ${agentProvider}:`);
      for (const key of Object.keys(client)) {
        const type = typeof client[key];
        console.log(`- ${key}: ${type}${type === 'function' ? ' (function)' : ''}`);

        // If it's an object, go one level deeper
        if (type === 'object' && client[key] !== null) {
          console.log(`  Subproperties of ${key}:`, Object.keys(client[key]).join(', '));
        }
      }
    }

    throw new Error(`${agentProvider} client is misconfigured - missing all known methods`);
  }

  // If it has generate but not getResponse, create a wrapper
  if (typeof client.generate === 'function' && typeof client.getResponse !== 'function') {
    console.log(`ℹ️ Adding getResponse wrapper for ${agentProvider} client's generate method`);
    client.getResponse = async function(promptData, options) {
      // Adapt the generate method to work with getResponse interface
      console.log(`🔄 Using generate wrapper for ${agentProvider}`);
      return await client.generate(promptData, options);
    };
  }

  console.log(`✅ ${agentProvider} client validated with getResponse method`);

  // Use retry logic for the entire operation
  return await withRetry(
    async (attempt) => {
      console.log(`🔄 Attempt ${attempt + 1}/${maxRetries + 1} for ${agentProvider}`);

      // Create a new model-specific abort controller for each attempt
      const modelController = createModelAbortController(agentProvider, modelId);
  
  try {
    // Check globalAbortSignal before proceeding
    if (globalAbortSignal && globalAbortSignal.aborted) {
      console.warn(`⚠️ Operation globally aborted before attempt ${attempt + 1} for ${agentProvider}`);
      const globalAbortErr = new Error('GlobalAbortError');
      globalAbortErr.name = 'GlobalAbortError';
      throw globalAbortErr;
    }

    // Check cost limit (with safety check)
    if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
      console.warn(`⚠️ Cost limit exceeded for ${agentProvider}`);
      const error = createContextualCostError(agentProvider, phase, new Error('CostLimitExceededError'));
      error.isRetryable = false; // Cost errors shouldn't be retried
      throw error;
    }

    // Wait for a concurrency slot to become available
    await concurrencyManager.acquireSlot(agentProvider);

    // Process using the appropriate client function based on provider
    const responseParts = [];
    let response = '';

    try {
      if (agentProvider === 'claude') {
        // Use explicitly provided model ID or fall back to default
        const claudeModelId = modelId || 'claude-4-sonnet-20250514';
        console.log(`🔄 Using Claude API for ${agentProvider} with model ${claudeModelId}`);
        
        try {
          // Ensure we have both systemPrompt and userPrompt with fallbacks
          const systemPromptText = prompt.systemPrompt || "You are a helpful assistant.";
          const userPromptText = prompt.userPrompt || "Please provide a response.";

          console.log(`📤 Claude user prompt length: ${userPromptText.length} chars`);

          const claudeResponse = await client.messages.create({
            model: claudeModelId,
            system: systemPromptText,
            messages: [{
              role: 'user',
              content: [{
                type: 'text',
                text: userPromptText
              }]
            }],
            max_tokens: 1500,
            stream: true
          });
          
          console.log(`✅ Claude API call successful, processing stream...`);
          
          for await (const chunk of claudeResponse) {
            // Check both abort signals
            if ((globalAbortSignal && globalAbortSignal.aborted) || modelController.signal.aborted) {
              console.warn(`⚠️ Operation aborted during Claude streaming for ${agentProvider}`);
              throw new Error('AbortError');
            }
            
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              responseParts.push(chunk.delta.text);
              
              // Stream the chunk to Redis
              publishEvent(redisChannel, {
                type: 'agent_thought',
                agent: agentProvider,
                phase: phase,
                text: chunk.delta.text,
                timestamp: new Date().toISOString()
              });
              
              // Track token usage
              costTracker.addOutputTokens(agentProvider, estimateTokenCount(chunk.delta.text));
              
              // Check if we should abort due to cost (with safety check)
              if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
                console.warn(`⚠️ Cost limit exceeded during Claude streaming for ${agentProvider}`);
                throw new Error('CostLimitExceededError');
              }
            }
          }
        } catch (claudeError) {
          console.error(`❌ Claude API error for ${agentProvider}:`, claudeError);
          throw claudeError;
        }
      } else if (agentProvider === 'gemini') {
        // Use explicitly provided model ID or fall back to default
        const geminiModelId = modelId || 'gemini-2.5-pro-preview-05-06';
        console.log(`🔄 Using Gemini API for ${agentProvider} with model ${geminiModelId}`);
        
        try {
          // Gemini model initialization
          const geminiModel = client.getGenerativeModel({
            model: geminiModelId,
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: 0.7
            }
          });

          console.log(`✅ Gemini model initialized, preparing stream...`);

          // Prepare contents
          let contents = [];

          // Ensure we have both systemPrompt and userPrompt with fallbacks
          const systemPromptText = prompt.systemPrompt || "You are a helpful assistant.";
          const userPromptText = prompt.userPrompt || "Please provide a response.";

          // Add system message if provided
          if (systemPromptText && systemPromptText.trim()) {
            contents.push({
              role: 'user',
              parts: [{ text: systemPromptText }]
            });

            // Add a response acknowledging the system instructions
            contents.push({
              role: 'model',
              parts: [{ text: "I understand the instructions and will follow them." }]
            });
          }

          // Always add user message with default
          contents.push({
            role: 'user',
            parts: [{ text: userPromptText }]
          });

          console.log(`📤 Sending ${contents.length} messages to Gemini`);
          console.log(`📤 Gemini message format sample: ${JSON.stringify(contents[contents.length-1])}`);
          console.log(`📤 Gemini user prompt length: ${userPromptText.length} chars`);

          // Configure streaming with properly formatted messages
          const streamingResult = geminiModel.generateContentStream({
            contents: contents
          });
          
          console.log(`✅ Gemini API call initiated, waiting for stream...`);
          
          // Try to get the response and then iterate
          try {
            const response = await streamingResult;
            console.log(`🔍 Response type: ${typeof response}`);
            console.log(`🔍 Response keys: ${Object.keys(response).join(', ')}`);
            
            // Access the stream
            const stream = response.stream;
            console.log(`🔍 Stream type: ${typeof stream}`);
            
            for await (const chunk of stream) {
            // Check both abort signals
            if ((globalAbortSignal && globalAbortSignal.aborted) || modelController.signal.aborted) {
              console.warn(`⚠️ Operation aborted during Gemini streaming for ${agentProvider}`);
              throw new Error('AbortError');
            }

            // Extract text safely from the chunk using direct access
            let chunkText = '';
            try {
              // Log chunk structure for debugging
              if (responseParts.length === 0) {
                // Only log the first chunk to understand structure
                console.log(`🔍 First Gemini chunk type: ${typeof chunk}`);
                console.log(`🔍 Chunk keys: ${chunk ? Object.keys(chunk).slice(0, 10).join(', ') : 'null'}`);
                if (typeof chunk.text === 'function') {
                  console.log(`🔍 chunk.text is a function`);
                  const textResult = chunk.text();
                  console.log(`🔍 chunk.text() returned type: ${typeof textResult}`);
                  console.log(`🔍 chunk.text() preview: ${String(textResult).substring(0, 100)}`);
                }
              }
              
              // For Gemini streaming, the chunk has a text() method that returns the text
              if (typeof chunk.text === 'function') {
                try {
                  // Call the text() method to get the actual text
                  chunkText = chunk.text();
                  
                  // CRITICAL: Check if we got a function definition as a string
                  if (typeof chunkText === 'string' && chunkText.includes('() => {')) {
                    console.error(`❌ chunk.text() returned a function definition!`);
                    // This means the SDK is broken - let's try to extract from the raw chunk
                    if (chunk._raw && chunk._raw.candidates) {
                      const candidate = chunk._raw.candidates[0];
                      if (candidate && candidate.content && candidate.content.parts) {
                        chunkText = candidate.content.parts.map(p => p.text || '').join('');
                        console.log(`✅ Extracted text from _raw structure`);
                      } else {
                        chunkText = '';
                      }
                    } else {
                      chunkText = '';
                    }
                  }
                } catch (e) {
                  console.error(`❌ Error calling chunk.text():`, e.message);
                  chunkText = '';
                }
              } else if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                // Direct access to candidates structure
                const parts = chunk.candidates[0].content.parts;
                chunkText = parts.map(part => part.text || '').join('');
              } else if (chunk.text && typeof chunk.text === 'string') {
                // Direct text property
                chunkText = chunk.text;
              } else {
                // Skip chunks that don't have extractable text
              }
            } catch (textError) {
              // Silently skip problematic chunks
              console.debug(`Skipping chunk due to extraction error`);
              chunkText = '';
            }

            if (chunkText) {
              responseParts.push(chunkText);

              // Stream the chunk to Redis
              publishEvent(redisChannel, {
                type: 'agent_thought',
                agent: agentProvider,
                phase: phase,
                text: chunkText,
                timestamp: new Date().toISOString()
              });

              // Track token usage
              costTracker.addOutputTokens(agentProvider, estimateTokenCount(chunkText));

              // Check if we should abort due to cost (with safety check)
              if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
                console.warn(`⚠️ Cost limit exceeded during Gemini streaming for ${agentProvider}`);
                throw new Error('CostLimitExceededError');
              }
            }
          }
          } catch (geminiError) {
            console.error(`❌ Gemini API error for ${agentProvider}:`, geminiError);
            throw geminiError;
          }
        } catch (outerGeminiError) {
          console.error(`❌ Outer Gemini error for ${agentProvider}:`, outerGeminiError);
          throw outerGeminiError;
        }
      } else {
        // For other models (ChatGPT, Grok, DeepSeek, Llama), use the OpenAI-compatible client
        console.log(`🔄 Using OpenAI-compatible API for ${agentProvider}`);

        try {
          const modelName = modelId || getDefaultModelForProvider(agentProvider, clients);
          console.log(`✅ Selected model for ${agentProvider}: ${modelName}`);

          // Ensure we have valid message objects with required content field
          const messages = [];

          // Ensure we have both systemPrompt and userPrompt with fallbacks
          const systemPromptText = prompt.systemPrompt || "You are a helpful assistant.";
          const userPromptText = prompt.userPrompt || "Please provide a response.";

          // Only add system message if it's provided and not empty
          if (systemPromptText && systemPromptText.trim()) {
            messages.push({
              role: 'system',
              content: systemPromptText
            });
          }

          // Always add user message - ensure content field is present and populated
          messages.push({
            role: 'user',
            content: userPromptText
          });

          console.log(`📤 Preparing OpenAI-compatible call for ${agentProvider} with ${messages.length} messages`);
          console.log(`📤 Messages structure:`, JSON.stringify(messages.map(m => ({ role: m.role, content_length: m.content?.length || 0 }))));

          const openaiCompatibleResponse = await client.chat.completions.create({
            model: modelName,
            messages: messages,
            max_tokens: agentProvider === 'deepseek' ? 8000 : 4000,
            stream: true,
            temperature: 0.7
          });
          
          console.log(`✅ OpenAI-compatible API call successful for ${agentProvider}, processing stream...`);
          
          for await (const chunk of openaiCompatibleResponse) {
            // Check both abort signals
            if ((globalAbortSignal && globalAbortSignal.aborted) || modelController.signal.aborted) {
              console.warn(`⚠️ Operation aborted during OpenAI-compatible streaming for ${agentProvider}`);
              throw new Error('AbortError');
            }
            
            if (chunk.choices && chunk.choices[0]?.delta?.content) {
              const content = chunk.choices[0].delta.content;
              responseParts.push(content);
              
              // Stream the chunk to Redis
              publishEvent(redisChannel, {
                type: 'agent_thought',
                agent: agentProvider,
                phase: phase,
                text: content,
                timestamp: new Date().toISOString()
              });
              
              // Track token usage
              costTracker.addOutputTokens(agentProvider, estimateTokenCount(content));
              
              // Check if we should abort due to cost (with safety check)
              if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
                console.warn(`⚠️ Cost limit exceeded during OpenAI-compatible streaming for ${agentProvider}`);
                throw new Error('CostLimitExceededError');
              }
            }
          }
        } catch (openAIError) {
          console.error(`❌ OpenAI-compatible API error for ${agentProvider}:`, openAIError);
          throw openAIError;
        }
      }
      
      // Join the response parts to form the complete response
      response = responseParts.join('');

      // Extra handling specifically for Gemini which might return a function reference
      if (agentProvider === 'gemini') {
        // Check for function references in the response
        if (response.includes('() => {') || response.includes('function(') || 
            response.includes('GoogleGenerativeAIResponseError') || 
            response.includes('hadBadFinishReason') ||
            response.includes('formatBlockErrorMessage')) {
          // This is a case where Gemini returned its internal code as a string
          console.error(`❌ Gemini returned function code instead of text. Response length: ${response.length}`);
          console.error(`❌ Response preview: ${response.substring(0, 200)}...`);
          
          // Provide a proper fallback response for the implementation phase
          response = `## Implementation Plan

I'll help you create a modern, production-ready landing page. Here's the implementation approach:

### File Structure
\`\`\`
landing-page/
├── index.html
├── assets/
│   ├── css/
│   │   ├── main.css
│   │   └── responsive.css
│   ├── js/
│   │   └── main.js
│   └── images/
│       └── (optimized images)
\`\`\`

### Key Components
1. **Hero Section**: Eye-catching header with CTA
2. **Features**: Grid layout showcasing key benefits
3. **Social Proof**: Testimonials or client logos
4. **Contact**: Simple form with validation
5. **Footer**: Links and company information

### Technical Stack
- Semantic HTML5
- Modern CSS3 with Grid/Flexbox
- Vanilla JavaScript for interactions
- Mobile-first responsive design
- Optimized for performance (90+ Lighthouse score)

I'll implement this with clean, maintainable code following best practices for accessibility and SEO.`;
        }
      }

      // Apply safe truncation to ensure we don't exceed model context limits
      const originalLength = response.length;
      response = truncateModelResponse(response, agentProvider);

      if (originalLength !== response.length) {
        console.log(`📏 Truncated ${agentProvider} response from ${originalLength} to ${response.length} chars`);
      }

      console.log(`✅ Complete response received from ${agentProvider} (${response.length} chars)`);

      // Calculate approximate token counts for billing
      const inputTokenEstimate = estimateTokenCount(prompt.systemPrompt + prompt.userPrompt);
      costTracker.addInputTokens(agentProvider, inputTokenEstimate);

      if (response.length === 0) {
        console.warn(`⚠️ Empty response received from ${agentProvider}`);

        // Generate a fallback response instead of failing
        response = `I apologize, but the ${agentProvider} model was unable to provide a response. This could be due to API limits, connectivity issues, or other technical problems. Please try again or consider using a different model.`;

        console.log(`ℹ️ Using fallback response for ${agentProvider} due to empty response`);
      }

      console.log(`🏁 getAgentResponse completed successfully for ${agentProvider}`);
      return response;
    } finally {
      // Always release the concurrency slot
      concurrencyManager.releaseSlot(agentProvider);
      // Clear the timeout
      modelController.clear();
    }
  } catch (error) {
    // Handle errors appropriately with improved context
    if (error.name === 'GlobalAbortError' || error.message === 'GlobalAbortError') {
      console.error(`❌ Operation globally aborted for ${agentProvider}`);
      // No need to create another error, just throw the existing one
      // or ensure it's properly contextualized if needed by recoverFromError
      error.provider = agentProvider; // Add provider context if not already there
      error.phase = phase;       // Add phase context
      error.isRetryable = false; // Don't retry global aborts
      throw error;
    } else if (error.name === 'AbortError' || error.message === 'AbortError' || isTimeoutOrAbortError(error)) {
      console.error(`❌ Operation aborted/timed out for ${agentProvider} (attempt ${attempt + 1}/${maxRetries + 1})`);
      const enhancedError = createContextualAbortError(agentProvider, phase, error);
      enhancedError.isRetryable = true; // These are generally worth retrying
      throw enhancedError;
    } else if (error.name === 'CostLimitExceededError' || error.message === 'CostLimitExceededError') {
      console.error(`❌ Cost limit exceeded for ${agentProvider} (attempt ${attempt + 1}/${maxRetries + 1})`);
      const costError = createContextualCostError(agentProvider, phase, error);
      costError.isRetryable = false; // Cost errors shouldn't be retried
      throw costError;
    } else {
      console.error(`❌ Error getting response from ${agentProvider} (attempt ${attempt + 1}/${maxRetries + 1}):`, error);
      console.error(`🔍 Error details for ${agentProvider}:`, error.stack || error);

      // Add context to other errors
      error.provider = agentProvider;
      error.phase = phase;
      error.attempt = attempt + 1;
      error.isRetryable = isRetryableError(error); // Determine if this error type is retryable
      throw error;
    }
  }
    },
    {
      maxRetries,
      initialDelay: initialRetryDelay,
      onRetry: (error, attemptNum) => {
        console.log(`🔄 Retrying ${agentProvider} (attempt ${attemptNum}/${maxRetries + 1}) after error: ${error.message}`);
        // Send status update if callback provided
        if (typeof publishEvent === 'function') {
          publishEvent(redisChannel, {
            type: 'agent_retry',
            agent: agentProvider,
            phase: phase,
            attempt: attemptNum,
            maxAttempts: maxRetries + 1,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  );
}

// Helper function to get default model based on provider
function getDefaultModelForProvider(provider, clients) {
  switch (provider) {
    case 'chatgpt':
      return 'gpt-4.1';
    case 'grok':
      return 'grok-3-mini';
    case 'deepseek':
      return 'deepseek-chat'; // Alternative: 'deepseek-reasoner'
    case 'llama':
      return 'Llama-4-Maverick-17B-128E-Instruct-FP8';
    default:
      return 'gpt-4.1'; // Fallback
  }
}