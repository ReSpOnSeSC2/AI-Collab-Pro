/**
 * API Keys Management JavaScript
 */

class ApiKeysManager {
    constructor() {
        this.providers = {
            'openai': { name: 'OpenAI', icon: '🤖' },
            'anthropic': { name: 'Anthropic', icon: '🧠' },
            'google': { name: 'Google Gemini', icon: '💎' },
            'deepseek': { name: 'DeepSeek', icon: '🔍' },
            'grok': { name: 'Grok', icon: '🚀' },
            'llama': { name: 'Llama', icon: '🦙' }
        };
        
        // Set up backend URL for production
        this.isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        this.BACKEND_URL = this.isProduction ? 'https://ai-collab-pro.onrender.com' : '';
        
        this.init();
    }

    async init() {
        // Skip auth check if we're in settings page (already authenticated)
        if (!document.querySelector('#api-keys-tab')) {
            // Only check auth for standalone page
            if (typeof checkAuthStatus === 'function') {
                const isAuthenticated = await checkAuthStatus();
                if (!isAuthenticated) {
                    window.location.href = '/login.html?redirect=/api-keys.html';
                    return;
                }
            }
        }

        // Initialize form handlers
        this.initFormHandlers();
        
        // Load initial data
        await this.loadProviderStatus();
        await this.loadSavedKeys();
        await this.loadUsageStats();
    }

    initFormHandlers() {
        const form = document.getElementById('api-key-form');
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const provider = formData.get('provider');
        const apiKey = formData.get('apiKey');

        if (!provider || !apiKey) {
            this.showMessage('Please select a provider and enter an API key', 'error');
            return;
        }

        try {
            const token = localStorage.getItem('ai_collab_token');
            const response = await fetch(`${this.BACKEND_URL}/api/api-keys`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include',
                body: JSON.stringify({ provider, apiKey })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('API response not OK:', response.status, data);
                this.showMessage(data.error || data.message || `HTTP ${response.status}: Failed to save API key`, 'error');
                return;
            }

            if (data.success) {
                this.showMessage(data.message, 'success');
                e.target.reset();
                
                // Reload data
                await this.loadProviderStatus();
                await this.loadSavedKeys();
            } else {
                this.showMessage(data.error || 'Failed to save API key', 'error');
            }
        } catch (error) {
            console.error('Error saving API key:', error);
            this.showMessage(`Network error: ${error.message}`, 'error');
        }
    }

    async loadProviderStatus() {
        try {
            const token = localStorage.getItem('ai_collab_token');
            const response = await fetch(`${this.BACKEND_URL}/api/api-keys/status`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include'
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('Provider status response not OK:', response.status, data);
                return;
            }
            
            if (data.success) {
                this.renderProviderStatus(data.data);
            } else {
                console.error('Provider status failed:', data);
            }
        } catch (error) {
            console.error('Error loading provider status:', error);
        }
    }

    renderProviderStatus(status) {
        const container = document.getElementById('provider-status');
        if (!container) {
            console.warn('Provider status container not found');
            return;
        }
        container.innerHTML = '';

        Object.entries(status).forEach(([provider, info]) => {
            const providerInfo = this.providers[provider];
            if (!providerInfo) return;

            const card = document.createElement('div');
            card.className = `provider-status-card ${info.configured ? 'configured' : info.source === 'system' ? 'system-only' : 'unavailable'}`;
            
            card.innerHTML = `
                <div class="provider-logo">${providerInfo.icon}</div>
                <div class="provider-name">${providerInfo.name}</div>
                <div class="provider-status">
                    ${info.configured ? `Your Key: ****${info.keyId}` : 'Using platform key'}
                </div>
                <div class="status-badge ${info.source}">
                    ${info.source === 'system' ? 'AVAILABLE' : info.configured ? 'YOUR KEY' : 'ADD KEY'}
                </div>
            `;
            
            container.appendChild(card);
        });
    }

    async loadSavedKeys() {
        try {
            const token = localStorage.getItem('ai_collab_token');
            const response = await fetch(`${this.BACKEND_URL}/api/api-keys`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include'
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('Saved keys response not OK:', response.status, data);
                return;
            }
            
            if (data.success) {
                this.renderSavedKeys(data.data);
            } else {
                console.error('Loading saved keys failed:', data);
            }
        } catch (error) {
            console.error('Error loading saved keys:', error);
        }
    }

