/**
 * Small Team Collaboration - Optimized for 3-4 AIs
 * 
 * This module provides a specialized Round Table implementation
 * for collaboration with a small team of 3-4 AIs, addressing
 * issues with timeouts, concurrency, and fallback handling.
 */

import { enhancedGetAgentResponse } from './agent-response.mjs';
import { runParallelWithConcurrency, recoverFromError } from './collaboration-improvements.mjs';
import { truncatePhaseContent, truncateResponseArray, logContentMetrics } from './truncation-utils.mjs';

// Special concurrency limits for small teams
const SMALL_TEAM_CONCURRENCY = {
  DEFAULT: 2,
  claude: 2,
  gemini: 2,
  chatgpt: 2,
  grok: 1,
  deepseek: 1,
  llama: 1
};

// Extended timeouts for small teams (in ms)
const SMALL_TEAM_TIMEOUTS = {
  DEFAULT: 180000, // 3 minutes
  "claude-3-5-sonnet": 240000, // 4 minutes
  "claude-3-opus": 300000, // 5 minutes
  "gemini-2.5-pro-preview": 240000, // 4 minutes
  "gpt-4o": 240000, // 4 minutes
  "Llama-4-Maverick": 300000, // 5 minutes
  "deepseek": 240000 // 4 minutes
};

/**
 * Create a model-specific abort controller with extended timeout
 */
function createExtendedAbortController(provider, modelId) {
  const controller = new AbortController();
  
  // Get timeout from extended values
  let timeout = SMALL_TEAM_TIMEOUTS.DEFAULT;
  if (modelId) {
    for (const [pattern, timeoutValue] of Object.entries(SMALL_TEAM_TIMEOUTS)) {
      if (pattern === 'DEFAULT') continue;
      if (modelId.includes(pattern)) {
        timeout = timeoutValue;
        break;
      }
    }
  }
  
  console.log(`⏱️ Using extended timeout of ${timeout}ms for ${provider}${modelId ? ` (${modelId})` : ''}`);
  
  const timeoutId = setTimeout(() => {
    console.log(`⏱️ Extended timeout reached (${timeout}ms) for ${provider}${modelId ? ` (${modelId})` : ''}`);
    controller.abort();
  }, timeout);
  
  // Add clearTimeout method to clean up when done
  controller.clear = () => clearTimeout(timeoutId);
  
  return controller;
}

/**
 * Optimized Round Table Collaboration for 3-4 AIs
 */
