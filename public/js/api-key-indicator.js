/**
 * API Key Status Indicator for Hub Page
 */

(function() {
    'use strict';
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    async function init() {
        // Wait a bit for other components to load
        setTimeout(() => {
            addApiKeyIndicator();
            checkApiKeyStatus();
        }, 1000);
    }
    
    function addApiKeyIndicator() {
        // Find the feature toggles row
        const featureTogglesRow = document.querySelector('.feature-toggles-row');
        if (!featureTogglesRow) {
            console.warn('Feature toggles row not found');
            return;
        }
        
        // Create API key indicator
        const indicator = document.createElement('div');
        indicator.className = 'api-key-indicator';
        indicator.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 12px;
            background: #f0f0f0;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s;
            margin-left: 10px;
        `;
        
        indicator.innerHTML = `
            <span class="indicator-icon">🔑</span>
            <span class="indicator-text">Checking API Keys...</span>
        `;
        
        indicator.onclick = () => {
            window.open('/test-api-key-flow.html', '_blank');
        };
        
        indicator.title = 'Click to test API keys';
        
        // Add to the page
        featureTogglesRow.appendChild(indicator);
    }
    
    async function checkApiKeyStatus() {
        const indicator = document.querySelector('.api-key-indicator');
        if (!indicator) return;
        
        try {
            // Check session first
            const sessionResponse = await fetch('/api/auth/session', {
                credentials: 'include'
            });
            const sessionData = await sessionResponse.json();
            
            if (!sessionData.authenticated) {
                updateIndicator('Not logged in', '#dc3545', '❌');
                return;
            }
            
            // Check API key status
            const statusResponse = await fetch('/api/api-keys/status', {
                credentials: 'include'
            });
            const statusData = await statusResponse.json();
            
            if (statusData.success) {
                // Count configured keys
                const providers = ['openai', 'anthropic', 'google', 'deepseek', 'grok', 'llama'];
                let configuredCount = 0;
                let availableCount = 0;
                
                providers.forEach(provider => {
                    if (statusData.data[provider]) {
                        if (statusData.data[provider].configured) configuredCount++;
                        if (statusData.data[provider].available) availableCount++;
                    }
                });
                
                if (configuredCount === 0) {
                    updateIndicator('No API keys configured', '#dc3545', '❌');
                } else if (configuredCount < providers.length) {
                    updateIndicator(`${configuredCount}/${providers.length} keys configured`, '#ffc107', '⚠️');
                } else {
                    updateIndicator('All API keys configured', '#28a745', '✅');
                }
            } else {
                updateIndicator('Error checking keys', '#dc3545', '❌');
            }
        } catch (error) {
            console.error('Error checking API key status:', error);
            updateIndicator('Error checking keys', '#dc3545', '❌');
        }
    }
    
    function updateIndicator(text, color, icon) {
        const indicator = document.querySelector('.api-key-indicator');
        if (!indicator) return;
        
        const iconSpan = indicator.querySelector('.indicator-icon');
        const textSpan = indicator.querySelector('.indicator-text');
        
        if (iconSpan) iconSpan.textContent = icon;
        if (textSpan) textSpan.textContent = text;
        
        indicator.style.background = color + '20';
        indicator.style.border = `1px solid ${color}`;
        indicator.style.color = color;
    }
    
    // Refresh status every 30 seconds
    setInterval(checkApiKeyStatus, 30000);
})();