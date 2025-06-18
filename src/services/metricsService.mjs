/**
 * Metrics Service
 * Handles collaboration metrics collection, calculation, and analysis
 */

import { CollaborationMetrics, ModelLeaderboard } from '../models/Metrics.mjs';

class MetricsService {
  /**
   * Record metrics for a collaboration session
   */
  async recordCollaborationMetrics(data) {
    try {
      const {
        sessionId,
        userId,
        collaborationType,
        models,
        responses,
        startTime,
        endTime,
        costs,
        userFeedback
      } = data;

      // Calculate duration
      const totalDuration = endTime - startTime;

      // Calculate quality scores based on various factors
      const qualityMetrics = this.calculateQualityScores(responses);

      // Calculate team chemistry metrics
      const chemistryMetrics = this.calculateTeamChemistry(responses, collaborationType);

      // Prepare model metrics
      const modelMetrics = models.map((model, index) => {
        const response = responses[model];
        return {
          model: model.split(':')[1], // Extract model name
          provider: model.split(':')[0], // Extract provider
          responseTime: response.responseTime || 0,
          tokenCount: response.tokenCount || 0,
          cost: costs[model] || 0,
          qualityScore: qualityMetrics.modelScores[model] || 0,
          errorRate: response.error ? 100 : 0
        };
      });

      // Create metrics record
      const metrics = new CollaborationMetrics({
        sessionId,
        userId,
        collaborationType,
        models,
        overallQualityScore: qualityMetrics.overallScore,
        totalCost: Object.values(costs).reduce((sum, cost) => sum + cost, 0),
        totalDuration,
        totalTokens: modelMetrics.reduce((sum, m) => sum + m.tokenCount, 0),
        modelMetrics,
        consensusScore: chemistryMetrics.consensus,
        diversityScore: chemistryMetrics.diversity,
        synergyScore: chemistryMetrics.synergy,
        userSatisfactionScore: userFeedback?.rating || null,
        userFeedback: userFeedback?.comment || null
      });

      await metrics.save();

      // Update leaderboard
      await this.updateLeaderboard(modelMetrics, new Date());

      return metrics;
    } catch (error) {
      console.error('Error recording collaboration metrics:', error);
      throw error;
    }
  }

  /**
   * Calculate quality scores for responses
   */
  calculateQualityScores(responses) {
    const modelScores = {};
    let totalScore = 0;
    let count = 0;

    for (const [model, response] of Object.entries(responses)) {
      if (response.error) {
        modelScores[model] = 0;
        continue;
      }

      // Calculate score based on various factors
      let score = 50; // Base score

      // Length factor (reasonable length is good)
      const length = response.content?.length || 0;
      if (length > 100 && length < 5000) {
        score += 10;
      } else if (length > 5000) {
        score += 5;
      }

      // Response time factor (faster is better)
      const responseTime = response.responseTime || 0;
      if (responseTime < 2000) {
        score += 20;
      } else if (responseTime < 5000) {
        score += 10;
      }

      // Vote factor (if available)
      if (response.votes) {
        const voteRatio = response.votes.up / (response.votes.up + response.votes.down + 1);
        score += voteRatio * 20;
      }

      modelScores[model] = Math.min(100, Math.max(0, score));
      totalScore += modelScores[model];
      count++;
    }

    return {
      modelScores,
      overallScore: count > 0 ? totalScore / count : 0
    };
  }

  /**
   * Calculate team chemistry metrics
   */
  calculateTeamChemistry(responses, collaborationType) {
    const responseContents = Object.values(responses)
      .filter(r => !r.error && r.content)
      .map(r => r.content);

    if (responseContents.length < 2) {
      return { consensus: 0, diversity: 0, synergy: 0 };
    }

    // Calculate consensus (similarity between responses)
    let consensusScore = 0;
    let diversityScore = 0;
    let synergyScore = 50; // Base synergy score

    // Simple similarity check based on common words
    const wordSets = responseContents.map(content => 
      new Set(content.toLowerCase().match(/\b\w+\b/g) || [])
    );

    let totalPairs = 0;
    let totalSimilarity = 0;

    for (let i = 0; i < wordSets.length; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const intersection = new Set([...wordSets[i]].filter(x => wordSets[j].has(x)));
        const union = new Set([...wordSets[i], ...wordSets[j]]);
        const similarity = intersection.size / union.size;
        
        totalSimilarity += similarity;
        totalPairs++;
      }
    }

