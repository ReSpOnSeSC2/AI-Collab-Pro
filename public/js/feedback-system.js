// Feedback System for AI Collaboration Hub
class FeedbackSystem {
  constructor() {
    this.feedbackChance = 0.02; // 2% chance
    this.lastFeedbackTime = localStorage.getItem('lastFeedbackTime') || 0;
    this.feedbackCooldown = 5 * 60 * 1000; // 5 minutes cooldown between feedbacks
    this.categories = [
      'accuracy',
      'helpfulness',
      'creativity',
      'clarity',
      'relevance',
      'technical_knowledge',
      'problem_solving',
      'code_quality',
      'response_time',
      'context_understanding',
      'collaboration_effectiveness',
      'innovation'
    ];
    this.isMinimized = false;
  }

  // Check if we should show feedback based on probability and cooldown
  shouldShowFeedback() {
    const now = Date.now();
    if (now - this.lastFeedbackTime < this.feedbackCooldown) {
      return false;
    }
    return Math.random() < this.feedbackChance;
  }

  // Show collaboration feedback (satisfaction rating)
  showCollaborationFeedback(conversationId, models, response) {
    if (!this.shouldShowFeedback()) return;

    const feedbackHtml = `
      <div class="feedback-overlay" id="feedback-overlay">
        <div class="feedback-modal" id="feedback-modal">
          <div class="feedback-header">
            <h3>How was this response?</h3>
            <div class="feedback-controls">
              <button class="feedback-minimize" onclick="feedbackSystem.toggleMinimize()" title="Minimize">
                <span style="font-size: 20px; line-height: 1;">−</span>
              </button>
              <button class="feedback-close" onclick="feedbackSystem.closeFeedback()">
                <span style="font-size: 20px; line-height: 1;">×</span>
              </button>
            </div>
          </div>
          <div class="feedback-body">
            <p>Your feedback helps us improve our AI collaboration system.</p>
            
            <div class="feedback-satisfaction">
              <label>Overall satisfaction:</label>
              <div class="star-rating" id="satisfaction-rating">
                ${[1,2,3,4,5].map(i => `
                  <span class="star" data-rating="${i}" onclick="feedbackSystem.setSatisfaction(${i})">☆</span>
                `).join('')}
              </div>
            </div>

            <div class="feedback-task-type">
              <label>What type of task was this?</label>
              <select id="feedback-task-type" class="feedback-select">
                <option value="">Select task type...</option>
                <option value="coding">Coding/Programming</option>
                <option value="writing">Writing/Content Creation</option>
                <option value="analysis">Analysis/Research</option>
                <option value="math">Math/Calculations</option>
                <option value="creative">Creative/Design</option>
                <option value="qa">Q&A/Information</option>
                <option value="debugging">Debugging/Troubleshooting</option>
                <option value="planning">Planning/Strategy</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="feedback-criteria">
              <label>Which aspects were most important? (check all that apply)</label>
              <div class="criteria-checkboxes">
                ${this.categories.map(cat => `
                  <label class="criteria-checkbox">
                    <input type="checkbox" id="criteria-${cat}" value="${cat}">
                    <span>${cat.replace(/_/g, ' ').charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="feedback-categories">
              <label>Rate the aspects you selected:</label>
              ${this.categories.map(cat => `
                <div class="category-rating" id="category-${cat}" style="display: none;">
                  <span>${cat.replace(/_/g, ' ').charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}:</span>
                  <div class="mini-star-rating" id="rating-${cat}">
                    ${[1,2,3,4,5].map(i => `
                      <span class="star mini" data-rating="${i}" onclick="feedbackSystem.setCategoryRating('${cat}', ${i})">☆</span>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>

            <div class="feedback-comparison">
              <label>How did this collaboration compare to single AI responses?</label>
              <select id="feedback-comparison" class="feedback-select">
                <option value="">Select comparison...</option>
                <option value="much_better">Much Better</option>
                <option value="better">Better</option>
                <option value="same">About the Same</option>
                <option value="worse">Worse</option>
                <option value="much_worse">Much Worse</option>
              </select>
            </div>

            <div class="feedback-comment">
              <label>Additional comments (optional):</label>
              <textarea id="feedback-comment" placeholder="Tell us more about your experience..."></textarea>
            </div>
          </div>
          <div class="feedback-footer">
            <button class="btn btn-secondary" onclick="feedbackSystem.closeFeedback()">Skip</button>
            <button class="btn btn-primary" onclick="feedbackSystem.submitCollaborationFeedback('${conversationId}', '${models.join(',')}')">
              Submit Feedback
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', feedbackHtml);
    this.lastFeedbackTime = Date.now();
    localStorage.setItem('lastFeedbackTime', this.lastFeedbackTime);
    
    // Add event listeners for checkboxes to show/hide rating categories
    this.categories.forEach(cat => {
      const checkbox = document.getElementById(`criteria-${cat}`);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          const categoryDiv = document.getElementById(`category-${cat}`);
          if (categoryDiv) {
            categoryDiv.style.display = e.target.checked ? 'flex' : 'none';
          }
        });
      }
    });
  }

