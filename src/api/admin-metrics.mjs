import express from 'express';
import { authenticateUser } from './auth.mjs';
import User from '../models/User.mjs';
import { CollaborationMetrics } from '../models/Metrics.mjs';
import Conversation from '../models/Conversation.mjs';

const router = express.Router();

// Middleware to check for admin access
const requireAdmin = (req, res, next) => {
  // For demo purposes, skip auth check
  // In production, uncomment the proper admin check below
  next();
  
  /*
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
  */
};

// Middleware to require authentication
const requireAuth = (req, res, next) => {
  // For demo purposes, skip auth check
  // In production, use authenticateUser middleware
  next();
};

// Get API Keys Overview
router.get('/api-keys-overview', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Get all users with their provider status (NOT actual keys)
        const users = await User.find({}, {
            email: 1,
            name: 1,
            picture: 1,
            'usage.totalRequests': 1,
            'usage.totalCost': 1,
            'usage.lastRequestDate': 1
        }).lean();
        
        // We need to manually check which providers are configured without exposing keys
        const usersWithProviderStatus = await User.aggregate([
            {
                $project: {
                    email: 1,
                    name: 1,
                    picture: 1,
                    usage: 1,
                    providers: {
                        openai: { $cond: [{ $gt: ['$apiKeys.openai', null] }, true, false] },
                        anthropic: { $cond: [{ $gt: ['$apiKeys.anthropic', null] }, true, false] },
                        google: { $cond: [{ $gt: ['$apiKeys.google', null] }, true, false] },
                        deepseek: { $cond: [{ $gt: ['$apiKeys.deepseek', null] }, true, false] },
                        grok: { $cond: [{ $gt: ['$apiKeys.grok', null] }, true, false] },
                        llama: { $cond: [{ $gt: ['$apiKeys.llama', null] }, true, false] }
                    }
                }
            }
        ]);

        // Calculate overview stats
        const overview = {
            totalUsersWithKeys: 0,
            totalActiveKeys: 0,
            totalRequests: 0,
            totalCost: 0
        };

        const providerStats = {
            openai: 0,
            anthropic: 0,
            google: 0,
            deepseek: 0,
            grok: 0,
            llama: 0
        };

        const processedUsers = usersWithProviderStatus.map(user => {
            const activeProviders = Object.entries(user.providers || {})
                .filter(([_, isActive]) => isActive)
                .map(([provider, _]) => provider);

            const hasProviders = activeProviders.length > 0;

            if (hasProviders) overview.totalUsersWithKeys++;
            overview.totalActiveKeys += activeProviders.length;
            overview.totalRequests += user.usage?.totalRequests || 0;
            overview.totalCost += user.usage?.totalCost || 0;

            // Count providers
            activeProviders.forEach(provider => {
                if (providerStats[provider] !== undefined) {
                    providerStats[provider]++;
                }
            });

            return {
                email: user.email,
                name: user.name || 'Unknown',
                picture: user.picture,
                providers: user.providers || {}, // Only provider status, not actual keys
                hasActiveKeys: hasProviders,
                totalRequests: user.usage?.totalRequests || 0,
                totalCost: user.usage?.totalCost || 0,
                lastApiActivity: user.usage?.lastRequestDate
            };
        });

        res.json({
            overview,
            providerStats,
            users: processedUsers
        });
    } catch (error) {
        console.error('Error fetching API keys overview:', error);
        res.status(500).json({ error: 'Failed to fetch API keys data' });
    }
});

