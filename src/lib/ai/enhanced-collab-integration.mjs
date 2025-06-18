/**
 * Integration Module for Enhanced Collaboration
 * 
 * This module provides functions to integrate the enhanced parallel collaboration
 * functionality into the existing codebase without requiring a complete rewrite.
 */

import { executeParallelRoundTableCollaboration } from './parallel-collaboration.mjs';
import { executeSequentialCritiqueChain } from './sequential-critique-chain.mjs';
import { applySequentialStyle, SEQUENTIAL_STYLES } from './sequential-style-options.mjs';
import { getOptimalAgentOrder } from './collaboration-options.mjs';
import { estimateCost as originalEstimateCost, trackCost as originalTrackCost } from '../billing/costControl.mjs';
// Import core collaboration functions directly to avoid circular imports
import { 
  executeCodeArchitect,
  executeAdversarialDebate, 
  executeExpertPanel,
  executeScenarioAnalysis,
  executeCreativeBrainstormSwarm,
  executeHybridGuardedBraintrust
} from './collaboration.mjs';

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
    getTotalSpent: () => 0,
    shouldAbort: () => false, // Add the missing shouldAbort function
    addInputTokens: (provider, tokens) => {},
    addOutputTokens: (provider, tokens) => {},
    getUsageDetails: () => ({ usage: {}, totalCost: 0 })
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
    // Handle both options.agents (used in server code) and options.agentNames (used in enhanced version)
    agentNames,
    agents,
    mode = 'round_table',
    sessionId = 'session_' + Date.now(),
    costCapDollars = 0.50,
    maxSeconds = 120,
    ignoreFailingModels = false,
    models = {},
    // Get utility functions from options or use imported versions or defaults
    securityGuard = options.securityGuard || DEFAULT_SECURITY_GUARD,
    estimateCost = options.estimateCost || originalEstimateCost || DEFAULT_COST_ESTIMATOR.estimateCost,
    trackCost = options.trackCost || originalTrackCost || DEFAULT_COST_TRACKER
  } = options;
  
  // Determine which agents are available (handle both naming conventions)
  const availableAgents = [...(agents || agentNames || [])];
  
  if (availableAgents.length === 0) {
    throw new Error("No available agents to collaborate");
  }
  
  // Log the ignoreFailingModels setting
  console.log(`⚙️ Enhanced collaboration options: ignoreFailingModels=${ignoreFailingModels}`);
  
  // Log all model IDs being used to help debug
  if (models) {
    for (const agent of availableAgents) {
      if (models[agent] && models[agent].length > 0) {
        console.log(`🤖 Agent ${agent} using model ID: ${models[agent][0]}`);
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
  
  // Setup cost tracking with validation
  let costTracker;
  
  try {
    // Use the trackCost from the options or imported version
    costTracker = trackCost.initializeSession(sessionId, costCapDollars);
    
    // Ensure the costTracker has all required methods
    if (!costTracker.shouldAbort) {
      console.warn('CostTracker missing shouldAbort method, adding default implementation');
      costTracker.shouldAbort = () => false;
    }
    if (!costTracker.getTotalSpent) {
      console.warn('CostTracker missing getTotalSpent method, adding default implementation');
      costTracker.getTotalSpent = () => 0;
    }
  } catch (error) {
    console.error('Error initializing cost tracker, using fallback:', error);
    // Use a fallback implementation if trackCost.initializeSession fails
    costTracker = {
      addCost: (cost) => {},
      getTotalSpent: () => 0,
      shouldAbort: () => false,
      addInputTokens: (provider, tokens) => {},
      addOutputTokens: (provider, tokens) => {},
      getUsageDetails: () => ({ usage: {}, totalCost: 0 })
    };
  }
  
  // Setup Redis channel for streaming
  const redisChannel = 'collab:' + sessionId;
  
  // Get or create defaults for additional dependencies
  const {
    publishEvent = (channel, message) => console.log(`[${channel}] ${JSON.stringify(message)}`),
    clients = {},
    estimateTokenCount = (text) => Math.ceil(text.length / 4), // Rough estimate
    constructPrompt = (promptText, agent, instruction) => ({
      systemPrompt: instruction || "You are a helpful assistant.",
      userPrompt: promptText || "Please provide a response."
    }),
    extractVotedAgent = () => availableAgents[0],
    getAgentWithHighestTokenLimit = () => availableAgents[0],
    // We now import the actual executeSequentialCritiqueChain function,
    // but keep this as a fallback option in case we need to override
    customExecuteSequentialCritiqueChain = null,
    executeValidatedConsensus = async () => { throw new Error("Validated consensus not implemented in enhanced version") }
  } = options;
  
  // Validate that clients are available for all agents
  console.log("🔍 Validating AI clients availability...");
  console.log("Available agents:", availableAgents);
  console.log("Available clients:", Object.keys(clients));
  
  // First check if clients object is empty
  if (!clients || typeof clients !== 'object' || Object.keys(clients).length === 0) {
    console.error("❌ CRITICAL ERROR: clients object is empty or not an object", clients);
    throw new Error("No AI clients were provided to the collaboration module. This is a configuration issue.");
  }
  
  // Check which clients are missing
  const missingClients = [];
  for (const agent of availableAgents) {
    if (!clients[agent]) {
      console.error(`❌ Client for ${agent} is not available!`);
      missingClients.push(agent);
    } else {
      // Verify client has required methods
      if (typeof clients[agent].getResponse !== 'function') {
        console.error(`❌ Client for ${agent} is available but missing getResponse() method!`);
        console.error(`Available methods:`, Object.keys(clients[agent]).join(', '));
        missingClients.push(agent);
      } else {
        console.log(`✅ Client for ${agent} is available and valid`);
      }
    }
  }
  
  if (missingClients.length > 0) {
    console.error(`❌ Missing or invalid clients for: ${missingClients.join(', ')}`);
    if (missingClients.length === availableAgents.length) {
      throw new Error(`No valid AI clients available. Please check your API keys and configuration.`);
    }
  }
  
  try {
    let result;
    
    // Execute appropriate collaboration mode
    switch (mode) {
      case 'round_table':
        try {
          // Use the enhanced parallel implementation for round_table mode
          console.log(`🚀 Executing parallel round table collaboration with ${availableAgents.length} agents`);
          
          // Log important parameters for troubleshooting
          console.log(`📋 Collaboration options:
          - ignoreFailingModels: ${ignoreFailingModels}
          - models: ${JSON.stringify(models)}
          - prompt length: ${sanitizedPrompt.length}
          - available clients: ${Object.keys(clients).join(', ')}
          - available agents: ${availableAgents.join(', ')}
          `);
          
          result = await executeParallelRoundTableCollaboration(
            sanitizedPrompt, 
            availableAgents, 
            redisChannel, 
            timeoutController.signal, 
            costTracker,
            {
              ignoreFailingModels: true, // Always set to true so we can handle errors at this level
          skipSynthesisIfAllFailed: options.skipSynthesisIfAllFailed || false,
          continueWithAvailableModels: options.continueWithAvailableModels || false,
          keepLoadingUntilComplete: options.keepLoadingUntilComplete || true,
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
        } catch (collaborationError) {
          console.error(`❌ Error in parallel round table collaboration:`, collaborationError);
          
          // If ignoreFailingModels is true, generate a simple summary
          if (ignoreFailingModels) {
            console.log(`🧯 Collaboration error but ignoreFailingModels=true, generating fallback summary`);
            result = {
              final: `I encountered an issue with the collaboration process: ${collaborationError.message}. Here's a simple response: The AI models were unable to collaborate effectively. Please try again with a different prompt or check API configurations.`,
              rationale: `Original error: ${collaborationError.stack || collaborationError.message}`,
              spentUSD: costTracker.getTotalSpent() // Use what we spent so far
            };
          } else {
            // If ignoreFailingModels is false, rethrow the error
            throw collaborationError;
          }
        }
        
        // If we still don't have a result and ignoreFailingModels is true, generate a simple summary
        if (!result && ignoreFailingModels) {
          console.log(`🧯 No result but ignoreFailingModels=true, generating fallback summary`);
          result = {
            final: "Collaboration summary could not be generated. The AI models encountered issues during collaboration.",
            spentUSD: costTracker.getTotalSpent() // Use what we spent so far
          };
        }
        break;
        
      case 'sequential_critique_chain':
        try {
          console.log(`🚀 Executing sequential critique chain with ${availableAgents.length} agents`);

          // Get optimal agent order for sequential critique
          const orderedAgents = getOptimalAgentOrder(availableAgents, 'sequentialCritique');
          console.log(`📋 Ordered agents for sequential chain: ${orderedAgents.join(', ')}`);

          // Determine which style option to use
          const sequentialStyle = options.sequentialStyle || 'balanced';
          console.log(`🎨 Using sequential style option: ${sequentialStyle}`);

          // Use override function if provided, otherwise use our imported function
          const sequentialCritiqueFunction = customExecuteSequentialCritiqueChain || executeSequentialCritiqueChain;

          result = await sequentialCritiqueFunction(
            sanitizedPrompt,
            orderedAgents,
            redisChannel,
            timeoutController.signal,
            costTracker,
            {
              ignoreFailingModels,
              continueWithAvailableModels: options.continueWithAvailableModels || true,
              styleOption: sequentialStyle,
              models,
              clients,
              publishEvent,
              estimateTokenCount,
              constructPrompt,
              onModelStatusChange: options.onModelStatusChange
            }
          );
        } catch (sequentialError) {
          console.error(`❌ Error in sequential critique chain:`, sequentialError);

          // If ignoreFailingModels is true, generate a simple summary
          if (ignoreFailingModels) {
            console.log(`🧯 Sequential chain error but ignoreFailingModels=true, generating fallback summary`);
            result = {
              answer: `I encountered an issue with the sequential critique chain: ${sequentialError.message}. Here's a simple response: The AI models were unable to complete the sequential critique process effectively. Please try again with a different prompt or check API configurations.`,
              leadAgent: availableAgents[0],
              iterations: [],
              spentUSD: costTracker.getTotalSpent() // Use what we spent so far
            };
          } else {
            // If ignoreFailingModels is false, rethrow the error
            throw sequentialError;
          }
        }
        break;
        
      case 'validated_consensus':
        // For now, fall back to original implementation for other modes
        console.log(`Using original implementation for ${mode} mode`);
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
        
      case 'code_architect':
        console.log(`🏗️ Executing code architect mode with ${availableAgents.length} agents`);
        try {
          result = await executeCodeArchitect(
            sanitizedPrompt,
            availableAgents,
            redisChannel,
            timeoutController.signal,
            costTracker,
            options
          );
        } catch (codeArchitectError) {
          if (ignoreFailingModels) {
            console.log(`🧯 Code architect error but ignoreFailingModels=true, generating fallback`);
            result = {
              answer: `I encountered an issue with code architect collaboration: ${codeArchitectError.message}. Partial results available.`,
              rationale: "Code architect collaboration failed, but continuing with fallback due to ignoreFailingModels setting.",
              spentUSD: costTracker.getTotalSpent()
            };
          } else {
            throw codeArchitectError;
          }
        }
        break;
        
      case 'adversarial_debate':
        console.log(`⚖️ Executing adversarial debate mode with ${availableAgents.length} agents`);
        try {
          result = await executeAdversarialDebate(
            sanitizedPrompt,
            availableAgents,
            redisChannel,
            timeoutController.signal,
            costTracker
          );
        } catch (debateError) {
          if (ignoreFailingModels) {
            result = {
              answer: `Adversarial debate encountered issues: ${debateError.message}`,
              rationale: "Debate collaboration failed but continuing with fallback.",
              spentUSD: costTracker.getTotalSpent()
            };
          } else {
            throw debateError;
          }
        }
        break;
        
      case 'expert_panel':
        console.log(`👥 Executing expert panel mode with ${availableAgents.length} agents`);
        try {
          result = await executeExpertPanel(
            sanitizedPrompt,
            availableAgents,
            redisChannel,
            timeoutController.signal,
            costTracker
          );
        } catch (panelError) {
          if (ignoreFailingModels) {
            result = {
              answer: `Expert panel encountered issues: ${panelError.message}`,
              rationale: "Panel collaboration failed but continuing with fallback.",
              spentUSD: costTracker.getTotalSpent()
            };
          } else {
            throw panelError;
          }
        }
        break;
        
      case 'scenario_analysis':
        console.log(`📊 Executing scenario analysis mode with ${availableAgents.length} agents`);
        try {
          result = await executeScenarioAnalysis(
            sanitizedPrompt,
            availableAgents,
            redisChannel,
            timeoutController.signal,
            costTracker,
            {
              models,
              clients,
              publishEvent,
              estimateTokenCount,
              constructPrompt,
              onModelStatusChange: options.onModelStatusChange
            }
          );
        } catch (scenarioError) {
          if (ignoreFailingModels) {
            result = {
              answer: `Scenario analysis encountered issues: ${scenarioError.message}`,
              rationale: "Scenario analysis failed but continuing with fallback.",
              spentUSD: costTracker.getTotalSpent()
            };
          } else {
            throw scenarioError;
          }
        }
        break;
        
      case 'creative_brainstorm_swarm':
        console.log(`💡 Executing creative brainstorm swarm mode with ${availableAgents.length} agents`);
        try {
          result = await executeCreativeBrainstormSwarm(
            sanitizedPrompt,
            availableAgents,
            redisChannel,
            timeoutController.signal,
            costTracker,
            {
              models,
              clients,
              publishEvent,
              estimateTokenCount,
              constructPrompt,
              onModelStatusChange: options.onModelStatusChange
            }
          );
        } catch (brainstormError) {
          if (ignoreFailingModels) {
            result = {
              answer: `Creative brainstorm encountered issues: ${brainstormError.message}`,
              rationale: "Brainstorm collaboration failed but continuing with fallback.",
              spentUSD: costTracker.getTotalSpent()
            };
          } else {
            throw brainstormError;
          }
        }
        break;
        
      case 'hybrid_guarded_braintrust':
        console.log(`🛡️ Executing hybrid guarded braintrust mode with ${availableAgents.length} agents`);
        try {
          result = await executeHybridGuardedBraintrust(
            sanitizedPrompt,
            availableAgents,
            redisChannel,
            timeoutController.signal,
            costTracker,
            {
              models,
              clients,
              publishEvent,
              estimateTokenCount,
              constructPrompt,
              onModelStatusChange: options.onModelStatusChange
            }
          );
        } catch (braintrustError) {
          if (ignoreFailingModels) {
            result = {
              answer: `Hybrid braintrust encountered issues: ${braintrustError.message}`,
              rationale: "Braintrust collaboration failed but continuing with fallback.",
              spentUSD: costTracker.getTotalSpent()
            };
          } else {
            throw braintrustError;
          }
        }
        break;
        
      default:
        throw new Error(`Unknown collaboration mode: ${mode}. Supported modes: round_table, sequential_critique_chain, validated_consensus, code_architect, adversarial_debate, expert_panel, scenario_analysis, creative_brainstorm_swarm, hybrid_guarded_braintrust`);
    }
    
    // Format the final result
    clearTimeout(timeoutId);
    
    if (result && (result.answer || result.final)) {
      const finalResponse = result.answer || result.final;
      const finalRationale = result.rationale || "";
      
      // Make sure to update status for all possible models before sending completion
      if (typeof options.onModelStatusChange === 'function') {
        // Track which models have had status updates sent
        const processedModels = new Set();

        // First check results from the round table process
        if (result.drafts) {
          // Process draft authors
          for (const draft of result.drafts) {
            if (!processedModels.has(draft.agent)) {
              // If it had an error, mark as failed, otherwise as completed
              if (draft.error) {
                options.onModelStatusChange(draft.agent, 'failed', `Failed in draft phase: ${draft.errorMessage || 'Unknown error'}`);
              } else {
                options.onModelStatusChange(draft.agent, 'completed', 'Collaboration complete');
              }
              processedModels.add(draft.agent);
            }
          }
        }

        // Make sure all requested agents have a status update
        for (const agent of availableAgents) {
          if (!processedModels.has(agent)) {
            options.onModelStatusChange(agent, 'completed', 'Collaboration complete');
            processedModels.add(agent);
          }
        }
      }

      // Send an explicit collaboration_complete event AFTER all model status updates
      publishEvent('collab:' + sessionId, {
        type: 'collaboration_complete',
        timestamp: new Date().toISOString()
      });
      
      // Calculate cost
      const totalSpent = costTracker.getTotalSpent();
      console.log(`✅ Collaboration complete. Cost: $${totalSpent.toFixed(4)}`);
      
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
    console.error(`❌ Error in enhanced collaboration:`, error);
    
    // Check for timeout error
    if (error.name === 'AbortError' || error.message === 'AbortError') {
      console.error(`⏱️ Collaboration timed out after ${maxSeconds} seconds`);
      
      if (ignoreFailingModels) {
        // Return a partial result with what we have
        return {
          final: "Collaboration timed out, partial result provided.",
          rationale: `The collaboration process exceeded the ${maxSeconds} second time limit.`,
          spentUSD: costTracker.getTotalSpent()
        };
      } else {
        throw new Error(`Collaboration timed out after ${maxSeconds} seconds`);
      }
    }
    
    if (error.message === 'CostLimitExceededError') {
      console.error(`💰 Collaboration exceeded cost limit of $${costCapDollars}`);
      throw new Error(`Collaboration exceeded cost limit of $${costCapDollars}`);
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
    // Handle both options.agents (used in server code) and options.agentNames (used in enhanced version)
    const agentsList = options.agents || options.agentNames || [];
    
    // Verify clients object is available
    if (!options.clients || typeof options.clients !== 'object' || Object.keys(options.clients).length === 0) {
      console.error("❌ CRITICAL ERROR: No clients object passed to runCollab", options.clients);
      // If we can import them directly, do so as fallback
      console.log("🔄 Attempting to import clients directly as fallback...");
      try {
        const { clients: importedClients } = await import('./index.mjs');
        options.clients = importedClients;
        console.log("✅ Successfully imported clients as fallback");
      } catch (error) {
        console.error("❌ Failed to import clients as fallback:", error);
        throw new Error("No AI clients were provided to the collaboration module. This is a configuration issue.");
      }
    } else {
      console.log("✅ Client object verified:", Object.keys(options.clients).join(", "));
    }
    
    if (options.useEnhancedCollab || agentsList.length > 3) {
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