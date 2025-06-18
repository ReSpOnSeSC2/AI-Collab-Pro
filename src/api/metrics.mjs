/**
 * Metrics API Routes
 * Handles collaboration metrics, dashboard data, and analytics
 */

import express from 'express';
import metricsService from '../services/metricsService.mjs';
import { authenticateUser } from './auth-routes.mjs';

const router = express.Router();

/**
 * Get dashboard data
 * GET /api/metrics/dashboard
 */
router.get('/dashboard', authenticateUser, async (req, res) => {
  try {
    const { timeRange = 'week' } = req.query;
    const userId = req.user.userId;

    const dashboardData = await metricsService.getDashboardData(userId, timeRange);

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data'
    });
  }
});

/**
 * Get model leaderboard
 * GET /api/metrics/leaderboard
 */
router.get('/leaderboard', authenticateUser, async (req, res) => {
  try {
    const { period = 'weekly', limit = 10 } = req.query;
    
    const { ModelLeaderboard } = await import('../models/Metrics.mjs');
    
    const leaderboard = await ModelLeaderboard.find({ period })
      .sort({ 'metrics.avgQualityScore': -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve leaderboard'
    });
  }
});

/**
 * Get cost optimization suggestions
 * GET /api/metrics/cost-optimization
 */
router.get('/cost-optimization', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const suggestions = await metricsService.getCostOptimizationSuggestions(userId);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    console.error('Error getting cost optimization suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost optimization suggestions'
    });
  }
});

/**
 * Get team chemistry analysis
 * GET /api/metrics/team-chemistry
 */
router.get('/team-chemistry', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { timeRange = 'month' } = req.query;

    const { CollaborationMetrics } = await import('../models/Metrics.mjs');
    
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
    }

    const metrics = await CollaborationMetrics.find({
      userId,
      timestamp: { $gte: startDate, $lte: endDate }
    }).select('models consensusScore diversityScore synergyScore collaborationType timestamp');

    // Analyze team combinations
    const teamStats = {};
    
    metrics.forEach(metric => {
      const teamKey = metric.models.sort().join(',');
      
      if (!teamStats[teamKey]) {
        teamStats[teamKey] = {
          models: metric.models,
          count: 0,
          avgConsensus: 0,
          avgDiversity: 0,
          avgSynergy: 0,
          collaborationTypes: {}
        };
      }
      
      const team = teamStats[teamKey];
      team.count++;
      team.avgConsensus += metric.consensusScore || 0;
      team.avgDiversity += metric.diversityScore || 0;
      team.avgSynergy += metric.synergyScore || 0;
      
      team.collaborationTypes[metric.collaborationType] = 
        (team.collaborationTypes[metric.collaborationType] || 0) + 1;
    });

    // Calculate averages and sort by synergy
    const teamAnalysis = Object.values(teamStats).map(team => ({
      models: team.models,
      count: team.count,
      avgConsensus: Math.round(team.avgConsensus / team.count),
      avgDiversity: Math.round(team.avgDiversity / team.count),
      avgSynergy: Math.round(team.avgSynergy / team.count),
      preferredCollaborationType: Object.entries(team.collaborationTypes)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || null
    })).sort((a, b) => b.avgSynergy - a.avgSynergy);

    res.json({
      success: true,
      data: {
        teamAnalysis,
        timeRange,
        totalMetrics: metrics.length
      }
    });
  } catch (error) {
    console.error('Error getting team chemistry analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve team chemistry analysis'
    });
  }
});

/**
 * Record collaboration metrics (internal use)
 * This would typically be called from the collaboration endpoint
 * POST /api/metrics/record
 */
router.post('/record', authenticateUser, async (req, res) => {
  try {
    const metricsData = {
      ...req.body,
      userId: req.user.userId
    };

    const metrics = await metricsService.recordCollaborationMetrics(metricsData);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error recording metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record metrics'
    });
  }
});

/**
 * Get quality score trends
 * GET /api/metrics/quality-trends
 */
router.get('/quality-trends', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { groupBy = 'day', timeRange = 'month' } = req.query;

    const { CollaborationMetrics } = await import('../models/Metrics.mjs');
    
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
    }

    const metrics = await CollaborationMetrics.find({
      userId,
      timestamp: { $gte: startDate, $lte: endDate }
    }).select('overallQualityScore timestamp collaborationType').lean();

    // Group by time period
    const trends = {};
    
    metrics.forEach(metric => {
      const date = new Date(metric.timestamp);
      let key;
      
      switch (groupBy) {
        case 'hour':
          key = `${date.toISOString().slice(0, 13)}:00`;
          break;
        case 'day':
          key = date.toISOString().slice(0, 10);
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().slice(0, 10);
          break;
      }
      
      if (!trends[key]) {
        trends[key] = {
          date: key,
          avgQuality: 0,
          count: 0,
          byType: {}
        };
      }
      
      trends[key].avgQuality += metric.overallQualityScore;
      trends[key].count++;
      
      if (!trends[key].byType[metric.collaborationType]) {
        trends[key].byType[metric.collaborationType] = {
          avgQuality: 0,
          count: 0
        };
      }
      
      trends[key].byType[metric.collaborationType].avgQuality += metric.overallQualityScore;
      trends[key].byType[metric.collaborationType].count++;
    });

    // Calculate averages
    const trendData = Object.values(trends).map(trend => {
      trend.avgQuality = Math.round(trend.avgQuality / trend.count);
      
      for (const type in trend.byType) {
        trend.byType[type].avgQuality = 
          Math.round(trend.byType[type].avgQuality / trend.byType[type].count);
      }
      
      return trend;
    }).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: {
        trends: trendData,
        groupBy,
        timeRange
      }
    });
  } catch (error) {
    console.error('Error getting quality trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve quality trends'
    });
  }
});

export default router;