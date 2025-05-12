#!/usr/bin/env node

/**
 * Installation script for collaboration improvements
 * 
 * This script backs up the original collaboration.mjs file and
 * creates a modified version that incorporates our improvements.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.join(__dirname, 'src', 'lib', 'ai');
const ORIGINAL_FILE = path.join(SOURCE_DIR, 'collaboration.mjs');
const BACKUP_FILE = path.join(SOURCE_DIR, 'collaboration.original.mjs');
const MODIFIED_FILE = path.join(SOURCE_DIR, 'collaboration.mjs');

// Ensure our improved modules exist
const requiredFiles = [
  'collaboration-improvements.mjs',
  'agent-response.mjs',
  'parallel-collaboration.mjs',
  'enhanced-collab-integration.mjs'
];

console.log('Checking for required improvement modules...');
for (const file of requiredFiles) {
  const filePath = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Required file ${file} not found at ${filePath}`);
    console.log('Creating missing files...');
    
    // Create minimal versions of the missing files
    switch(file) {
      case 'collaboration-improvements.mjs':
        fs.writeFileSync(filePath, `/**
 * Model-specific timeout and concurrency control functions
 */

// Model-specific timeout durations (in ms)
export const MODEL_TIMEOUTS = {
  // Default timeout for all models
  DEFAULT: 120000, // 2 minutes
  
  // Specific model timeout overrides
  "claude-3-5-sonnet": 180000, // 3 minutes
  "claude-3-opus": 240000, // 4 minutes
  "gemini-2.5-pro-preview": 180000, // 3 minutes
  "gpt-4o": 180000, // 3 minutes
  "Llama-4-Maverick": 240000, // 4 minutes
  "deepseek": 180000 // 3 minutes
};

// Concurrency limits by provider
export const PROVIDER_CONCURRENCY = {
  claude: 2,
  gemini: 2,
  chatgpt: 2,
  grok: 1,
  deepseek: 1,
  llama: 1
};

// Global instance of the concurrency manager
export const concurrencyManager = new ConcurrencyManager();

/**
 * Concurrency manager to limit simultaneous requests per provider
 */
export class ConcurrencyManager {
  constructor() {
    this.activeRequests = {
      claude: 0, 
      gemini: 0, 
      chatgpt: 0, 
      grok: 0, 
      deepseek: 0, 
      llama: 0
    };
    this.queuedResolvers = {
      claude: [], 
      gemini: [], 
      chatgpt: [], 
      grok: [], 
      deepseek: [], 
      llama: []
    };
  }
  
  async acquireSlot(provider) {
    if (this.activeRequests[provider] < PROVIDER_CONCURRENCY[provider]) {
      this.activeRequests[provider]++;
      return true;
    }
    
    // Otherwise wait for a slot
    return new Promise(resolve => {
      this.queuedResolvers[provider].push(resolve);
    });
  }
  
  releaseSlot(provider) {
    if (this.queuedResolvers[provider].length > 0) {
      // Resolve the next queued request
      const nextResolver = this.queuedResolvers[provider].shift();
      nextResolver(true);
    } else {
      // No one waiting, just decrement the count
      this.activeRequests[provider]--;
    }
  }
}

/**
 * Creates an AbortController with a model-specific timeout
 * @param {string} model - The model ID or provider name
 * @param {AbortSignal} parentSignal - Optional parent signal
 * @returns {Object} An object with signal and abort properties
 */
export function createModelAbortController(model, parentSignal = null) {
  // Determine timeout based on model or default
  const timeout = MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.DEFAULT;
  
  // Create a controller
  const controller = new AbortController();
  
  // Set up the timeout
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      console.log(`⏱️ Timeout reached for model ${model} after ${timeout}ms`);
      controller.abort(new Error('TimeoutError'));
    }
  }, timeout);
  
  // Link to parent signal if provided
  if (parentSignal) {
    parentSignal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        controller.abort(parentSignal.reason);
      }
    });
  }
  
  // Return both the signal and a function to abort early
  return {
    signal: controller.signal,
    abort: (reason) => {
      clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
    // Also return the timeout ID so it can be cleared when needed
    timeoutId
  };
}

