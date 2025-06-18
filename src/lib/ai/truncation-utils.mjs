/**
 * Utility functions for smart AI content truncation
 * to prevent context length issues in collaborations.
 */

/**
 * Log content metrics for debugging and analysis
 * @param {string} phaseId - Identifier for the phase
 * @param {object} metrics - Metrics object with content sizes
 */
export function logContentMetrics(phaseId, metrics) {
  console.log(`📊 Content metrics for ${phaseId}:`, JSON.stringify(metrics));
}

/**
 * Truncate entire phase content (used by parallel-collaboration.mjs)
 * @param {string} content - The content to truncate
 * @param {string} type - The type of content (DRAFT, VOTE, etc.)
 * @param {number} maxLength - Optional maximum length
 * @returns {string} - Truncated content
 */
export function truncatePhaseContent(content, type, maxLength = 50000) {
  if (!content || content.length <= maxLength) return content;

  // Use content-aware truncation
  return smartTruncateByContent(content, maxLength, type);
}

/**
 * Truncate an array of content responses
 * @param {Array} responses - Array of response objects
 * @param {number} maxTotalLength - Maximum total length
 * @returns {Array} - Truncated responses
 */
export function truncateResponseArray(responses, maxTotalLength = 80000) {
  // Make a safe copy of the responses without using JSON serialization
  // JSON.stringify loses functions, which breaks Google AI response objects
  const responsesCopy = responses.map(resp => {
    if (resp && typeof resp === 'object') {
      // Create a shallow copy while preserving methods and functions
      return { ...resp };
    }
    return resp;
  });

  const totalLength = responsesCopy.reduce((sum, resp) => sum + (resp.content?.length || 0), 0);
  if (totalLength <= maxTotalLength) return responsesCopy;

  console.log(`⚠️ Responses exceed size limit (${totalLength} > ${maxTotalLength}), truncating...`);

  const ratio = maxTotalLength / totalLength;
  return responsesCopy.map(resp => {
    if (!resp.content) return resp;
    const maxItemLength = Math.floor(resp.content.length * ratio);
    return {
      ...resp,
      content: smartTruncateByContent(resp.content, maxItemLength, resp.type || 'unknown'),
      truncated: true
    };
  });
}

/**
 * Content-aware smart truncation that analyzes content type
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @param {string} contentType - Type of content for specialized handling
 * @returns {string} - Truncated text with indicator
 */
