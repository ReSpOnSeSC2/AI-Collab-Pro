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
  // Proper admin check
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Admin privileges required' });
  }
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

export default router;