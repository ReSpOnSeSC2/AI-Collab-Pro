import { enhancedGetAgentResponse } from './agent-response.mjs';
import { runParallelWithConcurrency, recoverFromError } from './collaboration-improvements.mjs';
import { trackCost as originalTrackCost } from '../billing/costControl.mjs';
import { truncatePhaseContent, truncateResponseArray, logContentMetrics } from './truncation-utils.mjs';

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
    skipSynthesisIfAllFailed = false,
    continueWithAvailableModels = false,
    keepLoadingUntilComplete = true,
    models = {},
    clients,
    publishEvent,
    estimateTokenCount,
    constructPrompt,
    extractVotedAgent,
    onModelStatusChange
  } = options;
  
  // Validate that clients are provided
  console.log("🔍 [ParallelCollaboration] Checking clients availability...");
  if (!clients || typeof clients !== 'object') {
    console.error("❌ [ParallelCollaboration] CRITICAL ERROR: clients is not an object:", clients);
    throw new Error("No clients object provided to parallel collaboration. Check configuration.");
  }
  
  if (Object.keys(clients).length === 0) {
    console.error("❌ [ParallelCollaboration] CRITICAL ERROR: clients object is empty");
    throw new Error("Clients object is empty. No AI models available for collaboration.");
  }
  
  // Log which clients are available
  console.log(`🔍 [ParallelCollaboration] Available client keys: ${Object.keys(clients).join(', ')}`);
  console.log(`🔍 [ParallelCollaboration] Agents to use: ${agents.join(', ')}`);
  
  // Validate that the client objects have the necessary methods
  for (const agent of agents) {
    if (!clients[agent]) {
      console.error(`❌ [ParallelCollaboration] Client for agent "${agent}" is missing`);
    } else {
      // Check for either getResponse or generate method
      if (typeof clients[agent].getResponse !== 'function' && typeof clients[agent].generate !== 'function') {
        console.error(`❌ [ParallelCollaboration] Client for agent "${agent}" is missing both getResponse and generate methods`);
        console.log(`Available methods: ${Object.keys(clients[agent]).join(', ')}`);
      } else {
        // Add wrapper if only generate method exists
        if (typeof clients[agent].generate === 'function' && typeof clients[agent].getResponse !== 'function') {
          console.log(`ℹ️ [ParallelCollaboration] Adding getResponse wrapper for ${agent} client's generate method`);
          clients[agent].getResponse = async function(promptData, options) {
            // Adapt the generate method to work with getResponse interface
            return await clients[agent].generate(promptData, options);
          };
        }
        console.log(`✅ [ParallelCollaboration] Client for agent "${agent}" is valid`);
      }
    }
  }
  
  try {
    // Determine lead agent (first agent in the list, or override if specified)
    const leadAgent = options.leadAgent || agents[0];
    console.log(`👑 Lead agent: ${leadAgent}`);
    
    // Phase 1: Initial Drafts (already parallelized in original implementation)
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'draft',
      timestamp: new Date().toISOString()
    });

    // Update all models' status to maintain loading UI
    for (const agent of agents) {
      if (typeof onModelStatusChange === 'function') {
        // Notify phase change for drafts
        onModelStatusChange(agent, 'phase_change', 'Phase 1/4: Initial Drafts');
        onModelStatusChange(agent, 'processing', 'Starting initial draft');
      }
    }
    
    // Create parallel tasks for initial drafts
    const draftTasks = agents.map(agent => {
      return async () => {
        try {
          publishEvent(redisChannel, {
            type: 'agent_thinking',
            agent: agent,
            phase: 'draft',
            timestamp: new Date().toISOString()
          });
          
          // Construct draft prompt with additional debugging and emphasis on conciseness
          const draftInstruction = 'Independently draft a response to the given prompt. BE CONCISE AND DIRECT - focus on providing a clear, efficient solution without unnecessary explanation or verbosity. Keep your response focused and to the point.';
          const draftPrompt = constructPrompt(prompt, agent, draftInstruction);
          const modelId = models && models[agent] && models[agent][0];

          if (modelId) {
            console.log(`📋 Using model ID for ${agent}: ${modelId}`);
          }

          // Debug log the prompt structure to help diagnose issues
          const userPromptPreview = draftPrompt.userPrompt ?
            (draftPrompt.userPrompt.length > 50 ?
              draftPrompt.userPrompt.substring(0, 50) + '...' :
              draftPrompt.userPrompt) :
            'MISSING';

          console.log(`📋 Prompt structure for ${agent}: systemPrompt=${Boolean(draftPrompt.systemPrompt)}, userPrompt preview="${userPromptPreview}" (${draftPrompt.userPrompt ? draftPrompt.userPrompt.length : 0} chars)`);

          // If either prompt component is missing, log a warning
          if (!draftPrompt.systemPrompt || !draftPrompt.userPrompt) {
            console.warn(`⚠️ Warning: ${!draftPrompt.systemPrompt ? 'systemPrompt' : 'userPrompt'} is missing for ${agent}`);
          }
          
          // Send status update if callback provided
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'processing', 'Writing initial draft');
          }
          
          // Log information about the client object for debugging
          console.log(`🔍 Agent ${agent} client availability:`, Boolean(clients[agent]));
          if (clients[agent]) {
            console.log(`🔍 Agent ${agent} client methods:`, Object.keys(clients[agent]).join(', '));
          }
          
          // Get the draft using the enhanced function
          let draft;

          try {
            if (agent === 'claude' || agent === 'gemini') {
              // These providers need the precise model ID
              draft = await enhancedGetAgentResponse(
                agent, draftPrompt, 'draft', redisChannel,
                globalAbortSignal, costTracker, modelId,
                clients, publishEvent, estimateTokenCount
              );
            } else {
              // For other providers, let the default model handling work
              draft = await enhancedGetAgentResponse(
                agent, draftPrompt, 'draft', redisChannel,
                globalAbortSignal, costTracker, null,
                clients, publishEvent, estimateTokenCount
              );
            }

            console.log(`✅ ${agent} draft complete (${draft.length} chars)`);
          } catch (error) {
            console.error(`❌ Error in draft generation for ${agent}:`, error);
            throw error; // Re-throw to be caught by the outer try/catch
          }
          
          // Send status update if callback provided
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'completed', 'Initial draft completed');
          }
          
          return {
            agent: agent,
            content: draft
          };
        } catch (error) {
          console.error(`❌ Error getting draft from ${agent}:`, error);
          
          // Send status update if callback provided
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agent, 'failed', `Failed to create draft: ${error.message}`);
          }
          
          // Return error result
          return {
            agent: agent,
            content: `[${agent} was unable to provide a draft: ${error.message}]`,
            error: true
          };
        }
      };
    });
    
    // Run draft tasks in parallel with concurrency management
    console.log(`🔄 Running ${draftTasks.length} draft tasks in parallel with concurrency control`);
    const initialDrafts = await runParallelWithConcurrency(draftTasks, {
      maxConcurrent: 6, // Allow higher concurrency for drafts
      errorHandler: (error, index) => {
        console.error(`❌ Error in draft task ${index} (${agents[index] || 'unknown agent'}):`, error);
        return recoverFromError(error, 'draft', agents[index]);
      }
    });

    console.log(`✅ Parallel draft tasks completed: ${initialDrafts.length} results`);
    // Log individual draft results briefly for debugging
    initialDrafts.forEach((draft, i) => {
      console.log(`📋 Draft ${i+1}: ${draft.agent} - ${draft.error ? '❌ ERROR' : '✅ OK'} - ${draft.content ? draft.content.substring(0, 50) + '...' : 'No content'}`);
    });

    // Check if we have at least one successful draft
    const successfulDrafts = initialDrafts.filter(draft => !draft.error);

    // --- ADDITION: Check global abort after drafts ---
    if (globalAbortSignal.aborted) {
        console.warn("⚠️ Global abort signal detected after draft phase. Skipping subsequent phases.");
        // If we want to return partial results, we need to ensure reasonable fallbacks
        if (ignoreFailingModels && successfulDrafts.length > 0) {
            const firstDraft = successfulDrafts[0];
            return {
                answer: `${firstDraft.content}\n\n[Note: Collaboration was aborted after the draft phase due to time constraints. This represents the best available draft.]`,
                leadAgent: leadAgent,
                summarizerAgent: firstDraft.agent,
                drafts: initialDrafts,
                critiques: [],
                votes: []
            };
        }
        // Otherwise throw to be caught by the outer try/catch
        const abortError = new Error('Global timeout after draft phase');
        abortError.name = 'GlobalAbortError';
        throw abortError;
    }
    // --- END ADDITION ---

    // Log content metrics
    logContentMetrics('draft', {
      totalDrafts: initialDrafts.length,
      successfulDrafts: successfulDrafts.length,
      totalContentLength: initialDrafts.reduce((sum, draft) => sum + (draft.content?.length || 0), 0)
    });

    // DISABLED: No longer truncating drafts to preserve content quality
    // const truncatedDrafts = truncateResponseArray(initialDrafts, 80000);
    // for (let i = 0; i < initialDrafts.length; i++) {
    //   if (truncatedDrafts[i] && truncatedDrafts[i].content) {
    //     initialDrafts[i].content = truncatedDrafts[i].content;
    //     initialDrafts[i].truncated = truncatedDrafts[i].truncated || false;
    //   }
    // }

    // Set truncated flag to false for all drafts
    initialDrafts.forEach(draft => {
      draft.truncated = false;
    });

    // Check if we should continue based on cost (with safety check)
    if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
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
      
      // Log the specific errors for each agent to help with debugging
      const errorMessages = initialDrafts
        .filter(draft => draft.error)
        .map(draft => `${draft.agent}: ${draft.content}`)
        .join('\n');
      
      console.error("Agent errors:\n" + errorMessages);
      
      // Log client availability again for debugging
      console.log("🔍 [CRITICAL] Client availability check:");
      for (const agent of agents) {
        if (clients[agent]) {
          console.log(`- ${agent}: Available`);
          console.log(`  Methods: ${Object.keys(clients[agent]).join(', ')}`);
          
          // Check for provider-specific API status
          if (agent === 'claude' && clients[agent].messages) {
            console.log(`  Claude API client type: ${typeof clients[agent].messages.create}`);
          } else if (agent === 'gemini' && clients[agent].getGenerativeModel) {
            console.log(`  Gemini API client type: ${typeof clients[agent].getGenerativeModel}`);
          } else if (agent === 'chatgpt' && clients[agent].chat?.completions) {
            console.log(`  ChatGPT API client type: ${typeof clients[agent].chat.completions.create}`);
          }
        } else {
          console.log(`- ${agent}: MISSING CLIENT`);
        }
      }
      
      // If we should ignore failing models, try to proceed with a fallback message
      if (ignoreFailingModels) {
        console.log("🧯 Continuing despite all drafts failing because ignoreFailingModels=true");
        
        // Create a synthetic successful draft from the first agent
        const firstAgent = agents[0];
        initialDrafts[0] = {
          agent: firstAgent,
          content: `As a fallback due to API errors, I'll provide a basic response: I'm sorry, but all AI models encountered errors. Please check your API keys and configuration.`,
          error: false  // Mark as not an error so processing can continue
        };
        
        return {
          answer: "All AI models encountered errors, but continuing with fallback response due to ignoreFailingModels setting.",
          leadAgent: firstAgent,
          summarizerAgent: firstAgent
        };
      }
      
      // Construct a detailed diagnostic error message
      const clientInfo = agents.map(agent => {
        // Check for the actual client instance
        let clientExists = false;
        let actualClientName = agent;

        // Check for the special client mapping cases
        if (agent === 'claude') {
          actualClientName = 'anthropic';
          clientExists = !!clients['anthropic'];
        } else if (agent === 'chatgpt' || agent === 'gpt4') {
          actualClientName = 'openai';
          clientExists = !!clients['openai'];
        } else {
          clientExists = !!clients[agent];
        }

        // Get detailed client info
        const methodsInfo = clientExists ?
          `Methods: ${Object.keys(clients[actualClientName]).join(', ')}` :
          'No client object available';

        // Get more specific details for each client type
        let extraInfo = '';

        if (clientExists) {
          if (agent === 'claude' && clients['anthropic']) {
            extraInfo = `API client check: ${!!clients['anthropic'].messages}`;
          } else if ((agent === 'chatgpt' || agent === 'gpt4') && clients['openai']) {
            extraInfo = `API client check: ${!!clients['openai'].chat?.completions}`;
          } else if (agent === 'gemini' && clients['gemini']) {
            extraInfo = `API client check: ${!!clients['gemini'].getGenerativeModel}`;
          }
        }

        return `${agent} (uses ${actualClientName} client): ${clientExists ? 'Client available' : 'CLIENT MISSING'} - ${methodsInfo} ${extraInfo ? '- ' + extraInfo : ''}`;
      }).join('\n');

      throw new Error(`All agents failed to provide drafts. Please check API keys and configuration.\n\nDetailed client diagnostics:\n${clientInfo}`);
    }
    
    // Phase 2: Critiques (parallelize this phase)
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'critique',
      timestamp: new Date().toISOString()
    });

    // Notify phase change for critiques
    if (typeof onModelStatusChange === 'function') {
      const activeCritiqueAgents = agents.filter(agent => {
        const agentDraft = initialDrafts.find(draft => draft.agent === agent);
        return agentDraft && !agentDraft.error;
      });
      activeCritiqueAgents.forEach(agent => onModelStatusChange(agent, 'phase_change', 'Phase 2/4: Critiques'));
    }
    
    // --- ADDITION: Check global abort before critiques ---
    if (globalAbortSignal.aborted) {
        console.warn("⚠️ Global abort signal detected before critique phase. Skipping critiques.");
        if (ignoreFailingModels && successfulDrafts.length > 0) {
            const firstDraft = successfulDrafts[0];
            return {
                answer: `${firstDraft.content}\n\n[Note: Collaboration was aborted before the critique phase due to time constraints. This represents the best available draft.]`,
                leadAgent: leadAgent,
                summarizerAgent: firstDraft.agent,
                drafts: initialDrafts,
                critiques: [],
                votes: []
            };
        }
        const abortError = new Error('Global timeout before critique phase');
        abortError.name = 'GlobalAbortError';
        throw abortError;
    }
    // --- END ADDITION ---

    // Create critique tasks for agents that had successful drafts
    const critiqueTasks = agents
      .filter(agent => {
        // Only include agents with successful drafts
        const agentDraft = initialDrafts.find(draft => draft.agent === agent);
        return agentDraft && !agentDraft.error;
      })
      .map(agent => {
        return async () => {
          try {
            const otherDrafts = initialDrafts.filter(draft => 
              draft.agent !== agent && !draft.error
            );
            
            // Skip if no other drafts to critique
            if (otherDrafts.length === 0) {
              return {
                agent,
                content: "[No other drafts to critique]",
                targets: []
              };
            }
            
            publishEvent(redisChannel, {
              type: 'agent_thinking',
              agent: agent,
              phase: 'critique',
              timestamp: new Date().toISOString()
            });
            
            const draftsText = otherDrafts.map(draft => 
              `${draft.agent.toUpperCase()}'s DRAFT:\n${draft.content}\n`
            ).join('\n');
            
            const critiqueInstruction = 'Please critique these drafts BRIEFLY AND PRECISELY. Focus on the 2-3 most important strengths and weaknesses for each draft. BE EXTREMELY CONCISE - provide short, targeted feedback rather than comprehensive analysis. Prioritize clarity and directness over detail.';
            const combinedPrompt = prompt + "\n\nHere are drafts from other participants:\n\n" + draftsText;

            const critiquePrompt = constructPrompt(
              combinedPrompt,
              agent,
              critiqueInstruction
            );

            // Debug log the prompt structure
            console.log(`📋 Critique prompt for ${agent}: systemPrompt=${Boolean(critiquePrompt.systemPrompt)}, userPrompt length=${critiquePrompt.userPrompt ? critiquePrompt.userPrompt.length : 0} chars`);
            
            // Send status update if callback provided
            if (typeof onModelStatusChange === 'function') {
              onModelStatusChange(agent, 'processing', 'Writing critique');
            }
            
            // Get the critique using the enhanced function
            const critique = await enhancedGetAgentResponse(
              agent, critiquePrompt, 'critique', redisChannel, 
              globalAbortSignal, costTracker, models?.[agent]?.[0],
              clients, publishEvent, estimateTokenCount
            );
            
            // Send status update if callback provided
            if (typeof onModelStatusChange === 'function') {
              onModelStatusChange(agent, 'completed', 'Critique completed');
            }
            
            return {
              agent,
              content: critique,
              targets: otherDrafts.map(d => d.agent)
            };
          } catch (error) {
            console.error(`Error getting critique from ${agent}:`, error);
            
            // Send status update if callback provided
            if (typeof onModelStatusChange === 'function') {
              onModelStatusChange(agent, 'failed', `Failed to create critique: ${error.message}`);
            }
            
            // Return error result using the recovery helper
            return recoverFromError(error, 'critique', agent);
          }
        };
      });
    
    // Run critique tasks in parallel with concurrency management
    const critiques = await runParallelWithConcurrency(critiqueTasks, {
      maxConcurrent: 4, // Lower concurrency for critiques to avoid overloading
      errorHandler: (error, index) => {
        const agentIndex = agents
          .filter(agent => {
            const agentDraft = initialDrafts.find(draft => draft.agent === agent);
            return agentDraft && !agentDraft.error;
          })
          .indexOf(agents[index]);
        
        return recoverFromError(error, 'critique', agents[agentIndex]);
      }
    });
    
    // Filter out error critiques
    const successfulCritiques = critiques.filter(critique => !critique.error);

    // Log critique content metrics
    logContentMetrics('critique', {
      totalCritiques: critiques.length,
      successfulCritiques: successfulCritiques.length,
      totalContentLength: critiques.reduce((sum, critique) => sum + (critique.content?.length || 0), 0)
    });

    // DISABLED: No longer truncating critiques to preserve content quality
    // const truncatedCritiques = truncateResponseArray(critiques, 80000);
    // for (let i = 0; i < critiques.length; i++) {
    //   if (truncatedCritiques[i] && truncatedCritiques[i].content) {
    //     critiques[i].content = truncatedCritiques[i].content;
    //     critiques[i].truncated = truncatedCritiques[i].truncated || false;
    //   }
    // }

    // Set truncated flag to false for all critiques
    critiques.forEach(critique => {
      critique.truncated = false;
    });

    // Check if we should continue based on cost (with safety check)
    if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }

    // --- ADDITION: Check global abort after critiques ---
    if (globalAbortSignal.aborted) {
        console.warn("⚠️ Global abort signal detected after critique phase. Skipping voting and synthesis.");
        // If ignoring failures, we can still return something useful based on critiques
        if (ignoreFailingModels && successfulDrafts.length > 0) {
            // Use the first draft as a simple fallback
            const firstDraft = successfulDrafts[0];
            return {
                answer: `${firstDraft.content}\n\n[Note: Collaboration was aborted after the critique phase due to time constraints. This represents the best available draft.]`,
                leadAgent: leadAgent,
                summarizerAgent: firstDraft.agent,
                drafts: initialDrafts,
                critiques: critiques,
                votes: []
            };
        }
        const abortError = new Error('Global timeout after critique phase');
        abortError.name = 'GlobalAbortError';
        throw abortError;
    }
    // --- END ADDITION ---

    // Phase 3: Voting (parallelize this phase)
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'voting',
      timestamp: new Date().toISOString()
    });

    // Notify phase change for voting and update UI during voting phase
    if (typeof onModelStatusChange === 'function') {
      const activeVotingAgents = agents.filter(agent => {
        const agentDraft = initialDrafts.find(draft => draft.agent === agent);
        return agentDraft && !agentDraft.error;
      });
      activeVotingAgents.forEach(agent => {
        onModelStatusChange(agent, 'phase_change', 'Phase 3/4: Voting');

        // Only update processing status for models that successfully completed the critique phase
        const agentCritique = critiques.find(critique => critique.agent === agent);
        if (agentCritique && !agentCritique.error) {
          onModelStatusChange(agent, 'processing', 'Starting voting phase');
        }
      });
    }
    
    // --- ADDITION: Check global abort before voting ---
    if (globalAbortSignal.aborted) {
        console.warn("⚠️ Global abort signal detected before voting phase. Skipping voting and synthesis.");
        if (ignoreFailingModels && successfulDrafts.length > 0) {
            // Use the first draft as a simple fallback
            const firstDraft = successfulDrafts[0];
            return {
                answer: `${firstDraft.content}\n\n[Note: Collaboration was aborted before the voting phase due to time constraints. This represents the best available draft.]`,
                leadAgent: leadAgent,
                summarizerAgent: firstDraft.agent,
                drafts: initialDrafts,
                critiques: critiques,
                votes: []
            };
        }
        const abortError = new Error('Global timeout before voting phase');
        abortError.name = 'GlobalAbortError';
        throw abortError;
    }
    // --- END ADDITION ---

    // Create vote tasks for agents that had successful drafts
    const voteTasks = agents
      .filter(agent => {
        // Only include agents with successful drafts
        const agentDraft = initialDrafts.find(draft => draft.agent === agent);
        return agentDraft && !agentDraft.error;
      })
      .map(agent => {
        return async () => {
          try {
            publishEvent(redisChannel, {
              type: 'agent_thinking',
              agent,
              phase: 'vote',
              timestamp: new Date().toISOString()
            });
            
            const draftsForVoting = initialDrafts
              .filter(draft => !draft.error)
              .map(draft => `${draft.agent.toUpperCase()}'s DRAFT:\n${draft.content}\n`)
              .join('\n');
            
            const critiquesText = successfulCritiques
              .map(critique => `${critique.agent.toUpperCase()}'s CRITIQUE:\n${critique.content}\n`)
              .join('\n');
            
            const voteInstruction = 'Based on all drafts and critiques, vote for which draft offers the best starting point for a final answer. BE EXTREMELY BRIEF - state your chosen draft in the first line, then provide just 2-3 short bullet points explaining your reasoning. Keep your vote and explanation UNDER 500 WORDS TOTAL.';
            const combinedVotePrompt = prompt +
              "\n\nDRAFTS:\n" + draftsForVoting +
              "\n\nCRITIQUES:\n" + critiquesText;

            const votePrompt = constructPrompt(
              combinedVotePrompt,
              agent,
              voteInstruction
            );

            // Debug log the prompt structure
            console.log(`📋 Vote prompt for ${agent}: systemPrompt=${Boolean(votePrompt.systemPrompt)}, userPrompt length=${votePrompt.userPrompt ? votePrompt.userPrompt.length : 0} chars`);
            
            // Send status update if callback provided
            if (typeof onModelStatusChange === 'function') {
              onModelStatusChange(agent, 'processing', 'Voting');
            }
            
            // Get the vote using the enhanced function
            const voteResponse = await enhancedGetAgentResponse(
              agent, votePrompt, 'vote', redisChannel, 
              globalAbortSignal, costTracker, models?.[agent]?.[0],
              clients, publishEvent, estimateTokenCount
            );
            
            // Attempt to extract the voted-for agent
            const votedForAgent = agents.find(a => {
              const regex = new RegExp(`\\b${a}\\b`, 'i');
              return regex.test(voteResponse.split('\n')[0]);
            }) || extractVotedAgent(voteResponse, agents);
            
            // Send status update if callback provided
            if (typeof onModelStatusChange === 'function') {
              onModelStatusChange(agent, 'completed', 'Voting completed');
            }
            
            return {
              voter: agent,
              votedFor: votedForAgent,
              reasoning: voteResponse
            };
          } catch (error) {
            console.error(`Error getting vote from ${agent}:`, error);
            
            // Send status update if callback provided
            if (typeof onModelStatusChange === 'function') {
              onModelStatusChange(agent, 'failed', `Failed to vote: ${error.message}`);
            }
            
            // Return error result using the recovery helper
            return recoverFromError(error, 'vote', agent);
          }
        };
      });
    
    // Run vote tasks in parallel with concurrency management
    const votes = await runParallelWithConcurrency(voteTasks, {
      maxConcurrent: 3, // Even lower concurrency for votes to avoid overloading
      errorHandler: (error, index) => {
        const agentIndex = agents
          .filter(agent => {
            const agentDraft = initialDrafts.find(draft => draft.agent === agent);
            return agentDraft && !agentDraft.error;
          })
          .indexOf(agents[index]);
        
        return recoverFromError(error, 'vote', agents[agentIndex]);
      }
    });
    
    // Filter out error votes
    const successfulVotes = votes.filter(vote => !vote.error);

    // Log vote content metrics
    logContentMetrics('vote', {
      totalVotes: votes.length,
      successfulVotes: successfulVotes.length,
      totalContentLength: votes.reduce((sum, vote) => sum + (vote.reasoning?.length || 0), 0)
    });

    // DISABLED: No longer truncating votes to preserve content quality
    // const truncatedVotes = votes.map(vote => {
    //   if (vote.reasoning && vote.reasoning.length > 10000) {
    //     return {
    //       ...vote,
    //       reasoning: truncatePhaseContent(vote.reasoning, 'vote')
    //     };
    //   }
    //   return vote;
    // });
    //
    // for (let i = 0; i < votes.length; i++) {
    //   if (truncatedVotes[i] && truncatedVotes[i].reasoning) {
    //     votes[i].reasoning = truncatedVotes[i].reasoning;
    //     votes[i].truncated = truncatedVotes[i].truncated || false;
    //   }
    // }

    // Set truncated flag to false for all votes
    votes.forEach(vote => {
      vote.truncated = false;
    });

    // --- ADDITION: Check global abort after voting ---
    if (globalAbortSignal.aborted) {
        console.warn("⚠️ Global abort signal detected after voting phase. Skipping synthesis.");

        // Count votes to determine the most popular draft
        const voteCounts = {};
        const successfulVotes = votes.filter(vote => !vote.error);

        for (const vote of successfulVotes) {
            if (vote.votedFor) {
                voteCounts[vote.votedFor] = (voteCounts[vote.votedFor] || 0) + 1;
            }
        }

        // Find agent with most votes
        let mostVotedAgent = null;
        let highestVotes = 0;

        for (const [agent, count] of Object.entries(voteCounts)) {
            if (count > highestVotes) {
                highestVotes = count;
                mostVotedAgent = agent;
            }
        }

        if (ignoreFailingModels) {
            // If we have votes, use the most popular draft
            if (mostVotedAgent) {
                const winningDraft = initialDrafts.find(draft => draft.agent === mostVotedAgent);
                if (winningDraft) {
                    return {
                        answer: `${winningDraft.content}\n\n[Note: Collaboration was aborted after voting but before synthesis. This draft received the most votes (${highestVotes}).]`,
                        leadAgent: leadAgent,
                        summarizerAgent: mostVotedAgent,
                        drafts: initialDrafts,
                        critiques: critiques,
                        votes: votes
                    };
                }
            }

            // Fallback to first draft if no clear winner
            if (successfulDrafts.length > 0) {
                const firstDraft = successfulDrafts[0];
                return {
                    answer: `${firstDraft.content}\n\n[Note: Collaboration was aborted after voting phase. This represents the first available draft.]`,
                    leadAgent: leadAgent,
                    summarizerAgent: firstDraft.agent,
                    drafts: initialDrafts,
                    critiques: critiques,
                    votes: votes
                };
            }
        }

        // If we shouldn't ignore failures or we don't have any drafts, throw
        const abortError = new Error('Global timeout after voting phase');
        abortError.name = 'GlobalAbortError';
        throw abortError;
    }
    // --- END ADDITION ---

    // The synthesis phase is kept sequential since it's a single operation
    // and doesn't benefit from parallelization
    
    // Phase 4: Synthesis
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'synthesis',
      timestamp: new Date().toISOString()
    });

    // --- FIX: Determine summarizerAgent BEFORE using it in onModelStatusChange ---
    // Always use Gemini for summarization if available
    let summarizerAgent = 'gemini';

    // Check if Gemini is available among the agents with successful drafts
    const geminiAvailable = agents.some(agent => {
      if (agent === 'gemini') {
        const agentDraft = initialDrafts.find(draft => draft.agent === agent);
        return agentDraft && !agentDraft.error;
      }
      return false;
    });

    // If Gemini is not available, fall back to the highest token limit agent
    if (!geminiAvailable) {
      console.log(`⚠️ Gemini is not available for summarization, falling back to token-based selection`);
      if (typeof options.getAgentWithHighestTokenLimit === 'function') {
        summarizerAgent = options.getAgentWithHighestTokenLimit(
          agents.filter(agent => {
            // Only use agents that are available and didn't error out
            const agentDraft = initialDrafts.find(draft => draft.agent === agent);
            return agentDraft && !agentDraft.error;
          }),
          models
        );
      } else {
        console.warn("⚠️ options.getAgentWithHighestTokenLimit is not a function. Defaulting summarizer to leadAgent or first successful agent.");
        const firstSuccessfulAgent = successfulDrafts.length > 0 ? successfulDrafts[0].agent : leadAgent;
        summarizerAgent = leadAgent || firstSuccessfulAgent || agents[0]; // Fallback chain
      }
    }

    console.log(`👑 Using ${summarizerAgent} for final summarization`);

    // Add additional log for Gemini selection
    if (summarizerAgent === 'gemini') {
      console.log(`✅ Gemini selected as the preferred summarizer agent per requirements`);
    }

    // Now that summarizerAgent is defined, notify about the synthesis phase
    if (typeof onModelStatusChange === 'function') {
      // For synthesis, notify all remaining active agents about the phase.
      const activeSynthesisAgents = agents.filter(agent => {
        const agentDraft = initialDrafts.find(draft => draft.agent === agent);
        return agentDraft && !agentDraft.error;
      });

      // Notify about phase with synthesizer agent highlighted
      for (const agent of agents) {
        // Send phase change notification (now that summarizerAgent is defined)
        onModelStatusChange(agent, 'phase_change', `Phase 4/4: Synthesis (by ${summarizerAgent})`);

        // Let users know which phase we're in even for models that didn't make it to this phase
        onModelStatusChange(agent, 'processing', 'Entering final synthesis phase');
      }
    }

    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: summarizerAgent,
      phase: 'synthesis',
      timestamp: new Date().toISOString()
    });

    // Send status update if callback provided
    if (typeof onModelStatusChange === 'function') {
      onModelStatusChange(summarizerAgent, 'processing', 'Creating final summary');
    }
    
    const draftsText = initialDrafts
      .filter(draft => !draft.error)
      .map(draft => `${draft.agent.toUpperCase()}'s DRAFT:\n${draft.content}\n`)
      .join('\n');
    
    const votesText = successfulVotes
      .map(vote => `${vote.voter.toUpperCase()}'s VOTE: ${vote.votedFor || 'Unclear'}\nReasoning: ${vote.reasoning}\n`)
      .join('\n');
    
    const synthesisInstruction = 'As the summarizer, create an efficient synthesis of the best content from all drafts while addressing key critiques. BE DIRECT AND FOCUSED - avoid unnecessary explanation or verbose reasoning. Split your response into: 1) FINAL ANSWER (clear, concise, direct) and 2) BRIEF RATIONALE explaining your synthesis approach in 2-3 paragraphs maximum.';

    // Calculate the combined length of all draft and vote content
    const totalDraftsLength = draftsText.length;
    const totalVotesLength = votesText.length;
    console.log(`📊 Synthesis content sizes: drafts=${totalDraftsLength} chars, votes=${totalVotesLength} chars, total=${totalDraftsLength + totalVotesLength} chars`);

    // Log content metrics before truncation
    logContentMetrics('synthesis-pre', {
      draftsLength: totalDraftsLength,
      votesLength: totalVotesLength,
      totalLength: totalDraftsLength + totalVotesLength
    });

    // DISABLED: No longer truncating content for synthesis to preserve quality
    // let useDraftsText = truncatePhaseContent(draftsText, 'DRAFT');
    // let useVotesText = truncatePhaseContent(votesText, 'VOTE');

    // Use the original untruncated text
    let useDraftsText = draftsText;
    let useVotesText = votesText;

    console.log(`📊 Using full content for synthesis: drafts=${useDraftsText.length} chars, votes=${useVotesText.length} chars, total=${useDraftsText.length + useVotesText.length} chars`);

    logContentMetrics('synthesis-post', {
      draftsLength: useDraftsText.length,
      votesLength: useVotesText.length,
      totalLength: useDraftsText.length + useVotesText.length
    });

    const combinedSynthesisPrompt = prompt +
      "\n\nDRAFTS:\n" + useDraftsText +
      "\n\nVOTES:\n" + useVotesText;

    const synthesisPrompt = constructPrompt(
      combinedSynthesisPrompt,
      summarizerAgent,
      synthesisInstruction
    );

    // Debug log the synthesis prompt structure
    console.log(`📋 Synthesis prompt for ${summarizerAgent}: systemPrompt=${Boolean(synthesisPrompt.systemPrompt)}, userPrompt length=${synthesisPrompt.userPrompt ? synthesisPrompt.userPrompt.length : 0} chars`);
    
    // Use enhanced function for synthesis with fallback mechanism
    let synthesisResponse;
    let fallbackAttempted = false;

    // --- ADDITION: Check global abort before synthesis API call ---
    if (globalAbortSignal.aborted) {
        console.warn(`⚠️ Global abort signal detected before synthesis call by ${summarizerAgent}. Using vote-based fallback.`);

        // Count votes to determine the most popular draft
        const voteCounts = {};
        const successfulVotes = votes.filter(vote => !vote.error);

        for (const vote of successfulVotes) {
            if (vote.votedFor) {
                voteCounts[vote.votedFor] = (voteCounts[vote.votedFor] || 0) + 1;
            }
        }

        // Find agent with most votes
        let mostVotedAgent = null;
        let highestVotes = 0;

        for (const [agent, count] of Object.entries(voteCounts)) {
            if (count > highestVotes) {
                highestVotes = count;
                mostVotedAgent = agent;
            }
        }

        // Use most voted draft content if available, but enhance with insights from other drafts
        if (mostVotedAgent) {
            const winningDraft = initialDrafts.find(draft => draft.agent === mostVotedAgent);

            // Extract voting reasons
            const votesForWinner = successfulVotes.filter(vote => vote.votedFor === mostVotedAgent);
            let votingReasons = '';

            if (votesForWinner.length > 0) {
                votingReasons = votesForWinner.map(vote => {
                    // Extract a brief reason from each vote
                    const reasonText = vote.reasoning || '';
                    const briefReason = reasonText.split('\n').slice(0, 3).join('\n');
                    return `- ${vote.voter} voted for this draft because: ${briefReason}`;
                }).join('\n\n');
            }

            synthesisResponse = `FINAL ANSWER:\n${winningDraft.content}\n\nRATIONALE:\nThis draft from ${mostVotedAgent} received the most votes (${highestVotes}) from the collaboration. The synthesis phase was skipped due to time constraints, but this represents the most preferred answer.\n\nKey strengths of this answer according to other agents:\n${votingReasons}`;
            fallbackAttempted = true;
        } else if (successfulDrafts.length > 0) {
            // No clear winner, use the first successful draft but also mention insights from others
            const firstDraft = successfulDrafts[0];

            // Try to extract some unique insights from other drafts
            let otherInsights = '';
            if (successfulDrafts.length > 1) {
                const otherDrafts = successfulDrafts.filter(draft => draft.agent !== firstDraft.agent);
                otherInsights = otherDrafts.map(draft => {
                    // Extract the first paragraph as a key insight
                    const firstParagraph = draft.content.split('\n\n')[0] || '';
                    return `- From ${draft.agent}: "${firstParagraph.substring(0, 150)}..."`;
                }).join('\n\n');
            }

            synthesisResponse = `FINAL ANSWER:\n${firstDraft.content}\n\nRATIONALE:\nThis answer uses ${firstDraft.agent}'s draft as a fallback since synthesis was skipped due to time constraints and there was no clear voting winner.\n\nKey insights from other agents that weren't incorporated:\n${otherInsights}`;
            fallbackAttempted = true;
        } else {
            // No successful drafts, this is an error case
            if (!ignoreFailingModels) {
                const abortError = new Error('Global timeout before synthesis call and no successful drafts');
                abortError.name = 'GlobalAbortError';
                throw abortError;
            }
            synthesisResponse = `FINAL ANSWER:\nThe AI collaboration was unable to provide a complete response due to time constraints.\n\nRATIONALE:\nThe collaboration was aborted before synthesis could be completed, and no successful drafts were available to use as fallback.`;
            fallbackAttempted = true;
        }
    } else {
        try {
          // First try with the primary summarizer
          synthesisResponse = await enhancedGetAgentResponse(
            summarizerAgent, synthesisPrompt, 'synthesis', redisChannel,
            globalAbortSignal, costTracker, models?.[summarizerAgent]?.[0],
            clients, publishEvent, estimateTokenCount
          );
        } catch (primaryError) {
          console.error(`Error during synthesis by primary synthesizer ${summarizerAgent}:`, primaryError);
          fallbackAttempted = true;

          // Try to use a different agent if the primary fails
          if (primaryError.name === 'AbortError' || primaryError.message === 'AbortError') {
            console.log(`⚠️ Primary synthesizer ${summarizerAgent} aborted, trying fallback synthesizers`);

            // Find available agents that aren't the primary synthesizer
            const fallbackAgents = agents.filter(agent => {
              if (agent === summarizerAgent) return false;
              const agentDraft = initialDrafts.find(draft => draft.agent === agent);
              return agentDraft && !agentDraft.error;
            });

            console.log(`📋 Available fallback synthesizers: ${fallbackAgents.join(', ')}`);

            // Try each fallback agent in turn
            let fallbackSucceeded = false;

            for (const fallbackAgent of fallbackAgents) {
              console.log(`🔄 Attempting synthesis with fallback agent: ${fallbackAgent}`);
              try {
                // Send status update if callback provided
                if (typeof onModelStatusChange === 'function') {
                  onModelStatusChange(fallbackAgent, 'processing', 'Creating final summary (fallback)');
                }

                // Try synthesis with this fallback agent
                synthesisResponse = await enhancedGetAgentResponse(
                  fallbackAgent, synthesisPrompt, 'synthesis', redisChannel,
                  globalAbortSignal, costTracker, models?.[fallbackAgent]?.[0],
                  clients, publishEvent, estimateTokenCount
                );

                console.log(`✅ Fallback synthesis succeeded with ${fallbackAgent}`);
                fallbackSucceeded = true;

                // Update the summarizer agent to reflect who actually did the summarization
                summarizerAgent = fallbackAgent;

                // Send status update if callback provided
                if (typeof onModelStatusChange === 'function') {
                  onModelStatusChange(fallbackAgent, 'completed', 'Fallback summarization completed');
                }

                // We succeeded with this fallback, stop trying others
                break;
              } catch (fallbackError) {
                console.error(`❌ Fallback synthesizer ${fallbackAgent} also failed:`, fallbackError);

                // Send status update if callback provided
                if (typeof onModelStatusChange === 'function') {
                  onModelStatusChange(fallbackAgent, 'failed', `Failed to create summary: ${fallbackError.message}`);
                }

                // Continue to the next fallback
              }
            }

            // If all fallbacks failed, use the voting-based approach
            if (!fallbackSucceeded) {
              console.log(`⚠️ All fallback synthesizers failed, using vote-based selection`);
              // Proceed with vote-based fallback
            } else {
              // Skip the vote-based fallback if we succeeded with a fallback agent
              return synthesisResponse;
            }
          }

          // Fall back to the most voted agent's draft if synthesis fails with all agents
          if (ignoreFailingModels || fallbackAttempted) {
            // Count votes to determine the most popular draft
            const voteCounts = {};
            for (const vote of successfulVotes) {
              if (vote.votedFor) {
                voteCounts[vote.votedFor] = (voteCounts[vote.votedFor] || 0) + 1;
              }
            }

            // Find agent with most votes
            let mostVotedAgent = null;
            let highestVotes = 0;

            for (const [agent, count] of Object.entries(voteCounts)) {
              if (count > highestVotes) {
                highestVotes = count;
                mostVotedAgent = agent;
              }
            }

            // If we found a clear winner, use their draft with enhanced explanation
            if (mostVotedAgent) {
              const winningDraft = initialDrafts.find(draft => draft.agent === mostVotedAgent);

              // Extract voting reasons and critiques for better context
              const votesForWinner = successfulVotes.filter(vote => vote.votedFor === mostVotedAgent);
              const critiquesOfWinner = critiques.filter(critique =>
                critique.targets && critique.targets.includes(mostVotedAgent)
              );

              // Format reasons from votes
              let votingReasons = '';
              if (votesForWinner.length > 0) {
                votingReasons = votesForWinner.slice(0, 2).map(vote => {
                  const reasonText = vote.reasoning || '';
                  const briefReason = reasonText.split('\n').slice(0, 2).join(' ');
                  return `- ${vote.voter} voted for this draft because: ${briefReason.substring(0, 200)}...`;
                }).join('\n\n');
              }

              // Format critiques (they're already about this agent's draft)
              let criticismPoints = '';
              if (critiquesOfWinner.length > 0) {
                criticismPoints = critiquesOfWinner.slice(0, 2).map(critique => {
                  const criticText = critique.content || '';
                  const briefCritic = criticText.split('\n').slice(0, 2).join(' ');
                  return `- ${critique.agent} noted: ${briefCritic.substring(0, 200)}...`;
                }).join('\n\n');
              }

              synthesisResponse = `FINAL ANSWER:\n${winningDraft.content}\n\n` +
                `RATIONALE:\nThis draft from ${mostVotedAgent} received the most votes (${highestVotes}) from the collaboration. ` +
                `The synthesis phase failed, so this represents the most preferred draft without improvements.\n\n` +
                `Key reasons this draft was selected:\n${votingReasons}\n\n` +
                `Points that could have been improved (but weren't due to synthesis failure):\n${criticismPoints}`;
            } else {
              // No clear winner, use the first successful draft with context from other drafts
              const firstDraft = successfulDrafts[0];

              // Extract some key points from other drafts for context
              let otherInsights = '';
              if (successfulDrafts.length > 1) {
                const otherDrafts = successfulDrafts.filter(draft => draft.agent !== firstDraft.agent);
                otherInsights = otherDrafts.slice(0, 3).map(draft => {
                  const firstParagraph = draft.content.split('\n\n')[0] || '';
                  return `- From ${draft.agent}: "${firstParagraph.substring(0, 200)}..."`;
                }).join('\n\n');
              }

              synthesisResponse = `FINAL ANSWER:\n${firstDraft.content}\n\n` +
                `RATIONALE:\nThis answer uses ${firstDraft.agent}'s draft as a fallback since synthesis failed ` +
                `and there was no clear winner in the voting.\n\n` +
                `Key insights from other agents that weren't incorporated:\n${otherInsights}`;
            }
          } else {
            // Re-throw the error if we shouldn't ignore failures
            throw primaryError;
          }
        }
    }
    
    // Extract final answer and rationale from synthesis
    let finalAnswer = '';
    let rationale = '';

    if (synthesisResponse.includes('FINAL ANSWER')) {
      const parts = synthesisResponse.split(/RATIONALE|REASONING/i);
      if (parts.length >= 1) {
        finalAnswer = parts[0].replace(/FINAL ANSWER:?/i, '').trim();
        rationale = parts.length > 1 ? parts[1].trim() : '';
      }
    } else {
      finalAnswer = synthesisResponse;
      rationale = `Synthesized from multiple AI perspectives with ${successfulVotes.length} votes.`;
    }

    // Log final content sizes
    logContentMetrics('final-answer', {
      finalAnswerLength: finalAnswer.length,
      rationaleLength: rationale.length,
      totalLength: finalAnswer.length + rationale.length
    });

    // Apply final truncation to ensure reasonable response sizes
    // Truncate answer if it's extremely large (over 50K chars)
    if (finalAnswer.length > 50000) {
      console.log(`⚠️ Truncating very large final answer: ${finalAnswer.length} chars`);
      finalAnswer = truncatePhaseContent(finalAnswer, 'SYNTHESIS');
    }

    // Truncate rationale if it's extremely large (over 25K chars)
    if (rationale.length > 25000) {
      console.log(`⚠️ Truncating very large rationale: ${rationale.length} chars`);
      rationale = truncatePhaseContent(rationale, 'SYNTHESIS');
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
    if (typeof onModelStatusChange === 'function') {
      // Mark summarizer as completed
      onModelStatusChange(summarizerAgent, 'completed', 'Summarization completed');

      // If keepLoadingUntilComplete is true, ensure all agents are marked as completed to properly close loading indicators
      if (keepLoadingUntilComplete) {
        for (const agent of agents) {
          if (agent !== summarizerAgent) { // Skip the summarizer as we just updated it
            onModelStatusChange(agent, 'completed', 'Collaboration complete');
          }
        }
      }
    }
    
    // Construct final result
    return {
      answer: finalAnswer,
      rationale: rationale,
      leadAgent: leadAgent,
      summarizerAgent: summarizerAgent,
      drafts: initialDrafts,
      critiques: critiques,
      votes: votes
    };
  } catch (error) {
    // Handle errors during the round table process
    console.error(`❌ Error in parallel round table collaboration:`, error);
    
    // Special handling for timeout/abort errors when ignoreFailingModels is true
    if (ignoreFailingModels && (error.name === 'AbortError' || error.message === 'AbortError')) {
      console.log(`⚠️ Parallel round table collaboration aborted, but ignoreFailingModels=true, returning partial result`);
      
      // Return meaningful partial results if we have any
      if (typeof initialDrafts !== 'undefined' && initialDrafts && initialDrafts.length > 0) {
        // Filter successful drafts
        const successfulDrafts = initialDrafts.filter(d => !d.error);
        
        if (successfulDrafts.length > 0) {
          return {
            answer: "Collaboration completed with partial results (some models failed but were ignored as configured)",
            rationale: "The round-table process was interrupted, but some models provided initial drafts.",
            leadAgent: leadAgent,
            drafts: initialDrafts,
            critiques: typeof critiques !== 'undefined' ? critiques : [],
            votes: typeof votes !== 'undefined' ? votes : []
          };
        }
      }
    }
    
    // Re-throw the error to be handled by the parent function
    throw error;
  }
}