export async function executeSmallTeamCollaboration(
  prompt, 
  agents, 
  redisChannel, 
  globalAbortSignal, 
  costTracker,
  options = {}
) {
  console.log(`🚀 Starting Small Team Collaboration with ${agents.length} agents: ${agents.join(', ')}`);
  
  // Extract required dependencies from options
  const {
    ignoreFailingModels = true, // Default to true for small teams
    skipSynthesisIfAllFailed = true, // Default to true for small teams
    continueWithAvailableModels = true, // Default to true for small teams
    keepLoadingUntilComplete = true,
    models = {},
    clients,
    publishEvent,
    estimateTokenCount,
    constructPrompt,
    extractVotedAgent,
    onModelStatusChange
  } = options;
  
  // Validate clients availability
  if (!clients || typeof clients !== 'object' || Object.keys(clients).length === 0) {
    throw new Error("No clients object provided to Small Team Collaboration. Check configuration.");
  }
  
  console.log(`🔍 Available client keys: ${Object.keys(clients).join(', ')}`);
  
  try {
    // Determine lead agent (first agent in the list, or override if specified)
    const leadAgent = options.leadAgent || agents[0];
    console.log(`👑 Lead agent: ${leadAgent}`);
    
    // PHASE 1: INITIAL DRAFTS
    // =======================
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'draft',
      timestamp: new Date().toISOString()
    });

    // Update all models' status
    for (const agent of agents) {
      if (typeof onModelStatusChange === 'function') {
        onModelStatusChange(agent, 'phase_change', 'Phase 1/3: Initial Drafts');
        onModelStatusChange(agent, 'processing', 'Starting initial draft');
      }
    }
    
    // Run drafts in parallel, but with more detailed instructions
    const draftTasks = agents.map(agent => {
      return async () => {
        try {
          publishEvent(redisChannel, {
            type: 'agent_thinking',
            agent: agent,
            phase: 'draft',
            timestamp: new Date().toISOString()
          });
          
          // Create more detailed draft instructions for small teams
          const draftInstruction = `Independently draft a response to the given prompt. As part of a small team of only ${agents.length} AI models, your draft should be COMPREHENSIVE yet CONCISE - covering all key points while avoiding unnecessary verbosity. Your draft will potentially be used as the final answer if collaboration phases time out, so ensure it's complete.`;
          
          const draftPrompt = constructPrompt(prompt, agent, draftInstruction);
          const modelId = models && models[agent] && models[agent][0];

          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'processing', 'Writing initial draft');
          }
          
          // Get the draft using enhanced getResponse with extended timeout for small teams
          let draft;
          try {
            // Create an extended timeout abort controller
            const extendedController = createExtendedAbortController(agent, modelId);
            
            // Use enhancedGetAgentResponse with higher retry count for small teams
            draft = await enhancedGetAgentResponse(
              agent, draftPrompt, 'draft', redisChannel,
              extendedController.signal, costTracker, modelId,
              clients, publishEvent, estimateTokenCount,
              3, // Increase max retries
              2000 // Longer initial retry delay
            );
            
            // Clean up the controller
            extendedController.clear();
            
            console.log(`✅ ${agent} draft complete (${draft.length} chars)`);
          } catch (error) {
            console.error(`❌ Error in draft generation for ${agent}:`, error);
            throw error;
          }
          
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'completed', 'Initial draft completed');
          }
          
          return {
            agent: agent,
            content: draft
          };
        } catch (error) {
          console.error(`❌ Error getting draft from ${agent}:`, error);
          
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'failed', `Failed to create draft: ${error.message}`);
          }
          
          return {
            agent: agent,
            content: `[${agent} was unable to provide a draft: ${error.message}]`,
            error: true
          };
        }
      };
    });
    
    // Run draft tasks serially for small teams to avoid API rate limits
    console.log(`🔄 Running ${draftTasks.length} draft tasks serially for better reliability`);
    
    const initialDrafts = [];
    for (let i = 0; i < draftTasks.length; i++) {
      try {
        const result = await draftTasks[i]();
        initialDrafts.push(result);
      } catch (error) {
        console.error(`❌ Error in draft task ${i} (${agents[i] || 'unknown agent'}):`, error);
        initialDrafts.push(recoverFromError(error, 'draft', agents[i]));
      }
    }
    
    console.log(`✅ Serial draft tasks completed: ${initialDrafts.length} results`);
    
    // Count successful drafts
    const successfulDrafts = initialDrafts.filter(draft => !draft.error);
    console.log(`📊 Successful drafts: ${successfulDrafts.length}/${initialDrafts.length}`);
    
    // For small teams, we need at least 2 successful drafts to continue
    // Otherwise, just use the first successful draft as the answer
    if (successfulDrafts.length < 2) {
      console.log(`⚠️ Only ${successfulDrafts.length} successful drafts, skipping collaboration phases`);
      
      if (successfulDrafts.length === 1) {
        const onlyDraft = successfulDrafts[0];
        
        return {
          answer: onlyDraft.content,
          rationale: "Only one AI model was able to provide a successful draft. Collaboration phases were skipped.",
          leadAgent: leadAgent,
          summarizerAgent: onlyDraft.agent,
          drafts: initialDrafts,
          critiques: [],
          votes: []
        };
      }
      
      // If no successful drafts, but ignoreFailingModels is true, use a fallback message
      if (ignoreFailingModels) {
        return {
          answer: "All AI models encountered errors. Please check API status and try again.",
          rationale: "No successful drafts were produced. This may indicate API quota issues or connectivity problems.",
          leadAgent: leadAgent,
          summarizerAgent: leadAgent,
          drafts: initialDrafts,
          critiques: [],
          votes: []
        };
      }
      
      // Otherwise, throw error
      throw new Error(`Not enough successful drafts (${successfulDrafts.length}) to continue with collaboration.`);
    }
    
    // PHASE 2: COMBINED CRITIQUE AND VOTING
    // ====================================
    // For small teams, combine critique and voting to save time and API calls
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'critique_vote',
      timestamp: new Date().toISOString()
    });
    
    // Notify phase change
    for (const agent of agents) {
      if (typeof onModelStatusChange === 'function') {
        onModelStatusChange(agent, 'phase_change', 'Phase 2/3: Combined Critique & Vote');
      }
    }
    
    // Create combined critique and vote tasks
    const combinedTasks = successfulDrafts.map(draft => {
      return async () => {
        const agent = draft.agent;
        
        try {
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'processing', 'Critiquing and voting');
          }
          
          publishEvent(redisChannel, {
            type: 'agent_thinking',
            agent: agent,
            phase: 'critique_vote',
            timestamp: new Date().toISOString()
          });
          
          // Get other drafts to critique
          const otherDrafts = successfulDrafts.filter(d => d.agent !== agent);
          
          // If no other drafts, skip
          if (otherDrafts.length === 0) {
            return {
              agent: agent,
              critiques: [],
              votedFor: agent, // Vote for self if no other options
              reasoning: "No other drafts to evaluate"
            };
          }
          
          // Prepare drafts text
          const draftsText = otherDrafts.map(d => 
            `${d.agent.toUpperCase()}'s DRAFT:\n${d.content}\n`
          ).join('\n');
          
          // Special combined instruction for small teams
          const combinedInstruction = `As part of a small team of ${agents.length} AI models, you need to: 
1. BRIEFLY critique the drafts from other models (1-2 sentences per draft noting strengths/weaknesses)
2. VOTE for which draft you think is best as a starting point for the final answer
3. Provide a very brief reason for your vote (1-2 sentences)

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
CRITIQUES:
[brief critique of first model]
[brief critique of second model]

VOTE: [name of model you're voting for]
REASON: [1-2 sentence reason for your vote]`;

          const combinedPrompt = constructPrompt(
            prompt + "\n\nOTHER DRAFTS:\n" + draftsText, 
            agent, 
            combinedInstruction
          );
          
          const modelId = models && models[agent] && models[agent][0];
          
          // Get combined response with extended timeout
          const extendedController = createExtendedAbortController(agent, modelId);
          
          const combinedResponse = await enhancedGetAgentResponse(
            agent, combinedPrompt, 'critique_vote', redisChannel,
            extendedController.signal, costTracker, modelId,
            clients, publishEvent, estimateTokenCount,
            2, // Max retries
            2000 // Initial retry delay
          );
          
          // Clean up the controller
          extendedController.clear();
          
          // Parse the response to extract critiques and votes
          const critiquePart = combinedResponse.match(/CRITIQUES:[\s\S]*?(?=VOTE:|$)/i)?.[0] || '';
          const votePart = combinedResponse.match(/VOTE:[\s\S]*?(?=REASON:|$)/i)?.[0] || '';
          const reasonPart = combinedResponse.match(/REASON:[\s\S]*/i)?.[0] || '';
          
          // Extract voted for agent
          let votedFor = null;
          
          if (votePart) {
            // Try to match any agent name in the vote part
            for (const potentialAgent of agents) {
              if (votePart.toLowerCase().includes(potentialAgent.toLowerCase())) {
                votedFor = potentialAgent;
                break;
              }
            }
          }
          
          // If no vote detected, use extractVotedAgent as fallback
          if (!votedFor && typeof extractVotedAgent === 'function') {
            votedFor = extractVotedAgent(combinedResponse, agents);
          }
          
          // Still no vote? Default to first other agent
          if (!votedFor && otherDrafts.length > 0) {
            votedFor = otherDrafts[0].agent;
            console.log(`⚠️ Could not detect vote from ${agent}, defaulting to ${votedFor}`);
          }
          
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'completed', 'Critique and vote completed');
          }
          
          return {
            agent: agent,
            critiques: critiquePart.replace(/CRITIQUES:/i, '').trim(),
            votedFor: votedFor,
            reasoning: reasonPart.replace(/REASON:/i, '').trim(),
            fullResponse: combinedResponse
          };
        } catch (error) {
          console.error(`❌ Error in combined critique/vote for ${agent}:`, error);
          
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'failed', `Failed critique/vote: ${error.message}`);
          }
          
          // Create a recovery result with both critique and vote info
          return {
            agent: agent,
            critiques: `[${agent} was unable to provide critiques: ${error.message}]`,
            votedFor: null,
            reasoning: `[Error: ${error.message}]`,
            error: true
          };
        }
      };
    });
    
    // Run combined tasks serially for better reliability with small teams
    const combinedResults = [];
    for (let i = 0; i < combinedTasks.length; i++) {
      try {
        const result = await combinedTasks[i]();
        combinedResults.push(result);
      } catch (error) {
        console.error(`❌ Error in combined task ${i}:`, error);
        combinedResults.push({
          agent: successfulDrafts[i].agent,
          critiques: `[Error: ${error.message}]`,
          votedFor: null,
          reasoning: `[Error: ${error.message}]`,
          error: true
        });
      }
    }
    
    // Count vote results
    const voteCounts = {};
    let mostVotedAgent = null;
    let highestVotes = 0;
    
    for (const result of combinedResults) {
      if (result.votedFor) {
        voteCounts[result.votedFor] = (voteCounts[result.votedFor] || 0) + 1;
        
        if (voteCounts[result.votedFor] > highestVotes) {
          highestVotes = voteCounts[result.votedFor];
          mostVotedAgent = result.votedFor;
        }
      }
    }
    
    console.log(`📊 Vote results: ${JSON.stringify(voteCounts)}`);
    console.log(`📊 Most voted agent: ${mostVotedAgent} with ${highestVotes} votes`);
    
    // PHASE 3: SYNTHESIS
    // =================
    // For small teams, if we have a clear winner, use that draft as the base
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'synthesis',
      timestamp: new Date().toISOString()
    });
    
    // If no clear winner, use the lead agent or the first draft
    if (!mostVotedAgent && successfulDrafts.length > 0) {
      // See if lead agent has a successful draft
      const leadAgentDraft = successfulDrafts.find(d => d.agent === leadAgent);
      if (leadAgentDraft) {
        mostVotedAgent = leadAgent;
      } else {
        // Otherwise use the first successful draft
        mostVotedAgent = successfulDrafts[0].agent;
      }
      console.log(`⚠️ No clear vote winner, using ${mostVotedAgent} as base for synthesis`);
    }
    
    // Choose synthesizer - prefer Gemini or Claude if available
    let summarizerAgent = agents.find(a => a === 'gemini') || 
                          agents.find(a => a === 'claude') || 
                          leadAgent;
    
    // Make sure the summarizer has a successful draft
    if (!successfulDrafts.some(d => d.agent === summarizerAgent)) {
      summarizerAgent = successfulDrafts[0].agent;
    }
    
    console.log(`👑 Using ${summarizerAgent} for final synthesis`);
    
    // Notify about synthesis phase
    for (const agent of agents) {
      if (typeof onModelStatusChange === 'function') {
        onModelStatusChange(agent, 'phase_change', `Phase 3/3: Synthesis (by ${summarizerAgent})`);
      }
    }
    
    if (typeof onModelStatusChange === 'function') {
      onModelStatusChange(summarizerAgent, 'processing', 'Creating final summary');
    }
    
    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: summarizerAgent,
      phase: 'synthesis',
      timestamp: new Date().toISOString()
    });
    
    // Get winning draft
    const winningDraft = successfulDrafts.find(d => d.agent === mostVotedAgent);
    if (!winningDraft) {
      throw new Error(`Could not find draft for most voted agent: ${mostVotedAgent}`);
    }
    
    // Get critiques of winning draft
    const critiquesOfWinner = combinedResults
      .filter(r => !r.error && r.agent !== mostVotedAgent)
      .map(r => `${r.agent.toUpperCase()}'s CRITIQUE:\n${r.critiques}`)
      .join('\n\n');
    
    // Prepare synthesis instruction
    const synthesisInstruction = `You are creating the final synthesized answer. The draft from ${mostVotedAgent} received the most votes and will be your starting point.

Your task:
1. Improve the winning draft by addressing the critiques
2. Ensure the final answer is comprehensive yet concise
3. Format your response as:
   FINAL ANSWER: [your improved version of the winning draft]
   
   RATIONALE: [brief explanation of how you improved the draft]`;

    const synthesisPrompt = constructPrompt(
      prompt + 
      "\n\nWINNING DRAFT:\n" + winningDraft.content +
      "\n\nCRITIQUES OF WINNING DRAFT:\n" + critiquesOfWinner,
      summarizerAgent,
      synthesisInstruction
    );
    
    const modelId = models && models[summarizerAgent] && models[summarizerAgent][0];
    
    // Get synthesis with extended timeout
    let synthesisResponse;
    try {
      // Create extended controller
      const extendedController = createExtendedAbortController(summarizerAgent, modelId);
      
      synthesisResponse = await enhancedGetAgentResponse(
        summarizerAgent, synthesisPrompt, 'synthesis', redisChannel,
        extendedController.signal, costTracker, modelId,
        clients, publishEvent, estimateTokenCount,
        2, // Max retries
        2000 // Initial retry delay
      );
      
      // Clean up controller
      extendedController.clear();
    } catch (error) {
      console.error(`❌ Error in synthesis by ${summarizerAgent}:`, error);
      
      if (typeof onModelStatusChange === 'function') {
        onModelStatusChange(summarizerAgent, 'failed', `Failed synthesis: ${error.message}`);
      }
      
      // For small teams, fallback to winning draft
      console.log(`⚠️ Synthesis failed, falling back to winning draft from ${mostVotedAgent}`);
      
      // Create synthetic synthesis response
      synthesisResponse = `FINAL ANSWER:\n${winningDraft.content}\n\nRATIONALE:\nThis is the original draft from ${mostVotedAgent} which received the most votes. Synthesis failed due to API error: ${error.message}`;
    }
    
    // Extract final answer and rationale
    let finalAnswer = '';
    let rationale = '';
    
    if (synthesisResponse.includes('FINAL ANSWER')) {
      const parts = synthesisResponse.split(/RATIONALE|REASONING/i);
      finalAnswer = parts[0].replace(/FINAL ANSWER:?/i, '').trim();
      rationale = parts.length > 1 ? parts[1].trim() : '';
    } else {
      finalAnswer = synthesisResponse;
      rationale = `Synthesized from multiple AI perspectives with ${agents.length} contributors.`;
    }
    
    // Final notification
    publishEvent(redisChannel, {
      type: 'collaboration_result',
      answer: finalAnswer,
      rationale: rationale,
      leadAgent: leadAgent,
      summarizerAgent: summarizerAgent,
      timestamp: new Date().toISOString()
    });
    
    // Mark as completed
    if (typeof onModelStatusChange === 'function') {
      onModelStatusChange(summarizerAgent, 'completed', 'Summarization completed');
      
      // Mark all agents as completed if keepLoadingUntilComplete
      if (keepLoadingUntilComplete) {
        for (const agent of agents) {
          if (agent !== summarizerAgent) {
            onModelStatusChange(agent, 'completed', 'Collaboration complete');
          }
        }
      }
    }
    
    // Return final result
    return {
      answer: finalAnswer,
      rationale: rationale,
      leadAgent: leadAgent,
      summarizerAgent: summarizerAgent,
      drafts: initialDrafts,
      critiques: combinedResults.map(r => ({
        agent: r.agent,
        content: r.critiques,
        targets: successfulDrafts.filter(d => d.agent !== r.agent).map(d => d.agent)
      })),
      votes: combinedResults.map(r => ({
        voter: r.agent,
        votedFor: r.votedFor,
        reasoning: r.reasoning
      }))
    };
  } catch (error) {
    console.error(`❌ Error in small team collaboration:`, error);
    
    // If we should ignore failing models, use the best draft we have
    if (ignoreFailingModels && typeof initialDrafts !== 'undefined' && initialDrafts) {
      const successfulDrafts = initialDrafts.filter(d => !d.error);
      
      if (successfulDrafts.length > 0) {
        // Use the best draft as fallback
        const firstDraft = successfulDrafts[0];
        
        return {
          answer: firstDraft.content,
          rationale: "Collaboration failed with error, falling back to best available draft.",
          leadAgent: leadAgent,
          summarizerAgent: firstDraft.agent,
          drafts: initialDrafts,
          critiques: [],
          votes: []
        };
      }
    }
    
    // Re-throw the error
    throw error;
  }
}