import { enhancedGetAgentResponse } from './agent-response.mjs';
import { applySequentialStyle, getAgentPosition } from './sequential-style-options.mjs';
import { trackCost } from '../billing/costControl.mjs';

/**
 * Implements the Sequential Critique Chain collaboration pattern
 * Each agent builds upon the work of the previous agent, applying incremental improvements
 * 
 * @param {string} prompt - The user's original prompt
 * @param {Array<string>} agents - The ordered list of agents to use in the sequence
 * @param {string} redisChannel - Channel for publishing events
 * @param {AbortSignal} globalAbortSignal - Signal for aborting the process
 * @param {Object} costTracker - For tracking token usage and costs
 * @param {Object} options - Configuration options
 * @returns {Object} - The final result with intermediate steps
 */
export async function executeSequentialCritiqueChain(
  prompt,
  agents,
  redisChannel,
  globalAbortSignal,
  costTracker,
  options = {}
) {
  // Log the sequential critique chain execution
  console.log(`🔄 Starting Sequential Critique Chain with ${agents.length} agents in order: ${agents.join(' → ')}`);
  console.log(`🎨 Using style: ${options.styleOption || 'balanced'}`);
  
  // Extract options with defaults
  const {
    ignoreFailingModels = false,
    continueWithAvailableModels = true,
    styleOption = 'harmonious', // Default to harmonious style
    models = {},
    clients,
    publishEvent,
    estimateTokenCount,
    constructPrompt,
    onModelStatusChange
  } = options;
  
  // Validate that clients are provided
  console.log("🔍 [SequentialChain] Checking clients availability...");
  if (!clients || typeof clients !== 'object') {
    console.error("❌ [SequentialChain] CRITICAL ERROR: clients is not an object:", clients);
    throw new Error("No clients object provided to sequential chain. Check configuration.");
  }
  
  // Make sure we have at least 2 agents for a meaningful sequence
  if (agents.length < 2) {
    console.warn("⚠️ [SequentialChain] At least 2 agents are required for a sequential critique chain. " +
                 `Only ${agents.length} provided. Will use this agent for a simple response.`);
  }
  
  try {
    // Track all intermediate responses
    const chainResponses = [];
    let currentAnswer = null;
    
    // Phase 1: Initial Answer
    publishEvent(redisChannel, {
      type: 'phase_start',
      phase: 'sequential_initial',
      timestamp: new Date().toISOString()
    });
    
    // Update status for all agents
    if (typeof onModelStatusChange === 'function') {
      // First agent status
      const initialAgent = agents[0];
      onModelStatusChange(initialAgent, 'phase_change', 'Phase 1: Initial Draft');
      onModelStatusChange(initialAgent, 'processing', 'Creating initial draft');

      // Set all other agents to waiting status
      for (let i = 1; i < agents.length; i++) {
        onModelStatusChange(agents[i], 'pending', `Waiting for turn (position ${i+1})`);
      }
    }
    
    // Get first agent from the list
    const initialAgent = agents[0];

    publishEvent(redisChannel, {
      type: 'agent_thinking',
      agent: initialAgent,
      phase: 'sequential_initial',
      timestamp: new Date().toISOString()
    });
    
    // Get the style-specific initial prompt instruction
    const initialPosition = getAgentPosition(0, agents.length);
    const initialInstruction = applySequentialStyle(prompt, initialPosition, styleOption);
    
    // Construct the initial prompt
    const initialPrompt = constructPrompt(prompt, initialAgent, initialInstruction);
    
    try {
      // Get the initial draft response
      const firstAgent = agents[0]; // Ensure the first agent is defined in this scope
      currentAnswer = await enhancedGetAgentResponse(
        firstAgent,
        initialPrompt,
        'sequential_initial',
        redisChannel,
        globalAbortSignal,
        costTracker,
        models?.[firstAgent]?.[0],
        clients,
        publishEvent,
        estimateTokenCount
      );
      
      // Record the successful response
      chainResponses.push({
        agent: firstAgent,
        position: initialPosition,
        content: currentAnswer,
        error: false
      });
      
      // Update status with progress percentage - IMPORTANT: status MUST be 'completed' exactly for LoadingManager to update progress
      if (typeof onModelStatusChange === 'function') {
        // Calculate progress based on completed agents
        const totalAgents = agents.length;
        const progressPercent = Math.round((1 / totalAgents) * 100);

        // First make a phase change notification (for UI clarity)
        onModelStatusChange(firstAgent, 'phase_change', `Initial draft completed`);
        // Then mark as 'completed' which triggers LoadingManager progress update
        onModelStatusChange(firstAgent, 'completed', `Initial draft completed (${progressPercent}% chain progress)`);
        console.log(`✅ Agent ${firstAgent} marked as completed (${progressPercent}% of chain complete)`);
      }
      
    } catch (error) {
      console.error(`❌ Error getting initial answer from ${firstAgent}:`, error);
      
      // Update status - make sure LoadingManager recognizes the failure
      if (typeof onModelStatusChange === 'function') {
        // First mark as phase_change so UI updates properly
        onModelStatusChange(firstAgent, 'phase_change', 'Initial Agent Failed');
        // Then mark as 'failed' which triggers LoadingManager progress update (counts as completed)
        onModelStatusChange(firstAgent, 'failed', `Failed to create initial draft: ${error.message}`);
      }

      // Record the error
      chainResponses.push({
        agent: firstAgent,
        position: initialPosition,
        content: `[${firstAgent} was unable to provide an initial draft: ${error.message}]`,
        error: true
      });
      
      // Handle the error based on options
      if (!ignoreFailingModels) {
        throw new Error(`Initial agent ${firstAgent} failed to respond: ${error.message}`);
      }
      
      // Try the next agent in the sequence as fallback
      if (agents.length > 1 && continueWithAvailableModels) {
        console.log(`🔄 Initial agent ${firstAgent} failed, trying next agent ${agents[1]}`);
        
        // Update fallback agent status
        if (typeof onModelStatusChange === 'function') {
          onModelStatusChange(agents[1], 'phase_change', 'Phase 1: Initial Draft (Fallback)');
          onModelStatusChange(agents[1], 'processing', 'Creating initial draft as fallback');
        }
        
        // Try with the next agent
        try {
          currentAnswer = await enhancedGetAgentResponse(
            agents[1],
            initialPrompt,
            'sequential_initial_fallback',
            redisChannel,
            globalAbortSignal,
            costTracker,
            models?.[agents[1]]?.[0],
            clients,
            publishEvent,
            estimateTokenCount
          );
          
          // Record the successful fallback response
          chainResponses.push({
            agent: agents[1],
            position: initialPosition,
            content: currentAnswer,
            fallback: true,
            error: false
          });
          
          // Update status
          if (typeof onModelStatusChange === 'function') {
            onModelStatusChange(agents[1], 'completed', 'Initial draft completed (as fallback)');
          }
          
        } catch (fallbackError) {
          console.error(`❌ Fallback agent ${agents[1]} also failed:`, fallbackError);
          
          // Update status - make sure LoadingManager recognizes the failure
          if (typeof onModelStatusChange === 'function') {
            // First mark as phase_change so UI updates properly
            onModelStatusChange(agents[1], 'phase_change', 'Fallback Agent Failed');
            // Then mark as 'failed' which triggers LoadingManager progress update (counts as completed)
            onModelStatusChange(agents[1], 'failed', `Failed as fallback: ${fallbackError.message}`);
          }
          
          // If even the fallback failed, throw error
          throw new Error(`Both initial agent ${firstAgent} and fallback agent ${agents[1]} failed to respond`);
        }
      } else {
        // No fallback option available
        throw new Error(`Initial agent ${firstAgent} failed and no fallback options available`);
      }
    }
    
    // Check if we should abort due to cost
    if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
      throw new Error('CostLimitExceededError');
    }
    
    // Check if we should abort due to global signal
    if (globalAbortSignal.aborted) {
      console.warn("⚠️ Global abort signal detected after initial answer. Returning early result.");

      // Mark all remaining agents (from index 1 onward) as completed with abort message - ensure LoadingManager updates
      if (typeof onModelStatusChange === 'function') {
        const progressPercent = Math.round((1 / agents.length) * 100);

        // Mark the first agent as completed if it isn't already
        onModelStatusChange(agents[0], 'phase_change', `Task completed`);
        onModelStatusChange(agents[0], 'completed', `Initial draft completed (${progressPercent}% chain progress)`);

        // Mark all other agents as aborted but 'completed' status for LoadingManager to track progress
        for (let j = 1; j < agents.length; j++) {
          // Use phase_change then completed pattern for each agent
          onModelStatusChange(agents[j], 'phase_change', `Chain terminated early`);
          onModelStatusChange(agents[j], 'completed', `Aborted (chain terminated early)`);
          console.log(`⛔ Agent ${agents[j]} marked as completed (aborted) due to global abort signal`);
        }
      }

      return {
        answer: currentAnswer,
        leadAgent: agents[0],
        iterations: chainResponses,
        truncated: true
      };
    }
    
    // Phase 2+: Sequential Critique and Improvement
    // Start from the second agent (index 1)
    for (let i = 1; i < agents.length; i++) {
      const currentAgent = agents[i];
      const currentPosition = getAgentPosition(i, agents.length);
      
      // Check if we should continue based on previous results
      if (!currentAnswer) {
        console.warn(`⚠️ Missing current answer at iteration ${i}, cannot continue the chain`);

        // Mark all remaining agents as completed with appropriate message to update UI
        if (typeof onModelStatusChange === 'function') {
          const totalAgents = agents.length;
          const completedAgents = i; // Agents before current one
          const progressPercent = Math.round((completedAgents / totalAgents) * 100);

          // Mark current and all subsequent agents as completed but with skip message
          for (let j = i; j < agents.length; j++) {
            onModelStatusChange(agents[j], 'completed', `Skipped (${progressPercent}% chain progress)`);
            console.log(`⏩ Agent ${agents[j]} marked as skipped (${progressPercent}% chain complete)`);
          }
        }

        break;
      }
      
      publishEvent(redisChannel, {
        type: 'phase_start',
        phase: `sequential_critique_${i}`,
        timestamp: new Date().toISOString()
      });
      
      // Update status for all agents to show progress in the sequence
      if (typeof onModelStatusChange === 'function') {
        // Calculate overall progress percentage based on completed agents
        const totalAgents = agents.length;
        const completedAgents = i; // Agents before current one are completed
        const progressPercent = Math.round((completedAgents / totalAgents) * 100);

        // First properly mark previous agent as completed if it isn't the first agent (which is already marked)
        if (i > 0) {
          const previousAgent = agents[i-1];
          // Make sure previous agent shows as completed with correct progress
          onModelStatusChange(previousAgent, 'phase_change', `Contribution completed`);
          onModelStatusChange(previousAgent, 'completed', `Contribution completed (${progressPercent}% chain progress)`);
          console.log(`✅ Agent ${previousAgent} marked as completed (${progressPercent}% of chain complete)`);
        }

        // Update current agent status - use phasing that LoadingManager understands
        onModelStatusChange(currentAgent, 'phase_change', `Phase ${i+1}: Critique & Refinement`);
        onModelStatusChange(currentAgent, 'processing', 'Reviewing and enhancing previous work');

        // Update all other agents with waiting status
        for (let j = i+1; j < agents.length; j++) {
          onModelStatusChange(agents[j], 'pending', `Waiting for turn (position ${j+1})`);
        }
      }
      
      publishEvent(redisChannel, {
        type: 'agent_thinking',
        agent: currentAgent,
        phase: `sequential_critique_${i}`,
        timestamp: new Date().toISOString()
      });
      
      // Get the style-specific critiquing prompt instruction based on position
      const critiqueInstruction = applySequentialStyle(prompt, currentPosition, styleOption);
      
      // Combine original prompt with previous answer and instruction
      const combinedPrompt = 
        `ORIGINAL PROMPT: ${prompt}\n\n` +
        `PREVIOUS RESPONSE:\n${currentAnswer}\n\n` +
        `INSTRUCTION: ${critiqueInstruction}`;
      
      // Construct full prompt for this agent
      const critiquePrompt = constructPrompt(combinedPrompt, currentAgent, critiqueInstruction);
      
      try {
        // Get this agent's critique and improvement
        const critiquedAnswer = await enhancedGetAgentResponse(
          currentAgent,
          critiquePrompt,
          `sequential_critique_${i}`,
          redisChannel,
          globalAbortSignal,
          costTracker,
          models?.[currentAgent]?.[0],
          clients,
          publishEvent,
          estimateTokenCount
        );
        
        // Update the current answer for the next iteration
        currentAnswer = critiquedAnswer;
        
        // Record this iteration
        chainResponses.push({
          agent: currentAgent,
          position: currentPosition,
          content: critiquedAnswer,
          error: false
        });
        
        // Update status with progress percentage - ensure proper phase_change then completed status
        if (typeof onModelStatusChange === 'function') {
          // Calculate progress based on completed agents
          const totalAgents = agents.length;
          const completedAgents = i + 1; // Current agent + previous ones
          const progressPercent = Math.round((completedAgents / totalAgents) * 100);

          // First notify phase completion
          onModelStatusChange(currentAgent, 'phase_change', `Critique completed`);
          // Then mark explicitly as 'completed' - this is what LoadingManager watches for
          onModelStatusChange(currentAgent, 'completed', `Critique completed (${progressPercent}% chain progress)`);
          console.log(`✅ Agent ${currentAgent} marked as completed (${progressPercent}% of chain complete)`);
        }
        
      } catch (error) {
        console.error(`❌ Error getting critique from ${currentAgent}:`, error);
        
        // Update status - make sure LoadingManager recognizes the failure
        if (typeof onModelStatusChange === 'function') {
          // First mark as phase_change so UI updates properly
          onModelStatusChange(currentAgent, 'phase_change', `Agent ${i+1} Failed`);
          // Then mark as 'failed' which triggers LoadingManager progress update (counts as completed)
          onModelStatusChange(currentAgent, 'failed', `Failed to create critique: ${error.message}`);
        }
        
        // Record the error
        chainResponses.push({
          agent: currentAgent,
          position: currentPosition,
          content: `[${currentAgent} was unable to provide a critique: ${error.message}]`,
          error: true
        });
        
        // Handle the error based on options
        if (ignoreFailingModels) {
          console.log(`⚠️ Ignoring failure of ${currentAgent} and continuing with previous answer`);
          // Keep the previous answer and continue
        } else if (!continueWithAvailableModels) {
          // If we shouldn't continue with failures, stop the chain
          throw new Error(`Agent ${currentAgent} failed at position ${i} in the sequential chain`);
        }
        
        // If we're continuing despite errors, no need to update currentAnswer
      }
      
      // Check if we should abort due to cost
      if (costTracker && typeof costTracker.shouldAbort === 'function' && costTracker.shouldAbort()) {
        console.warn("⚠️ Cost limit reached, stopping sequential chain early.");
        break;
      }
      
      // Check if we should abort due to global signal
      if (globalAbortSignal.aborted) {
        console.warn(`⚠️ Global abort signal detected after iteration ${i}. Stopping sequence early.`);

        // Mark all remaining agents as completed with abort message to update UI - ensure LoadingManager updates
        if (typeof onModelStatusChange === 'function') {
          const totalAgents = agents.length;
          const completedAgents = i + 1; // Include the current agent
          const progressPercent = Math.round((completedAgents / totalAgents) * 100);

          // Make sure current agent is marked as completed
          onModelStatusChange(currentAgent, 'phase_change', `Task completed`);
          onModelStatusChange(currentAgent, 'completed', `Completed (${progressPercent}% chain progress)`);

          // Mark all remaining agents as aborted but 'completed' status for LoadingManager to track progress
          for (let j = i + 1; j < agents.length; j++) {
            // Use phase_change then completed pattern for each agent
            onModelStatusChange(agents[j], 'phase_change', `Chain terminated early`);
            onModelStatusChange(agents[j], 'completed', `Aborted (chain terminated at ${progressPercent}%)`);
            console.log(`⛔ Agent ${agents[j]} marked as completed (aborted) due to global abort signal`);
          }
        }

        break;
      }
    }
    
    // The final answer is the latest successful iteration
    const finalAnswer = currentAnswer;

    // Get the agent that produced the final answer
    let finalAgent = agents[0]; // Default to first agent
    for (let i = chainResponses.length - 1; i >= 0; i--) {
      if (!chainResponses[i].error) {
        finalAgent = chainResponses[i].agent;
        break;
      }
    }

    console.log(`✅ Sequential critique chain completed with ${chainResponses.length} iterations`);
    console.log(`🏁 Final answer provided by: ${finalAgent}`);
    for (let i = 0; i < chainResponses.length; i++) {
      if (!chainResponses[i].error) {
        console.log(`  ${i+1}. ${chainResponses[i].agent}: ${chainResponses[i].position || 'unknown'} ${chainResponses[i].error ? '❌ ERROR' : '✅'}`);
      }
    }
    
    publishEvent(redisChannel, {
      type: 'collaboration_result',
      answer: finalAnswer,
      leadAgent: finalAgent,
      timestamp: new Date().toISOString()
    });
    
    // Mark all agents as completed before returning - ensure LoadingManager updates properly
    if (typeof onModelStatusChange === 'function') {
      // First send a final phase change to indicate chain completion
      onModelStatusChange(agents[0], 'phase_change', 'Sequential Chain Complete');

      // Force 100% complete status on all agents to ensure UI shows completed state
      for (const agent of agents) {
        // First notify of phase completion if not already done
        onModelStatusChange(agent, 'phase_change', 'Sequential Chain Complete');
        // Then mark explicitly as 'completed' - this is what LoadingManager watches for
        onModelStatusChange(agent, 'completed', 'Sequential critique chain completed (100% complete)');
      }
      console.log(`✅ All ${agents.length} agents marked as completed (100% chain progress)`);
    }

    // Return the final result along with all intermediate steps
    return {
      answer: finalAnswer,
      leadAgent: finalAgent,
      summarizerAgent: finalAgent, // Mark the final agent as the summarizer
      iterations: chainResponses,
      truncated: globalAbortSignal.aborted
    };
    
  } catch (error) {
    console.error(`❌ Error in sequential critique chain:`, error);
    
    // Re-throw the error to be handled by the caller
    throw error;
  }
}