    renderSavedKeys(keys) {
        const container = document.getElementById('saved-keys-list');
        if (!container) {
            console.warn('Saved keys list container not found');
            return;
        }
        container.innerHTML = '';

        if (keys.length === 0) {
            container.innerHTML = '<p class="empty-state">No API keys saved yet.</p>';
            return;
        }

        keys.forEach(key => {
            const providerInfo = this.providers[key.provider];
            if (!providerInfo) return;

            const item = document.createElement('div');
            item.className = 'saved-key-item';
            
            item.innerHTML = `
                <div class="key-info">
                    <div class="key-provider">${providerInfo.icon} ${providerInfo.name}</div>
                    <div class="key-details">
                        <span>Key: ****${key.keyId}</span>
                        <span>Added: ${new Date(key.addedAt).toLocaleDateString()}</span>
                        <span>Status: ${key.isValid ? '✅ Valid' : '❌ Invalid'}</span>
                    </div>
                </div>
                <div class="key-actions">
                    <button class="btn btn-small btn-secondary" onclick="apiKeysManager.testKey('${key.provider}')">
                        Test
                    </button>
                    <button class="btn btn-small btn-danger" onclick="apiKeysManager.deleteKey('${key.provider}')">
                        Delete
                    </button>
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    async loadUsageStats() {
        try {
            // This would typically fetch from a user stats endpoint
            // For now, we'll use placeholder data
            const token = localStorage.getItem('ai_collab_token');
            const response = await fetch(`${this.BACKEND_URL}/api/auth/session`, {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include'
            });

            const data = await response.json();
            
            if (data.user) {
                const requestsEl = document.getElementById('total-requests');
                const costEl = document.getElementById('total-cost');
                const lastRequestEl = document.getElementById('last-request');
                
                if (requestsEl) requestsEl.textContent = data.user.usage?.totalRequests || 0;
                if (costEl) costEl.textContent = `$${(data.user.usage?.totalCost || 0).toFixed(2)}`;
                if (lastRequestEl) {
                    lastRequestEl.textContent = data.user.usage?.lastRequestAt 
                        ? new Date(data.user.usage.lastRequestAt).toLocaleString() 
                        : 'Never';
                }
            }
        } catch (error) {
            console.error('Error loading usage stats:', error);
        }
    }

    async testKey(provider) {
        try {
            const token = localStorage.getItem('ai_collab_token');
            const response = await fetch(`${this.BACKEND_URL}/api/api-keys/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include',
                body: JSON.stringify({ provider })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showMessage(`API key for ${this.providers[provider].name} is valid!`, 'success');
            } else {
                this.showMessage(`API key for ${this.providers[provider].name} is invalid.`, 'error');
            }
        } catch (error) {
            console.error('Error testing key:', error);
            this.showMessage('Failed to test API key', 'error');
        }
    }

    async deleteKey(provider) {
        if (!confirm(`Are you sure you want to delete the API key for ${this.providers[provider].name}?`)) {
            return;
        }

        try {
            const token = localStorage.getItem('ai_collab_token');
            const response = await fetch(`${this.BACKEND_URL}/api/api-keys/${provider}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                credentials: 'include'
            });

            const data = await response.json();
            
            if (data.success) {
                this.showMessage(data.message, 'success');
                
                // Reload data
                await this.loadProviderStatus();
                await this.loadSavedKeys();
            } else {
                this.showMessage(data.error || 'Failed to delete API key', 'error');
            }
        } catch (error) {
            console.error('Error deleting key:', error);
            this.showMessage('Failed to delete API key', 'error');
        }
    }

    showMessage(text, type = 'info') {
        const container = document.getElementById('message-container');
        
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        
        container.appendChild(message);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            message.remove();
        }, 5000);
    }
}

// Global functions for inline event handlers
let apiKeysManager;

function toggleApiKeyVisibility() {
    const input = document.getElementById('api-key-input');
    const button = event.target;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

async function validateApiKey() {
    const provider = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('api-key-input').value;
    
    if (!provider || !apiKey) {
        apiKeysManager.showMessage('Please select a provider and enter an API key', 'error');
        return;
    }

    // Show security preview
    showSecurityPreview(apiKey);

    try {
        const token = localStorage.getItem('ai_collab_token');
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const BACKEND_URL = isProduction ? 'https://ai-collab-pro.onrender.com' : '';
        
        const response = await fetch(`${BACKEND_URL}/api/api-keys/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            credentials: 'include',
            body: JSON.stringify({ provider, apiKey })
        });

        const data = await response.json();
        
        if (data.success) {
            apiKeysManager.showMessage('API key is valid!', 'success');
        } else {
            apiKeysManager.showMessage(data.data?.error || 'API key is invalid', 'error');
        }
    } catch (error) {
        console.error('Error validating key:', error);
        apiKeysManager.showMessage('Failed to validate API key', 'error');
    }
}