export function smartTruncateByContent(text, maxLength, contentType = 'text') {
  if (!text || text.length <= maxLength) return text;

  // Detect content type if not specified
  if (contentType === 'unknown') {
    // Check for code blocks
    if ((text.match(/```/g) || []).length >= 2 ||
        (text.match(/function\s+\w+\s*\(/g) || []).length > 0 ||
        (text.match(/class\s+\w+/g) || []).length > 0) {
      contentType = 'code';
    }
    // Check for Q&A format
    else if (text.includes('?\n') || text.match(/Q:.*?A:/s)) {
      contentType = 'qa';
    }
  }

  // Apply different truncation strategies based on content type
  switch (contentType) {
    case 'code':
      return truncateCode(text, maxLength);
    case 'DRAFT':
    case 'draft':
      return truncateDraftContent(text, maxLength);
    case 'VOTE':
    case 'vote':
      return truncateVoteContent(text, maxLength);
    case 'qa':
      return truncateQAContent(text, maxLength);
    default:
      return basicTruncate(text, maxLength);
  }
}

/**
 * Smart truncation that preserves both the beginning and end of text
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @param {number} beginRatio - Ratio of text to keep at beginning (0-1)
 * @returns {string} - Truncated text with indicator
 */
export function smartTruncate(text, maxLength, beginRatio = 0.3) {
  return basicTruncate(text, maxLength, beginRatio);
}

/**
 * Basic truncation that preserves beginning and end portions
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @param {number} beginRatio - Ratio of text to keep at beginning (0-1)
 * @returns {string} - Truncated text with indicator
 */
function basicTruncate(text, maxLength, beginRatio = 0.3) {
  if (!text || text.length <= maxLength) return text;

  const beginLength = Math.floor(maxLength * beginRatio);
  const endLength = maxLength - beginLength - 40; // 40 chars for truncation indicator

  const beginText = text.substring(0, beginLength);
  const endText = text.substring(text.length - endLength);

  return `${beginText}\n\n[...content truncated (${text.length - maxLength} characters)...]\n\n${endText}`;
}

/**
 * Code-aware truncation that preserves important code structures
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Truncated text prioritizing code blocks
 */
function truncateCode(text, maxLength) {
  if (!text || text.length <= maxLength) return text;

  // Find code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = [];
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push({
      content: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // If no code blocks with markdown, look for function/class definitions
  if (codeBlocks.length === 0) {
    const functionRegex = /(function|class|const|let|var|export|import|async)[\s\S]*?(?:\{[\s\S]*?\}|;)/g;
    while ((match = functionRegex.exec(text)) !== null) {
      codeBlocks.push({
        content: match[0],
        start: match.index,
        end: match.index + match[0].length,
        isPriority: true
      });
    }
  }

  // If we have code blocks, preserve them and trim surrounding text
  if (codeBlocks.length > 0) {
    // Sort code blocks by priority first, then by position
    codeBlocks.sort((a, b) => {
      if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
      return a.start - b.start;
    });

    // Calculate how much space we can allocate to each block and surrounding text
    const totalCodeLength = codeBlocks.reduce((sum, block) => sum + block.content.length, 0);
    const remainingLength = maxLength - totalCodeLength;

    // If code blocks alone exceed max length, we need to select which ones to keep
    if (totalCodeLength > maxLength * 0.8) {
      // Prioritize keeping full code blocks rather than partial ones
      const keepBlocks = [];
      let currentLength = 0;

      for (const block of codeBlocks) {
        if (currentLength + block.content.length <= maxLength * 0.8) {
          keepBlocks.push(block);
          currentLength += block.content.length;
        } else if (keepBlocks.length === 0) {
          // If we have no blocks yet, take at least one and truncate it
          keepBlocks.push(block);
          break;
        }
      }

      // Construct result with just the essential code blocks
      if (keepBlocks.length === 0) {
        // Fallback to basic truncation if we couldn't keep any full blocks
        return basicTruncate(text, maxLength);
      }

      const intro = text.substring(0, Math.min(500, keepBlocks[0].start));
      const blockContents = keepBlocks.map(block => block.content).join('\n\n[...non-code content omitted...]\n\n');
      const outro = text.substring(
        keepBlocks[keepBlocks.length - 1].end,
        keepBlocks[keepBlocks.length - 1].end + Math.min(300, text.length - keepBlocks[keepBlocks.length - 1].end)
      );

      const truncatedContent = `${intro}\n\n${blockContents}\n\n${outro}`;

      if (truncatedContent.length > maxLength) {
        return basicTruncate(truncatedContent, maxLength, 0.6); // Favor beginning which has code
      }
      return truncatedContent;
    }

    // Otherwise, keep all code blocks and distribute remaining space to text between them
    let result = '';
    let lastEnd = 0;
    const textSegments = [];

    // Create segments of text between code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      const block = codeBlocks[i];
      textSegments.push({
        content: text.substring(lastEnd, block.start),
        isCode: false
      });
      textSegments.push({
        content: block.content,
        isCode: true
      });
      lastEnd = block.end;
    }

    // Add final text segment after last code block
    if (lastEnd < text.length) {
      textSegments.push({
        content: text.substring(lastEnd),
        isCode: false
      });
    }

    // Calculate how much to truncate each non-code segment
    const nonCodeSegments = textSegments.filter(seg => !seg.isCode);
    const totalNonCodeLength = nonCodeSegments.reduce((sum, seg) => sum + seg.content.length, 0);
    const truncationRatio = Math.max(0.1, remainingLength / totalNonCodeLength);

    // Build result with truncated text segments and full code blocks
    for (const segment of textSegments) {
      if (segment.isCode) {
        result += segment.content + '\n\n';
      } else if (segment.content.trim()) {
        const maxSegmentLength = Math.floor(segment.content.length * truncationRatio);
        if (segment.content.length > maxSegmentLength && maxSegmentLength > 50) {
          const truncatedSegment = basicTruncate(segment.content, maxSegmentLength, 0.5);
          result += truncatedSegment + '\n\n';
        } else {
          result += segment.content + '\n\n';
        }
      }
    }

    // Final check to ensure we're within limits
    if (result.length > maxLength) {
      return basicTruncate(result, maxLength, 0.6); // Prioritize keeping beginning with imports/setup
    }

    return result.trim();
  }

  // Default to basic truncation if no code blocks found
  return basicTruncate(text, maxLength);
}

/**
 * Truncates a draft response with awareness of structure
 * @param {string} text - The draft text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Truncated draft preserving key sections
 */
function truncateDraftContent(text, maxLength) {
  if (!text || text.length <= maxLength) return text;

  // Check if this contains code
  if ((text.match(/```/g) || []).length >= 2 ||
      (text.match(/function\s+\w+\s*\(/g) || []).length > 0 ||
      (text.match(/class\s+\w+/g) || []).length > 0) {
    return truncateCode(text, maxLength);
  }

  // If it's a structured document with headings, preserve the structure
  const headingMatches = text.match(/#{1,3}\s+.+/g) || [];
  if (headingMatches.length >= 2) {
    // This is a structured document with headings
    const headingIndices = [];
    const headingRegex = /#{1,3}\s+.+/g;
    let match;

    while ((match = headingRegex.exec(text)) !== null) {
      headingIndices.push({
        heading: match[0],
        index: match.index
      });
    }

    // Calculate how much content to keep under each heading
    const sectionsCount = headingIndices.length;
    const contentPerSection = Math.floor(maxLength / sectionsCount) - 200; // Reserve space for indicators

    let result = text.substring(0, headingIndices[0].index); // Keep introduction before first heading

    for (let i = 0; i < headingIndices.length; i++) {
      const currentHeading = headingIndices[i];
      const nextHeading = headingIndices[i + 1];
      const sectionEnd = nextHeading ? nextHeading.index : text.length;
      const sectionContent = text.substring(currentHeading.index, sectionEnd);

      if (sectionContent.length > contentPerSection) {
        // Truncate this section
        const truncatedSection = basicTruncate(sectionContent, contentPerSection);
        result += truncatedSection;
      } else {
        result += sectionContent;
      }
    }

    return result;
  }

  // If it's a list-heavy document, preserve the list structure
  const listItemCount = (text.match(/^[\s]*[-*]\s+/gm) || []).length;
  if (listItemCount > 5) {
    // This is a list-heavy document
    const paragraphs = text.split('\n\n');
    const intro = paragraphs.slice(0, 2).join('\n\n');
    const listParagraphIndices = [];

    // Find paragraphs containing lists
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].match(/^[\s]*[-*]\s+/m)) {
        listParagraphIndices.push(i);
      }
    }

    // Keep introduction and sample of list items
    let result = intro + '\n\n';
    const listItemsToKeep = Math.min(10, listParagraphIndices.length);

    for (let i = 0; i < listItemsToKeep; i++) {
      const index = listParagraphIndices[i];
      result += paragraphs[index] + '\n\n';
    }

    if (listParagraphIndices.length > listItemsToKeep) {
      result += `[...${listParagraphIndices.length - listItemsToKeep} more list items omitted...]\n\n`;
    }

    // Add conclusion if present
    if (paragraphs.length > 0) {
      result += paragraphs[paragraphs.length - 1];
    }

    if (result.length > maxLength) {
      return basicTruncate(result, maxLength);
    }

    return result;
  }

  // Default to standard truncation for other types of content
  return basicTruncate(text, maxLength);
}

