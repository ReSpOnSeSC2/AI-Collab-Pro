/**
 * Metrics Model for MongoDB
 * Stores collaboration metrics, performance data, and quality scores
 */

import mongoose from 'mongoose';

// Schema for individual model performance metrics
const ModelPerformanceSchema = new mongoose.Schema({
  model: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  responseTime: {
    type: Number, // in milliseconds
    required: true
  },
  tokenCount: {
    type: Number,
    default: 0
  },
  cost: {
    type: Number, // in USD
    default: 0
  },
  qualityScore: {
    type: Number, // 0-100
    default: null
  },
  errorRate: {
    type: Number, // percentage
    default: 0
  }
}, { _id: false });

// Schema for collaboration session metrics
const CollaborationMetricsSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  collaborationType: {
    type: String,
    enum: ['parallel', 'sequential', 'voting', 'critique', 'small-team'],
    required: true
  },
  models: {
    type: [String],
    required: true
  },
  // Overall metrics
  overallQualityScore: {
    type: Number, // 0-100
    required: true
  },
  totalCost: {
    type: Number, // in USD
    required: true
  },
  totalDuration: {
    type: Number, // in milliseconds
    required: true
  },
  totalTokens: {
    type: Number,
    default: 0
  },
  // Individual model metrics
  modelMetrics: {
    type: [ModelPerformanceSchema],
    default: []
  },
  // Team chemistry metrics
  consensusScore: {
    type: Number, // 0-100, how well models agreed
    default: null
  },
  diversityScore: {
    type: Number, // 0-100, how diverse the responses were
    default: null
  },
  synergyScore: {
    type: Number, // 0-100, how well models built on each other
    default: null
  },
  // User feedback
  userSatisfactionScore: {
    type: Number, // 1-5
    default: null
  },
  userFeedback: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Schema for model leaderboard statistics
const ModelLeaderboardSchema = new mongoose.Schema({
  model: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'all-time'],
    required: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  metrics: {
    avgQualityScore: {
      type: Number,
      default: 0
    },
    avgResponseTime: {
      type: Number,
      default: 0
    },
    avgCost: {
      type: Number,
      default: 0
    },
    totalRequests: {
      type: Number,
      default: 0
    },
    errorRate: {
      type: Number,
      default: 0
    },
    userPreferenceScore: {
      type: Number, // based on votes/feedback
      default: 0
    },
    collaborationSuccessRate: {
      type: Number, // percentage of successful collaborations
      default: 0
    }
  }
}, { timestamps: true });

// Compound indexes for efficient queries
CollaborationMetricsSchema.index({ userId: 1, timestamp: -1 });
CollaborationMetricsSchema.index({ collaborationType: 1, timestamp: -1 });
CollaborationMetricsSchema.index({ overallQualityScore: -1 });

ModelLeaderboardSchema.index({ model: 1, provider: 1, period: 1, date: -1 });
ModelLeaderboardSchema.index({ period: 1, date: -1, 'metrics.avgQualityScore': -1 });

// Models
export const CollaborationMetrics = mongoose.model('CollaborationMetrics', CollaborationMetricsSchema);
export const ModelLeaderboard = mongoose.model('ModelLeaderboard', ModelLeaderboardSchema);

export default { CollaborationMetrics, ModelLeaderboard };