/**
 * AI Collaboration Engine
 * Orchestrates multi-model collaboration workflows
 * Version: 9.0.0
 */

import { clients, availability, agentClients } from './index.mjs';
import { getClient } from './index.mjs';
import clientFactory from './clientFactory.mjs';
import { DEFAULT_CLAUDE_MODEL } from './claude.mjs';
import { DEFAULT_GEMINI_MODEL } from './gemini.mjs';
import { publishEvent, subscribeToChannel } from '../messaging/redis.mjs';
import { securityGuard } from '../security/promptGuard.mjs';
import { estimateCost, trackUsage } from './costControl.mjs';

// Constants
const DEFAULT_TIMEOUT_SECONDS = 600; // 10 minutes - for complex prompts that can take 5-10 minutes
const DEFAULT_COST_CAP_DOLLARS = 1.0;
const DEFAULT_MODE = 'individual';

// Helper function to check agent availability dynamically
async function isAgentAvailable(agent, userId) {
  try {
    const client = await clientFactory.getClient(userId, agent);
    return client !== null;
  } catch (error) {
    return false;
  }
}

// Helper to get available agents from a list
async function getAvailableAgents(agents, userId) {
  const availableAgents = [];
  for (const agent of agents) {
    if (await isAgentAvailable(agent, userId)) {
      availableAgents.push(agent);
    }
  }
  return availableAgents;
}

// Collaboration configuration
const collaborationConfig = {
  styles: {
    balanced: { 
      name: "Balanced", 
      description: "Equal participation from all models", 
      promptDirective: "Give equal weight to all perspectives"
    },
    contrasting: { 
      name: "Contrasting", 
      description: "Emphasizes different perspectives", 
      promptDirective: "Highlight differences in approach and perspective"
    },
    harmonious: { 
      name: "Harmonious", 
      description: "Focuses on finding agreement", 
      promptDirective: "Find common ground and consensus where possible"
    }
  },
  currentStyle: "balanced",
  mode: "individual", // Default to individual mode (no collaboration between AIs)
  collaborationOrder: ["claude", "gemini", "chatgpt", "grok", "deepseek", "llama"]
};

// Provider-specific prompt templates
const SYSTEM_PROMPTS = {
  claude: {
    base: "You are Claude, a helpful, honest, and harmless AI assistant from Anthropic.",
    agent: "You are Claude, participating in a multi-model AI collaboration. You are known for thoughtfulness, nuance, and detail."
  },
  gemini: {
    base: "You are Gemini, a helpful AI assistant from Google.",
    agent: "You are Gemini, participating in a multi-model AI collaboration. You are known for reasoning and problem-solving capabilities."
  },
  chatgpt: {
    base: "You are ChatGPT, a helpful AI assistant from OpenAI.",
    agent: "You are ChatGPT, participating in a multi-model AI collaboration. You are known for your broad knowledge and helpful responses."
  },
  grok: {
    base: "You are Grok, a helpful AI assistant from xAI with a witty personality.",
    agent: "You are Grok, participating in a multi-model AI collaboration. You are known for witty, creative thinking and unconventional solutions."
  },
  deepseek: {
    base: "You are DeepSeek, a helpful AI assistant focused on advanced reasoning.",
    agent: "You are DeepSeek, participating in a multi-model AI collaboration. You are known for thoroughness and advanced reasoning capabilities."
  },
  llama: {
    base: "You are Llama, a helpful open-source AI assistant.",
    agent: "You are Llama, participating in a multi-model AI collaboration. You are known for your straightforward, helpful responses."
  },
};

/**
 * Main collaboration function exposed to API
 * @param {Object} options - Collaboration options
 * @param {string} options.prompt - User's prompt/question
 * @param {string} options.mode - Collaboration mode (default: 'round_table')
 * @param {Array<string>} options.agents - List of agent provider names
 * @param {number} options.costCapDollars - Maximum cost cap in USD (default: 1.0)
 * @param {number} options.maxSeconds - Maximum execution time in seconds (default: 13)
 * @returns {Promise<Object>} - Results with final answer, rationale, and cost
 */