/**
 * Truncates voting content, preserving the vote itself and key reasoning
 * @param {string} text - The vote text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Truncated vote preserving decision
 */
function truncateVoteContent(text, maxLength) {
  if (!text || text.length <= maxLength) return text;

  // Extract the vote decision from the first line or first sentence
  const firstLine = text.split('\n')[0];
  const firstSentence = text.split('.')[0] + '.';

  // Use whichever is longer as the vote decision
  const voteDecision = firstLine.length > firstSentence.length ? firstLine : firstSentence;

  // Look for reasoning sections
  const reasoningMatch = text.match(/reason(s|ing)?[:].+/i);
  let reasoning = '';

  if (reasoningMatch) {
    // Extract a portion of the reasoning
    const reasoningStart = text.indexOf(reasoningMatch[0]);
    reasoning = text.substring(reasoningStart, reasoningStart + Math.min(maxLength - voteDecision.length - 100, 1000));
  } else {
    // If no explicit reasoning section, take some content after the vote
    reasoning = text.substring(voteDecision.length, voteDecision.length + Math.min(maxLength - voteDecision.length - 100, 1000));
  }

  // Construct the result with vote decision and truncated reasoning
  let result = voteDecision + '\n\n';

  if (reasoning) {
    if (reasoning.length < text.length - voteDecision.length) {
      result += reasoning + '\n\n[...additional reasoning truncated...]';
    } else {
      result += reasoning;
    }
  }

  return result;
}

