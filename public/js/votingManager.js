/**
 * Voting Manager
 * Handles voting UI and interactions for AI responses
 * Version: 1.0.0
 */

// Question type categories for classification
const QUESTION_TYPES = [
  // STEM Fields
  'algebra',
  'geometry',
  'calculus',
  'statistics',
  'probability',
  'physics',
  'chemistry',
  'biology',
  'astronomy',
  'earth_science',
  'computer_science',
  'programming',
  'algorithms',
  'data_structures',
  'web_development',
  'mobile_development',
  'devops',
  'cybersecurity',
  'ai_and_ml',
  'deep_learning',
  'natural_language_processing',
  'computer_vision',
  'robotics',
  'data_science',
  'data_analysis',
  'big_data',
  'blockchain',
  'cryptocurrency',
  'quantum_computing',
  'engineering',
  'electrical_engineering',
  'mechanical_engineering',
  'civil_engineering',
  'biotechnology',
  'genetics',
  
  // Social Sciences
  'psychology',
  'sociology',
  'anthropology',
  'economics',
  'political_science',
  'international_relations',
  'history',
  'archaeology',
  'geography',
  'urban_planning',
  'demography',
  'linguistics',
  
  // Humanities
  'philosophy',
  'ethics',
  'logic',
  'literature',
  'creative_writing',
  'poetry',
  'drama',
  'religion',
  'theology',
  'classical_studies',
  'art_history',
  'visual_arts',
  'music',
  'music_theory',
  'film_studies',
  'media_studies',
  
  // Business & Finance
  'marketing',
  'advertising',
  'sales',
  'entrepreneurship',
  'management',
  'human_resources',
  'finance',
  'accounting',
  'investment',
  'real_estate',
  'banking',
  'insurance',
  'taxation',
  'e-commerce',
  
  // Health & Medicine
  'medicine',
  'anatomy',
  'physiology',
  'pharmacology',
  'nutrition',
  'fitness',
  'mental_health',
  'public_health',
  'epidemiology',
  'nursing',
  'dentistry',
  
  // Law & Politics
  'law',
  'constitutional_law',
  'criminal_law',
  'civil_law',
  'international_law',
  'politics',
  'government',
  'public_policy',
  'public_administration',
  
  // Other Categories
  'education',
  'pedagogy',
  'language_learning',
  'cooking',
  'culinary_arts',
  'gardening',
  'home_improvement',
  'travel',
  'tourism',
  'sports',
  'gaming',
  'game_design',
  'entertainment',
  'fashion',
  'lifestyle',
  'environment',
  'sustainability',
  'parenting',
  'relationships',
  'other'
];

// Cache for question eligibility (to avoid multiple API calls for the same question)
const votingEligibilityCache = new Map();

// --- State ---
let currentVotingMessageId = null;
let currentVotingMessage = null;
let currentVotingProvider = null;
let socketConnection = null;

/**
 * Initialize voting manager
 * @param {WebSocket} socket - WebSocket connection 
 */