// Original runCollab function renamed to be wrapped by enhanced version
async function originalRunCollab(options) {
  var prompt = options.prompt;
  var mode = options.mode || DEFAULT_MODE;
  var agents = options.agents || ['claude', 'gemini', 'chatgpt'];
  var costCapDollars = options.costCapDollars || DEFAULT_COST_CAP_DOLLARS;
  var maxSeconds = options.maxSeconds || DEFAULT_TIMEOUT_SECONDS;
  var sessionId = options.sessionId || 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  var ignoreFailingModels = options.ignoreFailingModels || false; // NEW: Flag to continue if some models fail
  var userId = options.userId || null; // User ID for checking user-provided API keys
  
  // Validate and sanitize inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error("Valid prompt is required");
  }
  
  // Filter out unavailable agents - check both system and user API keys
  var availableAgents = [];
  for (const agent of agents) {
    try {
      // Check if API key is available (user or system)
      const client = await clientFactory.getClient(userId, agent);
      if (client) {
        availableAgents.push(agent);
      }
    } catch (error) {
      console.log(`Agent ${agent} not available: ${error.message}`);
    }
  }
  
  if (availableAgents.length === 0) {
    throw new Error("No available agents to collaborate");
  }
  
  // Log the ignoreFailingModels setting
  console.log(`⚙️ Collaboration options: ignoreFailingModels=${ignoreFailingModels}`);
  
  // Log all model IDs being used to help debug
  if (options.models) {
    for (const agent of availableAgents) {
      if (options.models[agent] && options.models[agent].length > 0) {
        console.log(`🤖 Agent ${agent} using model ID: ${options.models[agent][0]}`);
      }
    }
  }
  
  // Security check on prompt
  var sanitizedPrompt = securityGuard.sanitizePrompt(prompt);
  
  // Estimate initial cost
  var estimatedCost = estimateCost({
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
  var timeoutController = new AbortController();
  var timeoutId = setTimeout(function() {
    timeoutController.abort();
  }, maxSeconds * 1000);
  
  // Setup cost tracking with safeguards
  const { initializeSession } = await import('./costControl.mjs');
  var costTracker = initializeSession(sessionId, costCapDollars);
  
  // Ensure costTracker has required methods
  if (!costTracker.getTotalCost) {
    console.warn('CostTracker missing getTotalCost method, adding fallback implementation');
    costTracker.getTotalCost = () => 0;
  }
  
  if (!costTracker.shouldAbort) {
    console.warn('CostTracker missing shouldAbort method, adding fallback implementation');
    costTracker.shouldAbort = () => false;
  }
  
  // Setup Redis channel for streaming
  var redisChannel = 'collab:' + sessionId;
  
  try {
    var result;
    
    // Execute appropriate collaboration mode
    switch (mode) {
        case 'round_table':
          result = await executeRoundTableCollaboration(
            sanitizedPrompt, 
            availableAgents, 
            redisChannel, 
            timeoutController.signal, 
            costTracker,
            {
              ignoreFailingModels: ignoreFailingModels,
              models: options.models || {} // Pass model IDs to preserve them
            }
          );
          
          // If we got a timeout/abort but ignoreFailingModels is true, generate a simple summary
          // from any successful drafts we were able to get
          if (!result && ignoreFailingModels) {
            console.log(`🧯 Some models failed but ignoreFailingModels=true, generating fallback summary`);
            const totalCost = costTracker.getTotalCost ? costTracker.getTotalCost() : 0;
            console.log(`Generating fallback summary with cost: $${totalCost.toFixed(4)}`);
            result = {
              final: "Collaboration summary from initial drafts (some models failed but were ignored per configuration)",
              spentUSD: totalCost // Use what we spent so far
            };
          }
        break;
      case 'sequential_critique_chain':
        result = await executeSequentialCritiqueChain(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels: ignoreFailingModels,
            models: options.models || {} // Pass model IDs to preserve them
          }
        );
        break;
      case 'validated_consensus':
        result = await executeValidatedConsensus(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels: ignoreFailingModels,
            models: options.models || {} // Pass model IDs to preserve them
          }
        );
        break;
      case 'creative_brainstorm_swarm':
        result = await executeCreativeBrainstormSwarm(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels: ignoreFailingModels,
            models: options.models || {} // Pass model IDs to preserve them
          }
        );
        break;
      case 'hybrid_guarded_braintrust':
        result = await executeHybridGuardedBraintrust(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          {
            ignoreFailingModels: ignoreFailingModels,
            models: options.models || {} // Pass model IDs to preserve them
          }
        );
        break;
      case 'individual': // Individual responses with no collaboration
        result = await executeIndividualResponses(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker
        );
        break;
      case 'code_architect':
        result = await executeCodeArchitect(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          options
        );
        break;
      case 'adversarial_debate':
        result = await executeAdversarialDebate(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          options
        );
        break;
      case 'expert_panel':
        result = await executeExpertPanel(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          options
        );
        break;
      case 'scenario_analysis':
        result = await executeScenarioAnalysis(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          options
        );
        break;
      default:
        // Default to individual if an unknown mode is specified
        result = await executeIndividualResponses(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker,
          options
        );
    }
    
    return {
      final: result.answer,
      rationale: result.rationale,
      spentUSD: costTracker.getTotalCost()
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        final: "Collaboration timed out after " + maxSeconds + " seconds.",
        rationale: "The operation exceeded the maximum allowed time. Partial results may be available in the agent scratchpads.",
        spentUSD: costTracker.getTotalCost()
      };
    } else if (error.name === 'CostLimitExceededError') {
      return {
        final: "Collaboration aborted: cost limit exceeded.",
        rationale: "The operation was stopped because it reached the cost cap of $" + costCapDollars.toFixed(2) + ".",
        spentUSD: costTracker.getTotalCost()
      };
    } else {
      console.error("Collaboration error:", error);
      return {
        final: "An error occurred during collaboration.",
        rationale: "Technical error: " + error.message,
        spentUSD: costTracker.getTotalCost()
      };
    }
  } finally {
    clearTimeout(timeoutId);
    // Ensure any streaming or resources are properly closed
    publishEvent(redisChannel, {
      type: 'collaboration_complete',
      sessionId: sessionId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Round Table Collaboration Mode
 * Classic synchronous consensus loop
 */
async function executeRoundTableCollaboration(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  try {
    // Ensure costTracker has required methods
    if (!costTracker) {
      console.warn('Round Table received null costTracker, creating default');
      costTracker = {
        addInputTokens: () => {},
        addOutputTokens: () => {},
        shouldAbort: () => false,
        getTotalCost: () => 0
      };
    } else if (!costTracker.getTotalCost) {
      console.warn('Round Table costTracker missing getTotalCost method, adding fallback');
      costTracker.getTotalCost = () => 0;
    }
    console.log(`🔄 Starting Round Table collaboration with ${agents.length} agents: ${agents.join(', ')}`);
    console.log(`🧠 Available clients:`, Object.keys(clients).filter(k => clients[k]).join(', '));
    
    // Get options
    const ignoreFailingModels = options.ignoreFailingModels || false;
    const models = options.models || {};
    const userId = options.userId || null;
    
    // Check agent availability dynamically
    const availableAgents = await getAvailableAgents(agents, userId);
    const availableAgentCount = availableAgents.length;
    console.log(`📊 Available agent count: ${availableAgentCount}/${agents.length}`);
    console.log(`⚙️ Round Table settings: ignoreFailingModels=${ignoreFailingModels}`);
    console.log(`📝 Round Table limits: prompt=5000 chars, draft=2000 words`);
    
    if (availableAgentCount === 0) {
      console.error("❌ No available agents for Round Table collaboration!");
      throw new Error("No available agents for collaboration");
    }
    // Phase 1: Initial drafting
    console.log(`📝 Phase 1: Initial drafting starting`);
    publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'initial_drafting',
    timestamp: new Date().toISOString()
  });
  
  // Process agents sequentially instead of using Promise.all to avoid rate limiting
  var initialDrafts = [];
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    
    // Skip unavailable agents
    if (!(await isAgentAvailable(agent, userId))) {
      console.warn(`⚠️ Agent ${agent} is not available, skipping...`);
      initialDrafts.push({
        agent: agent,
        content: `[${agent} is not available]`,
        error: true
      });
      continue;
    }
    
    console.log(`🤖 Agent ${agent} starting initial draft...`);
    try {
      // Check if we have the client for this agent
      const client = getClient(agent);
      if (!client) {
        console.error(`❌ Client for ${agent} not found or not initialized`);
        initialDrafts.push({
          agent: agent,
          content: `[${agent} client is not initialized]`,
          error: true
        });
        continue;
      }
      
      publishEvent(redisChannel, {
        type: 'agent_thinking',
        agent: agent,
        phase: 'draft',
        timestamp: new Date().toISOString()
      });
      
      // Construct prompt with increased character limit
      var draftPrompt = constructPrompt(
        prompt.substring(0, 5000), // Increased from 2000 to 5000 characters
        agent, 
        'Please provide your initial draft answer. Be thorough and comprehensive. You may use up to 2000 words for your response.'
      );
      
      console.log(`⏳ Waiting for ${agent} draft response...`);
      console.log(`📤 Sending prompt to ${agent} with system prompt: "${draftPrompt.systemPrompt.substring(0, 100)}..."`);
      
      // Get the model ID from options if available
      const modelId = models && models[agent] && models[agent][0];
      if (modelId) {
        console.log(`📋 Using model ID for ${agent}: ${modelId}`);
      }
      
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'processing', 'Writing initial draft');
      }
      
      // Special handling for different agents
      if (agent === 'claude' || agent === 'gemini') {
        // These specific providers need the precise model ID
        var draft = await getAgentResponse(agent, draftPrompt, 'draft', redisChannel, abortSignal, costTracker, modelId);
      } else {
        // For other providers, let the default model handling work
        var draft = await getAgentResponse(agent, draftPrompt, 'draft', redisChannel, abortSignal, costTracker);
      }
      console.log(`✅ ${agent} draft complete (${draft.length} chars)`);
      
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'processing', 'Initial draft completed');
      }
      
      initialDrafts.push({
        agent: agent,
        content: draft
      });
    } catch (error) {
      console.error(`❌ Error getting draft from ${agent}:`, error);
      console.error(`🔍 Error details:`, error.stack || error);
      
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'failed', `Failed to create draft: ${error.message}`);
      }
      
      initialDrafts.push({
        agent: agent,
        content: `[${agent} was unable to provide a draft: ${error.message}]`,
        error: true
      });
    }
  }
  
  // Check if we should continue based on cost
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Check if we have at least one successful draft
  const successfulDrafts = initialDrafts.filter(draft => !draft.error);
  console.log(`📊 Successful drafts: ${successfulDrafts.length}/${initialDrafts.length}`);
  
  // Log model IDs for successful and failed drafts
  if (models) {
    for (const draft of initialDrafts) {
      const draftModelId = models[draft.agent] && models[draft.agent][0];
      if (draftModelId) {
        console.log(`📋 ${draft.error ? '❌ Failed' : '✅ Successful'} draft from ${draft.agent} using model ID: ${draftModelId}`);
      }
    }
  }
  
  if (successfulDrafts.length === 0) {
    console.error("❌ All agents failed to provide drafts in the Round Table collaboration!");
    throw new Error("All agents failed to provide drafts. Please check API keys and try again.");
  }
  
  // Phase 2: Critiques
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'critique',
    timestamp: new Date().toISOString()
  });
  
  var critiques = [];
  for (var i = 0; i < agents.length; i++) {
    var currentAgent = agents[i];
    
    // Skip agents that failed to produce a draft
    if (initialDrafts.find(function(draft) { return draft.agent === currentAgent; }).error) {
      continue;
    }
    
    var otherDrafts = initialDrafts.filter(function(draft) {
      return draft.agent !== currentAgent && !draft.error;
    });
    
    if (otherDrafts.length === 0) {
      continue;
    }
    
    try {
      publishEvent(redisChannel, {
        type: 'agent_thinking',
        agent: currentAgent,
        phase: 'critique',
        timestamp: new Date().toISOString()
      });
      
      var draftsText = otherDrafts.map(function(draft) {
        return `${draft.agent.toUpperCase()}'s DRAFT:\n${draft.content}\n`;
      }).join('\n');
      
      var critiquePrompt = constructPrompt(
        prompt + "\n\nHere are drafts from other participants:\n\n" + draftsText,
        currentAgent,
        'Please critique these drafts. Highlight strengths, weaknesses, factual errors, and opportunities for improvement in each one.'
      );
      
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(currentAgent, 'processing', 'Writing critique');
      }
      
      var critique = await getAgentResponse(currentAgent, critiquePrompt, 'critique', redisChannel, abortSignal, costTracker);
      
      critiques.push({
        agent: currentAgent,
        content: critique,
        targets: otherDrafts.map(function(d) { return d.agent; })
      });
      
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(currentAgent, 'completed', 'Critique completed');
      }
    } catch (error) {
      console.error(`Error getting critique from ${currentAgent}:`, error);
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(currentAgent, 'failed', `Failed to create critique: ${error.message}`);
      }
      // Continue with other agents even if one fails
    }
    
    // Check if we should continue based on cost
    if (costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
  }
  
  // Phase 3: Voting and Synthesis
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'voting',
    timestamp: new Date().toISOString()
  });
  
  var votes = [];
  for (var j = 0; j < agents.length; j++) {
    var voter = agents[j];
    
    // Skip agents that failed to produce a draft
    if (initialDrafts.find(function(draft) { return draft.agent === voter; }).error) {
      continue;
    }
    
    try {
      publishEvent(redisChannel, {
        type: 'agent_thinking',
        agent: voter,
        phase: 'vote',
        timestamp: new Date().toISOString()
      });
      
      var draftsForVoting = initialDrafts.filter(function(draft) { 
        return !draft.error;
      }).map(function(draft) {
        return `${draft.agent.toUpperCase()}'s DRAFT:\n${draft.content}\n`;
      }).join('\n');
      
      var critiquesText = critiques.map(function(critique) {
        return `${critique.agent.toUpperCase()}'s CRITIQUE:\n${critique.content}\n`;
      }).join('\n');
      
      var votePrompt = constructPrompt(
        prompt + 
        "\n\nDRAFTS:\n" + draftsForVoting + 
        "\n\nCRITIQUES:\n" + critiquesText,
        voter,
        'Based on all drafts and critiques, vote for which draft offers the best starting point for a final answer. Explain your reasoning.'
      );
      
      var voteResponse = await getAgentResponse(voter, votePrompt, 'vote', redisChannel, abortSignal, costTracker);
      
      // Attempt to extract the voted-for agent
      var votedForAgent = agents.find(function(a) {
        var regex = new RegExp(`\\b${a}\\b`, 'i');
        return regex.test(voteResponse.split('\n')[0]);
      }) || extractVotedAgent(voteResponse, agents);
      
      votes.push({
        voter: voter,
        votedFor: votedForAgent,
        reasoning: voteResponse
      });
      
      publishEvent(redisChannel, {
        type: 'agent_vote',
        agent: voter,
        vote: votedForAgent,
        reasoning: voteResponse,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Error getting vote from ${voter}:`, error);
      // Continue with other agents even if one fails
    }
    
    // Check if we should continue based on cost
    if (costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
  }
  
  // Count votes to find the winning draft
  var voteCounts = {};
  agents.forEach(function(agent) {
    voteCounts[agent] = 0;
  });
  
  votes.forEach(function(vote) {
    if (vote.votedFor && voteCounts[vote.votedFor] !== undefined) {
      voteCounts[vote.votedFor]++;
    }
  });
  
  var leadAgent = Object.keys(voteCounts).reduce(function(a, b) {
    return voteCounts[a] > voteCounts[b] ? a : b;
  }, agents[0]);
  
  /**
 * Finds the agent with the highest token limit based on model type
 * @param {Array<string>} agents List of available agent names 
 * @param {Object} models Models object with agent names as keys
 * @param {string} userId User ID for checking API keys
 * @returns {Promise<string>} The agent name with the highest token limit
 */
async function getAgentWithHighestTokenLimit(agents, models = {}, userId = null) {
  // Define token limits for different models
  const MAX_TOKEN_LIMITS = {
    'claude-3-5-sonnet': 64000,
    'claude-3-5-opus': 64000,
    'claude-3-haiku': 32000,
    'claude-3-sonnet': 32000,
    'claude-3-opus': 32000,
    'claude-2': 16000,
    'gemini-2.5-pro': 64000,
    'gemini-1.5-pro': 32000,
    'gemini-1.0-pro': 16000,
    'gpt-4o': 32000,
    'gpt-4': 16000,
    'gpt-3.5-turbo': 8000,
    'deepseek-chat': 8000,
    'llama': 8000,
    'grok': 8000
  };

  let highestAgent = agents[0]; // Default to first agent
  let highestLimit = 0;

  for (const agent of agents) {
    // Skip unavailable agents
    if (!(await isAgentAvailable(agent, userId))) continue;
    
    // Get the model ID for this agent
    const modelId = models[agent] && models[agent][0] || '';
    let tokenLimit = 0;
    
    // Check for specific models first
    if (modelId) {
      // Look for matches in the token limits
      const matchedModel = Object.keys(MAX_TOKEN_LIMITS).find(model => 
        modelId.toLowerCase().includes(model.toLowerCase())
      );
      
      if (matchedModel) {
        tokenLimit = MAX_TOKEN_LIMITS[matchedModel];
      }
    }
    
    // If no specific model match, use provider defaults
    if (tokenLimit === 0) {
      if (agent === 'claude') {
        tokenLimit = 64000; // Default to highest Claude
      } else if (agent === 'gemini') {
        tokenLimit = 64000; // Default to highest Gemini
      } else if (agent === 'chatgpt') {
        tokenLimit = 32000; // Default to GPT-4o
      } else {
        tokenLimit = 8000; // Default for other providers
      }
    }
    
    // Update if this agent has a higher token limit
    if (tokenLimit > highestLimit) {
      highestLimit = tokenLimit;
      highestAgent = agent;
    }
  }
  
  console.log(`🔍 Selected ${highestAgent} for summarization with estimated ${highestLimit} token limit`);
  return highestAgent;
}

// Final synthesis
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'synthesis',
    timestamp: new Date().toISOString()
  });
  
  // Use the agent with the highest token limit for summarization instead of the lead agent
  let summarizerAgent = null;
  try {
    const availableNonErrorAgents = [];
    for (const agent of agents) {
      // Only use agents that are available and didn't error out
      if ((await isAgentAvailable(agent, userId)) && !initialDrafts.find(draft => draft.agent === agent && draft.error)) {
        availableNonErrorAgents.push(agent);
      }
    }
    summarizerAgent = await getAgentWithHighestTokenLimit(availableNonErrorAgents, options.models, userId);
  } catch (err) {
    console.error("Error getting agent with highest token limit:", err);
    // Fallback to first available agent
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !initialDrafts.find(draft => draft.agent === agent && draft.error)) {
        summarizerAgent = agent;
        break;
      }
    }
    if (!summarizerAgent) summarizerAgent = agents[0];
  }
  
  console.log(`👑 Using ${summarizerAgent} for final summarization (highest token limit)`);
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: summarizerAgent,
    phase: 'synthesis',
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(summarizerAgent, 'processing', 'Creating final summary');
  }
  
  var draftsText = initialDrafts.filter(function(draft) { 
    return !draft.error;
  }).map(function(draft) {
    return `${draft.agent.toUpperCase()}'s DRAFT:\n${draft.content}\n`;
  }).join('\n');
  
  var votesText = votes.map(function(vote) {
    return `${vote.voter.toUpperCase()}'s VOTE: ${vote.votedFor || 'Unclear'}\nReasoning: ${vote.reasoning}\n`;
  }).join('\n');
  
  var synthesisPrompt = constructPrompt(
    prompt + 
    "\n\nDRAFTS:\n" + draftsText + 
    "\n\nVOTES:\n" + votesText,
    summarizerAgent,
    'As the summarizer with the highest token limit, synthesize a final comprehensive answer that incorporates the best insights from all drafts and addresses the critiques raised. Split your response into: 1) FINAL ANSWER and 2) RATIONALE explaining how you combined the different perspectives.'
  );
  
  var synthesisResponse = await getAgentResponse(summarizerAgent, synthesisPrompt, 'synthesis', redisChannel, abortSignal, costTracker);
  
  // Extract final answer and rationale from synthesis
  var finalAnswer = '';
  var rationale = '';
  
  if (synthesisResponse.includes('FINAL ANSWER')) {
    var parts = synthesisResponse.split(/RATIONALE|REASONING/i);
    if (parts.length >= 1) {
      finalAnswer = parts[0].replace(/FINAL ANSWER:?/i, '').trim();
      rationale = parts.length > 1 ? parts[1].trim() : '';
    }
  } else {
    finalAnswer = synthesisResponse;
    rationale = "Synthesized from multiple AI perspectives with " + votes.length + " votes.";
  }
  
  publishEvent(redisChannel, {
    type: 'collaboration_result',
    answer: finalAnswer,
    rationale: rationale,
    leadAgent: leadAgent,
    summarizerAgent: summarizerAgent,
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(summarizerAgent, 'completed', 'Summarization completed');
  }
  
  // Construct final result
  const result = {
    answer: finalAnswer,
    rationale: rationale,
    leadAgent: leadAgent,
    summarizerAgent: summarizerAgent,
    drafts: initialDrafts,
    critiques: critiques,
    votes: votes
  };
  
  return result;
  
  } catch (error) {
    // Handle errors during the round table process
    console.error(`❌ Error in round table collaboration:`, error);
    
    // Special handling for timeout/abort errors when ignoreFailingModels is true
    const ignoreFailingModels = options.ignoreFailingModels || false;
    
    if (error.name === 'AbortError' && ignoreFailingModels) {
      console.log(`⚠️ Round table collaboration aborted, but ignoreFailingModels=true, returning partial result`);
      
      // If we have any successful initial drafts, create a simple summary from them
      const successfulDrafts = initialDrafts ? initialDrafts.filter(d => !d.error) : [];
      if (successfulDrafts && successfulDrafts.length > 0) {
        const totalCost = costTracker.getTotalCost ? costTracker.getTotalCost() : 0;  
        console.log(`Round table aborted but returning partial result. Cost: $${totalCost.toFixed(4)}`);
        
        return {
          answer: "Collaboration completed with partial results (some models failed but were ignored as configured)",
          rationale: "The round-table process was interrupted, but some models provided initial drafts.",
          leadAgent: null,
          drafts: initialDrafts,
          critiques: [],
          votes: [],
          spentUSD: totalCost // Include cost for partial results
        };
      }
    }
    
    // Re-throw the error to be handled by the parent function
    throw error;
  }
}

/**
 * Sequential Critique Chain
 * Low-trust pipeline critique
 */
async function executeSequentialCritiqueChain(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  // Need at least 2 agents for this mode
  if (agents.length < 2) {
    throw new Error("Sequential critique chain requires at least 2 agents");
  }
  
  const userId = options.userId || null;
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'sequential_chain',
    timestamp: new Date().toISOString()
  });
  
  // Publish initial progress
  publishEvent(redisChannel, {
    type: 'progress_update',
    phase: 'critique_chain',
    currentStep: 0,
    totalSteps: agents.length + 1, // +1 for final summary
    percentage: 0,
    timestamp: new Date().toISOString()
  });
  
  var currentResponse = '';
  var chain = [];
  
  // First agent generates initial answer
  var firstAgent = agents[0];
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: firstAgent,
    phase: 'initial',
    timestamp: new Date().toISOString()
  });
  
  var initialPrompt = constructPrompt(
    prompt,
    firstAgent,
    'You are the first agent in a critique chain. Please provide an initial answer to the query. Be thorough but know that your answer will be refined by other agents.'
  );
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(firstAgent, 'processing', 'Writing initial response');
  }
  
  try {
    currentResponse = await getAgentResponse(firstAgent, initialPrompt, 'initial', redisChannel, abortSignal, costTracker);
    
    chain.push({
      agent: firstAgent,
      content: currentResponse,
      role: 'initial'
    });
    
    // Send status update if callback provided
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(firstAgent, 'completed', 'Initial response completed');
    }
    
    // Publish progress update after first agent
    publishEvent(redisChannel, {
      type: 'progress_update',
      phase: 'critique_chain',
      currentStep: 1,
      totalSteps: agents.length + 1, // +1 for final summary
      percentage: Math.round((1 / (agents.length + 1)) * 100),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`Error getting initial response from ${firstAgent}:`, error);
    // If first agent fails, try the second
    if (agents.length > 1) {
      firstAgent = agents[1];
      currentResponse = await getAgentResponse(firstAgent, initialPrompt, 'initial', redisChannel, abortSignal, costTracker);
      
      chain.push({
        agent: firstAgent,
        content: currentResponse,
        role: 'initial'
      });
    } else {
      throw new Error("Failed to get initial response from any agent");
    }
  }
  
  // Check cost after first agent
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Chain of improvements
  for (var i = 1; i < agents.length; i++) {
    var currentAgent = agents[i];
    
    // Publish progress update
    publishEvent(redisChannel, {
      type: 'progress_update',
      phase: 'critique_chain',
      currentStep: i + 1, // +1 because first agent already done
      totalSteps: agents.length + 1, // +1 for final summary
      percentage: Math.round(((i + 1) / (agents.length + 1)) * 100),
      timestamp: new Date().toISOString()
    });
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: currentAgent,
      phase: 'critique_' + i,
      timestamp: new Date().toISOString()
    });
    
    var critiqueStyles = ['balanced', 'constructive', 'challenging'];
    var critiqueStyle = critiqueStyles[i % critiqueStyles.length];
    
    var chainPrompt = constructPrompt(
      prompt + "\n\nPREVIOUS RESPONSE:\n" + currentResponse,
      currentAgent,
      'You are agent #' + (i+1) + ' in a critique chain. Review the previous response and provide an improved version. Your style should be ' + 
      critiqueStyle + '. Incorporate what works, fix what doesn\'t, and add missing perspectives or information.'
    );
    
    // Send status update if callback provided
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(currentAgent, 'processing', `Writing ${critiqueStyle} critique`);
    }
    
    try {
      currentResponse = await getAgentResponse(currentAgent, chainPrompt, 'critique_' + i, redisChannel, abortSignal, costTracker);
      
      chain.push({
        agent: currentAgent,
        content: currentResponse,
        role: 'critique_' + i
      });
      
      // Send status update if callback provided
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(currentAgent, 'completed', `${critiqueStyle} critique completed`);
      }
      
    } catch (error) {
      console.error(`Error getting critique from ${currentAgent}:`, error);
      // Skip this agent but continue the chain
      continue;
    }
    
    // Check cost after each agent
    if (costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
  }
  
  // Final summarization by the agent with the highest token limit
  // This ensures we can handle the largest context for summarization
  var summarizerAgent = null;
  try {
    const availableNonErrorAgents = [];
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !chain.find(item => item.agent === agent && item.error)) {
        availableNonErrorAgents.push(agent);
      }
    }
    summarizerAgent = await getAgentWithHighestTokenLimit(availableNonErrorAgents, options.models, userId);
  } catch (err) {
    console.error("Error getting agent with highest token limit:", err);
    // Fallback to first available agent
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !chain.find(item => item.agent === agent && item.error)) {
        summarizerAgent = agent;
        break;
      }
    }
    if (!summarizerAgent) summarizerAgent = agents[0];
  }
  
  console.log(`👑 Using ${summarizerAgent} for final sequential chain summarization (highest token limit)`);
  
  // Publish progress for final summary
  publishEvent(redisChannel, {
    type: 'progress_update',
    phase: 'critique_chain',
    currentStep: agents.length,
    totalSteps: agents.length + 1,
    percentage: Math.round((agents.length / (agents.length + 1)) * 100),
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: summarizerAgent,
    phase: 'summary',
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(summarizerAgent, 'processing', 'Creating final summary');
  }
  
  var chainHistory = chain.map(function(item) {
    return `${item.agent.toUpperCase()} (${item.role}):\n${item.content}\n`;
  }).join('\n');
  
  var summaryPrompt = constructPrompt(
    prompt + "\n\nCRITIQUE CHAIN:\n" + chainHistory,
    summarizerAgent,
    'As the summarizer, review the entire critique chain and produce a final refined answer. Split your response into: 1) FINAL ANSWER and 2) RATIONALE explaining how the answer evolved through the critique chain.'
  );
  
  var summaryResponse = await getAgentResponse(summarizerAgent, summaryPrompt, 'summary', redisChannel, abortSignal, costTracker);
  
  // Extract final answer and rationale
  var finalAnswer = '';
  var rationale = '';
  
  if (summaryResponse.includes('FINAL ANSWER')) {
    var parts = summaryResponse.split(/RATIONALE|REASONING/i);
    if (parts.length >= 1) {
      finalAnswer = parts[0].replace(/FINAL ANSWER:?/i, '').trim();
      rationale = parts.length > 1 ? parts[1].trim() : '';
    }
  } else {
    finalAnswer = summaryResponse;
    rationale = "Refined through " + chain.length + " sequential critiques.";
  }
  
  publishEvent(redisChannel, {
    type: 'collaboration_result',
    answer: finalAnswer,
    rationale: rationale,
    summarizerAgent: summarizerAgent,
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(summarizerAgent, 'completed', 'Summarization completed');
  }
  
  return {
    answer: finalAnswer,
    rationale: rationale,
    summarizerAgent: summarizerAgent,
    chain: chain
  };
}

/**
 * Validated Consensus
 * Hallucination-mitigation workflow
 */
async function executeValidatedConsensus(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  // Need at least 3 agents for this mode (2 drafters + 1 verifier)
  if (agents.length < 3) {
    throw new Error("Validated consensus requires at least 3 agents");
  }
  
  console.log(`Starting validated consensus mode with ${agents.length} agents`);
  const userId = options.userId || null;
  
  // Assign roles: first 2 agents as co-drafters, rest as verifiers
  var drafterAgents = agents.slice(0, 2);
  var verifierAgents = agents.slice(2);
  
  // Phase 1: Co-drafting
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'co_drafting',
    timestamp: new Date().toISOString()
  });

  // Send status update for UI loading phase
  if (options && typeof options.onModelStatusChange === 'function') {
    drafterAgents.forEach(agent => {
      options.onModelStatusChange(agent, 'phase_change', 'Phase 1: Drafting Initial Responses');
    });
    verifierAgents.forEach(agent => {
      options.onModelStatusChange(agent, 'phase_change', 'Phase 1: Drafting Initial Responses');
    });
  }
  
  var drafts = await Promise.all(drafterAgents.map(async function(agent, index) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'draft',
      timestamp: new Date().toISOString()
    });
    
    // Send status update if callback provided
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(agent, 'processing', 'Creating initial draft');
    }
    
    var draftPrompt = constructPrompt(
      prompt,
      agent,
      'You are co-drafter #' + (index+1) + ' creating an initial answer. Focus on factual accuracy and cite sources where possible. Your draft will be verified for factual claims.'
    );
    
    try {
      var draftContent = await getAgentResponse(agent, draftPrompt, 'draft', redisChannel, abortSignal, costTracker);
      
      // Mark this agent as completed for this phase
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'completed', 'Draft completed');
      }
      
      return {
        agent: agent,
        content: draftContent
      };
    } catch (error) {
      console.error(`Error getting draft from ${agent}:`, error);
      
      // Mark this agent as failed
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'failed', `Failed to create draft: ${error.message}`);
      }
      
      return {
        agent: agent,
        content: `[${agent} was unable to provide a draft: ${error.message}]`,
        error: true
      };
    }
  }));
  
  // Check if we should continue based on cost
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Filter out errored drafts
  var validDrafts = drafts.filter(function(draft) { 
    return !draft.error;
  });
  
  if (validDrafts.length === 0) {
    throw new Error("All drafters failed to produce content");
  }
  
  // Merge drafts (use first drafter if only one succeeded)
  var initialDraft;
  
  if (validDrafts.length === 1) {
    initialDraft = validDrafts[0].content;
  } else {
    // Use a third agent (first verifier) to merge, if available
    var mergerAgent = verifierAgents[0] || drafterAgents[0];
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: mergerAgent,
      phase: 'merge',
      timestamp: new Date().toISOString()
    });
    
    var draftsText = validDrafts.map(function(draft) {
      return `${draft.agent.toUpperCase()}'S DRAFT:\n${draft.content}\n`;
    }).join('\n');
    
    var mergePrompt = constructPrompt(
      prompt + "\n\nDRAFTS TO MERGE:\n" + draftsText,
      mergerAgent,
      'Combine these drafts into a single coherent answer. Preserve facts and insights from both. Identify any contradictions and resolve them by selecting the most accurate information.'
    );
    
    initialDraft = await getAgentResponse(mergerAgent, mergePrompt, 'merge', redisChannel, abortSignal, costTracker);
  }
  
  // Check cost after merging
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 2: Verification
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'verification',
    timestamp: new Date().toISOString()
  });
  
  // Send phase change for UI
  if (options && typeof options.onModelStatusChange === 'function') {
    // First, mark all agents as completed for previous phase to ensure progress bar updates
    agents.forEach(agent => {
      options.onModelStatusChange(agent, 'completed', 'Initial draft phase completed');
    });
    
    // Short delay before changing phase to ensure UI updates
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Now send the phase change for all agents
    agents.forEach(agent => {
      options.onModelStatusChange(agent, 'phase_change', 'Phase 2: Fact Checking & Verification');
    });
    
    // Add slight delay then send processing status for this phase
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Set verifier agents to processing state
    verifierAgents.forEach(agent => {
      options.onModelStatusChange(agent, 'processing', 'Reviewing claims for accuracy');
    });
  }
  
  var verificationResults = await Promise.all(verifierAgents.map(async function(agent) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'verify',
      timestamp: new Date().toISOString()
    });
    
    // Mark verifier as processing
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(agent, 'processing', 'Verifying claims');
    }
    
    var verifyPrompt = constructPrompt(
      prompt + "\n\nDRAFT TO VERIFY:\n" + initialDraft,
      agent,
      'You are a fact-checker. Review this draft and identify any statements that: 1) contain factual inaccuracies, 2) make unsupported claims, 3) are misleading, or 4) require citation. For each issue, quote the text and explain the problem.'
    );
    
    try {
      var verificationContent = await getAgentResponse(agent, verifyPrompt, 'verify', redisChannel, abortSignal, costTracker);
      
      // Mark verifier as completed
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'completed', 'Verification completed');
      }
      
      return {
        agent: agent,
        content: verificationContent
      };
    } catch (error) {
      console.error(`Error getting verification from ${agent}:`, error);
      
      // Mark verifier as failed
      if (options && typeof options.onModelStatusChange === 'function') {
        options.onModelStatusChange(agent, 'failed', `Verification failed: ${error.message}`);
      }
      
      return {
        agent: agent,
        content: `[${agent} was unable to provide verification: ${error.message}]`,
        error: true
      };
    }
  }));
  
  // Check cost after verification
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Filter out errored verifications
  var validVerifications = verificationResults.filter(function(verification) { 
    return !verification.error;
  });
  
  // Helper function for getting agent with highest token limit
  function getAgentWithHighestTokenLimit(availableAgents, modelConfigs) {
    // Default hierarchy based on known token limits if not specified
    const tokenLimitHierarchy = ['claude', 'grok', 'chatgpt', 'gemini', 'deepseek', 'llama'];
    
    // Return first agent in the hierarchy that's in the available list
    for (const agent of tokenLimitHierarchy) {
      if (availableAgents.includes(agent)) {
        return agent;
      }
    }
    
    // Fallback to first available agent if none match the hierarchy
    return availableAgents[0];
  }
  
  // Calculate percentage of lines flagged
  var issuesFound = false;
  
  if (validVerifications.length > 0) {
    // Simple heuristic - check if verifiers found substantial issues
    // Consider an issue substantial if multiple verifiers mention similar concerns
    // or if a verification contains certain keywords indicating problems
    var issueKeywords = ['incorrect', 'false', 'misleading', 'unsupported', 'citation needed', 'inaccurate', 'error'];
    
    var issueScore = validVerifications.reduce(function(score, verification) {
      var verificationText = verification.content.toLowerCase();
      var keywordMatches = issueKeywords.filter(function(keyword) {
        return verificationText.includes(keyword);
      }).length;
      
      return score + keywordMatches;
    }, 0);
    
    // If the average score per verification is more than 2, consider it having substantial issues
    issuesFound = (issueScore / validVerifications.length) > 2;
  }
  
  var finalResponse;
  var finalRationale;
  
  // Phase 3: Rewriting (if needed)
  if (issuesFound) {
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'rewriting',
      timestamp: new Date().toISOString()
    });
    
    // Complete the verification phase before starting the next one
    if (options && typeof options.onModelStatusChange === 'function') {
      // Mark all agents as completed for the verification phase
      agents.forEach(agent => {
        options.onModelStatusChange(agent, 'completed', 'Verification phase completed');
      });
      
      // Short delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Send phase update for all agents
      agents.forEach(agent => {
        options.onModelStatusChange(agent, 'phase_change', 'Phase 3: Revising Based on Feedback');
      });
      
      // Short delay before setting processing state
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Use the agent with the highest token limit for rewriting
    var rewriterAgent = null;
    try {
      const availableNonVerifierAgents = [];
      for (const agent of agents) {
        if ((await isAgentAvailable(agent, userId)) && !verifierAgents.find(verifier => verifier === agent)) {
          availableNonVerifierAgents.push(agent);
        }
      }
      rewriterAgent = await getAgentWithHighestTokenLimit(availableNonVerifierAgents
, options.models, userId);
    } catch (err) {
      console.error("Error getting agent with highest token limit:", err);
      // Fallback to first available agent
      for (const agent of agents) {
        if ((await isAgentAvailable(agent, userId)) && !verifierAgents.includes(agent)) {
          rewriterAgent = agent;
          break;
        }
      }
      if (!rewriterAgent) rewriterAgent = agents[0];
    }
    
    console.log(`👑 Using ${rewriterAgent} for rewriting (highest token limit)`);
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: rewriterAgent,
      phase: 'rewrite',
      timestamp: new Date().toISOString()
    });
    
    // Send status update if callback provided
    if (options && typeof options.onModelStatusChange === 'function') {
      // Send explicit status updates with timestamps to ensure tracking
      console.log(`Validated Consensus: Setting ${rewriterAgent} to processing state for rewriting phase`);
      
      // Make sure UI knows which models to track for this phase
      agents.forEach(agent => {
        if (agent !== rewriterAgent) {
          // Mark other agents as completed so we track progress correctly
          options.onModelStatusChange(agent, 'completed', 'Waiting for final revision');
        }
      });
      
      // Now set the rewriter to processing state
      options.onModelStatusChange(rewriterAgent, 'processing', 'Rewriting based on verification feedback');
      
      // Send an additional processing update with a delay to ensure it's captured
      setTimeout(() => {
        console.log(`Validated Consensus: Sending delayed processing status for ${rewriterAgent}`);
        options.onModelStatusChange(rewriterAgent, 'processing', 'Creating improved version with corrections');
      }, 300);
    }
    
    var verificationsText = validVerifications.map(function(verification) {
      return `${verification.agent.toUpperCase()}'S VERIFICATION:\n${verification.content}\n`;
    }).join('\n');
    
    var rewritePrompt = constructPrompt(
      prompt + 
      "\n\nORIGINAL DRAFT:\n" + initialDraft + 
      "\n\nVERIFICATION FEEDBACK:\n" + verificationsText,
      rewriterAgent,
      'Rewrite the draft to address the issues identified by the fact-checkers. For claims that cannot be verified with high confidence, either remove them or clearly mark them with "⚠️ [uncertain]". Include inline citations where possible.'
    );
    
    finalResponse = await getAgentResponse(rewriterAgent, rewritePrompt, 'rewrite', redisChannel, abortSignal, costTracker);
    
    // Mark rewriter as completed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(rewriterAgent, 'completed', 'Revision completed');
    }
    
    finalRationale = "The initial draft was rewritten after fact-checkers identified potential issues.";
  } else {
    // No substantial issues found, use the initial draft
    finalResponse = initialDraft;
    
    // Send phase update for final synthesis
    if (options && typeof options.onModelStatusChange === 'function') {
      agents.forEach(agent => {
        options.onModelStatusChange(agent, 'phase_change', 'Phase 3: Finalizing Response');
        options.onModelStatusChange(agent, 'completed', 'Response finalized');
      });
    }
    finalRationale = "The drafted response passed verification with no substantial issues identified.";
  }
  
  publishEvent(redisChannel, {
    type: 'collaboration_result',
    answer: finalResponse,
    rationale: finalRationale,
    verified: !issuesFound,
    rewriterAgent: issuesFound ? rewriterAgent : null,
    timestamp: new Date().toISOString()
  });
  
  console.log(`Validated Consensus: Final response generated. Sending final status updates.`);
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    // First mark all agents as completed before final wrap-up
    console.log(`Validated Consensus: Marking all ${agents.length} agents as completed`);
    agents.forEach(agent => {
      options.onModelStatusChange(agent, 'completed', 'Response finalized');
    });
    
    // Short delay to ensure UI updates
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Send a final phase change to trigger progress bar completion
    console.log(`Validated Consensus: Sending final phase changes to all agents`);
    agents.forEach(agent => {
      options.onModelStatusChange(agent, 'phase_change', 'Final Response Generated');
    });
    
    if (issuesFound) {
      options.onModelStatusChange(rewriterAgent, 'completed', 'Rewriting completed');
    }
    
    // Mark all agents as completed
    agents.forEach(agent => {
      options.onModelStatusChange(agent, 'completed', 'Consensus validation completed');
    });
  }
  
  return {
    answer: finalResponse,
    rationale: finalRationale,
    drafts: drafts,
    verifications: validVerifications,
    verified: !issuesFound
  };
}

