/**
 * API Route Handler for Votes and Ratings
 * Handles storing and retrieving vote data for AI responses
 */

import express from 'express';
import { 
  recordVote, 
  getVotesForConversation, 
  getVotingStatistics,
  getIndividualVsCollaborativeStats,
  getFeedbackTextAnalysis,
  shouldEnableVotingForQuestion
} from '../services/voteService.mjs';

const router = express.Router();

// Middleware to check for admin access
const requireAdmin = (req, res, next) => {
  // For demo purposes, skip auth check
  // In production, uncomment the proper admin check below
  next();
  return;
  
  /* Production admin check:
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Admin privileges required' });
  }
  */
};

// POST /api/votes - Record a vote
router.post('/', express.json(), async (req, res) => {
  try {
    const { 
      userId, 
      sessionId, 
      messageIndex, 
      modelId, 
      rating, 
      questionType, 
      question,
      mode,
      collaborationStyle,
      feedback 
    } = req.body;
    
    // Validate required fields
    if (!userId || !sessionId || messageIndex === undefined || 
        !modelId || !rating || !questionType || !question || !mode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate rating
    if (rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10' });
    }
    
    const result = await recordVote(
      userId, 
      sessionId, 
      messageIndex, 
      modelId, 
      rating, 
      questionType, 
      question,
      mode,
      collaborationStyle,
      feedback
    );
    
    res.json({ success: true, vote: result });
  } catch (error) {
    console.error('API Error (POST /votes):', error);
    res.status(500).json({ error: 'Failed to record vote', details: error.message });
  }
});

// GET /api/votes/conversation/:sessionId - Get votes for a conversation
router.get('/conversation/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing required userId parameter' });
    }
    
    const votes = await getVotesForConversation(userId, sessionId);
    
    res.json({ success: true, votes });
  } catch (error) {
    console.error(`API Error (GET /votes/conversation/${req.params.sessionId}):`, error);
    res.status(500).json({ error: 'Failed to get votes', details: error.message });
  }
});

// GET /api/votes/should-enable - Check if voting should be enabled for a question
router.get('/should-enable', (req, res) => {
  try {
    const { questionId } = req.query;
    
    if (!questionId) {
      return res.status(400).json({ error: 'Missing required questionId parameter' });
    }
    
    const shouldEnable = shouldEnableVotingForQuestion(questionId);
    
    res.json({ success: true, shouldEnable });
  } catch (error) {
    console.error('API Error (GET /votes/should-enable):', error);
    res.status(500).json({ error: 'Failed to check voting eligibility', details: error.message });
  }
});

// --- Admin endpoints (protected) ---

// GET /api/votes/statistics - Get voting statistics
router.get('/statistics', requireAdmin, async (req, res) => {
  try {
    const { modelId, questionType, mode } = req.query;
    const stats = await getVotingStatistics(modelId, questionType, mode);
    
    res.json({ success: true, statistics: stats });
  } catch (error) {
    console.error('API Error (GET /votes/statistics):', error);
    res.status(500).json({ error: 'Failed to get voting statistics', details: error.message });
  }
});

// GET /api/votes/comparative - Get comparison between individual and collaborative modes
router.get('/comparative', requireAdmin, async (req, res) => {
  try {
    const comparison = await getIndividualVsCollaborativeStats();
    
    res.json({ success: true, comparison });
  } catch (error) {
    console.error('API Error (GET /votes/comparative):', error);
    res.status(500).json({ error: 'Failed to get comparative statistics', details: error.message });
  }
});

// GET /api/votes/feedback-analysis - Get analysis of feedback text
router.get('/feedback-analysis', requireAdmin, async (req, res) => {
  try {
    const analysis = await getFeedbackTextAnalysis();
    
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('API Error (GET /votes/feedback-analysis):', error);
    res.status(500).json({ error: 'Failed to get feedback analysis', details: error.message });
  }
});

// GET /api/votes/growth-stats - Get growth statistics for votes
router.get('/growth-stats', requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    const feedbackCollection = db.collection('feedback');
    
    // Get current date boundaries
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    // Get vote counts for this week and last week
    const [votesThisWeek, votesLastWeek] = await Promise.all([
      votesCollection.countDocuments({ createdAt: { $gte: weekAgo } }),
      votesCollection.countDocuments({ 
        createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } 
      })
    ]);
    
    // Calculate votes percentage change
    const votesChange = votesLastWeek > 0 
      ? ((votesThisWeek - votesLastWeek) / votesLastWeek * 100).toFixed(1)
      : votesThisWeek > 0 ? 100 : 0;
    
    // Get feedback counts
    const [feedbackTotal, feedbackThisWeek, feedbackLastWeek] = await Promise.all([
      feedbackCollection.countDocuments({}),
      feedbackCollection.countDocuments({ timestamp: { $gte: weekAgo } }),
      feedbackCollection.countDocuments({ 
        timestamp: { $gte: twoWeeksAgo, $lt: weekAgo } 
      })
    ]);
    
    // Calculate feedback percentage change
    const feedbackChange = feedbackLastWeek > 0
      ? ((feedbackThisWeek - feedbackLastWeek) / feedbackLastWeek * 100).toFixed(1)
      : feedbackThisWeek > 0 ? 100 : 0;
    
    // Get unique users who voted
    const [usersThisWeek, usersLastWeek, totalUniqueUsers] = await Promise.all([
      votesCollection.distinct('userId', { createdAt: { $gte: weekAgo } }),
      votesCollection.distinct('userId', { 
        createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } 
      }),
      votesCollection.distinct('userId')
    ]);
    
    // Calculate user percentage change
    const userChange = usersLastWeek.length > 0
      ? ((usersThisWeek.length - usersLastWeek.length) / usersLastWeek.length * 100).toFixed(1)
      : usersThisWeek.length > 0 ? 100 : 0;
    
    // Get average ratings for comparison
    const [ratingsThisWeek, ratingsLastWeek] = await Promise.all([
      votesCollection.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, avgRating: { $avg: '$vote' } } }
      ]).toArray(),
      votesCollection.aggregate([
        { $match: { createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } } },
        { $group: { _id: null, avgRating: { $avg: '$vote' } } }
      ]).toArray()
    ]);
    
    const avgRatingThisWeek = ratingsThisWeek[0]?.avgRating || 0;
    const avgRatingLastWeek = ratingsLastWeek[0]?.avgRating || 0;
    
    // Calculate rating percentage change
    const ratingChange = avgRatingLastWeek > 0
      ? ((avgRatingThisWeek - avgRatingLastWeek) / avgRatingLastWeek * 100).toFixed(1)
      : 0;
    
    res.json({
      success: true,
      votesChange: parseFloat(votesChange),
      feedbackChange: parseFloat(feedbackChange),
      userChange: parseFloat(userChange),
      ratingChange: parseFloat(ratingChange),
      feedbackCount: feedbackTotal,
      uniqueUsers: totalUniqueUsers.length,
      // Additional context data
      votesThisWeek,
      votesLastWeek,
      avgRatingThisWeek: parseFloat(avgRatingThisWeek.toFixed(1)),
      avgRatingLastWeek: parseFloat(avgRatingLastWeek.toFixed(1))
    });
  } catch (error) {
    console.error('API Error (GET /votes/growth-stats):', error);
    res.status(500).json({ error: 'Failed to get growth statistics', details: error.message });
  }
});

export default router;