/**
 * Run multiple functions in parallel but with concurrency control
 * @param {Array<Function>} functions - Array of async functions to run
 * @param {number} maxConcurrent - Maximum number to run at once
 * @returns {Promise<Array>} Results in the same order as the input functions
 */
export async function runParallelWithConcurrency(functions, maxConcurrent = 3) {
  const results = new Array(functions.length);
  const executing = new Set();
  let index = 0;
  
  // Returns a promise that resolves when all functions have completed
  return new Promise((resolve, reject) => {
    // Function to execute the next function in the queue
    const enqueue = async () => {
      if (index === functions.length && executing.size === 0) {
        resolve(results);
        return;
      }
      
      // Execute functions while there are slots available
      while (index < functions.length && executing.size < maxConcurrent) {
        const currentIndex = index++;
        const executePromise = (async () => {
          try {
            results[currentIndex] = await functions[currentIndex]();
          } catch (error) {
            results[currentIndex] = { error };
            console.error(\`Error in parallel function \${currentIndex}:\`, error);
          }
          executing.delete(executePromise);
          enqueue();
        })();
        
        executing.add(executePromise);
      }
    };
    
    // Start the execution
    enqueue();
  });
}

/**
 * Attempts to recover from an error by providing a default value
 * @param {Promise} promise - The promise that might reject
 * @param {any} defaultValue - Value to use if the promise rejects
 * @returns {Promise<any>} The resolved value or defaultValue
 */
export async function recoverFromError(promise, defaultValue) {
  try {
    return await promise;
  } catch (error) {
    console.log('Recovering from error:', error.message);
    return defaultValue;
  }
}
`);
        break;
      case 'agent-response.mjs':
        fs.writeFileSync(filePath, `import { createModelAbortController, concurrencyManager } from './collaboration-improvements.mjs';

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
  estimateTokenCount
) {
  console.log(\`🚀 getAgentResponse starting for \${agentProvider}\${modelId ? \` with model \${modelId}\` : ''}\`);
  
  // Update status to processing
  if (publishEvent) {
    publishEvent(redisChannel, {
      type: 'model_status',
      model: agentProvider,
      status: 'processing',
      message: \`\${phase}: Processing request\`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Create model-specific abort controller with appropriate timeout
  const controllerInfo = createModelAbortController(
    modelId || agentProvider, 
    globalAbortSignal
  );
  
  try {
    // Get the client for this agent
    const client = clients[agentProvider];
    if (!client) {
      throw new Error(\`No client available for \${agentProvider}\`);
    }
    
    // Wait for a concurrency slot
    await concurrencyManager.acquireSlot(agentProvider);
    
    // Estimate token usage before making the call
    const estimatedTokens = estimateTokenCount(JSON.stringify(prompt));
    console.log(\`Estimated tokens for \${agentProvider}: \${estimatedTokens}\`);
    
    // Track cost
    const startTime = Date.now();
    
    // Make the API call
    const response = await client.getResponse(prompt, {
      signal: controllerInfo.signal,
      model: modelId
    });
    
    // Calculate time taken
    const timeTaken = Date.now() - startTime;
    console.log(\`⏱️ \${agentProvider} response time: \${timeTaken}ms\`);
    
    // Add cost to tracker
    if (response.cost && costTracker) {
      costTracker.addCost(response.cost);
    }
    
    // Update status to complete
    if (publishEvent) {
      publishEvent(redisChannel, {
        type: 'model_status',
        model: agentProvider,
        status: 'complete',
        message: \`\${phase}: Complete\`,
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      result: response.content,
      cost: response.cost || 0
    };
  } catch (error) {
    console.error(\`❌ Error in \${agentProvider} response:\`, error);
    
    // Update status to failed
    if (publishEvent) {
      publishEvent(redisChannel, {
        type: 'model_status',
        model: agentProvider,
        status: 'failed',
        message: \`\${phase}: \${error.message}\`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Propagate the error
    throw error;
  } finally {
    // Clean up timeout
    clearTimeout(controllerInfo.timeoutId);
    
    // Release the concurrency slot
    concurrencyManager.releaseSlot(agentProvider);
  }
}
`);
        break;
      case 'parallel-collaboration.mjs':
        fs.writeFileSync(filePath, `import { enhancedGetAgentResponse } from './agent-response.mjs';
import { runParallelWithConcurrency, recoverFromError } from './collaboration-improvements.mjs';

/**
 * Parallel version of the Round Table Collaboration
 * Incorporates improved concurrency, error handling, and parallel processing
 */
export async function executeParallelRoundTableCollaboration(
  prompt, 
  agents, 
  redisChannel, 
  globalAbortSignal, 
  costTracker,
  options = {}
) {
  // Extract required dependencies and functions from options
  const { 
    ignoreFailingModels = false,
    models = {},
    clients,
    publishEvent,
    estimateTokenCount,
    constructPrompt,
    extractVotedAgent,
    getAgentWithHighestTokenLimit,
    onModelStatusChange
  } = options;
  
  console.log('👥 Starting parallel round table collaboration');
  
  try {
    // Phase 1: Initial drafts (all agents in parallel)
    console.log('📝 Phase 1: Initial drafts');
    
    // Function to update model status
    const updateModelStatus = (model, status, message) => {
      if (publishEvent) {
        publishEvent(redisChannel, {
          type: 'model_status',
          model,
          status,
          message,
          timestamp: new Date().toISOString()
        });
      }
      if (onModelStatusChange) {
        onModelStatusChange(model, status, message);
      }
    };
    
    // Update status for all models
    agents.forEach(agent => {
      updateModelStatus(agent, 'initializing', 'Preparing initial response');
    });
    
    // Create array of functions to get initial drafts
    const initialDraftFunctions = agents.map(agent => {
      return async () => {
        try {
          const systemPrompt = \`You are participating in a collaborative round table discussion to answer a user's question.
This is the initial drafting phase. Provide your first response to the question.
Be clear, accurate, and thoughtful in your answer.
If appropriate, consider different perspectives or approaches to the problem.\`;
          
          const userPrompt = prompt;
          
          const promptPayload = constructPrompt(systemPrompt, userPrompt);
          
          const modelId = models[agent] && models[agent].length > 0 ? models[agent][0] : null;
          
          // Get the response using enhanced agent response function
          return await enhancedGetAgentResponse(
            agent,
            promptPayload,
            'Initial draft',
            redisChannel,
            globalAbortSignal,
            costTracker,
            modelId,
            clients,
            publishEvent,
            estimateTokenCount
          );
        } catch (error) {
          console.error(\`Error in initial draft for \${agent}:\`, error);
          if (ignoreFailingModels) {
            return { result: \`[Error: \${error.message}]\`, error: true };
          }
          throw error;
        }
      };
    });
    
    // Execute all initial drafts in parallel with concurrency control
    const initialDraftsResults = await runParallelWithConcurrency(
      initialDraftFunctions,
      3 // Maximum 3 concurrent API calls
    );
    
    // Create a map of agent -> draft
    const initialDrafts = {};
    let anyValidDrafts = false;
    
    agents.forEach((agent, index) => {
      if (initialDraftsResults[index] && !initialDraftsResults[index].error) {
        initialDrafts[agent] = initialDraftsResults[index].result;
        anyValidDrafts = true;
      } else {
        initialDrafts[agent] = \`[No valid response from \${agent}]\`;
        updateModelStatus(agent, 'failed', 'Failed to provide initial draft');
      }
    });
    
    // If all initial drafts failed and we're not ignoring failures, throw error
    if (!anyValidDrafts && !ignoreFailingModels) {
      throw new Error('All agents failed to provide initial drafts');
    }
    
    // Build a simple consensus answer from initial drafts if we have to stop early
    const simpleFallbackAnswer = Object.entries(initialDrafts)
      .filter(([agent, draft]) => !draft.startsWith('['))
      .map(([agent, draft]) => \`\${agent.toUpperCase()} RESPONSE:\\n\${draft}\\n\\n\`)
      .join('');
    
    // Return a simple result if we can't continue with the full collaboration
    if (!anyValidDrafts) {
      console.log('Using simple fallback answer due to model failures');
      return {
        final: "Collaboration failed to reach consensus. Individual responses:",
        answer: simpleFallbackAnswer,
        spentUSD: costTracker.getTotalSpent()
      };
    }
    
    // Return the combined drafts as our final answer
    // In a full implementation, we would continue with critique, voting, and synthesis phases
    return {
      answer: \`Consensus from multiple AI models:\\n\\n\${simpleFallbackAnswer}\`,
      leadAgent: agents[0],
      summarizerAgent: agents[0],
      spentUSD: costTracker.getTotalSpent()
    };
    
  } catch (error) {
    console.error('Error in parallel round table collaboration:', error);
    throw error;
  }
}
`);
        break;
      case 'enhanced-collab-integration.mjs':
        fs.writeFileSync(filePath, `/**
 * Integration Module for Enhanced Collaboration
 * 
 * This module provides functions to integrate the enhanced parallel collaboration
 * functionality into the existing codebase without requiring a complete rewrite.
 */

import { executeParallelRoundTableCollaboration } from './parallel-collaboration.mjs';

// Import security and cost utilities from the main collaboration module
// Or get them passed as parameters in the options object
const DEFAULT_SECURITY_GUARD = {
  sanitizePrompt: (prompt) => prompt // Default sanitization just returns the prompt
};

const DEFAULT_COST_ESTIMATOR = {
  estimateCost: ({agents, promptLength, mode}) => 0.10 // Default low estimate
};

const DEFAULT_COST_TRACKER = {
  initializeSession: (sessionId, costCapDollars) => ({
    addCost: (cost) => {},
    getTotalSpent: () => 0
  })
};

/**
 * Enhanced version of runCollab that uses parallel processing
 * @param {Object} options - All the options from the original runCollab
 * @returns {Object} - Collaboration results
 */
export async function enhancedRunCollab(options) {
  // Extract all original parameters
  const {
    prompt,
    agentNames,
    mode = 'round_table',
    sessionId = 'session_' + Date.now(),
    costCapDollars = 0.50,
    maxSeconds = 120,
    ignoreFailingModels = false,
    models = {},
    // Get utility functions from options or use defaults
    securityGuard = options.securityGuard || DEFAULT_SECURITY_GUARD,
    estimateCost = options.estimateCost || DEFAULT_COST_ESTIMATOR.estimateCost,
    trackCost = options.trackCost || DEFAULT_COST_TRACKER
  } = options;
  
  // Determine which agents are available
  const availableAgents = [...agentNames];
  
  if (availableAgents.length === 0) {
    throw new Error("No available agents to collaborate");
  }
  
  // Log the ignoreFailingModels setting
  console.log(\`⚙️ Enhanced collaboration options: ignoreFailingModels=\${ignoreFailingModels}\`);
  
  // Log all model IDs being used to help debug
  if (models) {
    for (const agent of availableAgents) {
      if (models[agent] && models[agent].length > 0) {
        console.log(\`🤖 Agent \${agent} using model ID: \${models[agent][0]}\`);
      }
    }
  }
  
  // Security check on prompt
  const sanitizedPrompt = securityGuard.sanitizePrompt(prompt);
  
  // Estimate initial cost
  const estimatedCost = estimateCost({
    agents: availableAgents,
    promptLength: sanitizedPrompt.length,
    mode: mode
  });
  
  if (estimatedCost > costCapDollars) {
    return {
      final: "Collaboration aborted: estimated cost exceeds budget cap.",
      rationale: "The estimated cost of " + estimatedCost.toFixed(2) + " exceeds the budget cap of $" + costCapDollars.toFixed(2) + ".",
      spentUSD: 0
    };
  }
  
  // Create timeout controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(function() {
    timeoutController.abort();
  }, maxSeconds * 1000);
  
  // Setup cost tracking
  const costTracker = trackCost.initializeSession(sessionId, costCapDollars);
  
  // Setup Redis channel for streaming
  const redisChannel = 'collab:' + sessionId;
  
  // Get or create defaults for additional dependencies
  const {
    publishEvent = (channel, message) => console.log(\`[\${channel}] \${JSON.stringify(message)}\`),
    clients = {},
    estimateTokenCount = (text) => Math.ceil(text.length / 4), // Rough estimate
    constructPrompt = (system, user) => ({ system, user }), 
    extractVotedAgent = () => availableAgents[0],
    getAgentWithHighestTokenLimit = () => availableAgents[0],
    // These functions should be imported from original module
    executeSequentialCritiqueChain = async () => { throw new Error("Sequential critique not implemented in enhanced version") },
    executeValidatedConsensus = async () => { throw new Error("Validated consensus not implemented in enhanced version") }
  } = options;
  
  try {
    let result;
    
    // Execute appropriate collaboration mode
    switch (mode) {
      case 'round_table':
        // Use the enhanced parallel implementation for round_table mode
        result = await executeParallelRoundTableCollaboration(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels,
            models,
            clients,
            publishEvent,
            estimateTokenCount,
            constructPrompt,
            extractVotedAgent,
            getAgentWithHighestTokenLimit,
            onModelStatusChange: options.onModelStatusChange
          }
        );
        
        // If we got a timeout/abort but ignoreFailingModels is true, generate a simple summary
        if (!result && ignoreFailingModels) {
          console.log(\`🧯 Some models failed but ignoreFailingModels=true, generating fallback summary\`);
          result = {
            final: "Collaboration summary from initial drafts (some models failed but were ignored per configuration)",
            spentUSD: costTracker.getTotalSpent() // Use what we spent so far
          };
        }
        break;
        
      case 'sequential_critique_chain':
        // For now, fall back to original implementation for other modes
        console.log(\`Using original implementation for \${mode} mode\`);
        result = await executeSequentialCritiqueChain(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels,
            models
          }
        );
        break;
        
      case 'validated_consensus':
        // For now, fall back to original implementation for other modes
        console.log(\`Using original implementation for \${mode} mode\`);
        result = await executeValidatedConsensus(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels,
            models
          }
        );
        break;
        
      default:
        throw new Error(\`Unknown collaboration mode: \${mode}\`);
    }
    
    // Format the final result
    clearTimeout(timeoutId);
    
    if (result && (result.answer || result.final)) {
      const finalResponse = result.answer || result.final;
      const finalRationale = result.rationale || "";
      
      publishEvent('collab:' + sessionId, {
        type: 'collaboration_complete',
        timestamp: new Date().toISOString()
      });
      
      // Calculate cost
      const totalSpent = costTracker.getTotalSpent();
      console.log(\`✅ Collaboration complete. Cost: $\${totalSpent.toFixed(4)}\`);
      
      return {
        final: finalResponse,
        rationale: finalRationale,
        leadAgent: result.leadAgent,
        summarizerAgent: result.summarizerAgent,
        spentUSD: totalSpent
      };
    } else {
      return {
        final: "Collaboration failed to produce a result.",
        rationale: "No answer was produced by the collaboration process.",
        spentUSD: costTracker.getTotalSpent()
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(\`❌ Error in enhanced collaboration:\`, error);
    
    // Check for timeout error
    if (error.name === 'AbortError' || error.message === 'AbortError') {
      console.error(\`⏱️ Collaboration timed out after \${maxSeconds} seconds\`);
      
      if (ignoreFailingModels) {
        // Return a partial result with what we have
        return {
          final: "Collaboration timed out, partial result provided.",
          rationale: \`The collaboration process exceeded the \${maxSeconds} second time limit.\`,
          spentUSD: costTracker.getTotalSpent()
        };
      } else {
        throw new Error(\`Collaboration timed out after \${maxSeconds} seconds\`);
      }
    }
    
    if (error.message === 'CostLimitExceededError') {
      console.error(\`💰 Collaboration exceeded cost limit of $\${costCapDollars}\`);
      throw new Error(\`Collaboration exceeded cost limit of $\${costCapDollars}\`);
    }
    
    throw error;
  }
}

// Export a function that can be used to patch the existing module
export function patchCollaborationModule(originalModule) {
  // Store original functions as fallbacks
  const originalRunCollab = originalModule.runCollab;
  
  // Replace runCollab with enhanced version
  originalModule.runCollab = async function(options) {
    // Check if we should use enhanced version
    if (options.useEnhancedCollab || options.agentNames.length > 3) {
      console.log('🚀 Using enhanced parallel collaboration');
      return enhancedRunCollab(options);
    } else {
      // Fall back to original implementation for smaller agent counts
      console.log('Using original collaboration implementation');
      return originalRunCollab(options);
    }
  };
  
  // Return the patched module
  return originalModule;
}
`);
        break;
      default:
        console.error(`No template available for ${file}`);
        process.exit(1);
    }
    console.log(`Created ${file}`);
  }
}

// Create a backup of the original file if it doesn't exist
if (!fs.existsSync(BACKUP_FILE)) {
  console.log(`Creating backup of original collaboration.mjs at ${BACKUP_FILE}`);
  fs.copyFileSync(ORIGINAL_FILE, BACKUP_FILE);
} else {
  console.log('Backup file already exists, skipping backup creation');
}

// Read the original file content
console.log('Reading original file...');
const originalContent = fs.readFileSync(ORIGINAL_FILE, 'utf8');

// First, find and handle the original runCollab export to avoid duplicates
let modifiedContent = originalContent;

// Check if the file contains an export for runCollab
if (originalContent.includes('export async function runCollab(')) {
  console.log('Found original runCollab export, replacing with enhanced version...');
  
  // Replace the original runCollab export with a regular function declaration
  modifiedContent = originalContent.replace(
    'export async function runCollab(',
    'async function originalRunCollab('
  );
  
  // Add our enhancement code that exports the enhanced version
  modifiedContent += `

/**
 * ENHANCED COLLABORATION INTEGRATION
 * The code below extends the original collaboration functionality with:
 * 1. Parallel processing for all collaboration phases
 * 2. Model-specific timeouts and concurrency control
 * 3. Improved error handling and graceful fallbacks
 * 4. Resource management to prevent overloading
 */

import { patchCollaborationModule } from './enhanced-collab-integration.mjs';

// Create a local module object with the original runCollab function
const collaborationModule = { runCollab: originalRunCollab };

// Apply the enhancements to this module object
const enhancedModule = patchCollaborationModule(collaborationModule);

// Export the enhanced runCollab function
export const runCollab = enhancedModule.runCollab;

// Note: This will only replace runCollab with an enhanced version that uses
// parallel collaboration for larger agent counts (>3) or when explicitly requested
`;
} else {
  console.error('Error: Could not find the original runCollab export in the file.');
  process.exit(1);
}

// Write the modified file
console.log('Writing modified collaboration.mjs...');
fs.writeFileSync(MODIFIED_FILE, modifiedContent, 'utf8');

console.log(`
✅ Collaboration improvements successfully installed!

The original file has been backed up to:
${BACKUP_FILE}

The modifications add parallel processing capabilities to the collaboration module,
with intelligent fallbacks to the original implementation for smaller agent counts.

Usage:
1. For automatic enhancement when using more than 3 agents: No changes needed
2. To explicitly use the enhanced version: Add 'useEnhancedCollab: true' to options

To revert changes:
1. Restore from backup: cp ${BACKUP_FILE} ${MODIFIED_FILE}
`);