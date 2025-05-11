/**
 * Collaboration Controls Module
 * Manages UI for the Advanced Collaboration Engine
 * Version: 9.0.0
 */

// Cache frequently used DOM elements for better performance
let collabModeSelector;
let collabModeDescription;
let collabStyleSelector;
let collabStyleContainer;
let sequentialStyleSelector;
let sequentialStyleContainer;
let modeContainer;

// Available collaboration modes
const COLLABORATION_MODES = {
  'individual': {
    name: 'Individual',
    description: 'Each AI responds independently with no collaboration.',
    icon: 'bi-person-fill'
  },
  'round_table': {
    name: 'Round Table',
    description: 'Classic consensus building where all AIs draft answers, critique each other, vote, and synthesize.',
    icon: 'bi-people-fill'
  },
  'sequential_critique_chain': {
    name: 'Sequential Critique',
    description: 'Each AI builds upon and improves the work of the previous one in sequence.',
    icon: 'bi-arrow-right-circle-fill'
  },
  'validated_consensus': {
    name: 'Validated Consensus',
    description: 'AIs draft content then verify each other\'s factual claims for accuracy.',
    icon: 'bi-check-circle-fill'
  },
  'creative_brainstorm_swarm': {
    name: 'Creative Brainstorm',
    description: 'AIs generate diverse ideas, combine them into new concepts, and vote on the best.',
    icon: 'bi-lightbulb-fill'
  },
  'hybrid_guarded_braintrust': {
    name: 'Hybrid Braintrust',
    description: 'Balance creativity with fact-checking through multi-phase collaboration.',
    icon: 'bi-shield-check'
  },
  'code_architect': {
    name: 'Code Architect',
    description: 'Specialized for software development with design, implementation, review, and testing phases.',
    icon: 'bi-code-square'
  },
  'adversarial_debate': {
    name: 'Adversarial Debate',
    description: 'Models argue opposing viewpoints then synthesize a balanced perspective that considers trade-offs.',
    icon: 'bi-chat-square-text'
  },
  'expert_panel': {
    name: 'Expert Panel',
    description: 'Each AI assumes a different expertise role to build comprehensive solutions from multiple angles.',
    icon: 'bi-person-workspace'
  },
  'scenario_analysis': {
    name: 'Scenario Analysis',
    description: 'Evaluates multiple future possibilities, risks, and strategic recommendations for complex problems.',
    icon: 'bi-graph-up'
  }
};

/**
 * Initialize collaboration controls
 */
