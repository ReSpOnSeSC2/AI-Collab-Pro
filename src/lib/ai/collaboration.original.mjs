/**
 * AI Collaboration Engine
 * Orchestrates multi-model collaboration workflows
 * Version: 9.0.0
 */

import { clients, availability } from './index.mjs';
import { getClient } from './index.mjs';
import { DEFAULT_CLAUDE_MODEL } from './claude.mjs';
import { DEFAULT_GEMINI_MODEL } from './gemini.mjs';
import { publishEvent, subscribeToChannel } from '../messaging/redis.mjs';
import { securityGuard } from '../security/promptGuard.mjs';
import { estimateCost, trackCost } from '../billing/costControl.mjs';

// Constants
const DEFAULT_TIMEOUT_SECONDS = 13;
const DEFAULT_COST_CAP_DOLLARS = 1.0;
const DEFAULT_MODE = 'individual';

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
export async function runCollab(options) {
  var prompt = options.prompt;
  var mode = options.mode || DEFAULT_MODE;
  var agents = options.agents || ['claude', 'gemini', 'chatgpt'];
  var costCapDollars = options.costCapDollars || DEFAULT_COST_CAP_DOLLARS;
  var maxSeconds = options.maxSeconds || DEFAULT_TIMEOUT_SECONDS;
  var sessionId = options.sessionId || 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  var ignoreFailingModels = options.ignoreFailingModels || false; // NEW: Flag to continue if some models fail
  
  // Validate and sanitize inputs
  if (!prompt || typeof prompt !== 'string') {
    throw new Error("Valid prompt is required");
  }
  
  // Filter out unavailable agents
  var availableAgents = agents.filter(function(agent) {
    return availability[agent];
  });
  
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
  
  // Setup cost tracking
  var costTracker = trackCost.initializeSession(sessionId, costCapDollars);
  
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
            result = {
              final: "Collaboration summary from initial drafts (some models failed but were ignored per configuration)",
              spentUSD: costTracker.getTotalSpent() // Use what we spent so far
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
          costTracker
        );
        break;
      case 'adversarial_debate':
        result = await executeAdversarialDebate(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker
        );
        break;
      case 'expert_panel':
        result = await executeExpertPanel(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker
        );
        break;
      case 'scenario_analysis':
        result = await executeScenarioAnalysis(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker
        );
        break;
      default:
        // Default to individual if an unknown mode is specified
        result = await executeIndividualResponses(
          sanitizedPrompt, 
          availableAgents, 
          redisChannel, 
          timeoutController.signal, 
          costTracker
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
    console.log(`🔄 Starting Round Table collaboration with ${agents.length} agents: ${agents.join(', ')}`);
    console.log(`🧠 Available clients:`, Object.keys(clients).filter(k => clients[k]).join(', '));
    console.log(`🟢 Agent availability:`, JSON.stringify(availability));
    
    // Get options
    const ignoreFailingModels = options.ignoreFailingModels || false;
    const models = options.models || {};
    
    // Check if we have enough available agents
    const availableAgentCount = agents.filter(agent => availability[agent]).length;
    console.log(`📊 Available agent count: ${availableAgentCount}/${agents.length}`);
    console.log(`⚙️ Round Table settings: ignoreFailingModels=${ignoreFailingModels}`);
    
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
    if (!availability[agent]) {
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
      
      // Construct a simpler prompt with smaller token count
      var draftPrompt = constructPrompt(
        prompt.substring(0, 2000), // Further reduce prompt size for reliability
        agent, 
        'Please provide your initial draft answer. Be concise and focus on key points. Keep your response under 500 words.'
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
 * @returns {string} The agent name with the highest token limit
 */
function getAgentWithHighestTokenLimit(agents, models = {}) {
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

  agents.forEach(agent => {
    // Skip unavailable agents
    if (!availability[agent]) return;
    
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
  });
  
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
  const summarizerAgent = getAgentWithHighestTokenLimit(agents.filter(agent => {
    // Only use agents that are available and didn't error out
    return availability[agent] && !initialDrafts.find(draft => draft.agent === agent && draft.error);
  }), options.models);
  
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
        return {
          answer: "Collaboration completed with partial results (some models failed but were ignored as configured)",
          rationale: "The round-table process was interrupted, but some models provided initial drafts.",
          leadAgent: null,
          drafts: initialDrafts,
          critiques: [],
          votes: []
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
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'sequential_chain',
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
  
  try {
    currentResponse = await getAgentResponse(firstAgent, initialPrompt, 'initial', redisChannel, abortSignal, costTracker);
    
    chain.push({
      agent: firstAgent,
      content: currentResponse,
      role: 'initial'
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
    
    try {
      currentResponse = await getAgentResponse(currentAgent, chainPrompt, 'critique_' + i, redisChannel, abortSignal, costTracker);
      
      chain.push({
        agent: currentAgent,
        content: currentResponse,
        role: 'critique_' + i
      });
      
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
  var summarizerAgent = getAgentWithHighestTokenLimit(agents.filter(agent => 
    availability[agent] && !chain.find(item => item.agent === agent && item.error)
  ), options.models);
  
  console.log(`👑 Using ${summarizerAgent} for final sequential chain summarization (highest token limit)`);
  
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
  
  // Assign roles: first 2 agents as co-drafters, rest as verifiers
  var drafterAgents = agents.slice(0, 2);
  var verifierAgents = agents.slice(2);
  
  // Phase 1: Co-drafting
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'co_drafting',
    timestamp: new Date().toISOString()
  });
  
  var drafts = await Promise.all(drafterAgents.map(async function(agent, index) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'draft',
      timestamp: new Date().toISOString()
    });
    
    var draftPrompt = constructPrompt(
      prompt,
      agent,
      'You are co-drafter #' + (index+1) + ' creating an initial answer. Focus on factual accuracy and cite sources where possible. Your draft will be verified for factual claims.'
    );
    
    try {
      var draftContent = await getAgentResponse(agent, draftPrompt, 'draft', redisChannel, abortSignal, costTracker);
      
      return {
        agent: agent,
        content: draftContent
      };
    } catch (error) {
      console.error(`Error getting draft from ${agent}:`, error);
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
  
  var verificationResults = await Promise.all(verifierAgents.map(async function(agent) {
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: agent,
      phase: 'verify',
      timestamp: new Date().toISOString()
    });
    
    var verifyPrompt = constructPrompt(
      prompt + "\n\nDRAFT TO VERIFY:\n" + initialDraft,
      agent,
      'You are a fact-checker. Review this draft and identify any statements that: 1) contain factual inaccuracies, 2) make unsupported claims, 3) are misleading, or 4) require citation. For each issue, quote the text and explain the problem.'
    );
    
    try {
      var verificationContent = await getAgentResponse(agent, verifyPrompt, 'verify', redisChannel, abortSignal, costTracker);
      
      return {
        agent: agent,
        content: verificationContent
      };
    } catch (error) {
      console.error(`Error getting verification from ${agent}:`, error);
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
    
    // Use the agent with the highest token limit for rewriting
    var rewriterAgent = getAgentWithHighestTokenLimit(agents.filter(agent => 
      availability[agent] && !verifierAgents.find(verifier => verifier === agent)
    ), options.models);
    
    console.log(`👑 Using ${rewriterAgent} for rewriting (highest token limit)`);
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: rewriterAgent,
      phase: 'rewrite',
      timestamp: new Date().toISOString()
    });
    
    // Send status update if callback provided
    if (options && typeof options.onModelStatusChange === 'function') {
      options.onModelStatusChange(rewriterAgent, 'processing', 'Rewriting based on verification feedback');
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
    finalRationale = "The initial draft was rewritten after fact-checkers identified potential issues.";
  } else {
    // No substantial issues found, use the initial draft
    finalResponse = initialDraft;
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
  
  // Send status update if callback provided
  if (options && typeof options.onModelStatusChange === 'function') {
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
      'Generate 3-5 novel, creative ideas or approaches to address this prompt. Focus on originality and thinking outside the box. Present each idea clearly with a title and brief explanation.'
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
      'Select at least two distinct ideas from the list (they can be yours or from other agents) and combine them into a new, more complex "mega-idea." Explain why this fusion is particularly exciting or promising.'
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
      'Review all mega-ideas and vote for the ONE you find most original, impactful, or promising. You cannot vote for your own idea. Clearly state which agent\'s idea you are voting for and explain your reasoning.'
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
  var amplifierAgent = getAgentWithHighestTokenLimit(agents.filter(agent => 
    availability[agent] && !megaIdeas.find(idea => idea.agent === agent && idea.error)
  ), options.models);
  
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
    'Develop and elaborate on this winning idea, incorporating any valuable feedback from the votes. Create a comprehensive final version that explains the concept in detail, how it would be implemented, potential challenges, and expected benefits. Split your response into: 1) FINAL IDEA and 2) IMPLEMENTATION DETAILS.'
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
      'Generate 3-5 novel, creative ideas or approaches to address this prompt. Focus on originality, impact, and innovation. Present each idea with a title and brief explanation.'
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
    'Identify and rank the top 3-5 most promising ideas from the full set based on originality, feasibility, and potential impact. Explain your reasoning for each selection.'
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
      'Evaluate these ideas for: 1) Factual accuracy, 2) Feasibility, 3) Potential risks or limitations, and 4) Evidence supporting the concept. Rate each idea on a scale of 1-10 for overall validity and provide brief justification.'
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
  var elaboratorAgent = getAgentWithHighestTokenLimit(agents.filter(agent => 
    availability[agent] && !validValidations.find(validation => validation.agent === agent && validation.error)
  ), options.models);
  
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
    'Based on the validations, identify the highest-ranking idea that balances creativity with feasibility and evidence. Then develop this idea into a comprehensive solution. Include: 1) Core concept, 2) Implementation approach, 3) Evidence supporting it, 4) How it addresses potential concerns, and 5) Expected outcomes. Split your response into: FINAL SOLUTION and SUPPORTING EVIDENCE.'
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
  var systemPrompt = SYSTEM_PROMPTS[agentProvider]?.agent || 
    "You are an AI assistant participating in a multi-model collaboration.";
  
  if (instructions) {
    systemPrompt += " " + instructions;
  }
  
  return {
    systemPrompt: systemPrompt,
    userPrompt: userPrompt
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
          if (chunk.text) {
            responseParts.push(chunk.text);
            
            // Stream the chunk to Redis
            publishEvent(redisChannel, {
              type: 'agent_thought',
              agent: agentProvider,
              phase: phase,
              text: chunk.text,
              timestamp: new Date().toISOString()
            });
            
            // Track token usage
            costTracker.addOutputTokens(agentProvider, estimateTokenCount(chunk.text));
            
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
    'chatgpt': 'gpt-4o',
    'grok': 'grok-3',
    'deepseek': 'deepseek-chat',
    'llama': 'Llama-4-Maverick-17B-128E-Instruct-FP8'
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
async function executeIndividualResponses(prompt, agents, redisChannel, abortSignal, costTracker) {
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
    if (!availability[agent]) continue;
    
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
    summarizedAnswer += `\n\n## ${response.agent.toUpperCase()}'S RESPONSE:\n${response.content.substring(0, 300)}...`;
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
async function executeCodeArchitect(prompt, agents, redisChannel, abortSignal, costTracker) {
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
  
  var architectPrompt = constructPrompt(
    prompt,
    roles.architect,
    'You are the Software Architect. Create a detailed technical design for this code request, including: requirements analysis, system architecture, component design, data structures, API specifications, and implementation guidelines. Focus on separation of concerns, code organization, and clear interfaces.'
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
  } catch (error) {
    console.error("Error in architecture phase:", error);
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
  
  var implementationPrompt = constructPrompt(
    prompt + "\n\nARCHITECTURE DESIGN:\n" + architectureDesign,
    roles.developer,
    'You are the Developer. Implement the code according to the provided architecture design. Include all necessary files, modules, functions, and tests. Focus on clean, maintainable, production-ready code. Add comments to explain complex logic. Handle edge cases and potential errors appropriately.'
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
  } catch (error) {
    console.error("Error in implementation phase:", error);
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
  
  var reviewPrompt = constructPrompt(
    prompt + 
    "\n\nARCHITECTURE DESIGN:\n" + architectureDesign + 
    "\n\nIMPLEMENTATION:\n" + implementation,
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
  } catch (error) {
    console.error("Error in review phase:", error);
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
  
  var testPrompt = constructPrompt(
    prompt + 
    "\n\nARCHITECTURE DESIGN:\n" + architectureDesign + 
    "\n\nIMPLEMENTATION:\n" + implementation +
    "\n\nCODE REVIEW:\n" + review,
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
  } catch (error) {
    console.error("Error in testing phase:", error);
    return {
      answer: "Failed during testing phase.",
      rationale: `Error: ${error.message}`,
      architecture: architectureDesign,
      implementation: implementation,
      review: review,
      tests: null
    };
  }
  
  // Compile final answer
  var finalAnswer = "# Software Development Summary\n\n";
  finalAnswer += "## Architecture Design\n\n" + architectureDesign.substring(0, 500) + "...\n\n";
  finalAnswer += "## Implementation\n\n" + implementation.substring(0, 500) + "...\n\n";
  finalAnswer += "## Code Review\n\n" + review.substring(0, 500) + "...\n\n";
  finalAnswer += "## Test Plan\n\n" + tests.substring(0, 500) + "...";
  
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
async function executeAdversarialDebate(prompt, agents, redisChannel, abortSignal, costTracker) {
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
  finalAnswer += "## Pro Perspective\n\n" + proArgument.substring(0, 500) + "...\n\n";
  finalAnswer += "## Con Perspective\n\n" + conArgument.substring(0, 500) + "...\n\n";
  finalAnswer += "## Rebuttal\n\n" + rebuttal.substring(0, 500) + "...\n\n";
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
async function executeExpertPanel(prompt, agents, redisChannel, abortSignal, costTracker) {
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
  finalAnswer += "## Expert Panel Summary\n\n";
  
  // Create a condensed summary of each expert's key points
  validInsights.forEach(function(insight) {
    finalAnswer += `### ${insight.role}\n${insight.content.substring(0, 200)}...\n\n`;
  });
  
  finalAnswer += "## Panel Discussion Highlights\n\n" + discussion.substring(0, 500) + "...\n\n";
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
async function executeScenarioAnalysis(prompt, agents, redisChannel, abortSignal, costTracker) {
  // Need at least 3 agents for this mode
  if (agents.length < 3) {
    throw new Error("Scenario Analysis mode works best with at least 3 agents");
  }
  
  publishEvent(redisChannel, {
    type: 'phase_start',
    phase: 'scenario_analysis',
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
  finalAnswer += "## Key Trends & Uncertainties\n\n" + trendsAnalysis.substring(0, 500) + "...\n\n";
  finalAnswer += "## Alternative Future Scenarios\n\n" + scenarios.substring(0, 500) + "...\n\n";
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
    prompt_length: options.prompt?.length || 0
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
  
  // Filter out unavailable agents
  const availableAgents = agents.filter(agent => availability[agent]);
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
    onModelStatusChange: onModelStatusChange
  };
  
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

