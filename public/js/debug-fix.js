/**
 * WebSocket Debug Fixer - To Be Included Directly In Browser Console
 * This script provides emergency fixes for WebSocket display issues
 */

(function() {
    console.log('🔧 Emergency WebSocket Debug Fix Initializing...');

    // PROBLEM: The "AI is typing..." indicator isn't properly removed or responses aren't displayed
    
    // First, try to manually remove all typing indicators
    function cleanupAllTypingIndicators() {
        const containers = [
            document.getElementById('claude-messages'),
            document.getElementById('gemini-messages'),
            document.getElementById('chatgpt-messages'),
            document.getElementById('grok-messages'),
            document.getElementById('deepseek-messages'),
            document.getElementById('llama-messages')
        ];
        
        let count = 0;
        containers.forEach(container => {
            if (container) {
                const typingIndicators = container.querySelectorAll('.typing-indicator');
                typingIndicators.forEach(indicator => {
                    indicator.remove();
                    count++;
                });
            }
        });
        
        console.log(`🧹 Removed ${count} typing indicators`);
    }
    
    // Attempt to manually fix the connection state
    function fixConnectionState() {
        if (typeof ConnectionManager !== 'undefined') {
            console.log('🔄 Reconnecting WebSocket...');
            // Force reconnect
            try {
                ConnectionManager.connectWebSocket();
                console.log('✅ WebSocket reconnection attempted');
            } catch (e) {
                console.error('❌ WebSocket reconnection failed:', e);
            }
        } else {
            console.warn('⚠️ ConnectionManager not available');
        }
    }
    
    // Attempt to forcibly display any pending responses
    function displayPendingResponses() {
        if (!window._appState || !window._appState.latestResponses) {
            console.warn('⚠️ No stored responses found in _appState');
            return;
        }
        
        const providers = ['claude', 'gemini', 'chatgpt', 'grok', 'deepseek', 'llama'];
        let displayCount = 0;
        
        providers.forEach(provider => {
            const response = window._appState.latestResponses[provider];
            if (response && response.length > 0) {
                const messagesContainer = document.getElementById(`${provider}-messages`);
                if (messagesContainer) {
                    console.log(`📝 Found stored response for ${provider}, length: ${response.length}`);
                    
                    // Create a new message element
                    const messageElement = document.createElement('div');
                    messageElement.className = `message message-ai ${provider}-message`;
                    
                    // Model indicator
                    const modelInfoEl = document.createElement('div');
                    modelInfoEl.className = 'model-indicator';
                    modelInfoEl.textContent = `Default ${provider}`;
                    messageElement.appendChild(modelInfoEl);
                    
                    // Content
                    const contentEl = document.createElement('div');
                    contentEl.className = 'message-content';
                    messageElement.appendChild(contentEl);
                    
                    // Add to DOM
                    messagesContainer.appendChild(messageElement);
                    
                    // Render content
                    try {
                        if (typeof marked !== 'undefined') {
                            contentEl.innerHTML = marked.parse(response);
                        } else {
                            contentEl.textContent = response;
                        }
                        displayCount++;
                    } catch (e) {
                        console.error(`❌ Failed to render ${provider} response:`, e);
                        contentEl.textContent = response;
                    }
                    
                    // Scroll to bottom
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            }
        });
        
        console.log(`📊 Displayed ${displayCount} pending responses`);
    }
    
    // Force apply main fixes
    setTimeout(() => {
        console.log('🚀 Applying emergency WebSocket display fixes...');
        cleanupAllTypingIndicators();
        fixConnectionState();
        displayPendingResponses();
        console.log('✅ Emergency fixes applied. If issues persist, please try refreshing the page.');
    }, 1000);
    
    // Create global debug helper
    window.WSDebugFix = {
        cleanupTypingIndicators: cleanupAllTypingIndicators,
        reconnect: fixConnectionState,
        showPendingResponses: displayPendingResponses,
        runAll: function() {
            cleanupAllTypingIndicators();
            fixConnectionState();
            displayPendingResponses();
        }
    };
    
    console.log('🔧 WebSocket Debug Fix initialized. Available at window.WSDebugFix');
})();