// Get User Metrics
router.get('/user-metrics', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { timeRange = 30, tier = 'all', mode = 'all' } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeRange));

        // Build query
        const metricsQuery = { timestamp: { $gte: startDate } };
        if (mode !== 'all') metricsQuery.collaborationType = mode;

        // Get metrics
        const metrics = await CollaborationMetrics.find(metricsQuery).lean();
        
        // Get user data
        const userQuery = {};
        if (tier !== 'all') userQuery.tier = tier;
        const users = await User.find(userQuery).lean();

        // Process quality trend
        const qualityTrend = processQualityTrend(metrics, timeRange);

        // Calculate engagement
        const engagement = calculateEngagement(metrics, users.length);

        // Process user metrics
        const userMetricsMap = new Map();
        
        metrics.forEach(metric => {
            const userId = metric.userId;
            if (!userMetricsMap.has(userId)) {
                userMetricsMap.set(userId, {
                    collaborationCount: 0,
                    totalQuality: 0,
                    totalCost: 0,
                    modes: {},
                    models: {}
                });
            }

            const userMetric = userMetricsMap.get(userId);
            userMetric.collaborationCount++;
            userMetric.totalQuality += metric.qualityScore || 0;
            userMetric.totalCost += metric.totalCost || 0;
            
            // Track modes
            if (metric.collaborationType) {
                userMetric.modes[metric.collaborationType] = (userMetric.modes[metric.collaborationType] || 0) + 1;
            }
            
            // Track models
            if (metric.modelsUsed) {
                metric.modelsUsed.forEach(model => {
                    userMetric.models[model] = (userMetric.models[model] || 0) + 1;
                });
            }
        });

        // Build user list with metrics
        const processedUsers = users.map(user => {
            const metrics = userMetricsMap.get(user._id.toString()) || {
                collaborationCount: 0,
                totalQuality: 0,
                totalCost: 0,
                modes: {},
                models: {}
            };

            const avgQuality = metrics.collaborationCount > 0 
                ? metrics.totalQuality / metrics.collaborationCount 
                : 0;

            // Find favorite mode
            const favoriteMode = Object.entries(metrics.modes)
                .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

            // Find favorite models
            const favoriteModels = Object.entries(metrics.models)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([model]) => model);

            return {
                email: user.email,
                name: user.name || 'Unknown',
                picture: user.picture,
                collaborationCount: metrics.collaborationCount,
                avgQuality,
                totalCost: metrics.totalCost,
                favoriteMode,
                favoriteModels
            };
        });

        // Process model combinations
        const modelCombinations = processModelCombinations(metrics);

        // Generate activity heatmap
        const activityHeatmap = generateActivityHeatmap(metrics);

        res.json({
            qualityTrend,
            engagement,
            users: processedUsers,
            modelCombinations,
            activityHeatmap
        });
    } catch (error) {
        console.error('Error fetching user metrics:', error);
        res.status(500).json({ error: 'Failed to fetch user metrics' });
    }
});

// Export Provider Report (NO API KEYS EXPOSED)
router.get('/export-provider-report', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Get provider status without exposing actual keys
        const usersWithProviderStatus = await User.aggregate([
            {
                $project: {
                    email: 1,
                    name: 1,
                    usage: 1,
                    createdAt: 1,
                    providers: {
                        openai: { $cond: [{ $gt: ['$apiKeys.openai', null] }, 'Yes', 'No'] },
                        anthropic: { $cond: [{ $gt: ['$apiKeys.anthropic', null] }, 'Yes', 'No'] },
                        google: { $cond: [{ $gt: ['$apiKeys.google', null] }, 'Yes', 'No'] },
                        deepseek: { $cond: [{ $gt: ['$apiKeys.deepseek', null] }, 'Yes', 'No'] },
                        grok: { $cond: [{ $gt: ['$apiKeys.grok', null] }, 'Yes', 'No'] },
                        llama: { $cond: [{ $gt: ['$apiKeys.llama', null] }, 'Yes', 'No'] }
                    }
                }
            }
        ]);

        // Create CSV
        const csv = [
            'Email,Name,OpenAI,Anthropic,Google,DeepSeek,Grok,Llama,Total Requests,Total Cost,Account Created',
            ...usersWithProviderStatus.map(user => {
                return [
                    user.email,
                    user.name || 'Unknown',
                    user.providers.openai,
                    user.providers.anthropic,
                    user.providers.google,
                    user.providers.deepseek,
                    user.providers.grok,
                    user.providers.llama,
                    user.usage?.totalRequests || 0,
                    user.usage?.totalCost || 0,
                    new Date(user.createdAt).toISOString().split('T')[0]
                ].join(',');
            })
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=provider-usage-report-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting provider report:', error);
        res.status(500).json({ error: 'Failed to export report' });
    }
});