/**
 * Creative Brainstorm Swarm
 * Maximize creativity and novel idea generation
 */
async function executeCreativeBrainstormSwarm(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  
  // Phase A: Solo Ideation
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'solo_ideation',
    timestamp: new Date().toISOString()
  });
  
  var soloIdeas = await Promise.all(agents.map(async function(agent) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'ideation',
      timestamp: new Date().toISOString()
    });
    
    var ideationPrompt = constructPrompt(
      prompt,
      agent,
      'You are in the creative ideation phase. Generate 3-5 novel, creative ideas or approaches that directly answer the user\'s question. Focus on originality and thinking outside the box about THE SPECIFIC TOPIC they asked about. Present each idea clearly with a title and brief explanation. Remember: answer about what they asked, not about collaboration itself.'
    );
    
    try {
      var ideationContent = await getAgentResponse(agent, ideationPrompt, 'ideation', redisChannel, abortSignal, costTracker);
      
      return {
        agent: agent,
        content: ideationContent
      };
    } catch (error) {
      console.error(`Error getting ideas from ${agent}:`, error);
      return {
        agent: agent,
        content: `[${agent} was unable to provide ideas: ${error.message}]`,
        error: true
      };
    }
  }));
  
  // Check cost after solo ideation
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Filter out errored ideas
  var validIdeas = soloIdeas.filter(function(idea) { 
    return !idea.error;
  });
  
  if (validIdeas.length === 0) {
    throw new Error("All agents failed to generate ideas");
  }
  
  // Phase B: Idea Fusion
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'idea_fusion',
    timestamp: new Date().toISOString()
  });
  
  var allIdeasText = validIdeas.map(function(idea) {
    return `${idea.agent.toUpperCase()}'S IDEAS:\n${idea.content}\n`;
  }).join('\n');
  
  var megaIdeas = await Promise.all(agents.map(async function(agent) {
    // Skip agents that failed in Phase A
    if (validIdeas.find(function(idea) { return idea.agent === agent; }).error) {
      return {
        agent: agent,
        content: `[${agent} skipped fusion phase due to earlier error]`,
        error: true
      };
    }
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'fusion',
      timestamp: new Date().toISOString()
    });
    
    var fusionPrompt = constructPrompt(
      prompt + "\n\nALL IDEAS FROM PHASE A:\n" + allIdeasText,
      agent,
      'You are in the idea fusion phase. Review the creative ideas about the user\'s original question. Select at least two distinct ideas and combine them into a new, more complex "mega-idea" that still directly addresses what the user asked about. Explain why this fusion is particularly exciting or promising FOR THEIR SPECIFIC QUESTION. Do not discuss collaboration processes.'
    );
    
    try {
      var fusionContent = await getAgentResponse(agent, fusionPrompt, 'fusion', redisChannel, abortSignal, costTracker);
      
      return {
        agent: agent,
        content: fusionContent
      };
    } catch (error) {
      console.error(`Error getting mega-idea from ${agent}:`, error);
      return {
        agent: agent,
        content: `[${agent} was unable to provide a mega-idea: ${error.message}]`,
        error: true
      };
    }
  }));
  
  // Check cost after idea fusion
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Filter out errored mega-ideas
  var validMegaIdeas = megaIdeas.filter(function(idea) { 
    return !idea.error;
  });
  
  if (validMegaIdeas.length === 0) {
    // If all mega-ideas failed, fall back to the best solo idea
    var fallbackIdea = validIdeas[0].content;
    
    return {
      answer: fallbackIdea,
      rationale: "All agents failed in the fusion phase. This is the best individual idea from the solo ideation phase.",
      soloIdeas: validIdeas,
      megaIdeas: [],
      winningIdea: null
    };
  }
  
  // Phase C: Vote & Amplify
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'vote_amplify',
    timestamp: new Date().toISOString()
  });
  
  var megaIdeasText = validMegaIdeas.map(function(idea) {
    return `${idea.agent.toUpperCase()}'S MEGA-IDEA:\n${idea.content}\n`;
  }).join('\n');
  
  var votes = await Promise.all(agents.map(async function(agent) {
    // Skip agents that failed in previous phases
    if (validMegaIdeas.find(function(idea) { return idea.agent === agent; }).error) {
      return {
        voter: agent,
        votedFor: null,
        reasoning: '',
        error: true
      };
    }
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'vote',
      timestamp: new Date().toISOString()
    });
    
    var votePrompt = constructPrompt(
      prompt + "\n\nMEGA-IDEAS TO EVALUATE:\n" + megaIdeasText,
      agent,
      'You are in the voting phase. Review all mega-ideas that address the user\'s original question and vote for the ONE you find most original, impactful, or promising AS AN ANSWER TO THEIR SPECIFIC QUESTION. You cannot vote for your own idea. Clearly state which agent\'s idea you are voting for and explain why it best answers what the user asked about.'
    );
    
    try {
      var voteResponse = await getAgentResponse(agent, votePrompt, 'vote', redisChannel, abortSignal, costTracker);
      
      // Try to extract voted-for agent
      var votedForAgent = validMegaIdeas
        .map(function(idea) { return idea.agent; })
        .filter(function(a) { return a !== agent; }) // Can't vote for self
        .find(function(a) {
          var regex = new RegExp(`\\b${a}\\b`, 'i');
          return regex.test(voteResponse.split('\n')[0]);
        }) || extractVotedAgent(voteResponse, agents);
      
      publishEvent(redisChannel, {
        type: 'agent_vote',
        agent: agent,
        vote: votedForAgent,
        reasoning: voteResponse,
        timestamp: new Date().toISOString()
      });
      
      return {
        voter: agent,
        votedFor: votedForAgent,
        reasoning: voteResponse
      };
    } catch (error) {
      console.error(`Error getting vote from ${agent}:`, error);
      return {
        voter: agent,
        votedFor: null,
        reasoning: '',
        error: true
      };
    }
  }));
  
  // Check cost after voting
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Count votes to find the winning mega-idea
  var voteCount = {};
  validMegaIdeas.forEach(function(idea) {
    voteCount[idea.agent] = 0;
  });
  
  votes.forEach(function(vote) {
    if (vote.votedFor && voteCount[vote.votedFor] !== undefined) {
      voteCount[vote.votedFor]++;
    }
  });
  
  var winningAgent = Object.keys(voteCount).reduce(function(a, b) {
    return voteCount[a] > voteCount[b] ? a : b;
  }, validMegaIdeas[0].agent);
  
  var winningIdea = validMegaIdeas.find(function(idea) {
    return idea.agent === winningAgent;
  });
  
  // Final amplification
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'amplification',
    timestamp: new Date().toISOString()
  });
  
  // Use the agent with the highest token limit for amplification
  var amplifierAgent = null;
  try {
    const availableNonErrorAgents = [];
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !megaIdeas.find(idea => idea.agent === agent && idea.error)) {
        availableNonErrorAgents.push(agent);
      }
    }
    amplifierAgent = await getAgentWithHighestTokenLimit(availableNonErrorAgents, options.models, userId);
  } catch (err) {
    console.error("Error getting agent with highest token limit:", err);
    // Fallback to first available agent
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !megaIdeas.find(idea => idea.agent === agent && idea.error)) {
        amplifierAgent = agent;
        break;
      }
    }
    if (!amplifierAgent) amplifierAgent = agents[0];
  }
  
  console.log(`👑 Using ${amplifierAgent} for idea amplification (highest token limit)`);
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: amplifierAgent,
    phase: 'amplify',
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(amplifierAgent, 'processing', 'Amplifying winning idea');
  }
  
  var amplifyPrompt = constructPrompt(
    prompt + 
    "\n\nWINNING MEGA-IDEA:\n" + winningIdea.content + 
    "\n\nVOTES AND REASONING:\n" + votes.filter(function(v) { return !v.error; }).map(function(v) {
      return `${v.voter.toUpperCase()}'s VOTE: ${v.votedFor || 'Unclear'}\nReasoning: ${v.reasoning}`;
    }).join('\n'),
    amplifierAgent,
    'You are in the final amplification phase. Develop and elaborate on this winning idea AS A COMPREHENSIVE ANSWER TO THE USER\'S ORIGINAL QUESTION. Create a detailed, creative response that directly addresses what they asked about. If they asked about food, talk about food. If they asked about travel, talk about travel. DO NOT discuss collaboration methods or AI systems unless that was their actual question. Make your answer creative, detailed, and directly relevant to their query.'
  );
  
  var amplifiedResponse;
  try {
    amplifiedResponse = await getAgentResponse(amplifierAgent, amplifyPrompt, 'amplify', redisChannel, abortSignal, costTracker);
  } catch (error) {
    console.error("Error in amplification phase:", error);
    // Fall back to the winning idea without amplification
    amplifiedResponse = winningIdea.content;
  }
  
  // Extract final idea and implementation details
  var finalIdea = '';
  var implementationDetails = '';
  
  if (amplifiedResponse.includes('FINAL IDEA') && amplifiedResponse.includes('IMPLEMENTATION DETAILS')) {
    var parts = amplifiedResponse.split('IMPLEMENTATION DETAILS');
    finalIdea = parts[0].replace('FINAL IDEA', '').trim();
    implementationDetails = parts[1].trim();
  } else {
    finalIdea = amplifiedResponse;
    implementationDetails = "See above for the complete idea.";
  }
  
  publishEvent(redisChannel, {
    type: 'collaboration_result',
    answer: finalIdea,
    rationale: implementationDetails,
    winningAgent: winningAgent,
    amplifierAgent: amplifierAgent,
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(amplifierAgent, 'completed', 'Amplification completed');
  }
  
  return {
    answer: finalIdea,
    rationale: implementationDetails,
    soloIdeas: validIdeas,
    megaIdeas: validMegaIdeas,
    votes: votes.filter(function(v) { return !v.error; }),
    winningIdea: winningIdea
  };
}