// Show security preview of how the key will be stored
function showSecurityPreview(apiKey) {
    const preview = document.getElementById('security-preview');
    const originalEl = document.getElementById('preview-original');
    const encryptedEl = document.getElementById('preview-encrypted');
    const idEl = document.getElementById('preview-id');
    
    // Check if elements exist
    if (!preview || !originalEl || !encryptedEl || !idEl) {
        console.warn('Security preview elements not found');
        return;
    }
    
    // Show masked version of original key
    const maskedKey = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);
    originalEl.textContent = maskedKey;
    
    // Generate a fake encrypted representation (for demo purposes)
    const fakeEncrypted = btoa(apiKey).substring(0, 32) + '...' + btoa(apiKey).substring(btoa(apiKey).length - 8);
    encryptedEl.textContent = fakeEncrypted;
    
    // Show the last 4 characters that will be stored
    idEl.textContent = '****' + apiKey.substring(apiKey.length - 4);
    
    preview.style.display = 'block';
}

// Test API key without saving
async function testApiKey() {
    const provider = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('api-key-input').value;
    
    if (!provider || !apiKey) {
        apiKeysManager.showMessage('Please select a provider and enter an API key', 'error');
        return;
    }

    // Show test mode banner
    showTestModeBanner();

    try {
        // Create a temporary session storage for the test
        sessionStorage.setItem(`test_api_key_${provider}`, apiKey);
        
        const token = localStorage.getItem('ai_collab_token');
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const BACKEND_URL = isProduction ? 'https://ai-collab-pro.onrender.com' : '';
        
        const response = await fetch(`${BACKEND_URL}/api/api-keys/test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            credentials: 'include',
            body: JSON.stringify({ provider, apiKey, testMode: true })
        });

        const data = await response.json();
        
        if (data.success) {
            apiKeysManager.showMessage(`Test successful! ${data.message}`, 'success');
            
            // Show test results
            if (data.testResults) {
                showTestResults(data.testResults);
            }
        } else {
            apiKeysManager.showMessage(data.error || 'Test failed', 'error');
        }
    } catch (error) {
        console.error('Error testing key:', error);
        apiKeysManager.showMessage('Failed to test API key', 'error');
    } finally {
        // Clean up test key from session storage
        sessionStorage.removeItem(`test_api_key_${provider}`);
        
        // Remove test mode banner after 5 seconds
        setTimeout(() => {
            removeTestModeBanner();
        }, 5000);
    }
}

// Show test mode banner
function showTestModeBanner() {
    if (document.getElementById('test-mode-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'test-mode-banner';
    banner.className = 'test-mode-banner';
    banner.innerHTML = '🧪 TEST MODE - API key will not be saved';
    document.body.appendChild(banner);
}

// Remove test mode banner
function removeTestModeBanner() {
    const banner = document.getElementById('test-mode-banner');
    if (banner) {
        banner.remove();
    }
}

// Show test results
function showTestResults(results) {
    const container = document.createElement('div');
    container.className = 'test-results';
    container.innerHTML = `
        <h4>Test Results</h4>
        <p>Model: ${results.model || 'Unknown'}</p>
        <p>Response Time: ${results.responseTime || 'N/A'}</p>
        <p>Status: ${results.status || 'Success'}</p>
    `;
    
    const form = document.getElementById('api-key-form');
    form.appendChild(container);
    
    // Remove after 10 seconds
    setTimeout(() => {
        container.remove();
    }, 10000);
}

// Initialize API Keys Manager
function initializeApiKeys() {
    if (!window.apiKeysManager) {
        window.apiKeysManager = new ApiKeysManager();
    }
    // Also assign to global scope for inline event handlers
    apiKeysManager = window.apiKeysManager;
}

// For standalone page, initialize on DOM ready
if (window.location.pathname.includes('api-keys.html')) {
    document.addEventListener('DOMContentLoaded', initializeApiKeys);
}

// Export for settings page
window.initializeApiKeys = initializeApiKeys;