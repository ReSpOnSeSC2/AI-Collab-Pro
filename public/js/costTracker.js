'use strict';

/**
 * Cost Tracker Mini Widget
 * Simple cost indicator that links to the full settings page
 */
window.CostTracker = (function() {
    var costDisplay = null;
    var isInitialized = false;
    
    /**
     * Initialize the cost tracker
     */
    function init() {
        if (isInitialized) return;
        isInitialized = true;
        
        // Create display
        createCostDisplay();
        
        // Setup message handler
        setupMessageHandler();
        
        // Request initial data
        requestInitialData();
    }
    
    /**
     * Create the mini cost display widget
     */
    function createCostDisplay() {
        // Check if it already exists
        if (document.getElementById('cost-tracker-widget')) return;
        
        var widget = document.createElement('div');
        widget.id = 'cost-tracker-widget';
        widget.className = 'cost-tracker-widget cost-tracker-mini';
        widget.innerHTML = '<a href="settings.html" class="cost-tracker-link" title="View usage details in Settings">' +
            '<div class="cost-tracker-mini-content">' +
                '<i class="fas fa-dollar-sign"></i>' +
                '<span class="cost-value" id="session-cost">$0.0000</span>' +
                '<span class="cost-separator">/</span>' +
                '<span class="cost-value cost-daily" id="daily-cost">$0.0000</span>' +
            '</div>' +
        '</a>';
        
        // Add to the page
        document.body.appendChild(widget);
        costDisplay = widget;
    }
    
    /**
     * Setup message handler
     */
    function setupMessageHandler() {
        // Listen for WebSocket messages through a global handler
        window.handleCostMessage = function(data) {
            switch(data.type) {
                case 'cost_update':
                    handleCostUpdate(data);
                    break;
                case 'session_cost':
                    handleSessionCostResponse(data);
                    break;
                case 'daily_cost':
                    handleDailyCostResponse(data);
                    break;
                case 'budget_exceeded':
                    handleBudgetExceeded(data);
                    break;
            }
        };
    }
    
    /**
     * Request initial cost data
     */
    function requestInitialData() {
        if (window.connectionManager && window.connectionManager.isConnected()) {
            // Request session cost
            window.connectionManager.send({
                type: 'get_session_cost'
            });
            
            // Request daily cost
            window.connectionManager.send({
                type: 'get_daily_cost'
            });
        }
    }
    
    /**
     * Handle cost update message
     */
    function handleCostUpdate(data) {
        if (data.sessionCost !== undefined) {
            updateSessionCost(data.sessionCost);
        }
        if (data.dailyCost !== undefined) {
            updateDailyCost(data.dailyCost);
        }
    }
    
    /**
     * Handle session cost response
     */
    function handleSessionCostResponse(data) {
        if (data.totalCost !== undefined) {
            updateSessionCost(data.totalCost);
        }
    }
    
    /**
     * Handle daily cost response
     */
    function handleDailyCostResponse(data) {
        if (data.totalCost !== undefined) {
            updateDailyCost(data.totalCost);
        }
    }
    
    /**
     * Handle budget exceeded
     */
    function handleBudgetExceeded(data) {
        // Flash the widget to indicate budget exceeded
        if (costDisplay) {
            costDisplay.classList.add('budget-exceeded');
            setTimeout(function() {
                costDisplay.classList.remove('budget-exceeded');
            }, 3000);
        }
    }
    
    /**
     * Update session cost display
     */
    function updateSessionCost(cost) {
        var element = document.getElementById('session-cost');
        if (element) {
            element.textContent = '$' + cost.toFixed(4);
        }
    }
    
    /**
     * Update daily cost display
     */
    function updateDailyCost(cost) {
        var element = document.getElementById('daily-cost');
        if (element) {
            element.textContent = '$' + cost.toFixed(4);
        }
    }
    
    // Public API
    return {
        init: init
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    CostTracker.init();
});