  // Show model comparison feedback (which AI is best)
  showModelComparisonFeedback(conversationId, responses) {
    if (!this.shouldShowFeedback()) return;
    if (responses.length < 2) return; // Need at least 2 models to compare

    const feedbackHtml = `
      <div class="feedback-overlay" id="feedback-overlay">
        <div class="feedback-modal feedback-comparison">
          <div class="feedback-header">
            <h3>Which AI gave the best response?</h3>
            <button class="feedback-close" onclick="feedbackSystem.closeFeedback()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="feedback-body">
            <p>Help us understand which AI models work best for different tasks.</p>
            
            <div class="model-comparison">
              ${responses.map((resp, idx) => `
                <div class="model-option" onclick="feedbackSystem.selectModel('${resp.model}', ${idx})">
                  <input type="radio" name="best-model" id="model-${idx}" value="${resp.model}">
                  <label for="model-${idx}">
                    <div class="model-name">${resp.model.charAt(0).toUpperCase() + resp.model.slice(1)}</div>
                    <div class="model-response">${this.truncateResponse(resp.content)}</div>
                  </label>
                </div>
              `).join('')}
            </div>

            <div class="feedback-task-category">
              <label>What type of task was this?</label>
              <select id="task-category">
                <option value="">Select a category...</option>
                <option value="coding">Coding/Programming</option>
                <option value="writing">Creative Writing</option>
                <option value="analysis">Data Analysis</option>
                <option value="math">Mathematics</option>
                <option value="research">Research/Information</option>
                <option value="problem_solving">Problem Solving</option>
                <option value="language">Language/Translation</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="feedback-criteria">
              <label>Why was it the best? (select all that apply)</label>
              <div class="criteria-options">
                <label><input type="checkbox" value="accuracy"> Most accurate</label>
                <label><input type="checkbox" value="completeness"> Most complete</label>
                <label><input type="checkbox" value="clarity"> Clearest explanation</label>
                <label><input type="checkbox" value="creativity"> Most creative</label>
                <label><input type="checkbox" value="helpful"> Most helpful</label>
                <label><input type="checkbox" value="concise"> Most concise</label>
              </div>
            </div>
          </div>
          <div class="feedback-footer">
            <button class="btn btn-secondary" onclick="feedbackSystem.closeFeedback()">Skip</button>
            <button class="btn btn-primary" onclick="feedbackSystem.submitComparisonFeedback('${conversationId}')">
              Submit Feedback
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', feedbackHtml);
    this.lastFeedbackTime = Date.now();
    localStorage.setItem('lastFeedbackTime', this.lastFeedbackTime);
  }

  // Helper functions
  setSatisfaction(rating) {
    this.currentSatisfaction = rating;
    this.updateStarDisplay('satisfaction-rating', rating);
  }

  setCategoryRating(category, rating) {
    if (!this.categoryRatings) this.categoryRatings = {};
    this.categoryRatings[category] = rating;
    this.updateStarDisplay(`rating-${category}`, rating);
  }

  updateStarDisplay(containerId, rating) {
    const stars = document.querySelectorAll(`#${containerId} .star`);
    stars.forEach((star, idx) => {
      if (idx < rating) {
        star.textContent = '★'; // Filled star
        star.classList.add('filled');
      } else {
        star.textContent = '☆'; // Empty star
        star.classList.remove('filled');
      }
    });
  }