export function initializeVotingManager(socket) {
  socketConnection = socket;
  
  // Listen for WebSocket messages related to voting
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle vote-related messages
      if (data.type === 'vote_recorded') {
        console.log('Vote recorded successfully:', data);
        showVoteSuccessMessage(data.messageId);
      } else if (data.type === 'vote_error') {
        console.error('Error recording vote:', data);
        showVoteErrorMessage(data.error, data.messageId);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  console.log('Voting Manager initialized');
}

/**
 * Check if voting should be enabled for a question
 * Uses the API to determine if this question should have voting (2% of questions)
 * @param {string} question - The user's question 
 * @returns {Promise<boolean>} - Whether voting should be enabled
 */
export async function shouldEnableVotingForQuestion(question) {
  // Generate a question ID (simple hash)
  const questionId = generateQuestionId(question);
  
  // Check cache first
  if (votingEligibilityCache.has(questionId)) {
    return votingEligibilityCache.get(questionId);
  }
  
  try {
    const response = await fetch(`/api/votes/should-enable?questionId=${encodeURIComponent(questionId)}`);
    const data = await response.json();
    
    if (data.success) {
      // Cache the result
      votingEligibilityCache.set(questionId, data.shouldEnable);
      return data.shouldEnable;
    }
    
    return false; // Default to not showing voting UI if API call fails
  } catch (error) {
    console.error('Error checking vote eligibility:', error);
    return false;
  }
}

/**
 * Add voting UI to a message container
 * @param {HTMLElement} messageContainer - The message container element
 * @param {string} provider - The AI provider (claude, gemini, etc.)
 * @param {string} question - The original user question 
 * @param {string} mode - The collaboration mode (individual/collaborative)
 * @param {string} collaborationStyle - The collaboration style (if applicable)
 * @param {number} messageIndex - Index of the message in the conversation 
 */
export function addVotingUIToMessage(messageContainer, provider, question, mode, collaborationStyle, messageIndex) {
  // Create voting container
  const votingContainer = document.createElement('div');
  votingContainer.className = 'voting-container mt-3 p-3 border-top';
  
  // Determine voting title based on mode
  const votingTitle = mode === 'individual' 
    ? 'How would you rate this response?'
    : 'How helpful was this collaborative response?';
  
  // Create voting UI based on mode
  if (mode === 'individual') {
    // For individual mode: Best to worst ranking (when multiple models are used)
    votingContainer.innerHTML = `
      <div class="voting-header mb-2">
        <p class="mb-1 fw-bold">${votingTitle}</p>
        <p class="text-muted small mb-2">Please rank from best (1) to worst (${getActiveModelCount()})</p>
      </div>
      <div class="ranking-container d-flex flex-wrap gap-2 mb-3" id="voting-ranking-${provider}-${messageIndex}">
        <!-- Ranking options added dynamically -->
      </div>
      <div class="question-type-container mb-3">
        <label for="question-type-${provider}-${messageIndex}" class="form-label small">What type of question is this?</label>
        <select class="form-select form-select-sm" id="question-type-${provider}-${messageIndex}">
          ${QUESTION_TYPES.map(type => 
            `<option value="${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="feedback-container">
        <label for="feedback-${provider}-${messageIndex}" class="form-label small">Additional feedback (optional)</label>
        <textarea class="form-control form-control-sm" id="feedback-${provider}-${messageIndex}" 
          rows="2" placeholder="What did you like or dislike about this response?"></textarea>
      </div>
      <div class="d-flex justify-content-end mt-2">
        <button class="btn btn-sm btn-primary submit-vote-btn" 
          data-provider="${provider}" 
          data-message-index="${messageIndex}"
          data-mode="${mode}">
          Submit Feedback
        </button>
      </div>
      <div class="vote-status mt-2 text-center" id="vote-status-${provider}-${messageIndex}"></div>
    `;
    
    // Add ranking options once the element is in the DOM
    setTimeout(() => {
      const rankingContainer = votingContainer.querySelector(`#voting-ranking-${provider}-${messageIndex}`);
      if (rankingContainer) {
        const activeModels = getActiveModels();
        activeModels.forEach((model, index) => {
          const rankButton = document.createElement('button');
          rankButton.className = 'btn btn-outline-secondary rank-btn';
          rankButton.setAttribute('data-model', model);
          rankButton.setAttribute('data-rank', '');
          rankButton.innerHTML = `
            <span class="model-name">${model.charAt(0).toUpperCase() + model.slice(1)}</span>
            <span class="rank-value"></span>
          `;
          rankingContainer.appendChild(rankButton);
          
          // Add click handler
          rankButton.addEventListener('click', () => {
            handleRankSelection(rankButton, activeModels.length, rankingContainer);
          });
        });
      }
    }, 0);
  } else {
    // For collaborative mode: Simple 1-10 rating
    votingContainer.innerHTML = `
      <div class="voting-header mb-2">
        <p class="mb-1 fw-bold">${votingTitle}</p>
        <p class="text-muted small mb-2">1 = Perfect, 10 = Needs improvement</p>
      </div>
      <div class="rating-container d-flex justify-content-between mb-3">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rating => `
          <button class="btn btn-outline-secondary rating-btn" 
            data-rating="${rating}">
            ${rating}
          </button>
        `).join('')}
      </div>
      <div class="question-type-container mb-3">
        <label for="question-type-${provider}-${messageIndex}" class="form-label small">What type of question is this?</label>
        <select class="form-select form-select-sm" id="question-type-${provider}-${messageIndex}">
          ${QUESTION_TYPES.map(type => 
            `<option value="${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="feedback-container">
        <label for="feedback-${provider}-${messageIndex}" class="form-label small">Additional feedback (optional)</label>
        <textarea class="form-control form-control-sm" id="feedback-${provider}-${messageIndex}" 
          rows="2" placeholder="What did you like or dislike about this response?"></textarea>
      </div>
      <div class="d-flex justify-content-end mt-2">
        <button class="btn btn-sm btn-primary submit-vote-btn" 
          data-provider="${provider}" 
          data-message-index="${messageIndex}"
          data-mode="${mode}"
          data-collaboration-style="${collaborationStyle || ''}">
          Submit Feedback
        </button>
      </div>
      <div class="vote-status mt-2 text-center" id="vote-status-${provider}-${messageIndex}"></div>
    `;
    
    // Add click handlers for rating buttons
    setTimeout(() => {
      const ratingButtons = votingContainer.querySelectorAll('.rating-btn');
      ratingButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          // Remove active class from all buttons
          ratingButtons.forEach(b => b.classList.remove('active'));
          // Add active class to clicked button
          btn.classList.add('active');
        });
      });
    }, 0);
  }
  
  // Add to message container
  messageContainer.appendChild(votingContainer);
  
  // Add submit button handler
  setTimeout(() => {
    const submitBtn = votingContainer.querySelector('.submit-vote-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        handleVoteSubmission(submitBtn, question);
      });
    }
  }, 0);
}

/**
 * Handle rank selection for individual mode voting
 * @param {HTMLElement} clickedButton - The clicked rank button
 * @param {number} totalModels - Total number of models to rank
 * @param {HTMLElement} container - The ranking container
 */
function handleRankSelection(clickedButton, totalModels, container) {
  const modelId = clickedButton.getAttribute('data-model');
  const currentRank = clickedButton.getAttribute('data-rank');
  
  // Clear current rank if re-clicking already ranked button
  if (currentRank) {
    clickedButton.setAttribute('data-rank', '');
    clickedButton.querySelector('.rank-value').textContent = '';
    clickedButton.classList.remove('active');
    return;
  }
  
  // Find next available rank
  const allButtons = container.querySelectorAll('.rank-btn');
  const usedRanks = [];
  
  allButtons.forEach(btn => {
    const rank = btn.getAttribute('data-rank');
    if (rank) {
      usedRanks.push(parseInt(rank));
    }
  });
  
  // Find next available rank (smallest number not yet used)
  let nextRank = 1;
  while (usedRanks.includes(nextRank) && nextRank <= totalModels) {
    nextRank++;
  }
  
  // If all ranks used, don't do anything
  if (nextRank > totalModels) {
    return;
  }
  
  // Set rank on button
  clickedButton.setAttribute('data-rank', nextRank);
  clickedButton.querySelector('.rank-value').textContent = `(#${nextRank})`;
  clickedButton.classList.add('active');
}

/**
 * Handle vote submission
 * @param {HTMLElement} submitButton - The submit button element
 * @param {string} question - The original user question
 */
function handleVoteSubmission(submitButton, question) {
  // Extract data from button attributes
  const provider = submitButton.getAttribute('data-provider');
  const messageIndex = parseInt(submitButton.getAttribute('data-message-index'));
  const mode = submitButton.getAttribute('data-mode');
  const collaborationStyle = submitButton.getAttribute('data-collaboration-style') || null;
  
  // Get the container parent element
  const container = submitButton.closest('.voting-container');
  
  // Get question type selection
  const questionTypeSelect = document.getElementById(`question-type-${provider}-${messageIndex}`);
  const questionType = questionTypeSelect ? questionTypeSelect.value : 'other';
  
  // Get feedback text
  const feedbackTextarea = document.getElementById(`feedback-${provider}-${messageIndex}`);
  const feedback = feedbackTextarea ? feedbackTextarea.value : '';
  
  // For individual mode, get rankings
  let ratings = {};
  if (mode === 'individual') {
    const rankButtons = container.querySelectorAll('.rank-btn');
    
    // Convert rankings to ratings (1st place = 10, 2nd = 9, etc.)
    rankButtons.forEach(btn => {
      const model = btn.getAttribute('data-model');
      const rank = btn.getAttribute('data-rank');
      
      if (rank) {
        // Convert rank to rating (10 = best, 1 = worst)
        // If we have 3 models, then rank 1 = rating 10, rank 2 = rating 5, rank 3 = rating 1
        const totalModels = rankButtons.length;
        const rating = 10 - ((parseInt(rank) - 1) * (9 / (totalModels - 1)));
        ratings[model] = Math.round(rating);
      }
    });
    
    // Check if at least one model is ranked
    if (Object.keys(ratings).length === 0) {
      showVoteErrorMessage('Please rank at least one model', `${provider}-${messageIndex}`);
      return;
    }
  } else {
    // For collaborative mode, get single rating
    const ratingButton = container.querySelector('.rating-btn.active');
    if (!ratingButton) {
      showVoteErrorMessage('Please select a rating', `${provider}-${messageIndex}`);
      return;
    }
    
    const rating = parseInt(ratingButton.getAttribute('data-rating'));
    ratings[provider] = rating;
  }
  
  // Send vote for each model
  Object.entries(ratings).forEach(([modelId, rating]) => {
    // Generate a unique message ID for tracking this vote
    const messageId = `vote-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Get auth token from storage
    const userId = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');
    const sessionId = localStorage.getItem('session_id') || sessionStorage.getItem('session_id');
    
    if (!userId || !sessionId) {
      console.error('User not authenticated, cannot send vote');
      showVoteErrorMessage('Authentication required to vote', `${provider}-${messageIndex}`);
      return;
    }
    
    // Send vote via WebSocket
    const voteMessage = {
      type: 'vote',
      messageId,
      userId,
      sessionId,
      messageIndex,
      modelId,
      rating,
      questionType,
      question,
      mode,
      collaborationStyle,
      feedback
    };
    
    console.log('Sending vote:', voteMessage);
    
    if (socketConnection) {
      // Store current voting message ID for tracking the response
      currentVotingMessageId = messageId;
      currentVotingMessage = messageIndex;
      currentVotingProvider = provider;
      
      // Send via WebSocket
      socketConnection.send(JSON.stringify(voteMessage));
      
      // Disable submit button
      submitButton.disabled = true;
      submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Submitting...';
    } else {
      showVoteErrorMessage('WebSocket connection not available', `${provider}-${messageIndex}`);
    }
  });
}

/**
 * Show vote success message
 * @param {string} messageId - ID of the vote message 
 */
function showVoteSuccessMessage(messageId) {
  if (currentVotingMessageId === messageId && currentVotingMessage !== null && currentVotingProvider !== null) {
    const statusElement = document.getElementById(`vote-status-${currentVotingProvider}-${currentVotingMessage}`);
    if (statusElement) {
      statusElement.className = 'vote-status mt-2 text-center text-success';
      statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Thank you for your feedback!';
      
      // Find and disable all interactive elements
      const container = statusElement.closest('.voting-container');
      if (container) {
        // Disable rating/rank buttons
        container.querySelectorAll('.rating-btn, .rank-btn').forEach(btn => {
          btn.disabled = true;
        });
        
        // Disable select and textarea
        const select = container.querySelector('select');
        if (select) select.disabled = true;
        
        const textarea = container.querySelector('textarea');
        if (textarea) textarea.disabled = true;
        
        // Update submit button
        const submitBtn = container.querySelector('.submit-vote-btn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Feedback Submitted';
        }
      }
    }
  }
}

/**
 * Show vote error message
 * @param {string} error - Error message
 * @param {string} elementId - Element ID suffix (provider-messageIndex) 
 */
function showVoteErrorMessage(error, elementId) {
  const statusElement = document.getElementById(`vote-status-${elementId}`);
  if (statusElement) {
    statusElement.className = 'vote-status mt-2 text-center text-danger';
    statusElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${error}`;
    
    // Re-enable submit button if it was disabled
    const container = statusElement.closest('.voting-container');
    if (container) {
      const submitBtn = container.querySelector('.submit-vote-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Feedback';
      }
    }
    
    // Clear error after 5 seconds
    setTimeout(() => {
      if (statusElement.classList.contains('text-danger')) {
        statusElement.innerHTML = '';
      }
    }, 5000);
  }
}

/**
 * Generate a question ID (simple hash for determining voting eligibility)
 * @param {string} question - User question
 * @returns {string} - Question ID
 */
function generateQuestionId(question) {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < question.length; i++) {
    const char = question.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `q${hash}`;
}

/**
 * Get the number of active models
 * @returns {number} - Count of active models
 */
function getActiveModelCount() {
  // This would ideally come from the main app state
  // For now, use a placeholder implementation
  return getActiveModels().length;
}

/**
 * Get array of active models
 * @returns {string[]} - Array of active model IDs
 */
function getActiveModels() {
  // This would ideally come from the main app state
  // For example: window._appState.activeModels or similar
  
  // Placeholder implementation - get models that have visible columns
  const activeModels = [];
  const modelColumns = document.querySelectorAll('.chat-column:not(.hidden-column)');
  
  modelColumns.forEach(column => {
    const modelId = column.id.replace('-column', '');
    if (modelId) {
      activeModels.push(modelId);
    }
  });
  
  return activeModels.length ? activeModels : ['claude', 'gemini', 'chatgpt'];
}

// Add CSS for voting UI
function addVotingStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .voting-container {
      border-radius: 8px;
      background-color: rgba(0, 0, 0, 0.02);
      transition: all 0.3s ease;
    }

    .voting-container .rating-btn,
    .voting-container .rank-btn {
      min-width: 36px;
      height: 36px;
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
      border-radius: 4px;
    }

    .voting-container .rating-btn.active {
      background-color: #0d6efd;
      color: white;
      border-color: #0d6efd;
    }

    .voting-container .rank-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 80px;
    }

    .voting-container .rank-btn .model-name {
      font-weight: 500;
    }

    .voting-container .rank-btn .rank-value {
      font-size: 0.75rem;
      color: #6c757d;
    }

    .voting-container .rank-btn.active {
      background-color: #0d6efd;
      color: white;
      border-color: #0d6efd;
    }

    .voting-container .rank-btn.active .rank-value {
      color: rgba(255, 255, 255, 0.8);
    }

    .vote-status {
      min-height: 24px;
      transition: all 0.3s ease;
    }

    /* Dark mode support */
    .theme-dark .voting-container {
      background-color: rgba(255, 255, 255, 0.05);
    }
    
    .theme-dark .voting-container .rank-btn:not(.active) .rank-value {
      color: #adb5bd;
    }
  `;
  
  document.head.appendChild(styleElement);
}

// Add voting styles when module is imported
addVotingStyles();