/**
 * Truncates Q&A content, preserving questions and direct answers
 * @param {string} text - The Q&A text to truncate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Truncated Q&A preserving key answers
 */
function truncateQAContent(text, maxLength) {
  if (!text || text.length <= maxLength) return text;

  // Try to identify Q&A pattern
  const qaMatches = text.match(/Q[.:]\s*.*?\n+A[.:]\s*.*?(?=\n+Q[.:]\s*|$)/gs);

  if (qaMatches && qaMatches.length > 0) {
    // We have identified Q&A pairs
    const pairs = qaMatches.map(qa => {
      const parts = qa.split(/\n+A[.:]\s*/);
      return {
        question: parts[0].replace(/^Q[.:]\s*/, ''),
        answer: parts[1] || ''
      };
    });

    // Calculate how much to keep
    const totalLength = pairs.reduce((sum, pair) => sum + pair.question.length + pair.answer.length + 10, 0);
    const keepRatio = Math.min(1, maxLength / totalLength);

    // If we need to truncate, preserve all questions but truncate answers
    if (keepRatio < 1) {
      let result = '';
      let currentLength = 0;

      for (const pair of pairs) {
        const questionText = `Q: ${pair.question}\n\n`;
        let answerText = '';

        // Calculate max answer length based on remaining space
        const maxAnswerLength = Math.floor((maxLength - currentLength - questionText.length) * 0.8 / (pairs.length - pairs.indexOf(pair)));

        if (pair.answer.length > maxAnswerLength && maxAnswerLength > 20) {
          answerText = `A: ${basicTruncate(pair.answer, maxAnswerLength)}\n\n`;
        } else {
          answerText = `A: ${pair.answer}\n\n`;
        }

        result += questionText + answerText;
        currentLength += questionText.length + answerText.length;

        // Check if we've exceeded the limit
        if (currentLength >= maxLength * 0.95) {
          result += `[...${pairs.length - pairs.indexOf(pair) - 1} more Q&A pairs omitted...]`;
          break;
        }
      }

      return result;
    }

    // If we don't need to truncate, just reassemble
    return pairs.map(pair => `Q: ${pair.question}\n\nA: ${pair.answer}`).join('\n\n');
  }

  // Default to standard truncation if no Q&A pattern found
  return basicTruncate(text, maxLength);
}

/**
 * Truncates an AI-generated draft to fit within token limits
 * @param {string} draft - The draft text to truncate
 * @param {string} provider - AI provider name for provider-specific limits
 * @returns {string} - Truncated draft
 */