// Export Metrics Report
router.get('/export-metrics-report', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { timeRange = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(timeRange));

        const metrics = await CollaborationMetrics.find({
            timestamp: { $gte: startDate }
        }).populate('userId', 'email name').lean();

        // Create CSV
        const csv = [
            'Date,User Email,User Name,Collaboration Type,Quality Score,Total Cost,Models Used,Duration',
            ...metrics.map(metric => {
                return [
                    new Date(metric.timestamp).toISOString(),
                    metric.userId?.email || 'Unknown',
                    metric.userId?.name || 'Unknown',
                    metric.collaborationType || 'Unknown',
                    metric.qualityScore || 0,
                    metric.totalCost || 0,
                    (metric.modelsUsed || []).join(';'),
                    metric.duration || 0
                ].join(',');
            })
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=user-metrics-report-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting metrics report:', error);
        res.status(500).json({ error: 'Failed to export report' });
    }
});

// Helper Functions
function processQualityTrend(metrics, timeRange) {
    const days = parseInt(timeRange);
    const labels = [];
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dayMetrics = metrics.filter(m => {
            const mDate = new Date(m.timestamp);
            return mDate >= date && mDate < nextDate;
        });
        
        const avgQuality = dayMetrics.length > 0
            ? dayMetrics.reduce((sum, m) => sum + (m.qualityScore || 0), 0) / dayMetrics.length
            : 0;
        
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        data.push(avgQuality);
    }
    
    return { labels, data };
}

function calculateEngagement(metrics, totalUsers) {
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    
    const uniqueUsers = new Set();
    const dailyUsers = new Set();
    const weeklyUsers = new Set();
    const monthlyUsers = new Set();
    
    metrics.forEach(m => {
        const userId = m.userId;
        const date = new Date(m.timestamp);
        
        uniqueUsers.add(userId);
        
        if (date >= monthAgo) monthlyUsers.add(userId);
        if (date >= weekAgo) weeklyUsers.add(userId);
        if (date >= dayAgo) dailyUsers.add(userId);
    });
    
    return {
        daily: dailyUsers.size,
        weekly: weeklyUsers.size,
        monthly: monthlyUsers.size
    };
}

function processModelCombinations(metrics) {
    const combinations = new Map();
    
    metrics.forEach(metric => {
        if (metric.modelsUsed && metric.modelsUsed.length > 0) {
            const key = metric.modelsUsed.sort().join('+');
            
            if (!combinations.has(key)) {
                combinations.set(key, {
                    models: metric.modelsUsed,
                    usageCount: 0,
                    totalQuality: 0
                });
            }
            
            const combo = combinations.get(key);
            combo.usageCount++;
            combo.totalQuality += metric.qualityScore || 0;
        }
    });
    
    return Array.from(combinations.values())
        .map(combo => ({
            ...combo,
            avgQuality: combo.usageCount > 0 ? combo.totalQuality / combo.usageCount : 0
        }))
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 10);
}

function generateActivityHeatmap(metrics) {
    const weeks = 12;
    const heatmap = [];
    
    for (let w = weeks - 1; w >= 0; w--) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date();
            date.setDate(date.getDate() - (w * 7 + d));
            date.setHours(0, 0, 0, 0);
            
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const count = metrics.filter(m => {
                const mDate = new Date(m.timestamp);
                return mDate >= date && mDate < nextDate;
            }).length;
            
            week.push({
                date: date.toISOString().split('T')[0],
                count
            });
        }
        heatmap.push(week);
    }
    
    return heatmap;
}

export default router;