/**
 * Hybrid Guarded Braintrust
 * Balance creativity with safety and factual grounding
 */
async function executeHybridGuardedBraintrust(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  
  // Turn 1: Creative Ideation (borrowing from creative_brainstorm_swarm)
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'creative_ideation',
    timestamp: new Date().toISOString()
  });
  
  var rawIdeas = await Promise.all(agents.map(async function(agent) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'ideation',
      timestamp: new Date().toISOString()
    });
    
    var ideationPrompt = constructPrompt(
      prompt,
      agent,
      'You are in the ideation phase. Generate 3-5 novel, creative ideas or approaches that directly answer the user\'s question. Focus on originality, impact, and innovation ABOUT THE SPECIFIC TOPIC THEY ASKED. Present each idea with a title and brief explanation. Remember: if they asked about food, give creative food ideas. If they asked about technology, give tech ideas. Do NOT discuss collaboration or AI systems unless that was their question.'
    );
    
    try {
      var ideationContent = await getAgentResponse(agent, ideationPrompt, 'ideation', redisChannel, abortSignal, costTracker);
      
      return {
        agent: agent,
        content: ideationContent
      };
    } catch (error) {
      console.error(`Error getting ideas from ${agent}:`, error);
      return {
        agent: agent,
        content: `[${agent} was unable to provide ideas: ${error.message}]`,
        error: true
      };
    }
  }));
  
  // Check cost after ideation
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Filter out errored ideas
  var validRawIdeas = rawIdeas.filter(function(idea) { 
    return !idea.error;
  });
  
  if (validRawIdeas.length === 0) {
    throw new Error("All agents failed to generate ideas");
  }
  
  // Turn 2: Validation Sweep (rank and select top ideas for validation)
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'ranking_selection',
    timestamp: new Date().toISOString()
  });
  
  // Use an agent to rank and select the top ideas
  var rankerAgent = agents[0];
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: rankerAgent,
    phase: 'ranking',
    timestamp: new Date().toISOString()
  });
  
  var allIdeasText = validRawIdeas.map(function(idea) {
    return `${idea.agent.toUpperCase()}'S IDEAS:\n${idea.content}\n`;
  }).join('\n');
  
  var rankingPrompt = constructPrompt(
    prompt + "\n\nALL GENERATED IDEAS:\n" + allIdeasText,
    rankerAgent,
    'You are ranking ideas. Identify and rank the top 3-5 most promising ideas that best answer the user\'s original question. Base your ranking on how well each idea addresses WHAT THEY ACTUALLY ASKED ABOUT, plus originality, feasibility, and potential impact. Explain your reasoning for each selection in the context of their specific question.'
  );
  
  var rankingResponse;
  try {
    rankingResponse = await getAgentResponse(rankerAgent, rankingPrompt, 'ranking', redisChannel, abortSignal, costTracker);
  } catch (error) {
    console.error("Error in idea ranking:", error);
    // Fall back to using all ideas
    rankingResponse = allIdeasText;
  }
  
  // Check cost after ranking
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Turn 2 (continued): Validation Sweep
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'validation_sweep',
    timestamp: new Date().toISOString()
  });
  
  // Use multiple agents for validation (skip the ranker)
  var validatorAgents = agents.filter(function(agent) { 
    return agent !== rankerAgent;
  }).slice(0, 2); // Limit to 2 validators for efficiency
  
  if (validatorAgents.length === 0) {
    validatorAgents = [rankerAgent]; // Fall back to ranker if needed
  }
  
  var validations = await Promise.all(validatorAgents.map(async function(agent) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'validation',
      timestamp: new Date().toISOString()
    });
    
    var validationPrompt = constructPrompt(
      prompt + "\n\nIDEAS TO VALIDATE:\n" + rankingResponse,
      agent,
      'You are validating ideas. Evaluate these ideas IN THE CONTEXT OF THE USER\'S ORIGINAL QUESTION for: 1) Factual accuracy, 2) Feasibility, 3) Potential risks or limitations, and 4) Evidence supporting the concept. Rate each idea on how well it answers what they asked about. Focus on validating the content related to their specific topic, not collaboration methods.'
    );
    
    try {
      var validationContent = await getAgentResponse(agent, validationPrompt, 'validation', redisChannel, abortSignal, costTracker);
      
      return {
        agent: agent,
        content: validationContent
      };
    } catch (error) {
      console.error(`Error getting validation from ${agent}:`, error);
      return {
        agent: agent,
        content: `[${agent} was unable to provide validation: ${error.message}]`,
        error: true
      };
    }
  }));
  
  // Check cost after validation
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Filter out errored validations
  var validValidations = validations.filter(function(validation) { 
    return !validation.error;
  });
  
  // Turn 3: Rank & Elaborate (final selection based on combined score)
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'final_elaboration',
    timestamp: new Date().toISOString()
  });
  
  // Use the agent with the highest token limit for final elaboration
  var elaboratorAgent = null;
  try {
    const availableNonErrorAgents = [];
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !validValidations.find(validation => validation.agent === agent && validation.error)) {
        availableNonErrorAgents.push(agent);
      }
    }
    elaboratorAgent = await getAgentWithHighestTokenLimit(availableNonErrorAgents, options.models, userId);
  } catch (err) {
    console.error("Error getting agent with highest token limit:", err);
    // Fallback to first available agent
    for (const agent of agents) {
      if ((await isAgentAvailable(agent, userId)) && !validValidations.find(validation => validation.agent === agent && validation.error)) {
        elaboratorAgent = agent;
        break;
      }
    }
    if (!elaboratorAgent) elaboratorAgent = agents[0];
  }
  
  console.log(`👑 Using ${elaboratorAgent} for final elaboration (highest token limit)`);
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: elaboratorAgent,
    phase: 'elaboration',
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(elaboratorAgent, 'processing', 'Creating final elaboration');
  }
  
  var validationsText = validValidations.map(function(validation) {
    return `${validation.agent.toUpperCase()}'S VALIDATION:\n${validation.content}\n`;
  }).join('\n');
  
  var elaborationPrompt = constructPrompt(
    prompt + 
    "\n\nRANKED IDEAS:\n" + rankingResponse + 
    "\n\nVALIDATIONS:\n" + validationsText,
    elaboratorAgent,
    'You are creating the final answer. Based on the validations, identify the best idea that answers the user\'s original question. Develop this into a comprehensive response ABOUT WHAT THEY ASKED. If they asked about food, give a detailed food answer. If they asked about travel, give travel details. Include creative elements but stay focused on their actual topic. Do NOT discuss collaboration processes unless that was their question.'
  );
  
  var elaborationResponse;
  try {
    elaborationResponse = await getAgentResponse(elaboratorAgent, elaborationPrompt, 'elaboration', redisChannel, abortSignal, costTracker);
  } catch (error) {
    console.error("Error in elaboration phase:", error);
    // Fall back to using the top ranked idea
    elaborationResponse = "FINAL SOLUTION:\n" + rankingResponse.split('\n').slice(0, 10).join('\n');
  }
  
  // Extract final solution and supporting evidence
  var finalSolution = '';
  var supportingEvidence = '';
  
  if (elaborationResponse.includes('FINAL SOLUTION') && elaborationResponse.includes('SUPPORTING EVIDENCE')) {
    var parts = elaborationResponse.split('SUPPORTING EVIDENCE');
    finalSolution = parts[0].replace('FINAL SOLUTION', '').trim();
    supportingEvidence = parts[1].trim();
  } else if (elaborationResponse.includes('FINAL SOLUTION')) {
    finalSolution = elaborationResponse.replace('FINAL SOLUTION', '').trim();
    supportingEvidence = "See above for the complete solution.";
  } else {
    finalSolution = elaborationResponse;
    supportingEvidence = "This solution was selected and elaborated based on both creativity and validation scores.";
  }
  
  publishEvent(redisChannel, {
    type: 'collaboration_result',
    answer: finalSolution,
    rationale: supportingEvidence,
    elaborator: elaboratorAgent,
    timestamp: new Date().toISOString()
  });
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(elaboratorAgent, 'completed', 'Elaboration completed');
  }
  
  return {
    answer: finalSolution,
    rationale: supportingEvidence,
    rawIdeas: validRawIdeas,
    rankings: {
      agent: rankerAgent,
      content: rankingResponse
    },
    validations: validValidations,
    elaborator: elaboratorAgent
  };
}

