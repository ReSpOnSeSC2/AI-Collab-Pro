/**
 * Enhanced Collaboration Module with Metrics Recording
 * Wraps the original collaboration functions with metrics tracking
 */

import { runCollab as originalRunCollab } from './collaboration.mjs';
import metricsService from '../../services/metricsService.mjs';
import apiKeyService from '../../services/apiKeyService.mjs';
import clientFactory from './clientFactory.mjs';

/**
 * Enhanced collaboration function with metrics recording
 */
export async function runCollab(options) {
    const startTime = Date.now();
    const { userId, sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` } = options;
    
    let result;
    let error;
    
    try {
        // Run the original collaboration
        result = await originalRunCollab({
            ...options,
            sessionId
        });
        
    } catch (err) {
        error = err;
        throw err;
    } finally {
        // Record metrics regardless of success/failure
        try {
            await recordCollaborationMetrics({
                ...options,
                sessionId,
                userId,
                startTime,
                endTime: Date.now(),
                result,
                error
            });
        } catch (metricsError) {
            console.error('Error recording metrics:', metricsError);
            // Don't throw - we don't want metrics failures to affect the main operation
        }
        
        // Update usage statistics
        if (userId && result?.totalCost) {
            try {
                await apiKeyService.updateUsageStats(userId, result.totalCost, result.totalTokens);
            } catch (usageError) {
                console.error('Error updating usage stats:', usageError);
            }
        }
    }
    
    return result;
}

/**
 * Record metrics for a collaboration session
 */
async function recordCollaborationMetrics(data) {
    const {
        sessionId,
        userId,
        mode = 'individual',
        agents = [],
        startTime,
        endTime,
        result,
        error
    } = data;
    
    if (!userId) {
        // Skip metrics recording for anonymous users
        return;
    }
    
    // Prepare responses data
    const responses = {};
    const costs = {};
    
    if (result) {
        // Extract individual model responses and costs
        if (result.responses) {
            Object.entries(result.responses).forEach(([model, response]) => {
                responses[model] = {
                    content: response,
                    responseTime: result.responseTimes?.[model] || 0,
                    tokenCount: result.tokenCounts?.[model] || 0,
                    error: false
                };
                costs[model] = result.costs?.[model] || 0;
            });
        }
        
        // Handle any errors in individual models
        if (result.errors) {
            Object.entries(result.errors).forEach(([model, errorMsg]) => {
                responses[model] = {
                    content: '',
                    error: true,
                    errorMessage: errorMsg
                };
                costs[model] = 0;
            });
        }
    }
    
    // Map collaboration mode
    const collaborationType = mapCollaborationMode(mode);
    
    // Record metrics
    await metricsService.recordCollaborationMetrics({
        sessionId,
        userId,
        collaborationType,
        models: agents,
        responses,
        startTime,
        endTime,
        costs,
        userFeedback: null // This can be added later via a separate endpoint
    });
}

/**
 * Map internal collaboration modes to metric types
 */
function mapCollaborationMode(mode) {
    const modeMap = {
        'individual': 'parallel',
        'round_table': 'sequential',
        'debate': 'critique',
        'voting': 'voting',
        'team': 'small-team'
    };
    
    return modeMap[mode] || 'parallel';
}

/**
 * Get available providers for a user (considering their API keys)
 */
export async function getAvailableProviders(userId) {
    if (!userId) {
        // For anonymous users, return system-available providers
        const { availability } = await import('./index.mjs');
        return Object.keys(availability).filter(key => availability[key]);
    }
    
    return clientFactory.getAvailableProviders(userId);
}

/**
 * Create an enhanced AI client that uses user API keys
 */
export async function createUserAwareClient(userId, provider) {
    return clientFactory.getClient(userId, provider);
}

// Export the enhanced client factory
export { clientFactory };

// Re-export other functions from the original collaboration module
export * from './collaboration.mjs';