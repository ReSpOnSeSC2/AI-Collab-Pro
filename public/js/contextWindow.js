/**
 * Context Window Display for AI Collaboration Hub
 * Shows the smallest context window available among all selected models.
 * Version: 8.0.1
 */

// Define AI providers to match the application
const AI_PROVIDERS = ['claude', 'gemini', 'chatgpt', 'grok', 'deepseek', 'llama'];

// Define known context window sizes for each model type (in tokens)
const MODEL_CONTEXT_WINDOWS = {
    'claude': {
        // INPUT context windows (these are approximate based on documented values)
        input: {
            'default': 200000,
            'claude-3-5-sonnet': 200000,
            'claude-3-7-sonnet': 200000,
            'claude-3-5-opus': 200000,
            'claude-3-haiku': 200000,
            'claude-3-opus': 200000,
            'claude-3-sonnet': 200000,
            'claude-2': 100000,
            'claude-instant': 100000,
        },
        // OUTPUT context windows
        output: {
            'default': 128000,
            'claude-3-5-sonnet': 128000,
            'claude-3-7-sonnet': 128000,
            'claude-3-5-opus': 128000,
            'claude-3-haiku': 64000,
            'claude-3-opus': 128000,
            'claude-3-sonnet': 64000,
            'claude-2': 16000,
            'claude-instant': 12000,
        }
    },
    'gemini': {
        // INPUT context windows
        input: {
            'default': 1048576, // 1M tokens
            'gemini-2.5-pro-exp-03-25': 1048576,
            'gemini-2.5-pro': 1048576,
            'gemini-2.5-flash': 1048576,
            'gemini-1.5-pro': 1048576,
            'gemini-1.5-flash': 32000,
            'gemini-1.0-pro': 32000,
        },
        // OUTPUT context windows
        output: {
            'default': 65536, // Default Gemini 2.5 Pro output limit
            'gemini-2.5-pro-exp-03-25': 65536,
            'gemini-2.5-pro': 65536,
            'gemini-2.5-flash': 65536,
            'gemini-1.5-pro': 32000,
            'gemini-1.5-flash': 16000,
            'gemini-1.0-pro': 4000,
        }
    },
    'chatgpt': {
        // INPUT context windows
        input: {
            'default': 1048576, // 1M tokens for GPT-4.1 input
            'gpt-4.1': 1048576,
            'gpt-4.1L': 1048576,
            'gpt-4o': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4-vision-preview': 128000,
            'gpt-4': 8192,
            'gpt-3.5-turbo': 16000,
        },
        // OUTPUT context windows
        output: {
            'default': 32768, // Default GPT-4.1 output limit
            'gpt-4.1': 32768,
            'gpt-4.1L': 32768,
            'gpt-4o': 8192,
            'gpt-4-turbo': 4096,
            'gpt-4-vision-preview': 4096,
            'gpt-4': 4096,
            'gpt-3.5-turbo': 4096,
        }
    },
    'grok': {
        // INPUT context windows
        input: {
            'default': 1048576, // 1M tokens
            'grok-3-mini': 1048576,
            'grok-3-max': 1048576,
            'grok-3': 1048576,
            'grok-2': 64000,
            'grok-1.5': 32000,
        },
        // OUTPUT context windows
        output: {
            'default': 128000, // Grok-3 output limit
            'grok-3-mini': 128000,
            'grok-3-max': 128000,
            'grok-3': 128000,
            'grok-2': 8000,
            'grok-1.5': 4000,
        }
    },
    'deepseek': {
        // INPUT context windows
        input: {
            'default': 32000,
            'deepseek-chat': 32000,
            'deepseek-reasoner': 32000,
        },
        // OUTPUT context windows
        output: {
            'default': 8000, // DeepSeek output limit
            'deepseek-chat': 8000,
            'deepseek-reasoner': 8000,
        }
    },
    'llama': {
        // INPUT context windows
        input: {
            'default': 1048576, // 1M tokens for Llama-4
            'Llama-4-Maverick-17B-128E-Instruct-FP8': 1048576,
            'Llama-4-Gracie-35B-128E-Instruct-FP8': 1048576,
            'Llama-4-Glass-35B-256E-Instruct-FP8': 1048576,
            'Llama-3-70B-Instruct': 32000,
            'Llama-3-8B-Instruct': 16000,
        },
        // OUTPUT context windows
        output: {
            'default': 32768, // Llama-4 output limit
            'Llama-4-Maverick-17B-128E-Instruct-FP8': 32768,
            'Llama-4-Gracie-35B-128E-Instruct-FP8': 32768,
            'Llama-4-Glass-35B-256E-Instruct-FP8': 32768,
            'Llama-3-70B-Instruct': 8000,
            'Llama-3-8B-Instruct': 4000,
        }
    },
};

// Initial values for active models
let activeModels = {
    'claude': true,
    'gemini': true,
    'chatgpt': true,
    'grok': true,
    'deepseek': true,
    'llama': true
};

// Initial values for selected models
let selectedModels = {
    'claude': 'default',
    'gemini': 'default',
    'chatgpt': 'default',
    'grok': 'default',
    'deepseek': 'default',
    'llama': 'default'
};

/**
 * Update the context window displays for both input and output
 */