/**
 * Helper Functions
 */

/**
 * Construct a prompt for a specific agent with system instructions
 */
function constructPrompt(userPrompt, agentProvider, instructions) {
  var baseSystemPrompt = SYSTEM_PROMPTS[agentProvider]?.agent ||
    "You are an AI assistant participating in a multi-model collaboration.";

  var systemPrompt = baseSystemPrompt;
  
  // If there are collaboration instructions, format them properly
  if (instructions) {
    systemPrompt = `${baseSystemPrompt}

COLLABORATION INSTRUCTIONS: ${instructions}

CRITICAL: You must answer the user's actual question below. Focus on the specific topic they are asking about. Do NOT discuss collaboration methods, AI systems, or meta-topics unless that is explicitly what the user is asking about. Use your collaborative role to enhance your answer to their actual question.`;
  }

  // Ensure userPrompt is never empty and clearly marked
  const safeUserPrompt = userPrompt || "Please provide a response based on your expertise.";
  
  // Add clear separation to ensure the user's question is the focus
  const formattedUserPrompt = `USER'S ACTUAL QUESTION TO ANSWER:
${safeUserPrompt}

Please provide your response focusing specifically on answering this question.`;

  console.log(`📋 constructPrompt for ${agentProvider}: system=${systemPrompt.length} chars, user=${formattedUserPrompt.length} chars`);

  return {
    systemPrompt: systemPrompt,
    userPrompt: formattedUserPrompt
  };
}

/**
 * Get a response from a specific agent
 */
async function getAgentResponse(agentProvider, prompt, phase, redisChannel, abortSignal, costTracker, modelId = null) {
  console.log(`🚀 getAgentResponse starting for ${agentProvider}${modelId ? ` with model ${modelId}` : ''}`);
  var client = getClient(agentProvider);
  
  if (!client) {
    console.error(`❌ ${agentProvider} client not available in getAgentResponse`);
    throw new Error(`${agentProvider} client not available`);
  }
  
  console.log(`✅ ${agentProvider} client found`);
  
  // Check if the operation has been aborted
  if (abortSignal && abortSignal.aborted) {
    console.warn(`⚠️ Operation aborted for ${agentProvider}`);
    const error = new Error('AbortError');
    error.name = 'AbortError';
    throw error;
  }
  
  // Check if we should abort based on cost
  if (costTracker.shouldAbort()) {
    console.warn(`⚠️ Cost limit exceeded for ${agentProvider}`);
    throw new Error('CostLimitExceededError');
  }
  
  // Use the appropriate client function based on provider
  var responseParts = [];
  var response = '';
  
  try {
    if (agentProvider === 'claude') {
      // Use the explicitly provided model ID or fall back to the DEFAULT_CLAUDE_MODEL from claude.mjs
      const claudeModelId = modelId || DEFAULT_CLAUDE_MODEL;
      console.log(`🔄 Using Claude API for ${agentProvider} with model ${claudeModelId}`);
      
      try {
        var claudeResponse = await clients.anthropic.messages.create({
          model: claudeModelId, // Use proper versioned model ID
          system: prompt.systemPrompt,
          messages: [{
            role: 'user',
            content: prompt.userPrompt
          }],
          max_tokens: 1500,
          stream: true
        });
        
        console.log(`✅ Claude API call successful, processing stream...`);
        
        for await (const chunk of claudeResponse) {
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
            
            // Check if we should abort
            if (costTracker.shouldAbort()) {
              console.warn(`⚠️ Cost limit exceeded during Claude streaming for ${agentProvider}`);
              throw new Error('CostLimitExceededError');
            }
            
            // Check if the operation has been aborted
            if (abortSignal.aborted) {
              console.warn(`⚠️ Operation aborted during Claude streaming for ${agentProvider}`);
              throw new Error('AbortError');
            }
          }
        }
      } catch (claudeError) {
        console.error(`❌ Claude API error for ${agentProvider}:`, claudeError);
        throw claudeError;
      }
    } else if (agentProvider === 'gemini') {
      // Use the explicitly provided model ID or fall back to a properly versioned default
      const geminiModelId = modelId || DEFAULT_GEMINI_MODEL;
      console.log(`🔄 Using Gemini API for ${agentProvider} with model ${geminiModelId}`);
      
      try {
        // Gemini model initialization
        var geminiModel = clients.gemini.getGenerativeModel({
          model: geminiModelId // Use proper versioned model ID
        });
        
        console.log(`✅ Gemini model initialized, preparing stream...`);
        
        // Configure streaming
        var geminiResponse = await geminiModel.generateContentStream({
          contents: [{
            role: 'user',
            parts: [{ text: prompt.systemPrompt + "\n\n" + prompt.userPrompt }]
          }]
        });
        
        console.log(`✅ Gemini API call successful, processing stream...`);
        
        for await (const chunk of geminiResponse.stream) {
          // Extract text from chunk - it's a function that needs to be called
          let chunkText = '';
          if (typeof chunk.text === 'function') {
            try {
              chunkText = chunk.text();
              // Check if we got a function definition instead of actual text
              if (typeof chunkText === 'string' && chunkText.includes('() => {')) {
                console.error(`❌ chunk.text() returned a function definition in Code Architect mode!`);
                // Skip this problematic chunk
                continue;
              }
            } catch (e) {
              console.error(`❌ Error calling chunk.text():`, e.message);
              continue;
            }
          } else if (chunk.text && typeof chunk.text === 'string') {
            chunkText = chunk.text;
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
            
            // Check if we should abort
            if (costTracker.shouldAbort()) {
              console.warn(`⚠️ Cost limit exceeded during Gemini streaming for ${agentProvider}`);
              throw new Error('CostLimitExceededError');
            }
            
            // Check if the operation has been aborted
            if (abortSignal.aborted) {
              console.warn(`⚠️ Operation aborted during Gemini streaming for ${agentProvider}`);
              throw new Error('AbortError');
            }
          }
        }
      } catch (geminiError) {
        console.error(`❌ Gemini API error for ${agentProvider}:`, geminiError);
        throw geminiError;
      }
    } else {
      // For other models (ChatGPT, Grok, DeepSeek, Llama), use the OpenAI-compatible client
      console.log(`🔄 Using OpenAI-compatible API for ${agentProvider}`);
      try {
        var modelName = getDefaultModelForProvider(agentProvider);
        console.log(`✅ Selected model for ${agentProvider}: ${modelName}`);
        
        var messages = [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ];
        
        console.log(`📤 Preparing OpenAI-compatible call for ${agentProvider} with ${messages.length} messages`);
        
        var openaiCompatibleResponse = await client.chat.completions.create({
          model: modelName,
          messages: messages,
          max_tokens: agentProvider === 'deepseek' ? 8000 : 4000,
          stream: true,
          temperature: 0.7
        });
        
        console.log(`✅ OpenAI-compatible API call successful for ${agentProvider}, processing stream...`);
        
        for await (const chunk of openaiCompatibleResponse) {
          if (chunk.choices && chunk.choices[0]?.delta?.content) {
            var content = chunk.choices[0].delta.content;
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
            
            // Check if we should abort
            if (costTracker.shouldAbort()) {
              console.warn(`⚠️ Cost limit exceeded during OpenAI-compatible streaming for ${agentProvider}`);
              throw new Error('CostLimitExceededError');
            }
            
            // Check if the operation has been aborted
            if (abortSignal.aborted) {
              console.warn(`⚠️ Operation aborted during OpenAI-compatible streaming for ${agentProvider}`);
              throw new Error('AbortError');
            }
          }
        }
      } catch (openAIError) {
        console.error(`❌ OpenAI-compatible API error for ${agentProvider}:`, openAIError);
        throw openAIError;
      }
    }
    
    response = responseParts.join('');
    console.log(`✅ Complete response received from ${agentProvider} (${response.length} chars)`);
    
    // Publish completion event to Redis
    publishEvent(redisChannel, {
      type: 'agent_response_complete',
      agent: agentProvider,
      phase: phase,
      responseLength: response.length,
      timestamp: new Date().toISOString()
    });
    
    // Calculate approximate token counts for billing (more precise count available in API responses)
    var inputTokenEstimate = estimateTokenCount(prompt.systemPrompt + prompt.userPrompt);
    costTracker.addInputTokens(agentProvider, inputTokenEstimate);
    
    if (response.length === 0) {
      console.warn(`⚠️ Empty response received from ${agentProvider}`);
      throw new Error(`Empty response from ${agentProvider}`);
    }
    
    console.log(`🏁 getAgentResponse completed successfully for ${agentProvider}`);
    return response;
  } catch (error) {
    if (error.message === 'AbortError' || error.name === 'AbortError') {
      console.error(`❌ Operation aborted for ${agentProvider}`);
      throw new Error('AbortError');
    } else if (error.message === 'CostLimitExceededError') {
      console.error(`❌ Cost limit exceeded for ${agentProvider}`);
      throw new Error('CostLimitExceededError');
    } else {
      console.error(`❌ Error getting response from ${agentProvider}:`, error);
      console.error(`🔍 Error details for ${agentProvider}:`, error.stack || error);
      
      // Check if error is from API
      const errorMessage = error.response?.status 
        ? `API error (${error.response.status}): ${error.message}`
        : error.message;
      
      throw new Error(`Failed to get response from ${agentProvider}: ${errorMessage}`);
    }
  }
}

