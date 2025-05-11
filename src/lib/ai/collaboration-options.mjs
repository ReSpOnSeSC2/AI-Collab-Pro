/**
 * Configuration and style options for AI collaboration modes
 */

// Style options for Sequential Critique Chain
export const SEQUENTIAL_STYLES = {
  BALANCED: 'balanced',
  CONTRASTING: 'contrasting',
  HARMONIOUS: 'harmonious'
};

// Collaboration modes
export const COLLABORATION_MODES = {
  ROUND_TABLE: 'roundTable',
  SEQUENTIAL_CRITIQUE: 'sequentialCritique',
  VALIDATED_CONSENSUS: 'validatedConsensus',
  CREATIVE_BRAINSTORM: 'creativeBrainstorm',
  HYBRID_BRAINTRUST: 'hybridBraintrust'
};

/**
 * Get recommended agent ordering based on collaboration mode and available agents
 * 
 * @param {Array<string>} availableAgents - List of available agent IDs
 * @param {string} mode - Collaboration mode
 * @returns {Array<string>} - Optimized order of agents
 */
export function getOptimalAgentOrder(availableAgents, mode) {
  // Deep copy to avoid mutating the input
  const agents = [...availableAgents];

  switch (mode) {
    case COLLABORATION_MODES.SEQUENTIAL_CRITIQUE:
      // Use randomized order for sequential critique chain as token count isn't a critical factor
      // This creates more diverse and interesting chains that aren't biased toward any specific model pattern

      // Shuffle the agents using Fisher-Yates algorithm
      const randomizedAgents = [...agents];
      for (let i = randomizedAgents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [randomizedAgents[i], randomizedAgents[j]] = [randomizedAgents[j], randomizedAgents[i]];
      }

      console.log(`🎲 Using randomized agent order for sequential chain: ${randomizedAgents.join(' → ')}`);

      // You could still bias certain models for first or last position if needed
      // For example, to ensure a more structured start or a higher-token model at the end
      // This code is commented out as an optional enhancement
      /*
      // Attempt to place Claude first if available (good at initial structured responses)
      if (randomizedAgents.includes('claude') && randomizedAgents[0] !== 'claude') {
        const claudeIndex = randomizedAgents.indexOf('claude');
        randomizedAgents.splice(claudeIndex, 1); // Remove Claude
        randomizedAgents.unshift('claude'); // Add to beginning
      }

      // Attempt to place Gemini last if available (high token limit)
      if (randomizedAgents.includes('gemini') && randomizedAgents[randomizedAgents.length-1] !== 'gemini') {
        const geminiIndex = randomizedAgents.indexOf('gemini');
        randomizedAgents.splice(geminiIndex, 1); // Remove Gemini
        randomizedAgents.push('gemini'); // Add to end
      }
      */

      console.log(`📋 Final sequential order: ${randomizedAgents.join(' → ')}`);
      return randomizedAgents;
      
    case COLLABORATION_MODES.ROUND_TABLE:
      // For round table, keep the original order but ensure diversity
      return agents;
      
    case COLLABORATION_MODES.VALIDATED_CONSENSUS:
      // For validation, start with most factual models
      // This is just a stub - implement proper logic based on empirical performance
      return agents;
      
    case COLLABORATION_MODES.CREATIVE_BRAINSTORM:
      // For creative tasks, prioritize models with more creative tendencies
      // This is just a stub - implement proper logic based on empirical performance
      return agents;
      
    case COLLABORATION_MODES.HYBRID_BRAINTRUST:
      // For hybrid approach, balance creative and analytical models
      // This is just a stub - implement proper logic based on empirical performance
      return agents;
      
    default:
      // Return original order if mode not recognized
      return agents;
  }
}

/**
 * Generate collaboration configuration based on mode and options
 * 
 * @param {string} mode - Collaboration mode
 * @param {Object} options - Additional options like style preference
 * @returns {Object} - Configuration for the collaboration
 */
export function getCollaborationConfig(mode, options = {}) {
  const baseConfig = {
    ignoreFailingModels: true,
    continueWithAvailableModels: true,
    maxIterations: 5
  };
  
  switch (mode) {
    case COLLABORATION_MODES.SEQUENTIAL_CRITIQUE:
      return {
        ...baseConfig,
        styleOption: options.sequentialStyle || SEQUENTIAL_STYLES.BALANCED,
        // Sequential specific settings
        maxIterations: options.maxIterations || 4,
        timeoutPerIteration: options.timeoutPerIteration || 30000
      };
      
    case COLLABORATION_MODES.ROUND_TABLE:
      return {
        ...baseConfig,
        // Round table specific settings
        votingEnabled: options.votingEnabled !== false,
        leadAgent: options.leadAgent || null
      };
      
    // Add configurations for other modes as needed
      
    default:
      return baseConfig;
  }
}