function updateContextWindowDisplay() {
    // Update input context window
    const inputContextWindow = document.getElementById('input-context-window-value');
    if (inputContextWindow) {
        const availableInputContext = calculateMinimumContextWindow('input');
        // Format the number with commas
        const formattedInputValue = availableInputContext.toLocaleString();
        inputContextWindow.textContent = formattedInputValue;
    }
    
    // Update output context window
    const outputContextWindow = document.getElementById('output-context-window-value');
    if (outputContextWindow) {
        const availableOutputContext = calculateMinimumContextWindow('output');
        // Format the number with commas
        const formattedOutputValue = availableOutputContext.toLocaleString();
        outputContextWindow.textContent = formattedOutputValue;
    }
}

/**
 * Calculate the minimum context window among all active models for the specified type
 * @param {string} contextType - Either 'input' or 'output'
 * @returns {number} Minimum context window size in tokens
 */
function calculateMinimumContextWindow(contextType) {
    let minWindow = Number.MAX_SAFE_INTEGER;
    
    // Check each active model
    for (const modelType in activeModels) {
        if (activeModels[modelType]) {
            const modelName = selectedModels[modelType];
            const contextSize = getModelContextWindow(modelType, modelName, contextType);
            minWindow = Math.min(minWindow, contextSize);
        }
    }
    
    // If no models are active or something went wrong, return a reasonable default
    return minWindow === Number.MAX_SAFE_INTEGER ? 4000 : minWindow;
}

/**
 * Get the context window size for a specific model and context type
 * @param {string} modelType - The type of model (claude, gemini, etc.)
 * @param {string} modelName - The specific model name
 * @param {string} contextType - Either 'input' or 'output'
 * @returns {number} Context window size in tokens
 */
function getModelContextWindow(modelType, modelName, contextType) {
    // If we have specific data for this model, use it
    if (MODEL_CONTEXT_WINDOWS[modelType] && 
        MODEL_CONTEXT_WINDOWS[modelType][contextType] && 
        MODEL_CONTEXT_WINDOWS[modelType][contextType][modelName]) {
        return MODEL_CONTEXT_WINDOWS[modelType][contextType][modelName];
    }
    
    // Otherwise use the default for this model type
    if (MODEL_CONTEXT_WINDOWS[modelType] && 
        MODEL_CONTEXT_WINDOWS[modelType][contextType] && 
        MODEL_CONTEXT_WINDOWS[modelType][contextType].default) {
        return MODEL_CONTEXT_WINDOWS[modelType][contextType].default;
    }
    
    // Ultimate fallback
    return contextType === 'input' ? 16000 : 4000;
}

/**
 * Initialize model toggles and selection listeners
 */
function initializeContextWindowListeners() {
    console.log('Initializing context window listeners');
    
    // Listen for model toggle changes
    const modelToggles = document.querySelectorAll('.model-toggle');
    modelToggles.forEach(toggle => {
        const modelType = toggle.dataset.model;
        
        // Set initial state
        activeModels[modelType] = toggle.checked;
        
        // Listen for changes
        toggle.addEventListener('change', function() {
            console.log(`Model toggle changed: ${modelType} = ${this.checked}`);
            activeModels[modelType] = this.checked;
            updateContextWindowDisplay();
        });
    });
    
    // Listen for model selection changes
    document.addEventListener('model-selected', function(event) {
        const { modelType, modelName } = event.detail;
        console.log(`Model selected event: ${modelType} = ${modelName}`);
        selectedModels[modelType] = modelName;
        updateContextWindowDisplay();
    });
    
    // Get current model selections from the UI
    updateCurrentModelSelections();
    
    // Run periodic updates to ensure accuracy
    updateContextWindowDisplay();
    
    // Set up an interval to periodically check the context window
    // This helps if the model toggles or selections change through other means
    setInterval(updateContextWindowDisplay, 2000);
}

/**
 * Update the current model selections based on what's shown in the UI
 */
function updateCurrentModelSelections() {
    // Update toggle states
    AI_PROVIDERS.forEach(provider => {
        const toggle = document.getElementById(`${provider}-toggle`);
        if (toggle) {
            activeModels[provider] = toggle.checked;
        }
        
        // Try to get the selected model name from the UI
        const selectedModelElement = document.querySelector(`.model-selected[data-target="${provider}"] .selected-model-name`);
        if (selectedModelElement && selectedModelElement.textContent && selectedModelElement.textContent !== 'Default Model') {
            // Try to find the actual model ID that matches this display name
            const modelConfig = window.appState?.availableModels?.[provider];
            if (modelConfig) {
                const matchingModel = modelConfig.find(m => m.name === selectedModelElement.textContent);
                if (matchingModel) {
                    selectedModels[provider] = matchingModel.id;
                    console.log(`Updated model selection from UI: ${provider} = ${matchingModel.id}`);
                }
            }
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // We might need to wait for the dynamic model selector components to initialize
    setTimeout(initializeContextWindowListeners, 1000);
});

// Listen for layout-ready event which fires when header/footer are injected
document.addEventListener('layout-ready', function() {
    // Reinitialize in case DOM has changed
    setTimeout(initializeContextWindowListeners, 1000);
});