export function initialize() {
  // Initialize elements
  const collabControlsContainer = document.querySelector('.collaboration-mode-toggle');
  if (!collabControlsContainer) return;
  
  // Clear current controls
  collabControlsContainer.innerHTML = '';
  
  // Check for existing collaboration mode in app state
  const appState = window._appState || {};
  const currentMode = appState.collaboration?.mode || 'individual';
  const currentModeDetails = COLLABORATION_MODES[currentMode] || COLLABORATION_MODES['individual'];
  
  // Create new controls structure
  const controlsHTML = `
    <label class="me-1 small">Mode:</label>
    <div class="dropdown collab-mode-dropdown">
      <button class="btn btn-sm btn-outline-primary py-0 dropdown-toggle d-flex align-items-center" type="button" id="collab-mode-dropdown" data-bs-toggle="dropdown" aria-expanded="false">
        <i class="bi ${currentModeDetails.icon} me-1"></i>
        <span id="selected-mode-name">${currentModeDetails.name}</span>
      </button>
      <ul class="dropdown-menu collab-mode-menu" aria-labelledby="collab-mode-dropdown">
        ${Object.entries(COLLABORATION_MODES).map(([mode, details]) => `
          <li><a class="dropdown-item collab-mode-item d-flex align-items-center ${mode === currentMode ? 'active' : ''} ${mode === 'individual' ? 'border-top mt-1 pt-1' : ''}" href="#" data-mode="${mode}">
            <i class="bi ${details.icon} me-2"></i>
            <div>
              <div>${details.name}</div>
              <small class="text-muted">${details.description}</small>
            </div>
          </a></li>
        `).join('')}
      </ul>
    </div>
    <div class="collab-style-container ms-2" id="collab-style-container" ${currentMode === 'individual' ? 'style="display: none;"' : ''}>
      <select class="form-select form-select-sm py-0" style="height: 24px;" id="collab-style" aria-label="Collaboration Style">
        <option value="balanced" selected title="Balanced insights">Balanced</option>
        <option value="contrasting" title="Highlight differences">Contrasting</option>
        <option value="harmonious" title="Find common ground">Harmonious</option>
      </select>
    </div>
    <div class="sequential-style-container ms-2" id="sequential-style-container" style="display: none;">
      <select class="form-select form-select-sm py-0" style="height: 24px;" id="sequential-style" aria-label="Sequential Style">
        <option value="balanced" selected title="Balanced insights">Balanced</option>
        <option value="contrasting" title="Highlight differences">Contrasting</option>
        <option value="harmonious" title="Find common ground">Harmonious</option>
      </select>
    </div>
    <div class="enhanced-collab-container ms-2" id="enhanced-collab-container" ${currentMode === 'individual' ? 'style="display: none;"' : ''}>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="enhanced-collab-toggle" title="Use enhanced collaboration algorithm">
        <label class="form-check-label small" for="enhanced-collab-toggle">Enhanced</label>
      </div>
      <div class="form-check form-switch mt-1">
        <input class="form-check-input" type="checkbox" id="ignore-failures-toggle" title="Continue even if some AI models fail" checked>
        <label class="form-check-label small" for="ignore-failures-toggle">Ignore failures</label>
      </div>
    </div>
    <div class="collab-info ms-2">
      <button class="btn btn-sm btn-link p-0" id="collab-info-button" data-bs-toggle="modal" data-bs-target="#collab-info-modal">
        <i class="bi bi-info-circle"></i>
      </button>
    </div>
  `;
  
  // Add to DOM
  collabControlsContainer.innerHTML = controlsHTML;
  
  // Add modal for detailed info
  const modalHTML = `
  <div class="modal fade" id="collab-info-modal" tabindex="-1" aria-labelledby="collab-info-modal-label" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="collab-info-modal-label">AI Collaboration Modes</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="row mb-4">
            <div class="col-md-6">
              <h6><i class="bi bi-person-fill me-2"></i> Individual Mode</h6>
              <p>No collaboration between AIs:</p>
              <ol>
                <li>Each AI responds independently</li>
                <li>No interaction between responses</li>
                <li>You can compare different approaches</li>
              </ol>
              <p class="small text-muted">Best for: Comparing different AI approaches</p>
            </div>
          </div>
          
          <h5 class="mb-3 border-bottom pb-2">Enterprise Collaboration Modes</h5>
          
          <div class="row mb-4">
            <div class="col-md-6">
              <h6><i class="bi bi-people-fill me-2"></i> Round Table</h6>
              <p>The classic synchronous consensus-building approach:</p>
              <ol>
                <li>All AIs draft initial answers</li>
                <li>They critique each other's drafts</li>
                <li>They vote on the best elements</li>
                <li>A lead AI synthesizes a final answer</li>
              </ol>
              <p class="small text-muted">Best for: General queries that benefit from diverse perspectives</p>
            </div>
            <div class="col-md-6">
              <h6><i class="bi bi-arrow-right-circle-fill me-2"></i> Sequential Critique Chain</h6>
              <p>A pipeline approach for progressive refinement:</p>
              <ol>
                <li>First AI provides an initial answer</li>
                <li>Each subsequent AI improves upon the previous one</li>
                <li>The chain continues in sequence</li>
                <li>A final summarizer creates the output</li>
              </ol>
              <p class="small text-muted">Best for: Technical explanations, content refinement</p>
            </div>
          </div>
          
          <div class="row mb-4">
            <div class="col-md-6">
              <h6><i class="bi bi-check-circle-fill me-2"></i> Validated Consensus</h6>
              <p>A workflow focused on factual accuracy:</p>
              <ol>
                <li>AIs co-draft an initial answer</li>
                <li>Other AIs fact-check for accuracy</li>
                <li>Content is revised based on feedback</li>
                <li>Uncertain claims are marked</li>
              </ol>
              <p class="small text-muted">Best for: Research questions, reducing hallucinations</p>
            </div>
            <div class="col-md-6">
              <h6><i class="bi bi-lightbulb-fill me-2"></i> Creative Brainstorm Swarm</h6>
              <p>Maximizes creativity and novel ideas:</p>
              <ol>
                <li>Each AI independently generates ideas</li>
                <li>AIs combine ideas into new "mega-ideas"</li>
                <li>They vote on the most promising concept</li>
                <li>The winning idea is collaboratively developed</li>
              </ol>
              <p class="small text-muted">Best for: Brainstorming, creative challenges</p>
            </div>
          </div>
          
          <div class="row mb-4">
            <div class="col-md-6">
              <h6><i class="bi bi-shield-check me-2"></i> Hybrid Guarded Braintrust</h6>
              <p>Balances creativity with validation:</p>
              <ol>
                <li>Creative ideation phase generates ideas</li>
                <li>Ideas are validated for factual accuracy</li>
                <li>The best validated idea is developed fully</li>
              </ol>
              <p class="small text-muted">Best for: Innovation requiring factual grounding</p>
            </div>
            <div class="col-md-6">
              <h6><i class="bi bi-code-square me-2"></i> Code Architect</h6>
              <p>Enterprise software development workflow:</p>
              <ol>
                <li>Architect AI creates design specifications</li>
                <li>Developer AIs implement the code</li>
                <li>Reviewers check for bugs and optimization</li>
                <li>QA AI proposes test cases</li>
              </ol>
              <p class="small text-muted">Best for: Production-ready software development</p>
            </div>
          </div>
          
          <h5 class="mb-3 border-bottom pb-2">Advanced Enterprise Modes</h5>
          
          <div class="row mb-4">
            <div class="col-md-6">
              <h6><i class="bi bi-chat-square-text me-2"></i> Adversarial Debate</h6>
              <p>Dialectic process for balanced analysis:</p>
              <ol>
                <li>AIs assigned to opposing viewpoints</li>
                <li>Structured debate with rebuttals</li>
                <li>Identification of strengths in each position</li>
                <li>Synthesis into balanced perspective</li>
              </ol>
              <p class="small text-muted">Best for: Complex decisions, policy analysis, pros/cons evaluation</p>
            </div>
            <div class="col-md-6">
              <h6><i class="bi bi-person-workspace me-2"></i> Expert Panel</h6>
              <p>Multi-disciplinary team simulation:</p>
              <ol>
                <li>Each AI assigned specialized expertise role</li>
                <li>Panel discussion with different viewpoints</li>
                <li>Cross-examination of proposals</li>
                <li>Integration into comprehensive solution</li>
              </ol>
              <p class="small text-muted">Best for: Complex problems requiring multiple domains of expertise</p>
            </div>
          </div>
          
          <div class="row">
            <div class="col-md-6">
              <h6><i class="bi bi-graph-up me-2"></i> Scenario Analysis</h6>
              <p>Strategic foresight methodology:</p>
              <ol>
                <li>Identify key uncertainties and variables</li>
                <li>Generate multiple future scenarios</li>
                <li>Assess risks and opportunities in each</li>
                <li>Develop robust strategic recommendations</li>
              </ol>
              <p class="small text-muted">Best for: Strategic planning, risk assessment, future-proofing</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
  `;
  
  // Add modal to body if it doesn't exist
  if (!document.getElementById('collab-info-modal')) {
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);
  }
  
  // Cache element references
  collabModeSelector = document.getElementById('collab-mode-dropdown');
  collabStyleSelector = document.getElementById('collab-style');
  collabStyleContainer = document.getElementById('collab-style-container');
  sequentialStyleSelector = document.getElementById('sequential-style');
  sequentialStyleContainer = document.getElementById('sequential-style-container');
  modeContainer = document.getElementById('enhanced-collab-container');
  
  // Add event listeners
  setupEventListeners();
}

