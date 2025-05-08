/**
 * AI Model Configuration Loader (Frontend Module)
 * Dynamically loads model configurations from JSON files served by the server.
 * Version: 8.0.0
 */

const AI_PROVIDERS = ['claude', 'gemini', 'chatgpt', 'grok', 'deepseek', 'llama'];
const CONFIG_PATH_PREFIX = '/config/'; // Path relative to public root

/**
 * Loads model configuration for a specific provider.
 * @param {string} provider - The provider name (e.g., 'claude', 'gemini').
 * @returns {Promise<Object|null>} The parsed model configuration object or null on error.
 */
async function loadModelConfiguration(provider) {
    const configPath = `${CONFIG_PATH_PREFIX}models-${provider}.json?v=${Date.now()}`; // Cache bust
    console.log(`ModelLoader: Loading config for ${provider} from ${configPath}`);
    try {
        const response = await fetch(configPath);
        if (!response.ok) {
            throw new Error(`Failed to load config for ${provider}: ${response.status} ${response.statusText}`);
        }
        const configData = await response.json();

        // Basic validation
        if (!configData || typeof configData !== 'object') {
            throw new Error(`Invalid JSON structure received for ${provider}.`);
        }
        if (configData.provider !== provider) {
             console.warn(`Provider mismatch in ${configPath}: expected '${provider}', got '${configData.provider}'. Proceeding anyway.`);
             // Allow mismatch but log it, maybe useful for custom configs
        }
        if (!configData.defaultModel || typeof configData.defaultModel !== 'string') {
            throw new Error(`Missing or invalid 'defaultModel' (string) in config for ${provider}.`);
        }
        if (!Array.isArray(configData.models)) {
            throw new Error(`Missing or invalid 'models' (array) in config for ${provider}.`);
        }
        if (!configData.models.some(m => m.id === configData.defaultModel)) {
             console.warn(`Default model '${configData.defaultModel}' not found in models list for ${provider}. Using first model as fallback.`);
             // Fallback: use the first model if default is invalid, prevents app crash
             if (configData.models.length > 0) {
                 configData.defaultModel = configData.models[0].id;
             } else {
                 throw new Error(`No models found in config for ${provider}, cannot determine default.`);
             }
        }


        console.log(`ModelLoader: Successfully loaded ${configData.models.length} models for ${provider}. Default: ${configData.defaultModel}`);
        return configData;
    } catch (error) {
        console.error(`ModelLoader: Error loading configuration for ${provider}:`, error);
        return null; // Return null to indicate failure for this provider
    }
}

/**
 * Loads all model configurations for the defined providers.
 * @returns {Promise<{defaultModels: Record<string, string>, availableModels: Record<string, Array<any>>>|null>} Object containing default and available models, or null if all fail.
 */
export async function loadAllModelConfigurations() {
    console.log("ModelLoader: Loading all model configurations...");
    const modelConfigurations = {
        defaultModels: {},
        availableModels: {}
    };
    let loadedSuccessfully = 0;

    const loadPromises = AI_PROVIDERS.map(async (provider) => {
        try {
            const config = await loadModelConfiguration(provider);
            if (config) {
                modelConfigurations.defaultModels[provider] = config.defaultModel;
                // Map to only include necessary fields for the dropdown/UI
                modelConfigurations.availableModels[provider] = config.models.map(model => ({
                    id: model.id,
                    name: model.name,
                    price: model.price,
                    // Optionally include description or features if needed by UI
                    description: model.description,
                    features: model.features || [],
                    contextLength: model.contextLength
                }));
                loadedSuccessfully++;
            } else {
                 console.warn(`ModelLoader: No configuration loaded for provider: ${provider}`);
                 // Assign empty arrays/null defaults to prevent errors downstream
                 modelConfigurations.defaultModels[provider] = null;
                 modelConfigurations.availableModels[provider] = [];
            }
        } catch (providerError) {
            console.error(`ModelLoader: Uncaught error processing ${provider}:`, providerError);
            modelConfigurations.defaultModels[provider] = null;
            modelConfigurations.availableModels[provider] = [];
        }
    });

    await Promise.all(loadPromises);

    if (loadedSuccessfully === 0) {
        console.error("ModelLoader: Failed to load configurations for ALL providers.");
        return null;
    }

    console.log("ModelLoader: All configurations loaded.", modelConfigurations);
    return modelConfigurations;
}