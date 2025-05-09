/**
 * AI Client Index
 * Initializes and exports configured AI clients.
 * Version: 8.0.0
 */

import dotenv from 'dotenv';
import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

dotenv.config(); // Load environment variables

// --- Helper: Check API Key ---
const checkApiKey = (keyName, value) => {
    if (!value || value.length < 10) { // Basic check
        console.warn(`⚠️ AI Client: ${keyName} is missing or seems invalid. Related AI features disabled.`);
        return false;
    }
    console.log(`✅ AI Client: ${keyName} configured.`);
    return true;
};

// --- Client Initialization ---

// Anthropic (Claude)
let anthropicClient = null;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const isClaudeAvailable = checkApiKey('ANTHROPIC_API_KEY', anthropicApiKey);
if (isClaudeAvailable) {
    try {
        anthropicClient = new Anthropic({ apiKey: anthropicApiKey });
        // Optional: Add a quick ping/test call here if desired
    } catch (error) {
        console.error("❌ AI Client: Failed to initialize Anthropic:", error.message);
    }
}

// Google Generative AI (Gemini)
let geminiClient = null;
const geminiApiKey = process.env.GEMINI_API_KEY;
const isGeminiAvailable = checkApiKey('GEMINI_API_KEY', geminiApiKey);
if (isGeminiAvailable) {
    try {
        geminiClient = new GoogleGenerativeAI(geminiApiKey);
        // Note: Specific model instances are created on demand in gemini.mjs
    } catch (error) {
        console.error("❌ AI Client: Failed to initialize GoogleGenerativeAI:", error.message);
    }
}

// OpenAI (for ChatGPT, Grok, DeepSeek, Llama compat)
let openaiClient = null;
const openaiApiKey = process.env.OPENAI_API_KEY;
const isOpenaiAvailable = checkApiKey('OPENAI_API_KEY', openaiApiKey);
if (isOpenaiAvailable) {
    try {
        openaiClient = new OpenAI({ apiKey: openaiApiKey });
    } catch (error) {
        console.error("❌ AI Client: Failed to initialize OpenAI:", error.message);
    }
}

let grokClient = null;
const grokApiKey = process.env.XAI_API_KEY;
const isGrokAvailable = checkApiKey('XAI_API_KEY', grokApiKey);
if (isGrokAvailable) {
    try {
        grokClient = new OpenAI({
            apiKey: grokApiKey,
            baseURL: 'https://api.x.ai/v1'
        });
    } catch (error) {
        console.error("❌ AI Client: Failed to initialize Grok client:", error.message);
    }
}

let deepseekClient = null;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const isDeepseekAvailable = checkApiKey('DEEPSEEK_API_KEY', deepseekApiKey);
if (isDeepseekAvailable) {
    try {
        deepseekClient = new OpenAI({
            apiKey: deepseekApiKey,
            baseURL: 'https://api.deepseek.com/v1'
        });
    } catch (error) {
        console.error("❌ AI Client: Failed to initialize DeepSeek client:", error.message);
    }
}

let llamaClient = null;
const llamaApiKey = process.env.LLAMA_API_KEY;
// Llama might not require a key if self-hosted or using certain providers
const isLlamaAvailable = checkApiKey('LLAMA_API_KEY', llamaApiKey); // Adjust check if key isn't always needed
const llamaBaseUrl = process.env.LLAMA_BASE_URL || "https://api.llama.com/compat/v1/"; // Allow overriding base URL
if (isLlamaAvailable || process.env.LLAMA_BASE_URL) { // Allow connection even without key if URL is set
    try {
        llamaClient = new OpenAI({
            apiKey: llamaApiKey || "dummy-key", // OpenAI client might require a key even if API doesn't
            baseURL: llamaBaseUrl,
        });
        console.log(`✅ AI Client: Llama client initialized for URL: ${llamaBaseUrl}`);
    } catch (error) {
        console.error("❌ AI Client: Failed to initialize Llama client:", error.message);
    }
}


// Add getResponse method to all clients before exporting
// This method is required by the collaboration module
if (anthropicClient) {
    anthropicClient.getResponse = async function(promptData, options) {
        try {
            const modelId = options?.modelId || 'claude-3-7-sonnet-20250219';
            console.log(`🔄 Claude getResponse using model: ${modelId}`);

            // Always include user message
            const messages = [{ role: 'user', content: promptData.userPrompt }];

            // Create request with or without system prompt
            const requestParams = {
                model: modelId,
                max_tokens: 4000,
                messages: messages,
            };

            // Only add system if provided and not empty
            if (promptData.systemPrompt && promptData.systemPrompt.trim()) {
                requestParams.system = promptData.systemPrompt;
                console.log(`📤 Claude sending with system and user message`);
            } else {
                console.log(`📤 Claude sending with user message only`);
            }

            const response = await anthropicClient.messages.create(requestParams);

            // Log successful response
            const content = response.content[0].text;
            console.log(`📥 Received Claude response (${content.length} chars)`);

            return content;
        } catch (error) {
            console.error(`Claude getResponse error:`, error);
            throw error;
        }
    };
}