/**
 * Get the default model for a provider
 */
function getDefaultModelForProvider(provider) {
  var modelMap = {
    'claude': 'claude-4-sonnet-20250514',
    'chatgpt': 'gpt-4.1',
    'grok': 'grok-3-mini',
    'deepseek': 'deepseek-chat',
    'llama': 'Llama-4-Maverick-17B-128E-Instruct-FP8',
    'gemini': 'gemini-2.5-pro-preview-05-06'
  };

  return modelMap[provider] || provider;
}

/**
 * Estimate token count in a string (very approximate)
 */
function estimateTokenCount(text) {
  // Simple approximation: average English tokens are ~4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Extract the agent a voter voted for from their reasoning
 */
function extractVotedAgent(voteText, agents) {
  // Try to find an agent name mentioned near voting keywords
  var voteKeywords = ['vote', 'choose', 'select', 'prefer', 'pick'];
  var lowercaseText = voteText.toLowerCase();
  
  for (var i = 0; i < voteKeywords.length; i++) {
    var keyword = voteKeywords[i];
    var keywordIndex = lowercaseText.indexOf(keyword);
    
    if (keywordIndex !== -1) {
      // Look for agent names within 50 characters after the keyword
      var searchText = lowercaseText.substring(keywordIndex, keywordIndex + 50);
      
      for (var j = 0; j < agents.length; j++) {
        var agent = agents[j];
        if (searchText.includes(agent.toLowerCase())) {
          return agent;
        }
      }
    }
  }
  
  // Fall back to first agent mentioned in the text
  for (var k = 0; k < agents.length; k++) {
    var agentName = agents[k];
    if (lowercaseText.includes(agentName.toLowerCase())) {
      return agentName;
    }
  }
  
  return null;
}

/**
 * Determine the most reliable agent based on the chain of responses
 */
function determineMostReliableAgent(agents, chain) {
  // Simple heuristic: agent with most successful completions
  var successCounts = {};
  
  agents.forEach(function(agent) {
    successCounts[agent] = 0;
  });
  
  chain.forEach(function(item) {
    if (!item.error) {
      successCounts[item.agent]++;
    }
  });
  
  return Object.keys(successCounts).reduce(function(a, b) {
    return successCounts[a] > successCounts[b] ? a : b;
  }, agents[0]);
}

/**
 * Individual Responses (No Collaboration)
 * Each AI responds independently
 */
async function executeIndividualResponses(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  
  // Get individual responses from each agent
  var responses = [];
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'individual_responses',
    timestamp: new Date().toISOString()
  });
  
  for (var i = 0; i < agents.length; i++) {
    var agent = agents[i];
    
    // Skip unavailable agents
    if (!(await isAgentAvailable(agent, userId))) continue;
    
    try {
      // Publish event that agent is thinking
      publishEvent(redisChannel, {
        type: 'agent_thinking',
        agent: agent,
        phase: 'individual_response',
        timestamp: new Date().toISOString()
      });
      
      // Construct a basic prompt for each agent
      var agentPrompt = constructPrompt(
        prompt,
        agent,
        'Provide a helpful, comprehensive response to the query.'
      );
      
      // Get response
      var response = await getAgentResponse(
        agent, 
        agentPrompt, 
        'individual_response', 
        redisChannel, 
        abortSignal, 
        costTracker
      );
      
      responses.push({
        agent: agent,
        content: response
      });
      
    } catch (error) {
      console.error(`Error getting response from ${agent}:`, error);
      responses.push({
        agent: agent,
        content: `[${agent} was unable to provide a response: ${error.message}]`,
        error: true
      });
    }
    
    // Check if we should abort based on cost
    if (costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
    
    // Check if the operation has been aborted
    if (abortSignal.aborted) {
      throw new Error('AbortError');
    }
  }
  
  // Filter valid responses
  var validResponses = responses.filter(function(r) { return !r.error; });
  
  if (validResponses.length === 0) {
    return {
      answer: "All AI models failed to provide responses.",
      rationale: "There was an error getting responses from all selected models.",
      individualResponses: responses
    };
  }
  
  // For individual mode, we just compile the responses
  var summarizedAnswer = "Individual responses from each AI model:";
  
  validResponses.forEach(function(response) {
    summarizedAnswer += `\n\n## ${response.agent.toUpperCase()}'S RESPONSE:\n${response.content}`;
  });
  
  return {
    answer: summarizedAnswer,
    rationale: "Each AI has provided an independent response with no collaboration between models.",
    individualResponses: responses
  };
}

/**
 * Code Architect Mode
 * Enterprise software development workflow
 */
async function executeCodeArchitect(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  // Need at least 3 agents for this mode
  if (agents.length < 3) {
    throw new Error("Code Architect mode requires at least 3 agents");
  }
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'code_architect',
    timestamp: new Date().toISOString()
  });
  
  var roles = {
    architect: agents[0],
    developer: agents.length > 1 ? agents[1] : agents[0],
    reviewer: agents.length > 2 ? agents[2] : agents[0],
    tester: agents.length > 3 ? agents[3] : agents[1]
  };
  
  // Set initial pending status for all agents
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(roles.architect, 'pending', 'Waiting for architecture phase');
    if (roles.developer !== roles.architect) {
      options.onModelStatusChange(roles.developer, 'pending', 'Waiting for implementation phase');
    }
    if (roles.reviewer !== roles.architect && roles.reviewer !== roles.developer) {
      options.onModelStatusChange(roles.reviewer, 'pending', 'Waiting for review phase');
    }
    if (roles.tester !== roles.architect && roles.tester !== roles.developer && roles.tester !== roles.reviewer) {
      options.onModelStatusChange(roles.tester, 'pending', 'Waiting for testing phase');
    }
  }
  
  // Helper function to truncate content to prevent token overflow
  function truncateForContext(content, maxChars = 2000) {
    if (content.length <= maxChars) return content;
    return content.substring(0, maxChars) + "\n\n[Content truncated for brevity...]";
  }
  
  // Phase 1: Architecture and Design
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'architecture_design',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: roles.architect,
    phase: 'architecture',
    timestamp: new Date().toISOString()
  });
  
  // Update status to processing
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(roles.architect, 'processing', 'Creating architecture design');
  }
  
  var architectPrompt = constructPrompt(
    prompt,
    roles.architect,
    'You are the Software Architect. Create a detailed technical design for this code request. Provide:\n\n1. FUNCTIONAL REQUIREMENTS: Clear list of what the code must do\n2. TECHNICAL REQUIREMENTS: Performance, browser compatibility, etc.\n3. FILE STRUCTURE: Exact file names and organization\n4. COMPONENT DESIGN: Detailed breakdown of each component/module\n5. TECHNOLOGY STACK: Specific technologies, frameworks, libraries to use\n6. IMPLEMENTATION GUIDELINES: Clear instructions for the developer\n\nBe specific and detailed. The developer will use this to create production-ready code.'
  );
  
  var architectureDesign;
  try {
    architectureDesign = await getAgentResponse(
      roles.architect,
      architectPrompt,
      'architecture',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Publish completion for architect
    publishEvent(redisChannel, {
      type: 'agent_response_complete',
      agent: roles.architect,
      phase: 'architecture_design',
      timestamp: new Date().toISOString()
    });
    
    // Update status to completed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.architect, 'completed', 'Architecture design completed');
    }
  } catch (error) {
    console.error("Error in architecture phase:", error);
    
    // Update status to failed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.architect, 'failed', `Architecture failed: ${error.message}`);
    }
    
    return {
      answer: "Failed during architecture phase.",
      rationale: `Error: ${error.message}`,
      architecture: null,
      implementation: null,
      review: null,
      tests: null
    };
  }
  
  // Check cost after architecture
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 2: Implementation
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'implementation',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: roles.developer,
    phase: 'implementation',
    timestamp: new Date().toISOString()
  });
  
  // Update status to processing
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(roles.developer, 'processing', 'Implementing code based on architecture');
  }
  
  var implementationPrompt = constructPrompt(
    prompt + "\n\nARCHITECTURE DESIGN:\n" + truncateForContext(architectureDesign),
    roles.developer,
    'You are the Developer. Implement COMPLETE, FUNCTIONAL, PRODUCTION-READY code according to the provided architecture design. IMPORTANT: Provide the FULL working code, not code snippets or placeholders. Include:\n- Complete HTML files with proper structure\n- Complete CSS files with all styling\n- Complete JavaScript files with all functionality\n- All necessary files and dependencies\n- Proper file organization and structure\n- Production-ready, fully functional code\n\nDO NOT provide incomplete code, templates, or "// TODO" placeholders. Provide COMPLETE working implementation that can be used immediately in production.'
  );
  
  var implementation;
  try {
    implementation = await getAgentResponse(
      roles.developer,
      implementationPrompt,
      'implementation',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Publish completion for developer
    publishEvent(redisChannel, {
      type: 'agent_response_complete',
      agent: roles.developer,
      phase: 'implementation',
      timestamp: new Date().toISOString()
    });
    
    // Update status to completed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.developer, 'completed', 'Implementation completed');
    }
  } catch (error) {
    console.error("Error in implementation phase:", error);
    
    // Update status to failed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.developer, 'failed', `Implementation failed: ${error.message}`);
    }
    
    return {
      answer: "Failed during implementation phase.",
      rationale: `Error: ${error.message}`,
      architecture: architectureDesign,
      implementation: null,
      review: null,
      tests: null
    };
  }
  
  // Check cost after implementation
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 3: Code Review
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'code_review',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: roles.reviewer,
    phase: 'review',
    timestamp: new Date().toISOString()
  });
  
  // Update status to processing
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(roles.reviewer, 'processing', 'Reviewing code quality');
  }
  
  var reviewPrompt = constructPrompt(
    prompt + 
    "\n\nARCHITECTURE DESIGN:\n" + truncateForContext(architectureDesign) + 
    "\n\nIMPLEMENTATION:\n" + truncateForContext(implementation),
    roles.reviewer,
    'You are the Code Reviewer. Review the implementation against the architecture design and requirements. Identify bugs, code smells, security vulnerabilities, performance issues, and maintainability concerns. Provide specific suggestions for improvement with code examples where appropriate.'
  );
  
  var review;
  try {
    review = await getAgentResponse(
      roles.reviewer,
      reviewPrompt,
      'review',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Publish completion for reviewer
    publishEvent(redisChannel, {
      type: 'agent_response_complete',
      agent: roles.reviewer,
      phase: 'code_review',
      timestamp: new Date().toISOString()
    });
    
    // Update status to completed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.reviewer, 'completed', 'Code review completed');
    }
  } catch (error) {
    console.error("Error in review phase:", error);
    
    // Update status to failed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.reviewer, 'failed', `Review failed: ${error.message}`);
    }
    
    return {
      answer: "Failed during review phase.",
      rationale: `Error: ${error.message}`,
      architecture: architectureDesign,
      implementation: implementation,
      review: null,
      tests: null
    };
  }
  
  // Check cost after review
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 4: Test Plans
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'test_planning',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: roles.tester,
    phase: 'testing',
    timestamp: new Date().toISOString()
  });
  
  // Update status to processing
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(roles.tester, 'processing', 'Creating test plans');
  }
  
  var testPrompt = constructPrompt(
    prompt + 
    "\n\nARCHITECTURE DESIGN:\n" + truncateForContext(architectureDesign) + 
    "\n\nIMPLEMENTATION:\n" + truncateForContext(implementation) +
    "\n\nCODE REVIEW:\n" + truncateForContext(review),
    roles.tester,
    'You are the QA Engineer. Create a comprehensive test plan for this code including unit tests, integration tests, and end-to-end tests. Focus on edge cases, error conditions, and important functional requirements. Include test data and expected outcomes.'
  );
  
  var tests;
  try {
    tests = await getAgentResponse(
      roles.tester,
      testPrompt,
      'testing',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Publish completion for tester
    publishEvent(redisChannel, {
      type: 'agent_response_complete',
      agent: roles.tester,
      phase: 'test_planning',
      timestamp: new Date().toISOString()
    });
    
    // Update status to completed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.tester, 'completed', 'Test planning completed');
    }
  } catch (error) {
    console.error("Error in testing phase:", error);
    
    // Update status to failed
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(roles.tester, 'failed', `Testing failed: ${error.message}`);
    }
    
    return {
      answer: "Failed during testing phase.",
      rationale: `Error: ${error.message}`,
      architecture: architectureDesign,
      implementation: implementation,
      review: review,
      tests: null
    };
  }
  
  // Compile final answer with FULL content - no truncation
  var finalAnswer = "# Software Development Summary\n\n";
  finalAnswer += "## Architecture Design\n\n" + architectureDesign + "\n\n";
  finalAnswer += "## Implementation\n\n" + implementation + "\n\n";
  finalAnswer += "## Code Review\n\n" + review + "\n\n";
  finalAnswer += "## Test Plan\n\n" + tests;
  
  return {
    answer: finalAnswer,
    rationale: "Complete software development lifecycle executed using specialized AI roles.",
    architecture: architectureDesign,
    implementation: implementation,
    review: review,
    tests: tests
  };
}

