import express from 'express';
import { authenticateUser } from './auth.mjs';

const router = express.Router();

// Apply authentication middleware
router.use(authenticateUser);

/**
 * POST /api/feedback
 * Submit user feedback
 */
router.post('/', express.json(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const feedbackCollection = db.collection('feedback');
    
    const { type, conversationId, ...feedbackData } = req.body;
    
    // Create feedback document
    const feedback = {
      type, // 'collaboration' or 'comparison'
      conversationId,
      userId: req.user.userId,
      userEmail: req.user.email,
      timestamp: new Date(),
      ...feedbackData
    };
    
    // Store feedback
    const result = await feedbackCollection.insertOne(feedback);
    
    if (!result.insertedId) {
      throw new Error('Failed to save feedback');
    }
    
    // Update vote statistics if it's a comparison feedback
    if (type === 'comparison' && feedbackData.bestModel) {
      const votesCollection = db.collection('votes');
      await votesCollection.insertOne({
        model: feedbackData.bestModel,
        vote: 5, // Best model gets a 5-star rating
        userId: req.user.userId,
        conversationId,
        category: feedbackData.taskCategory,
        criteria: feedbackData.criteria,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      message: 'Thank you for your feedback!',
      feedbackId: result.insertedId.toString()
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save feedback'
    });
  }
});

/**
 * GET /api/feedback/stats
 * Get feedback statistics for the current user
 */
router.get('/stats', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const feedbackCollection = db.collection('feedback');
    
    const stats = await feedbackCollection.aggregate([
      {
        $match: { userId: req.user.userId }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgSatisfaction: { $avg: '$satisfaction' }
        }
      }
    ]).toArray();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting feedback stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get feedback statistics'
    });
  }
});

export default router;