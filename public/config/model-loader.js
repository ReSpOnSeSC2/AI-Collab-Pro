/**
 * AI Model Configuration Loader
 * 
 * This module dynamically loads model configurations from JSON files.
 * To update models, simply edit the corresponding JSON file without
 * modifying app.js directly.
 */

// Cache for model configurations
const modelConfigurations = {
    defaultModels: {},
    availableModels: {}
};

// List of providers to load
const providers = ['claude', 'gemini', 'chatgpt', 'grok', 'deepseek', 'llama'];

/**
 * Loads all model configurations and initializes the application with them
 * Call this function during app startup
 */
async function loadAllModelConfigurations() {
    console.log("Loading model configurations from JSON files...");
    
    try {
        // Initialize model configurations
        for (const provider of providers) {
            try {
                const config = await loadModelConfiguration(provider);
                if (config) {
                    // Store default model as a string (not an array)
                    if (config.defaultModel) {
                        modelConfigurations.defaultModels[provider] = config.defaultModel;
                    } else {
                        console.warn(`No defaultModel specified in config for provider: ${provider}`);
                    }
                    
                    // Store available models array
                    modelConfigurations.availableModels[provider] = config.models.map(model => ({
                        id: model.id,
                        name: model.name,
                        price: model.price
                    }));
                    
                    console.log(`Successfully loaded ${config.models.length} models for ${provider}`);
                }
            } catch (providerError) {
                console.error(`Error loading configuration for ${provider}:`, providerError);
            }
        }
        
        console.log("Model configurations loaded successfully");
        return modelConfigurations;
    } catch (error) {
        console.error("Failed to load model configurations:", error);
        return null;
    }
}

/**
 * Loads model configuration for a specific provider
 * @param {string} provider - The provider name (e.g., 'claude', 'gemini')
 * @returns {Promise<Object|null>} The model configuration or null if it couldn't be loaded
 */
async function loadModelConfiguration(provider) {
    try {
        const configPath = `/config/models-${provider}.json`;
        console.log(`Loading model configuration from ${configPath}`);
        
        const response = await fetch(configPath);
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error loading model configuration for ${provider}:`, error);
        return null;
    }
}

/**
 * Updates the application's model configurations with the dynamically loaded ones
 * @param {Object} app - The application instance or configuration object
 */
function updateAppWithModelConfigurations(app) {
    // Ensure configurations were loaded
    if (!modelConfigurations.defaultModels || !modelConfigurations.availableModels 
        || Object.keys(modelConfigurations.defaultModels).length === 0) {
        console.error("Model configurations not loaded. Using defaults.");
        return false;
    }
    
    // Update default models
    if (app.DEFAULT_MODELS) {
        Object.keys(modelConfigurations.defaultModels).forEach(provider => {
            app.DEFAULT_MODELS[provider] = modelConfigurations.defaultModels[provider];
        });
    }
    
    // Update available models
    if (app.AVAILABLE_MODELS) {
        Object.keys(modelConfigurations.availableModels).forEach(provider => {
            app.AVAILABLE_MODELS[provider] = modelConfigurations.availableModels[provider];
        });
    }
    
    console.log("App model configurations updated successfully");
    return true;
}

// Export the functions for use in app.js
window.ModelLoader = {
    loadAllModelConfigurations,
    loadModelConfiguration,
    updateAppWithModelConfigurations
};