/**
 * Adversarial Debate Mode
 * Structured debate with pro/con analysis
 */
async function executeAdversarialDebate(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  // Need at least 2 agents for this mode
  if (agents.length < 2) {
    throw new Error("Adversarial Debate mode requires at least 2 agents");
  }
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'adversarial_debate',
    timestamp: new Date().toISOString()
  });
  
  // Assign roles
  var proponent = agents[0];
  var opponent = agents[1];
  var moderator = agents.length > 2 ? agents[2] : agents[0];
  
  // Phase 1: Initial positions
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'initial_positions',
    timestamp: new Date().toISOString()
  });
  
  // Proponent perspective
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: proponent,
    phase: 'proponent',
    timestamp: new Date().toISOString()
  });
  
  var proponentPrompt = constructPrompt(
    prompt,
    proponent,
    'You are taking the AFFIRMATIVE position in this debate. Present the strongest, most convincing case for this position or approach. Focus on advantages, benefits, supporting evidence, and address potential objections.'
  );
  
  var proArgument;
  try {
    proArgument = await getAgentResponse(
      proponent,
      proponentPrompt,
      'proponent',
      redisChannel,
      abortSignal,
      costTracker
    );
  } catch (error) {
    console.error("Error in proponent phase:", error);
    return {
      answer: "Failed during proponent phase.",
      rationale: `Error: ${error.message}`,
      proArgument: null,
      conArgument: null,
      rebuttal: null,
      synthesis: null
    };
  }
  
  // Check cost after proponent
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Opponent perspective
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: opponent,
    phase: 'opponent',
    timestamp: new Date().toISOString()
  });
  
  var opponentPrompt = constructPrompt(
    prompt + "\n\nOPPOSING VIEW TO ADDRESS:\n" + proArgument,
    opponent,
    'You are taking the OPPOSING position in this debate. Present the strongest, most convincing counterarguments against the proposed position or approach. Focus on limitations, drawbacks, risks, and alternative perspectives.'
  );
  
  var conArgument;
  try {
    conArgument = await getAgentResponse(
      opponent,
      opponentPrompt,
      'opponent',
      redisChannel,
      abortSignal,
      costTracker
    );
  } catch (error) {
    console.error("Error in opponent phase:", error);
    return {
      answer: "Failed during opponent phase.",
      rationale: `Error: ${error.message}`,
      proArgument: proArgument,
      conArgument: null,
      rebuttal: null,
      synthesis: null
    };
  }
  
  // Check cost after opponent
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 2: Rebuttals
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'rebuttals',
    timestamp: new Date().toISOString()
  });
  
  // Proponent rebuttal
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: proponent,
    phase: 'rebuttal',
    timestamp: new Date().toISOString()
  });
  
  var rebuttalPrompt = constructPrompt(
    prompt + 
    "\n\nYOUR INITIAL ARGUMENT:\n" + proArgument + 
    "\n\nOPPONENT'S COUNTERARGUMENT:\n" + conArgument,
    proponent,
    'Address the opponent\'s counterarguments directly. Defend your position while acknowledging valid criticisms. Provide additional evidence or clarifications as needed.'
  );
  
  var rebuttal;
  try {
    rebuttal = await getAgentResponse(
      proponent,
      rebuttalPrompt,
      'rebuttal',
      redisChannel,
      abortSignal,
      costTracker
    );
  } catch (error) {
    console.error("Error in rebuttal phase:", error);
    return {
      answer: "Failed during rebuttal phase.",
      rationale: `Error: ${error.message}`,
      proArgument: proArgument,
      conArgument: conArgument,
      rebuttal: null,
      synthesis: null
    };
  }
  
  // Check cost after rebuttal
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 3: Synthesis and balanced conclusion
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'synthesis',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: moderator,
    phase: 'synthesis',
    timestamp: new Date().toISOString()
  });
  
  var synthesisPrompt = constructPrompt(
    prompt + 
    "\n\nPRO POSITION:\n" + proArgument + 
    "\n\nCON POSITION:\n" + conArgument + 
    "\n\nREBUTTAL:\n" + rebuttal,
    moderator,
    'As a neutral moderator, synthesize the strongest arguments from both sides of this debate. Present a balanced conclusion that acknowledges trade-offs and identifies the contexts in which different approaches may be valid. Highlight areas of agreement and disagreement.'
  );
  
  var synthesis;
  try {
    synthesis = await getAgentResponse(
      moderator,
      synthesisPrompt,
      'synthesis',
      redisChannel,
      abortSignal,
      costTracker
    );
  } catch (error) {
    console.error("Error in synthesis phase:", error);
    return {
      answer: "Failed during synthesis phase.",
      rationale: `Error: ${error.message}`,
      proArgument: proArgument,
      conArgument: conArgument,
      rebuttal: rebuttal,
      synthesis: null
    };
  }
  
  // Compile final answer
  var finalAnswer = "# Structured Debate Analysis\n\n";
  finalAnswer += "## Pro Perspective\n\n" + proArgument + "\n\n";
  finalAnswer += "## Con Perspective\n\n" + conArgument + "\n\n";
  finalAnswer += "## Rebuttal\n\n" + rebuttal + "\n\n";
  finalAnswer += "## Balanced Synthesis\n\n" + synthesis;
  
  return {
    answer: finalAnswer,
    rationale: "Multi-perspective analysis through structured adversarial debate.",
    proArgument: proArgument,
    conArgument: conArgument,
    rebuttal: rebuttal,
    synthesis: synthesis
  };
}

/**
 * Expert Panel Mode
 * Simulates diverse domain experts
 */
async function executeExpertPanel(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  // Need at least 3 agents for this mode
  if (agents.length < 3) {
    throw new Error("Expert Panel mode works best with at least 3 agents");
  }
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'expert_panel',
    timestamp: new Date().toISOString()
  });
  
  // Define expert roles based on the prompt
  // For simplicity, we'll use predefined roles, but in production this should
  // dynamically identify required domains of expertise based on prompt analysis
  var roles = [
    { name: "Technical Expert", focus: "technical implementation, feasibility, and best practices" },
    { name: "Business Strategist", focus: "business value, market positioning, and competitive advantage" },
    { name: "User Experience Specialist", focus: "usability, accessibility, and user satisfaction" },
    { name: "Risk & Compliance Analyst", focus: "potential risks, compliance issues, and mitigations" }
  ];
  
  // Limit roles to available agents
  roles = roles.slice(0, agents.length);
  
  // Phase 1: Expert Analysis
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'expert_analysis',
    timestamp: new Date().toISOString()
  });
  
  var expertInsights = [];
  
  for (var i = 0; i < roles.length; i++) {
    var role = roles[i];
    var agent = agents[i];
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'expert_' + i,
      timestamp: new Date().toISOString()
    });
    
    var expertPrompt = constructPrompt(
      prompt,
      agent,
      `You are the ${role.name} on this expert panel. Analyze the query from the perspective of ${role.focus}. Provide specialized insights and recommendations that others might miss. Highlight important considerations specific to your domain.`
    );
    
    try {
      var insight = await getAgentResponse(
        agent,
        expertPrompt,
        'expert_analysis',
        redisChannel,
        abortSignal,
        costTracker
      );
      
      expertInsights.push({
        role: role.name,
        agent: agent,
        content: insight
      });
      
    } catch (error) {
      console.error(`Error getting insights from ${role.name}:`, error);
      expertInsights.push({
        role: role.name,
        agent: agent,
        content: `[${role.name} was unable to provide insights: ${error.message}]`,
        error: true
      });
    }
    
    // Check if we should abort based on cost
    if (costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
    
    // Check if the operation has been aborted
    if (abortSignal.aborted) {
      throw new Error('AbortError');
    }
  }
  
  // Filter valid insights
  var validInsights = expertInsights.filter(function(insight) { return !insight.error; });
  
  if (validInsights.length === 0) {
    return {
      answer: "All experts failed to provide insights.",
      rationale: "There was an error getting insights from the expert panel.",
      insights: expertInsights,
      discussion: null,
      recommendation: null
    };
  }
  
  // Phase 2: Panel Discussion
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'panel_discussion',
    timestamp: new Date().toISOString()
  });
  
  // Select a moderator for the discussion
  var moderator = agents[0];
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: moderator,
    phase: 'discussion',
    timestamp: new Date().toISOString()
  });
  
  var expertInsightsText = validInsights.map(function(insight) {
    return `${insight.role} (${insight.agent}):\n${insight.content}\n`;
  }).join('\n');
  
  var discussionPrompt = constructPrompt(
    prompt + "\n\nINDIVIDUAL EXPERT INSIGHTS:\n" + expertInsightsText,
    moderator,
    'As the panel moderator, simulate a discussion between these experts. Identify areas of agreement, disagreement, and complementary insights. Highlight how different perspectives interact with each other. Format as a dialogue between experts.'
  );
  
  var discussion;
  try {
    discussion = await getAgentResponse(
      moderator,
      discussionPrompt,
      'discussion',
      redisChannel,
      abortSignal,
      costTracker
    );
  } catch (error) {
    console.error("Error in panel discussion phase:", error);
    return {
      answer: "Failed during panel discussion phase.",
      rationale: `Error: ${error.message}`,
      insights: expertInsights,
      discussion: null,
      recommendation: null
    };
  }
  
  // Check cost after discussion
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 3: Consolidated Recommendation
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'recommendation',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: moderator,
    phase: 'recommendation',
    timestamp: new Date().toISOString()
  });
  
  var recommendationPrompt = constructPrompt(
    prompt + 
    "\n\nEXPERT INSIGHTS:\n" + expertInsightsText + 
    "\n\nPANEL DISCUSSION:\n" + discussion,
    moderator,
    'Synthesize the panel\'s collective wisdom into a comprehensive recommendation. Integrate insights from all domains of expertise. Highlight trade-offs and key considerations. Format as an actionable recommendation with clearly defined next steps.'
  );
  
  var recommendation;
  try {
    recommendation = await getAgentResponse(
      moderator,
      recommendationPrompt,
      'recommendation',
      redisChannel,
      abortSignal,
      costTracker
    );
  } catch (error) {
    console.error("Error in recommendation phase:", error);
    return {
      answer: "Failed during recommendation phase.",
      rationale: `Error: ${error.message}`,
      insights: expertInsights,
      discussion: discussion,
      recommendation: null
    };
  }
  
  // Compile final answer
  var finalAnswer = "# Multi-Disciplinary Expert Analysis\n\n";
  finalAnswer += "## Expert Panel Insights\n\n";
  
  // Include full expert insights
  validInsights.forEach(function(insight) {
    finalAnswer += `### ${insight.role}\n${insight.content}\n\n`;
  });
  
  finalAnswer += "## Panel Discussion\n\n" + discussion + "\n\n";
  finalAnswer += "## Integrated Recommendation\n\n" + recommendation;
  
  return {
    answer: finalAnswer,
    rationale: "Cross-disciplinary analysis from simulated domain experts.",
    insights: expertInsights,
    discussion: discussion,
    recommendation: recommendation
  };
}

/**
 * Scenario Analysis Mode
 * Strategic foresight methodology
 */