/**
 * Setup event listeners for collaboration controls
 */
function setupEventListeners() {
  // Mode selection
  const modeItems = document.querySelectorAll('.collab-mode-item');
  modeItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = e.currentTarget.dataset.mode;
      const details = COLLABORATION_MODES[mode];

      // Update UI
      document.getElementById('selected-mode-name').textContent = details.name;
      const iconElement = collabModeSelector.querySelector('i');
      iconElement.className = `bi ${details.icon} me-1`;

      // Update active class
      modeItems.forEach(mi => mi.classList.remove('active'));
      e.currentTarget.classList.add('active');

      // Toggle style visibility
      modeContainer.style.display = mode === 'individual' ? 'none' : 'block';

      // Toggle sequential style selector visibility
      if (sequentialStyleContainer) {
        sequentialStyleContainer.style.display = mode === 'sequential_critique_chain' ? 'block' : 'none';
      }

      // Toggle regular style selector visibility
      if (collabStyleContainer) {
        collabStyleContainer.style.display = mode !== 'individual' && mode !== 'sequential_critique_chain' ? 'block' : 'none';
      }

      // Close dropdown (optional - Bootstrap usually handles this)
      const dropdownMenu = document.querySelector('.collab-mode-dropdown .dropdown-menu');
      if (dropdownMenu.classList.contains('show')) {
        dropdownMenu.classList.remove('show');
      }

      // Dispatch event
      const event = new CustomEvent('collab-mode-change', {
        detail: { mode: mode }
      });
      document.dispatchEvent(event);
    });
  });
  
  // Style selection
  collabStyleSelector.addEventListener('change', (e) => {
    const style = e.target.value;
    setStyle(style);

    // Dispatch event
    const event = new CustomEvent('collab-style-change', {
      detail: { style: style }
    });
    document.dispatchEvent(event);
  });

  // Sequential style selection
  sequentialStyleSelector.addEventListener('change', (e) => {
    const style = e.target.value;

    // Dispatch event
    const event = new CustomEvent('sequential-style-change', {
      detail: {
        sequentialStyle: style
      }
    });
    document.dispatchEvent(event);

    console.log(`Sequential critique style set to: ${style}`);
  });

  // Info button
  const infoButton = document.getElementById('collab-info-button');
  if (infoButton) {
    infoButton.addEventListener('click', (e) => {
      // Modal is handled by Bootstrap
    });
  }
}