if (geminiClient) {
    geminiClient.getResponse = async function(promptData, options) {
        try {
            const modelId = options?.modelId || 'gemini-2.5-pro-exp-03-25';
            console.log(`🔄 Gemini getResponse using model: ${modelId}`);

            // Create the model with appropriate configuration
            const model = geminiClient.getGenerativeModel({
                model: modelId,
                generationConfig: {
                    maxOutputTokens: 8192,
                    temperature: 0.7
                }
            });

            // Build the complete prompt with system instructions if available
            let fullPrompt = promptData.userPrompt;
            if (promptData.systemPrompt && promptData.systemPrompt.trim()) {
                fullPrompt = promptData.systemPrompt + "\n\n" + promptData.userPrompt;
            }

            console.log(`📤 Sending prompt to Gemini (${fullPrompt.length} chars)`);

            // Generate content with the complete prompt
            const result = await model.generateContent(fullPrompt);

            // Correctly extract text from the response with improved extraction
            let text;
            try {
                // Safe extraction with detailed logging
                console.log(`🔍 Gemini response structure keys:`, Object.keys(result).join(', '));

                if (result.text && typeof result.text === 'function') {
                    // Direct text() function on the result
                    text = result.text();
                    console.log(`📥 Got text from result.text() function`);
                } else if (result.response) {
                    console.log(`🔍 Gemini response.response keys:`, Object.keys(result.response).join(', '));

                    if (typeof result.response.text === 'function') {
                        // Text function on response object
                        text = result.response.text();
                        console.log(`📥 Got text from result.response.text() function`);
                    } else if (result.response.text) {
                        // Direct text property
                        text = result.response.text;
                        console.log(`📥 Got text from result.response.text property`);
                    } else if (result.response.candidates && result.response.candidates.length > 0) {
                        // Extract from candidates
                        const candidate = result.response.candidates[0];
                        console.log(`🔍 Candidate keys:`, Object.keys(candidate).join(', '));

                        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                            text = candidate.content.parts.map(part => part.text || '').join('');
                            console.log(`📥 Got text from candidate.content.parts`);
                        } else {
                            console.warn(`⚠️ Unexpected candidate structure in Gemini response`);
                            text = JSON.stringify(candidate);
                        }
                    } else if (result.response.parts && result.response.parts.length > 0) {
                        // Direct parts array
                        text = result.response.parts.map(part => part.text || '').join('');
                        console.log(`📥 Got text from result.response.parts`);
                    } else {
                        // Fallback for unknown structure
                        console.warn(`⚠️ Unknown Gemini response structure`);
                        text = JSON.stringify(result.response);
                    }
                } else {
                    // Last resort - stringify the whole result
                    console.warn(`⚠️ No response property in Gemini result`);
                    text = JSON.stringify(result);
                }

                console.log(`📥 Received Gemini response (${text.length} chars)`);

                // Fix for function reference returned as text
                if (text.includes('() => {') && text.includes('return getText(response)')) {
                    console.warn(`⚠️ Detected function reference in Gemini response. Providing fallback.`);
                    text = "I apologize, but I encountered an issue generating a proper response. Please try again or rephrase your question.";
                }
            } catch (textError) {
                console.error("Error extracting text from Gemini response:", textError);
                // Fallback to convert the entire response to a string
                text = JSON.stringify(result);
                console.log(`📥 Using fallback Gemini response handling (${text.length} chars)`);
            }

            return text;
        } catch (error) {
            console.error(`Gemini getResponse error:`, error);
            throw error;
        }
    };
}

// Add getResponse to OpenAI-compatible clients (OpenAI, Grok, DeepSeek, Llama)
const addOpenAIGetResponse = function(client, defaultModel) {
    if (client) {
        client.getResponse = async function(promptData, options) {
            try {
                const modelId = options?.modelId || defaultModel;
                console.log(`🔄 OpenAI-compatible getResponse using model: ${modelId}`);

                // Construct message array correctly - system message is optional
                const messages = [];

                // Only add system message if it's provided and not empty
                if (promptData.systemPrompt && promptData.systemPrompt.trim()) {
                    messages.push({ role: 'system', content: promptData.systemPrompt });
                }

                // Always include the user message
                messages.push({ role: 'user', content: promptData.userPrompt });

                console.log(`📤 OpenAI-compatible sending ${messages.length} messages`);

                const response = await client.chat.completions.create({
                    model: modelId,
                    messages: messages,
                    max_tokens: 4000,
                    temperature: 0.7
                });

                // Log successful response
                const content = response.choices[0].message.content;
                console.log(`📥 Received OpenAI-compatible response (${content.length} chars)`);

                return content;
            } catch (error) {
                console.error(`OpenAI-compatible getResponse error:`, error);
                throw error;
            }
        };
    }
};

