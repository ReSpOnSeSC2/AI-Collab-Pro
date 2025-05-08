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

console.log("AI Clients Initialized:", availability);