/**
 * Set collaboration mode
 * @param {string} mode - The collaboration mode to set
 */
export function setMode(mode) {
  if (!COLLABORATION_MODES[mode]) return;
  
  const details = COLLABORATION_MODES[mode];
  document.getElementById('selected-mode-name').textContent = details.name;
  
  const iconElement = collabModeSelector.querySelector('i');
  iconElement.className = `bi ${details.icon} me-1`;
  
  // Toggle style visibility
  modeContainer.style.display = mode === 'individual' ? 'none' : 'block';

  // Toggle style selector visibility
  if (collabStyleContainer) {
    collabStyleContainer.style.display = mode !== 'individual' && mode !== 'sequential_critique_chain' ? 'block' : 'none';
  }

  // Toggle sequential style selector visibility
  if (sequentialStyleContainer) {
    sequentialStyleContainer.style.display = mode === 'sequential_critique_chain' ? 'block' : 'none';
  }

  // Toggle enhanced collab toggle visibility
  const enhancedContainer = document.getElementById('enhanced-collab-container');
  if (enhancedContainer) {
    enhancedContainer.style.display = mode === 'individual' ? 'none' : 'block';
  }
}

/**
 * Set collaboration style
 * @param {string} style - The collaboration style to set
 */
export function setStyle(style) {
  if (!style || !collabStyleSelector) return;

  // Update dropdown selection
  collabStyleSelector.value = style;

  // You could send the style to the server here if backend implementation exists
  // For now, this just updates the UI to maintain the style in the dropdown
  console.log(`Collaboration style set to: ${style}`);
}

/**
 * Show cost information in the UI
 * @param {number} cost - The cost in USD
 * @param {string} mode - The collaboration mode used
 */
export function showCostInfo(cost, mode) {
  // Create or update cost notification
  const existingNotification = document.getElementById('cost-notification');
  
  if (existingNotification) {
    // Update existing notification
    existingNotification.querySelector('.cost-amount').textContent = `$${cost}`;
    existingNotification.querySelector('.cost-mode').textContent = COLLABORATION_MODES[mode]?.name || mode;
    
    // Reset animation
    existingNotification.style.animation = 'none';
    existingNotification.offsetHeight; // Trigger reflow
    existingNotification.style.animation = null;
    
    // Make visible and start hide timer
    existingNotification.classList.remove('d-none');
    startHideTimer(existingNotification);
  } else {
    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'cost-notification';
    notification.className = 'cost-notification';
    notification.innerHTML = `
      <div class="card shadow-sm">
        <div class="card-body p-2">
          <h6 class="mb-1"><i class="bi bi-receipt me-1"></i> Collaboration Cost</h6>
          <p class="mb-0 small">Mode: <span class="cost-mode">${COLLABORATION_MODES[mode]?.name || mode}</span></p>
          <p class="mb-0 small">Cost: <span class="cost-amount">$${cost}</span></p>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Add CSS
    const style = document.createElement('style');
    style.textContent = `
      .cost-notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1050;
        max-width: 300px;
        animation: fadeInOut 5s forwards;
      }
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(20px); }
        10% { opacity: 1; transform: translateY(0); }
        90% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(20px); }
      }
    `;
    document.head.appendChild(style);
    
    // Start hide timer
    startHideTimer(notification);
  }
}

/**
 * Start timer to hide notification
 * @param {HTMLElement} element - The notification element
 */
function startHideTimer(element) {
  setTimeout(() => {
    element.classList.add('d-none');
  }, 5000);
}

// Export the COLLABORATION_MODES object for reference elsewhere
export { COLLABORATION_MODES };