    consensusScore = totalPairs > 0 ? (totalSimilarity / totalPairs) * 100 : 0;
    diversityScore = 100 - consensusScore; // Inverse of consensus

    // Adjust synergy based on collaboration type
    if (collaborationType === 'sequential' || collaborationType === 'critique') {
      synergyScore += 20; // These modes typically have better synergy
    } else if (collaborationType === 'small-team') {
      synergyScore += 10;
    }

    return {
      consensus: Math.round(consensusScore),
      diversity: Math.round(diversityScore),
      synergy: Math.round(synergyScore)
    };
  }

  /**
   * Update model leaderboard
   */
  async updateLeaderboard(modelMetrics, date) {
    try {
      const periods = ['daily', 'weekly', 'monthly', 'all-time'];
      
      for (const metric of modelMetrics) {
        for (const period of periods) {
          const periodDate = this.getPeriodDate(date, period);
          
          // Find or create leaderboard entry
          const query = {
            model: metric.model,
            provider: metric.provider,
            period,
            date: periodDate
          };

          const update = {
            $inc: {
              'metrics.totalRequests': 1,
              'metrics.avgQualityScore': metric.qualityScore,
              'metrics.avgResponseTime': metric.responseTime,
              'metrics.avgCost': metric.cost
            }
          };

          await ModelLeaderboard.findOneAndUpdate(
            query,
            update,
            { upsert: true, new: true }
          );
        }
      }

      // Recalculate averages
      await this.recalculateLeaderboardAverages(date);
    } catch (error) {
      console.error('Error updating leaderboard:', error);
    }
  }

  /**
   * Get period date for leaderboard
   */
  getPeriodDate(date, period) {
    const d = new Date(date);
    
    switch (period) {
      case 'daily':
        d.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case 'all-time':
        return new Date('2000-01-01');
    }
    
    return d;
  }

  /**
   * Recalculate leaderboard averages
   */
  async recalculateLeaderboardAverages(date) {
    // This would be run periodically to ensure averages are correct
    // Implementation depends on specific requirements
  }

  /**
   * Get metrics dashboard data
   */
  async getDashboardData(userId, timeRange = 'week') {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      switch (timeRange) {
        case 'day':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      // Get collaboration metrics
      const metrics = await CollaborationMetrics.find({
        userId,
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: 1 });

      // Get leaderboard data
      const leaderboard = await ModelLeaderboard.find({
        period: 'daily',
        date: { $gte: startDate, $lte: endDate }
      }).sort({ 'metrics.avgQualityScore': -1 });

      // Calculate aggregated stats
      const stats = this.calculateAggregatedStats(metrics);

      return {
        metrics,
        leaderboard,
        stats,
        timeRange,
        startDate,
        endDate
      };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * Calculate aggregated statistics
   */
  calculateAggregatedStats(metrics) {
    if (metrics.length === 0) {
      return {
        totalCollaborations: 0,
        avgQualityScore: 0,
        totalCost: 0,
        avgCost: 0,
        avgDuration: 0,
        topCollaborationType: null,
        avgConsensus: 0,
        avgDiversity: 0,
        avgSynergy: 0
      };
    }

    const totalCollaborations = metrics.length;
    const totalCost = metrics.reduce((sum, m) => sum + m.totalCost, 0);
    const avgQualityScore = metrics.reduce((sum, m) => sum + m.overallQualityScore, 0) / totalCollaborations;
    const avgCost = totalCost / totalCollaborations;
    const avgDuration = metrics.reduce((sum, m) => sum + m.totalDuration, 0) / totalCollaborations;

    // Find top collaboration type
    const typeCounts = {};
    metrics.forEach(m => {
      typeCounts[m.collaborationType] = (typeCounts[m.collaborationType] || 0) + 1;
    });
    const topCollaborationType = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Calculate chemistry averages
    const chemistryMetrics = metrics.filter(m => 
      m.consensusScore !== null && m.diversityScore !== null && m.synergyScore !== null
    );
    
    const avgConsensus = chemistryMetrics.length > 0
      ? chemistryMetrics.reduce((sum, m) => sum + m.consensusScore, 0) / chemistryMetrics.length
      : 0;
    
    const avgDiversity = chemistryMetrics.length > 0
      ? chemistryMetrics.reduce((sum, m) => sum + m.diversityScore, 0) / chemistryMetrics.length
      : 0;
    
    const avgSynergy = chemistryMetrics.length > 0
      ? chemistryMetrics.reduce((sum, m) => sum + m.synergyScore, 0) / chemistryMetrics.length
      : 0;

    return {
      totalCollaborations,
      avgQualityScore: Math.round(avgQualityScore),
      totalCost: totalCost.toFixed(2),
      avgCost: avgCost.toFixed(2),
      avgDuration: Math.round(avgDuration / 1000), // Convert to seconds
      topCollaborationType,
      avgConsensus: Math.round(avgConsensus),
      avgDiversity: Math.round(avgDiversity),
      avgSynergy: Math.round(avgSynergy)
    };
  }

  /**
   * Get cost optimization suggestions
   */
  async getCostOptimizationSuggestions(userId) {
    try {
      // Get recent metrics
      const recentMetrics = await CollaborationMetrics.find({
        userId,
        timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      });

      const suggestions = [];

      // Analyze cost vs quality
      const modelCostEfficiency = {};
      
      recentMetrics.forEach(metric => {
        metric.modelMetrics.forEach(modelMetric => {
          const key = `${modelMetric.provider}:${modelMetric.model}`;
          if (!modelCostEfficiency[key]) {
            modelCostEfficiency[key] = {
              totalCost: 0,
              totalQuality: 0,
              count: 0
            };
          }
          
          modelCostEfficiency[key].totalCost += modelMetric.cost;
          modelCostEfficiency[key].totalQuality += modelMetric.qualityScore;
          modelCostEfficiency[key].count += 1;
        });
      });

      // Calculate efficiency scores
      const efficiencyScores = [];
      
      for (const [model, data] of Object.entries(modelCostEfficiency)) {
        const avgCost = data.totalCost / data.count;
        const avgQuality = data.totalQuality / data.count;
        const efficiency = avgQuality / (avgCost + 0.01); // Avoid division by zero
        
        efficiencyScores.push({
          model,
          avgCost,
          avgQuality,
          efficiency,
          count: data.count
        });
      }

      // Sort by efficiency
      efficiencyScores.sort((a, b) => b.efficiency - a.efficiency);

      // Generate suggestions
      if (efficiencyScores.length > 0) {
        const mostEfficient = efficiencyScores[0];
        const leastEfficient = efficiencyScores[efficiencyScores.length - 1];

        if (mostEfficient.model !== leastEfficient.model) {
          suggestions.push({
            type: 'model_switch',
            priority: 'high',
            message: `Consider using ${mostEfficient.model} more often. It provides ${mostEfficient.efficiency.toFixed(2)}x better quality per dollar compared to ${leastEfficient.model}.`,
            potentialSavings: ((leastEfficient.avgCost - mostEfficient.avgCost) * leastEfficient.count).toFixed(2)
          });
        }
      }

      // Analyze collaboration types
      const collaborationTypeStats = {};
      
      recentMetrics.forEach(metric => {
        if (!collaborationTypeStats[metric.collaborationType]) {
          collaborationTypeStats[metric.collaborationType] = {
            totalCost: 0,
            totalQuality: 0,
            count: 0
          };
        }
        
        collaborationTypeStats[metric.collaborationType].totalCost += metric.totalCost;
        collaborationTypeStats[metric.collaborationType].totalQuality += metric.overallQualityScore;
        collaborationTypeStats[metric.collaborationType].count += 1;
      });

      // Find most cost-effective collaboration type
      let bestCollabType = null;
      let bestCollabEfficiency = 0;
      
      for (const [type, stats] of Object.entries(collaborationTypeStats)) {
        const avgCost = stats.totalCost / stats.count;
        const avgQuality = stats.totalQuality / stats.count;
        const efficiency = avgQuality / (avgCost + 0.01);
        
        if (efficiency > bestCollabEfficiency) {
          bestCollabEfficiency = efficiency;
          bestCollabType = type;
        }
      }

      if (bestCollabType) {
        suggestions.push({
          type: 'collaboration_type',
          priority: 'medium',
          message: `The "${bestCollabType}" collaboration type offers the best quality-to-cost ratio for your usage patterns.`,
          efficiency: bestCollabEfficiency.toFixed(2)
        });
      }

      return {
        suggestions,
        efficiencyScores,
        totalAnalyzed: recentMetrics.length
      };
    } catch (error) {
      console.error('Error getting cost optimization suggestions:', error);
      throw error;
    }
  }
}

export default new MetricsService();