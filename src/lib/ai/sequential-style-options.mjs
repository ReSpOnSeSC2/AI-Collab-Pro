/**
 * Style options for the Sequential Critique Chain
 * These modifiers direct how each AI agent should approach their contribution
 */

// Constants for style options
export const SEQUENTIAL_STYLES = {
  BALANCED: 'balanced',
  CONTRASTING: 'contrasting',
  HARMONIOUS: 'harmonious'
};

export const sequentialStyleOptions = {
  // Balanced: Combines multiple perspectives in a neutral way
  balanced: {
    initialPrompt: `Generate an initial answer to the given prompt. Aim for a balanced and comprehensive response that represents the mainstream view. Focus on factual information while acknowledging where reasonable experts might hold different opinions. Your goal is to provide a foundation that presents information in a neutral, unbiased way.`,

    critiquingPrompt: `Review the previous agent's response and build upon it by adding depth, nuance, or additional examples as needed. Maintain the balanced approach, neither strongly challenging nor simply echoing the existing content. Fill gaps in the explanation while preserving the overall direction. Your goal is to improve clarity, comprehensiveness, and accuracy while maintaining neutrality.`,

    finalSynthesisPrompt: `As the final agent in this chain, refine the accumulated response into a polished, well-structured answer. Ensure all key points are properly developed and the information flows logically. Maintain a balanced perspective throughout, neither overly cautious nor excessively opinionated. Your goal is to deliver a comprehensive, accurate response that represents the most widely accepted understanding of the topic while acknowledging legitimate areas of debate.`
  },

  // Contrasting: Emphasizes different perspectives and productive disagreement
  contrasting: {
    initialPrompt: `Generate an initial answer to the given prompt. While being factual and informative, highlight aspects where reasonable experts might disagree. Consider multiple perspectives and identify areas of potential controversy. Your goal is to provide a balanced but nuanced starting point that acknowledges competing viewpoints.`,
    
    critiquingPrompt: `Review the previous agent's response and enhance it by intentionally taking a somewhat different perspective. Respectfully challenge assumptions, add alternative viewpoints, or present contrasting evidence where appropriate. Your goal is not to contradict but to enrich the answer with productive tension and intellectual diversity. Maintain a collegial tone while ensuring the response reflects a broader spectrum of thought.`,
    
    finalSynthesisPrompt: `As the final agent in this chain, synthesize the various perspectives provided by previous agents into a coherent, balanced answer. Don't eliminate the productive tensions or contrasting viewpoints - instead, integrate them into a sophisticated response that acknowledges areas of consensus and reasonable disagreement. Present multiple valid perspectives where appropriate, and explain the tradeoffs or considerations for each. Your goal is to deliver a nuanced, intellectually honest answer that respects diverse viewpoints.`
  },
  
  // Harmonious: Focuses on consensus and unified voice
  harmonious: {
    initialPrompt: `Generate an initial answer to the given prompt. Focus on widely accepted facts and perspectives that have broad consensus. Provide a clear, straightforward foundation that subsequent agents can build upon. Emphasize clarity and accessibility in your explanation.`,
    
    critiquingPrompt: `Review the previous agent's response and build upon it in a complementary way. Focus on filling gaps, enhancing clarity, or adding supporting evidence rather than introducing contrary perspectives. Your goal is to strengthen and extend the existing answer, maintaining a consistent voice and message. Add depth without changing direction.`,
    
    finalSynthesisPrompt: `As the final agent in this chain, polish and refine the cumulative response into a seamless, unified answer. Smooth transitions between ideas, ensure consistent terminology and tone, and create a coherent narrative that feels like it comes from a single authoritative voice. Your goal is to deliver a harmonious, definitive answer that presents a clear consensus view while preserving the depth and richness contributed by all agents in the chain.`
  }
};

/**
 * Apply style option to the appropriate prompt in the sequence
 * @param {string} basePrompt - The original user prompt
 * @param {string} position - Where in the sequence this agent is (initial, middle, final)
 * @param {string} styleOption - Which style to apply (balancedContrasting or harmonious)
 * @returns {string} - Modified instruction prompt
 */
export function applySequentialStyle(basePrompt, position, styleOption = 'balanced') {
  // Validate inputs
  if (!sequentialStyleOptions[styleOption]) {
    console.warn(`Unknown style option: ${styleOption}, defaulting to balanced`);
    styleOption = 'balanced';
  }
  
  const styleModifiers = sequentialStyleOptions[styleOption];
  
  // Determine which prompt modifier to use based on position
  let modifier;
  if (position === 'initial') {
    modifier = styleModifiers.initialPrompt;
  } else if (position === 'final') {
    modifier = styleModifiers.finalSynthesisPrompt;
  } else {
    modifier = styleModifiers.critiquingPrompt;
  }
  
  return modifier;
}

/**
 * Helper function to determine agent position in the sequence
 * @param {number} index - Agent's index in the sequence
 * @param {number} totalAgents - Total number of agents in the chain
 * @returns {string} - Position label (initial, middle, final)
 */
export function getAgentPosition(index, totalAgents) {
  if (index === 0) return 'initial';
  if (index === totalAgents - 1) return 'final';
  return 'middle';
}