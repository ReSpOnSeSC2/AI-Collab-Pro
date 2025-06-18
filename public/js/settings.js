'use strict';

(function() {
    // State
    var currentTab = 'usage';
    var currentBreakdown = 'session';
    var sessionStartTime = Date.now();
    var updateInterval;
    
    // Initialize
    document.addEventListener('DOMContentLoaded', function() {
        initializeTabs();
        initializeBreakdownTabs();
        initializeBudgetForm();
        startDataUpdates();
        requestInitialData();
    });
    
    // Tab Management
    function initializeTabs() {
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                switchTab(btn.dataset.tab);
            });
        });
    }
    
    function switchTab(tabName) {
        currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab content
        document.querySelectorAll('.tab-pane').forEach(function(pane) {
            pane.classList.toggle('active', pane.id === tabName + '-tab');
        });
        
        // Initialize tab-specific functionality
        if (tabName === 'api-keys' && typeof initializeApiKeys === 'function') {
            initializeApiKeys();
        } else if (tabName === 'metrics' && typeof initializeMetricsDashboard === 'function') {
            initializeMetricsDashboard();
        }
    }
    
    // Breakdown Tab Management
    function initializeBreakdownTabs() {
        document.querySelectorAll('.breakdown-tab').forEach(function(btn) {
            btn.addEventListener('click', function() {
                switchBreakdownTab(btn.dataset.breakdown);
            });
        });
    }
    
    function switchBreakdownTab(breakdown) {
        currentBreakdown = breakdown;
        
        // Update tab buttons
        document.querySelectorAll('.breakdown-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.breakdown === breakdown);
        });
        
        // Update tab content
        document.querySelectorAll('.breakdown-pane').forEach(function(pane) {
            pane.classList.toggle('active', pane.id === breakdown + '-breakdown');
        });
    }
    
    // Budget Form
    function initializeBudgetForm() {
        var saveBtn = document.getElementById('save-budget-btn');
        var input = document.getElementById('daily-budget-limit');
        
        saveBtn.addEventListener('click', saveBudget);
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                saveBudget();
            }
        });
    }
    
    function saveBudget() {
        var input = document.getElementById('daily-budget-limit');
        var limit = parseFloat(input.value) || 0;
        
        if (window.connectionManager && window.connectionManager.isConnected()) {
            window.connectionManager.send({
                type: 'set_budget_limit',
                limit: limit
            });
        }
    }
    
    // Data Updates
    function startDataUpdates() {
        // Update session duration every minute
        updateInterval = setInterval(updateSessionDuration, 60000);
        updateSessionDuration(); // Initial update
    }
    
    function updateSessionDuration() {
        var duration = Math.floor((Date.now() - sessionStartTime) / 60000);
        var durationEl = document.getElementById('session-duration');
        if (durationEl) {
            durationEl.textContent = duration + ' min';
        }
    }
    
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
    
    // Message Handlers
    window.handleSettingsMessage = function(data) {
        switch(data.type) {
            case 'cost_update':
                handleCostUpdate(data);
                break;
            case 'session_cost':
                handleSessionCost(data);
                break;
            case 'daily_cost':
                handleDailyCost(data);
                break;
            case 'budget_limit_set':
                handleBudgetSet(data);
                break;
            case 'budget_exceeded':
                handleBudgetExceeded(data);
                break;
        }
    };
    
    function handleCostUpdate(data) {
        // Update session cost
        if (data.sessionCost !== undefined) {
            document.getElementById('session-usage').textContent = '$' + data.sessionCost.toFixed(4);
        }
        
        // Update daily cost
        if (data.dailyCost !== undefined) {
            updateDailyCost(data.dailyCost, data.budgetLimit);
        }
    }
    
    function handleSessionCost(data) {
        if (data.totalCost !== undefined) {
            document.getElementById('session-usage').textContent = '$' + data.totalCost.toFixed(4);
        }
        
        if (data.breakdown) {
            updateSessionBreakdown(data.breakdown);
        }
    }
    
    function handleDailyCost(data) {
        if (data.totalCost !== undefined) {
            updateDailyCost(data.totalCost, data.budgetLimit);
        }
        
        if (data.breakdown) {
            updateDailyBreakdown(data.breakdown);
        }
    }
    
    function handleBudgetSet(data) {
        if (data.success) {
            var input = document.getElementById('daily-budget-limit');
            input.value = data.limit || '';
            updateBudgetStatus(data.limit);
        }
    }
    
    function handleBudgetExceeded(data) {
        alert('Budget limit exceeded! Current usage: $' + data.currentUsage.toFixed(4) + 
              ' / Limit: $' + data.limit.toFixed(2));
    }
    
    // UI Updates
    function updateDailyCost(cost, budgetLimit) {
        document.getElementById('daily-usage').textContent = '$' + cost.toFixed(4);
        
        if (budgetLimit && budgetLimit > 0) {
            var percentage = Math.min((cost / budgetLimit) * 100, 100);
            var progressBar = document.getElementById('daily-progress');
            progressBar.style.width = percentage + '%';
            progressBar.setAttribute('aria-valuenow', percentage);
            
            // Update color based on usage
            progressBar.classList.remove('bg-success', 'bg-warning', 'bg-danger');
            if (percentage >= 90) {
                progressBar.classList.add('bg-danger');
            } else if (percentage >= 75) {
                progressBar.classList.add('bg-warning');
            } else {
                progressBar.classList.add('bg-success');
            }
            
            document.getElementById('budget-info').textContent = 
                '$' + cost.toFixed(4) + ' / $' + budgetLimit.toFixed(2) + ' (' + percentage.toFixed(1) + '%)';
        } else {
            document.getElementById('budget-info').textContent = 'No budget limit set';
            document.getElementById('daily-progress').style.width = '0%';
        }
    }
    
    function updateBudgetStatus(limit) {
        if (limit && limit > 0) {
            document.getElementById('budget-info').textContent = 'Budget limit: $' + limit.toFixed(2);
        } else {
            document.getElementById('budget-info').textContent = 'No budget limit set';
        }
    }
    
    function updateSessionBreakdown(breakdown) {
        var container = document.getElementById('session-breakdown-list');
        if (!breakdown || breakdown.length === 0) {
            container.innerHTML = '<div class="no-data">No usage data for current session</div>';
            return;
        }
        
        container.innerHTML = breakdown.map(function(item) {
            return createBreakdownItem(item);
        }).join('');
    }
    
    function updateDailyBreakdown(breakdown) {
        var container = document.getElementById('daily-breakdown-list');
        if (!breakdown || breakdown.length === 0) {
            container.innerHTML = '<div class="no-data">No usage data for today</div>';
            return;
        }
        
        container.innerHTML = breakdown.map(function(item) {
            return createBreakdownItem(item);
        }).join('');
    }
    
    function createBreakdownItem(item) {
        var providerClass = item.provider.toLowerCase();
        var providerIcon = getProviderIcon(item.provider);
        
        return '<div class="breakdown-item">' +
            '<div class="breakdown-model">' +
                '<div class="model-icon ' + providerClass + '">' + providerIcon + '</div>' +
                '<div class="breakdown-details">' +
                    '<div class="breakdown-model-name">' + item.model + '</div>' +
                    '<div class="breakdown-tokens">' +
                        'Input: ' + item.inputTokens + ' | Output: ' + item.outputTokens +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="breakdown-cost">$' + item.cost.toFixed(4) + '</div>' +
        '</div>';
    }
    
    function getProviderIcon(provider) {
        var icons = {
            'claude': 'C',
            'gemini': 'G',
            'chatgpt': 'GP',
            'grok': 'X',
            'deepseek': 'DS',
            'llama': 'L'
        };
        return icons[provider.toLowerCase()] || provider.charAt(0).toUpperCase();
    }
    
    // Cleanup
    window.addEventListener('beforeunload', function() {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
    });
})();