async function executeScenarioAnalysis(prompt, agents, redisChannel, abortSignal, costTracker, options = {}) {
  const userId = options.userId || null;
  // Need at least 3 agents for this mode
  if (agents.length < 3) {
    throw new Error("Scenario Analysis mode works best with at least 3 agents");
  }
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'scenario_analysis',
    timestamp: new Date().toISOString()
  });
  
  // Publish initial progress
  publishEvent(redisChannel, {
    type: 'progress_update',
    phase: 'scenario_analysis',
    currentStep: 0,
    totalSteps: 3, // 3 phases: trends, scenarios, strategy
    percentage: 0,
    timestamp: new Date().toISOString()
  });
  
  // Select agents for different roles
  var trendsAnalyst = agents[0];
  var scenarioBuilder = agents[1];
  var strategist = agents[2];
  
  // Phase 1: Identify Key Trends and Uncertainties
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'trends_analysis',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: trendsAnalyst,
    phase: 'trends',
    timestamp: new Date().toISOString()
  });
  
  var trendsPrompt = constructPrompt(
    prompt,
    trendsAnalyst,
    'You are a Trends Analyst. Identify the key trends, drivers of change, and critical uncertainties relevant to this question or challenge. For each factor, assess its impact and uncertainty. Focus on factors that have high impact but uncertain outcomes as these will form the basis for different future scenarios.'
  );
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(trendsAnalyst, 'processing', 'Analyzing trends and uncertainties');
  }
  
  var trendsAnalysis;
  try {
    trendsAnalysis = await getAgentResponse(
      trendsAnalyst,
      trendsPrompt,
      'trends',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Mark complete
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(trendsAnalyst, 'completed', 'Trends analysis completed');
    }
    
    // Update progress
    publishEvent(redisChannel, {
      type: 'progress_update',
      phase: 'scenario_analysis',
      currentStep: 1,
      totalSteps: 3,
      percentage: 33,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error in trends analysis phase:", error);
    return {
      answer: "Failed during trends analysis phase.",
      rationale: `Error: ${error.message}`,
      trends: null,
      scenarios: null,
      strategy: null
    };
  }
  
  // Check cost after trends analysis
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 2: Develop Alternative Scenarios
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'scenario_development',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: scenarioBuilder,
    phase: 'scenarios',
    timestamp: new Date().toISOString()
  });
  
  var scenariosPrompt = constructPrompt(
    prompt + "\n\nTRENDS AND UNCERTAINTIES:\n" + trendsAnalysis,
    scenarioBuilder,
    'You are a Scenario Planner. Based on the identified trends and uncertainties, develop 3-4 distinct, plausible future scenarios. Each scenario should have a descriptive name, narrative description, key characteristics, and implications for the question or challenge. These scenarios should be diverse enough to cover the range of possible futures.'
  );
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(scenarioBuilder, 'processing', 'Building future scenarios');
  }
  
  var scenarios;
  try {
    scenarios = await getAgentResponse(
      scenarioBuilder,
      scenariosPrompt,
      'scenarios',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Mark complete
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(scenarioBuilder, 'completed', 'Scenario development completed');
    }
    
    // Update progress
    publishEvent(redisChannel, {
      type: 'progress_update',
      phase: 'scenario_analysis',
      currentStep: 2,
      totalSteps: 3,
      percentage: 67,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error in scenario development phase:", error);
    return {
      answer: "Failed during scenario development phase.",
      rationale: `Error: ${error.message}`,
      trends: trendsAnalysis,
      scenarios: null,
      strategy: null
    };
  }
  
  // Check cost after scenarios
  if (costTracker.shouldAbort()) {
    throw new Error('CostLimitExceededError');
  }
  
  // Phase 3: Strategic Recommendations
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'strategy_development',
    timestamp: new Date().toISOString()
  });
  
  publishEvent(redisChannel, {
    type: 'agent_thinking',
    agent: strategist,
    phase: 'strategy',
    timestamp: new Date().toISOString()
  });
  
  var strategyPrompt = constructPrompt(
    prompt + 
    "\n\nTRENDS AND UNCERTAINTIES:\n" + trendsAnalysis + 
    "\n\nFUTURE SCENARIOS:\n" + scenarios,
    strategist,
    'You are a Strategic Advisor. Develop robust strategic recommendations that would work across multiple scenarios. Identify "no-regrets" moves that make sense in any future, as well as contingent strategies that should be implemented only if certain scenarios begin to unfold. Provide a clear roadmap with short-term actions and longer-term strategic positioning.'
  );
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
    options.onModelStatusChange(strategist, 'processing', 'Developing strategic recommendations');
  }
  
  var strategy;
  try {
    strategy = await getAgentResponse(
      strategist,
      strategyPrompt,
      'strategy',
      redisChannel,
      abortSignal,
      costTracker
    );
    
    // Mark complete
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(strategist, 'completed', 'Strategic recommendations completed');
    }
    
    // Update progress to 100%
    publishEvent(redisChannel, {
      type: 'progress_update',
      phase: 'scenario_analysis',
      currentStep: 3,
      totalSteps: 3,
      percentage: 100,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error in strategy development phase:", error);
    return {
      answer: "Failed during strategy development phase.",
      rationale: `Error: ${error.message}`,
      trends: trendsAnalysis,
      scenarios: scenarios,
      strategy: null
    };
  }
  
  // Compile final answer
  var finalAnswer = "# Strategic Scenario Analysis\n\n";
  finalAnswer += "## Key Trends & Uncertainties\n\n" + trendsAnalysis + "\n\n";
  finalAnswer += "## Alternative Future Scenarios\n\n" + scenarios + "\n\n";
  finalAnswer += "## Strategic Recommendations\n\n" + strategy;
  
  return {
    answer: finalAnswer,
    rationale: "Robust strategic analysis accounting for multiple possible futures.",
    trends: trendsAnalysis,
    scenarios: scenarios,
    strategy: strategy
  };
}

/**
 * Get the current collaboration configuration
 * @returns {Object} - Current collaboration configuration
 */
export function getCollaborationConfig() {
  return {
    currentStyle: collaborationConfig.currentStyle,
    mode: collaborationConfig.mode,
    collaborationOrder: collaborationConfig.collaborationOrder,
    availableStyles: Object.entries(collaborationConfig.styles).map(function([id, style]) {
      return { id, name: style.name, description: style.description };
    }),
    availableModes: [
      'individual',
      'round_table',
      'sequential_critique_chain',
      'validated_consensus',
      'creative_brainstorm_swarm',
      'hybrid_guarded_braintrust',
      'code_architect',
      'adversarial_debate',
      'expert_panel',
      'scenario_analysis'
    ]
  };
}

/**
 * Set the collaboration style
 * @param {string} style - Style name
 * @returns {boolean} - Success flag
 */
export function setCollaborationStyle(style) {
  if (collaborationConfig.styles[style]) {
    collaborationConfig.currentStyle = style;
    console.log(`Collaboration style updated to ${style}`);
    return true;
  }
  return false;
}

/**
 * Set the collaboration mode
 * @param {string} mode - Mode name
 * @returns {boolean} - Success flag
 */
export function setCollaborationMode(mode) {
  var validModes = [
    'individual',
    'round_table',
    'sequential_critique_chain',
    'validated_consensus',
    'creative_brainstorm_swarm',
    'hybrid_guarded_braintrust',
    'code_architect',
    'adversarial_debate',
    'expert_panel',
    'scenario_analysis'
  ];
  
  // No special mode mapping needed
  
  if (validModes.includes(mode)) {
    collaborationConfig.mode = mode;
    console.log(`Collaboration mode updated to ${mode}`);
    return true;
  }
  return false;
}

/**
 * Handle a collaborative discussion between multiple AI models
 * @param {Object} options - Collaboration options
 * @returns {Promise<Object>} - Collaboration results
 */
export async function handleCollaborativeDiscussion(options) {
  console.log(`🚀 Starting collaborative discussion with options:`, JSON.stringify({
    mode: options.mode,
    agents: options.agents,
    prompt_length: options.prompt?.length || 0,
    userId: options.userId || 'system'
  }));
  
  // Apply the current collaboration style to the options
  var style = collaborationConfig.styles[collaborationConfig.currentStyle];
  var styleDirective = style ? style.promptDirective : '';
  
  // Ensure we have a valid session ID
  var sessionId = options.sessionId || 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  
  // Use the current configuration mode if not specified
  var mode = options.mode || collaborationConfig.mode;
  console.log(`🔄 Using collaboration mode: ${mode}`);
  
  // Use the collaboration order if agents not specified
  var agents = options.agents || collaborationConfig.collaborationOrder;
  console.log(`🤖 Using agents: ${agents.join(', ')}`);
  
  // Get user ID for API key checking
  var userId = options.userId || null;
  
  // Filter out unavailable agents - check both system and user API keys
  var availableAgents = [];
  for (const agent of agents) {
    try {
      // Check if API key is available (user or system)
      const client = await clientFactory.getClient(userId, agent);
      if (client) {
        availableAgents.push(agent);
      }
    } catch (error) {
      console.log(`Agent ${agent} not available: ${error.message}`);
    }
  }
  console.log(`📊 Available agents: ${availableAgents.length}/${agents.length}`);
  
  if (availableAgents.length === 0) {
    console.error("❌ No available agents for collaboration!");
    throw new Error("No available agents for collaboration. Please check API keys and try again.");
  }
  
  // Check if we have an onModelStatusChange callback
  var onModelStatusChange = options.onModelStatusChange;
  if (typeof onModelStatusChange === 'function') {
    console.log("👀 Using provided onModelStatusChange callback");
    
    // Wrap with error handler to prevent callback errors from breaking the process
    const originalCallback = onModelStatusChange;
    onModelStatusChange = (model, status, message) => {
      try {
        console.log(`🔔 Model status update: ${model} → ${status}`);
        originalCallback(model, status, message);
      } catch (error) {
        console.error(`Error in onModelStatusChange callback for ${model}:`, error);
      }
    };
    
    // Send initial 'pending' status for all agents
    availableAgents.forEach(agent => {
      onModelStatusChange(agent, 'pending', 'Waiting to start');
    });
  }
  
  // Create the enhanced options
  var enhancedOptions = {
    ...options,
    sessionId: sessionId,
    mode: mode,
    agents: availableAgents, // Use only available agents
    styleDirective: styleDirective,
    onModelStatusChange: onModelStatusChange,
    userId: userId, // Pass user ID for API key checking
    // IMPORTANT: Make sure clients are explicitly passed (imported at the top of this file)
    clients: clients 
  };
  
  // Debug log the clients object to ensure it's properly constructed
  console.log(`🧠 Available clients:`, Object.keys(clients).filter(k => clients[k]).join(', '));
  
  // Map 'collaborative' mode to 'individual' for backward compatibility
  if (mode === 'collaborative') {
    console.log(`ℹ️ Remapping 'collaborative' mode to 'individual' for backward compatibility`);
    enhancedOptions.mode = 'individual';
  }
  
  try {
    // Run the collaboration for advanced modes
    console.log(`🔄 Running collaboration in ${enhancedOptions.mode} mode with ${availableAgents.length} agents`);
    
    // Ensure model IDs are passed correctly without transformation
    if (enhancedOptions.models) {
      // Debug log the model IDs before passing to runCollab
      console.log(`📋 Using specified model IDs:`, JSON.stringify(enhancedOptions.models, null, 2));
    }
    
    const result = await runCollab(enhancedOptions);
    console.log(`✅ Collaboration complete. Cost: $${result.spentUSD.toFixed(4)}`);
    return result;
  } catch (error) {
    console.error(`❌ Collaboration error:`, error);
    console.error(`🔍 Error details:`, error.stack || error);
    
    // Return an error message that will be shown to the user
    return {
      final: `Error in ${mode} collaboration: ${error.message}`,
      rationale: "The collaboration encountered an error. Please check the server logs for details.",
      spentUSD: 0.00
    };
  }
}

// Import the enhanced collaboration integration module
import { patchCollaborationModule } from './enhanced-collab-integration.mjs';

// Create a wrapper runCollab that correctly passes the clients object
async function wrappedRunCollab(options) {
  // Use the properly mapped client object imported directly
  const mappedClients = agentClients;
  
  // Create the enhanced options
  var enhancedOptions = {
    ...options,
    clients: mappedClients, // Use our properly mapped clients object
    useEnhancedCollab: true // Always use enhanced collab to ensure clients are passed
  };
  
  // Debug log the clients object to ensure it's properly constructed
  console.log(`🧠 Original clients available:`, Object.keys(clients).filter(k => clients[k]).join(', '));
  console.log(`🧠 Mapped clients available:`, Object.keys(mappedClients).filter(k => mappedClients[k]).join(', '));
  console.log(`🧠 Collaboration clients being used:`, options.agents ? options.agents.filter(a => mappedClients[a]).join(', ') : 'none specified');
  
  // Log individual client availability
  if (options.agents) {
    for (const agent of options.agents) {
      console.log(`🔍 Client ${agent} availability:`, Boolean(mappedClients[agent]));
      if (mappedClients[agent]) {
        console.log(`🔍 Client ${agent} methods:`, Object.keys(mappedClients[agent]).join(', '));
      } else {
        console.error(`❌ Missing client for ${agent}`);
      }
    }
  }

  // Call the original function with the enhanced options
  return await originalRunCollab(enhancedOptions);
}

// Create a local module object with the wrapped runCollab function
const collaborationModule = { runCollab: wrappedRunCollab };

// Apply the enhancements to create an enhanced runCollab function
const enhancedModule = patchCollaborationModule(collaborationModule);

// Export the enhanced version of runCollab
export const runCollab = enhancedModule.runCollab;

// Export individual collaboration functions for enhanced integration
export { 
  executeCodeArchitect,
  executeAdversarialDebate, 
  executeExpertPanel,
  executeScenarioAnalysis,
  executeCreativeBrainstormSwarm,
  executeHybridGuardedBraintrust,
  executeValidatedConsensus,
  executeRoundTableCollaboration,
  executeSequentialCritiqueChain
};