export function truncateDraft(draft, provider) {
  // Provider-specific character limits (approximate)
  const limits = {
    'claude': 100000,  // Claude has a large context
    'gemini': 80000,   // Gemini has large context
    'chatgpt': 60000,  // GPT-4 with standard context
    'grok': 40000,     // Conservative estimate
    'deepseek': 50000, // Conservative estimate
    'llama': 30000,    // More restrictive for Llama
    'default': 25000   // Default conservative limit
  };
  
  const limit = limits[provider] || limits.default;
  return smartTruncate(draft, limit);
}

/**
 * Truncates a collection of drafts to be used in voting or synthesis phases
 * @param {Array} drafts - Array of draft objects
 * @param {number} maxTotalChars - Maximum total characters allowed
 * @returns {Array} - Array of truncated drafts
 */
export function truncateDraftsCollection(drafts, maxTotalChars = 80000) {
  // Calculate total size of all drafts
  const totalChars = drafts.reduce((sum, draft) => sum + (draft.content?.length || 0), 0);
  
  // If we're under the limit, return as is
  if (totalChars <= maxTotalChars) return drafts;
  
  console.log(`⚠️ Drafts exceed size limit (${totalChars} > ${maxTotalChars}), truncating...`);
  
  // Calculate how much we need to truncate each draft proportionally
  const truncationRatio = maxTotalChars / totalChars;
  
  // Create new array with truncated drafts
  return drafts.map(draft => {
    if (!draft.content) return draft;
    
    const maxDraftLength = Math.floor(draft.content.length * truncationRatio);
    const truncatedContent = smartTruncate(draft.content, maxDraftLength);
    
    return {
      ...draft,
      content: truncatedContent,
      truncated: true,
      originalLength: draft.content.length
    };
  });
}

/**
 * Get max safe context size for a given provider
 * @param {string} provider - AI provider name
 * @returns {number} - Safe context size in characters
 */
export function getMaxContextSize(provider) {
  // Provider-specific character limits (approximate)
  const contextSizes = {
    'claude': 200000,  // Claude-3 Opus
    'gemini': 180000,  // Gemini Ultra
    'chatgpt': 120000, // GPT-4
    'grok': 80000,     // Estimated
    'deepseek': 100000, // Estimated
    'llama': 60000,    // Estimated
    'default': 50000   // Default conservative limit
  };

  return contextSizes[provider] || contextSizes.default;
}

/**
 * Truncate model responses based on provider-specific safe limits
 * @param {string} text - The text to truncate
 * @param {string} provider - AI provider name
 * @param {string} phase - Collaboration phase
 * @returns {string} - Truncated text if needed
 */
export function truncateModelResponse(text, provider, phase = 'default') {
  // Define safe limits for each provider and phase
  const MAX_RESPONSE_SIZES = {
    'default': {
      'default': 25000,
      'draft': 25000,
      'critique': 15000,
      'vote': 5000,
      'synthesis': 40000
    },
    'claude': {
      'default': 50000,
      'draft': 50000,
      'critique': 30000,
      'vote': 8000,
      'synthesis': 80000
    },
    'gemini': {
      'default': 40000,
      'draft': 40000,
      'critique': 25000,
      'vote': 7000,
      'synthesis': 60000
    },
    'chatgpt': {
      'default': 35000,
      'draft': 35000,
      'critique': 20000,
      'vote': 6000,
      'synthesis': 50000
    },
    'grok': {
      'default': 25000,
      'draft': 25000,
      'critique': 15000,
      'vote': 5000,
      'synthesis': 40000
    },
    'deepseek': {
      'default': 30000,
      'draft': 30000,
      'critique': 18000,
      'vote': 5000,
      'synthesis': 45000
    },
    'llama': {
      'default': 20000,
      'draft': 20000,
      'critique': 12000,
      'vote': 4000,
      'synthesis': 35000
    }
  };

  // Get the appropriate size limit
  const providerLimits = MAX_RESPONSE_SIZES[provider] || MAX_RESPONSE_SIZES['default'];
  const maxSize = providerLimits[phase] || providerLimits['default'];

  // Apply truncation if needed
  if (text && text.length > maxSize) {
    return smartTruncate(text, maxSize);
  }

  return text;
}