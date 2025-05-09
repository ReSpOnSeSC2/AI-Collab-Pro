/**
 * Prompt Security Guard
 * Protects against prompt injection attacks and sanitizes user inputs
 * Version: 9.0.0
 */

// Define known patterns for prompt injection attacks
var INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /ignore prior instructions/i,
  /disregard (previous|prior|your|all) instructions/i,
  /forget (previous|prior|your|all) instructions/i,
  /system prompt/i,
  /you are now/i,
  /as an AI language model/i,
  /you are a/i,
  /from now on you/i,
  /create a security vulnerability/i,
  /bypass [a-z]+ protection/i
];

// Define patterns for potential sensitive information
var SENSITIVE_PATTERNS = [
  /api[_\s-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /credential/i,
  /authorization/i,
  /private/i,
  /[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/i, // UUID pattern
  /[a-z0-9]{32,}/i // Long alphanumeric strings that might be keys/tokens
];

/**
 * Main security guard object with sanitization methods
 */
export const securityGuard = {
  /**
   * Sanitizes a user prompt to prevent injection attacks
   * @param {string} prompt - The user's prompt
   * @returns {string} - Sanitized prompt
   */
  sanitizePrompt: function(prompt) {
    if (typeof prompt !== 'string') {
      return '';
    }
    
    // Replace potential injection patterns with warning markers
    var sanitized = prompt;
    
    INJECTION_PATTERNS.forEach(function(pattern) {
      sanitized = sanitized.replace(pattern, '[REDACTED: PROMPT SAFETY]');
    });
    
    // Redact potentially sensitive information
    SENSITIVE_PATTERNS.forEach(function(pattern) {
      sanitized = sanitized.replace(pattern, function(match) {
        // Keep the identifier but replace the actual value
        // e.g., "api_key=123456" becomes "api_key=[REDACTED]"
        var parts = match.split(/[=:]/);
        if (parts.length > 1) {
          return parts[0] + '=[REDACTED]';
        }
        return '[REDACTED: SENSITIVE DATA]';
      });
    });
    
    // Normalize whitespace to prevent obfuscation techniques
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  },
  
  /**
   * Constructs a safely formatted prompt with clear boundaries between system and user content
   * @param {string} systemInstruction - System instructions
   * @param {string} userContent - User provided content
   * @returns {string} - Safely formatted prompt
   */
  constructSafePrompt: function(systemInstruction, userContent) {
    // Ensure both inputs are strings
    systemInstruction = systemInstruction || '';
    userContent = this.sanitizePrompt(userContent || '');
    
    // Create a clear boundary with special characters that are unlikely to be in normal text
    return `${systemInstruction}\n\n###USER INPUT BEGIN###\n${userContent}\n###USER INPUT END###`;
  },
  
  /**
   * Checks if content violates content policy
   * @param {string} content - Content to check
   * @returns {Object} - Result with isViolation and reason if applicable
   */
  checkContentPolicy: function(content) {
    if (typeof content !== 'string') {
      return { isViolation: false };
    }
    
    // Check for explicit violation patterns
    var violationPatterns = [
      { pattern: /hack into/i, reason: 'Contains instructions for unauthorized access' },
      { pattern: /exploit vulnerability/i, reason: 'Contains potential security exploit instructions' },
      { pattern: /create malware/i, reason: 'Contains instructions for creating malicious software' }
    ];
    
    for (var i = 0; i < violationPatterns.length; i++) {
      var violation = violationPatterns[i];
      if (violation.pattern.test(content)) {
        return {
          isViolation: true,
          reason: violation.reason
        };
      }
    }
    
    return { isViolation: false };
  },
  
  /**
   * Validates that a generated response doesn't contain concerning patterns
   * @param {string} response - Generated AI response
   * @returns {Object} - Validation result with isValid and reason if invalid
   */
  validateResponse: function(response) {
    if (typeof response !== 'string') {
      return {
        isValid: false,
        reason: 'Response is not a string'
      };
    }
    
    // Check for responses suggesting the model is trying to escape its boundaries
    var escapeBoundaryPatterns = [
      /I cannot fulfill this request/i,
      /I'm unable to assist with that/i,
      /against my ethical guidelines/i,
      /I apologize, but I cannot/i
    ];
    
    for (var i = 0; i < escapeBoundaryPatterns.length; i++) {
      var pattern = escapeBoundaryPatterns[i];
      if (pattern.test(response)) {
        // This isn't necessarily a problem - the model might be correctly
        // refusing to do something harmful
        return {
          isValid: true,
          hasRefusal: true,
          refusalReason: 'Model indicated it cannot fulfill the request'
        };
      }
    }
    
    return { isValid: true };
  }
};

export default securityGuard;