// Add getResponse to all OpenAI-compatible clients with up-to-date model IDs
addOpenAIGetResponse(openaiClient, 'gpt-4o');
addOpenAIGetResponse(grokClient, 'grok-3-mini');
addOpenAIGetResponse(deepseekClient, 'deepseek-chat');
addOpenAIGetResponse(llamaClient, 'meta-llama/llama-3-8b-current');

// Special handling for DeepSeek to support both model options
if (deepseekClient) {
    deepseekClient.getResponse = async function(promptData, options) {
        try {
            // Use provided model ID or default to deepseek-chat
            // Options should be either 'deepseek-chat' or 'deepseek-reasoner'
            const modelId = options?.modelId || 'deepseek-chat';

            // Log which DeepSeek model is being used
            console.log(`🔄 Using DeepSeek model: ${modelId}`);

            const response = await deepseekClient.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: promptData.systemPrompt || '' },
                    { role: 'user', content: promptData.userPrompt }
                ],
                max_tokens: 8000, // DeepSeek supports up to 8k tokens output
                temperature: 0.7
            });
            return response.choices[0].message.content;
        } catch (error) {
            console.error(`DeepSeek getResponse error:`, error);
            throw error;
        }
    };
}

addOpenAIGetResponse(llamaClient, 'Llama-4-Maverick-17B-128E-Instruct-FP8');

// --- Export Clients and Availability Flags ---
export const clients = {
    anthropic: anthropicClient,
    gemini: geminiClient,
    openai: openaiClient,
    grok: grokClient,
    deepseek: deepseekClient,
    llama: llamaClient,
};

export const availability = {
    claude: !!anthropicClient,
    gemini: !!geminiClient,
    chatgpt: !!openaiClient, // Map chatgpt to the openai client availability
    grok: !!grokClient,
    deepseek: !!deepseekClient,
    llama: !!llamaClient,
};

// Create alternative mapping for collaboration with agent names
export const agentClients = {
    claude: anthropicClient,
    gemini: geminiClient,
    chatgpt: openaiClient,
    grok: grokClient,
    deepseek: deepseekClient,
    llama: llamaClient
};

// Helper function to get a client by provider name
export function getClient(providerName) {
    switch (providerName) {
        case 'claude': return clients.anthropic;
        case 'gemini': return clients.gemini;
        case 'chatgpt': return clients.openai;
        case 'grok': return clients.grok;
        case 'deepseek': return clients.deepseek;
        case 'llama': return clients.llama;
        default: return null;
    }
}

// Perform a detailed validation of client objects
function validateClientIntegrity() {
    console.log("🔍 Validating AI client integrity...");
    
    // Check how many clients are available
    const availableClientCount = Object.values(clients).filter(Boolean).length;
    console.log(`📊 ${availableClientCount} of ${Object.keys(clients).length} AI clients are available`);
    
    if (availableClientCount === 0) {
        console.error("❌ CRITICAL ERROR: No AI clients are available. Please check your API keys!");
    }
    
    // Check each client for expected methods
    Object.entries(clients).forEach(([name, client]) => {
        if (!client) {
            console.log(`⚠️ ${name} client not available - skipping validation`);
            return;
        }
        
        let methodsValid = false;
        
        if (name === 'anthropic') {
            methodsValid = client.messages && typeof client.messages.create === 'function';
            console.log(`${methodsValid ? '✅' : '❌'} ${name} client ${methodsValid ? 'has' : 'missing'} messages.create method`);
        } else if (name === 'gemini') {
            methodsValid = typeof client.getGenerativeModel === 'function';
            console.log(`${methodsValid ? '✅' : '❌'} ${name} client ${methodsValid ? 'has' : 'missing'} getGenerativeModel method`);
        } else {
            // OpenAI-compatible clients
            methodsValid = client.chat && client.chat.completions && typeof client.chat.completions.create === 'function';
            console.log(`${methodsValid ? '✅' : '❌'} ${name} client ${methodsValid ? 'has' : 'missing'} chat.completions.create method`);
        }
        
        if (!methodsValid) {
            console.log(`Available methods on ${name} client:`, Object.keys(client).join(', '));
        }
    });
    
    // Check that the availability flags match actual client availability
    Object.entries(availability).forEach(([agent, isAvailable]) => {
        const clientName = agent === 'claude' ? 'anthropic' : 
                          agent === 'chatgpt' ? 'openai' : agent;
        const clientExists = !!clients[clientName];
        
        if (isAvailable !== clientExists) {
            console.error(`❌ Availability mismatch for ${agent}: flag=${isAvailable}, actual=${clientExists}`);
        }
    });
    
    return availableClientCount > 0;
}

// Perform the validation
const clientsValid = validateClientIntegrity();
console.log(`AI Clients Initialized: ${clientsValid ? '✅ Valid' : '❌ Invalid'}`);
console.log("Availability status:", availability);