  selectModel(model, idx) {
    document.getElementById(`model-${idx}`).checked = true;
    this.selectedModel = model;
  }

  truncateResponse(content) {
    const maxLength = 150;
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  toggleMinimize() {
    const modal = document.getElementById('feedback-modal');
    const overlay = document.getElementById('feedback-overlay');
    
    if (!modal || !overlay) return;
    
    this.isMinimized = !this.isMinimized;
    
    if (this.isMinimized) {
      modal.classList.add('minimized');
      overlay.classList.add('minimized');
      // Move to bottom right corner when minimized
      modal.style.position = 'fixed';
      modal.style.bottom = '20px';
      modal.style.right = '20px';
      modal.style.top = 'auto';
      modal.style.left = 'auto';
      modal.style.transform = 'none';
    } else {
      modal.classList.remove('minimized');
      overlay.classList.remove('minimized');
      // Reset position
      modal.style.position = '';
      modal.style.bottom = '';
      modal.style.right = '';
      modal.style.top = '';
      modal.style.left = '';
      modal.style.transform = '';
    }
  }
  
  closeFeedback() {
    const overlay = document.getElementById('feedback-overlay');
    if (overlay) overlay.remove();
    this.currentSatisfaction = null;
    this.categoryRatings = {};
    this.selectedModel = null;
    this.isMinimized = false;
  }

  async submitCollaborationFeedback(conversationId, models) {
    // Get selected criteria
    const selectedCriteria = [];
    this.categories.forEach(cat => {
      const checkbox = document.getElementById(`criteria-${cat}`);
      if (checkbox && checkbox.checked) {
        selectedCriteria.push(cat);
      }
    });
    
    const feedback = {
      type: 'collaboration',
      conversationId,
      models: models.split(','),
      satisfaction: this.currentSatisfaction,
      taskType: document.getElementById('feedback-task-type')?.value || '',
      selectedCriteria: selectedCriteria,
      categoryRatings: this.categoryRatings || {},
      comparisonRating: document.getElementById('feedback-comparison')?.value || '',
      comment: document.getElementById('feedback-comment')?.value || '',
      timestamp: new Date()
    };

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback)
      });

      if (response.ok) {
        this.showThankYou();
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }

    this.closeFeedback();
  }

  async submitComparisonFeedback(conversationId) {
    const taskCategory = document.getElementById('task-category').value;
    const criteria = Array.from(document.querySelectorAll('.criteria-options input:checked'))
      .map(cb => cb.value);

    if (!this.selectedModel || !taskCategory) {
      alert('Please select a model and task category');
      return;
    }

    const feedback = {
      type: 'comparison',
      conversationId,
      bestModel: this.selectedModel,
      taskCategory,
      criteria,
      timestamp: new Date()
    };

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback)
      });

      if (response.ok) {
        this.showThankYou();
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }

    this.closeFeedback();
  }

  showThankYou() {
    const thankYouHtml = `
      <div class="feedback-thank-you" id="feedback-thank-you">
        <i class="fas fa-check-circle"></i>
        <p>Thank you for your feedback!</p>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', thankYouHtml);
    
    setTimeout(() => {
      const thankYou = document.getElementById('feedback-thank-you');
      if (thankYou) thankYou.remove();
    }, 3000);
  }
}

// Initialize feedback system
const feedbackSystem = new FeedbackSystem();

// Export for use in other modules
window.feedbackSystem = feedbackSystem;