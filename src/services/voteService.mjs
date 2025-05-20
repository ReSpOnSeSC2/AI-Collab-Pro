/**
 * Vote Service
 * Handles voting and rating functionality for AI responses
 */

import mongoose from 'mongoose';
import { Vote } from '../models/Vote.mjs';
import { Conversation } from '../models/Conversation.mjs';

/**
 * Determines if a specific message/question should be selected for voting
 * Randomly selects 2% of questions for voting
 * @param {String} questionId - Unique identifier for the question
 * @returns {Boolean} - true if this question should include voting UI
 */
export function shouldEnableVotingForQuestion(questionId) {
  // Create a deterministic hash from the questionId
  let hash = 0;
  for (let i = 0; i < questionId.length; i++) {
    const char = questionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use the hash to determine if this question should have voting (2% chance)
  return Math.abs(hash % 100) < 2;
}

/**
 * Record a vote for an AI response
 * @param {String} userId - User ID
 * @param {String} sessionId - Session ID
 * @param {Number} messageIndex - Index of the message in the conversation
 * @param {String} modelId - Model ID (e.g., claude, gemini)
 * @param {Number} rating - Rating from 1-10
 * @param {String} questionType - Category of the question
 * @param {String} question - The question text
 * @param {String} mode - individual or collaborative
 * @param {String} collaborationStyle - Style of collaboration if applicable
 * @param {String} feedback - Optional feedback text from user
 */
export async function recordVote(userId, sessionId, messageIndex, modelId, rating, questionType, question, mode, collaborationStyle = null, feedback = '') {
  try {
    // Get the conversation to find the message
    const conversation = await Conversation.findOne({ userId, sessionId });
    if (!conversation || !conversation.messages[messageIndex]) {
      throw new Error('Message not found');
    }
    
    // Get message ID (or create one if needed)
    const message = conversation.messages[messageIndex];
    let messageId = message._id;
    
    if (!messageId) {
      // If no _id exists, create one and save
      message._id = new mongoose.Types.ObjectId();
      messageId = message._id;
      await conversation.save();
    }
    
    // Upsert the vote (create or update)
    const result = await Vote.findOneAndUpdate(
      { userId, sessionId, messageId, modelId },
      { 
        rating, 
        questionType, 
        question,
        mode,
        collaborationStyle,
        feedback 
      },
      { upsert: true, new: true }
    );
    
    return result;
  } catch (error) {
    console.error('Error in recordVote:', error);
    throw error;
  }
}

/**
 * Get votes for a conversation
 * @param {String} userId - User ID
 * @param {String} sessionId - Session ID
 */
export async function getVotesForConversation(userId, sessionId) {
  try {
    return await Vote.find({ userId, sessionId }).sort({ timestamp: -1 });
  } catch (error) {
    console.error('Error in getVotesForConversation:', error);
    throw error;
  }
}

/**
 * Get aggregated voting statistics
 * @param {String} modelId - Optional model ID to filter by
 * @param {String} questionType - Optional question type to filter by
 * @param {String} mode - Optional mode to filter by (individual/collaborative)
 */
export async function getVotingStatistics(modelId = null, questionType = null, mode = null) {
  try {
    // Build match stage based on provided filters
    const matchStage = {};
    if (modelId) matchStage.modelId = modelId;
    if (questionType) matchStage.questionType = questionType;
    if (mode) matchStage.mode = mode;
    
    const stats = await Vote.aggregate([
      { $match: matchStage },
      { $group: {
        _id: {
          modelId: '$modelId',
          questionType: '$questionType',
          mode: '$mode'
        },
        averageRating: { $avg: '$rating' },
        count: { $sum: 1 },
        ratingsDistribution: {
          $push: '$rating'
        }
      }},
      { $project: {
        _id: 0,
        modelId: '$_id.modelId',
        questionType: '$_id.questionType',
        mode: '$_id.mode',
        averageRating: 1,
        count: 1,
        ratingsDistribution: 1
      }}
    ]);
    
    // Process the ratings distribution for better reporting
    stats.forEach(stat => {
      // Create a distribution object showing count of each rating
      const distribution = {};
      for (let i = 1; i <= 10; i++) {
        distribution[i] = stat.ratingsDistribution.filter(r => r === i).length;
      }
      stat.ratingsDistribution = distribution;
    });
    
    return stats;
  } catch (error) {
    console.error('Error in getVotingStatistics:', error);
    throw error;
  }
}

/**
 * Get a detailed comparative analysis between individual and collaborative modes
 */
export async function getIndividualVsCollaborativeStats() {
  try {
    const stats = await Vote.aggregate([
      { $group: {
        _id: {
          mode: '$mode',
          questionType: '$questionType'
        },
        averageRating: { $avg: '$rating' },
        count: { $sum: 1 }
      }},
      { $project: {
        _id: 0,
        mode: '$_id.mode',
        questionType: '$_id.questionType',
        averageRating: 1,
        count: 1
      }},
      { $sort: { questionType: 1, mode: 1 }}
    ]);
    
    // Restructure for easier comparison
    const comparison = {};
    stats.forEach(stat => {
      if (!comparison[stat.questionType]) {
        comparison[stat.questionType] = { individual: null, collaborative: null };
      }
      comparison[stat.questionType][stat.mode] = {
        averageRating: stat.averageRating,
        count: stat.count
      };
    });
    
    return comparison;
  } catch (error) {
    console.error('Error in getIndividualVsCollaborativeStats:', error);
    throw error;
  }
}

/**
 * Get statistics on feedback text using simple keyword analysis
 */
export async function getFeedbackTextAnalysis() {
  try {
    // Get all feedback texts that aren't empty
    const feedbackTexts = await Vote.find(
      { feedback: { $ne: '' } },
      { feedback: 1, mode: 1, modelId: 1 }
    );
    
    // Simple keyword analysis
    const keywords = [
      'helpful', 'accurate', 'informative', 'thorough', 'clear',
      'confusing', 'wrong', 'incorrect', 'unhelpful', 'misleading',
      'creative', 'innovative', 'thoughtful', 'insightful', 'detailed'
    ];
    
    const analysis = {
      totalFeedbackCount: feedbackTexts.length,
      keywordFrequency: {},
      byModel: {},
      byMode: {
        individual: { count: 0, keywords: {} },
        collaborative: { count: 0, keywords: {} }
      }
    };
    
    // Initialize keyword counters
    keywords.forEach(keyword => {
      analysis.keywordFrequency[keyword] = 0;
      analysis.byMode.individual.keywords[keyword] = 0;
      analysis.byMode.collaborative.keywords[keyword] = 0;
    });
    
    // Process each feedback text
    feedbackTexts.forEach(item => {
      const lowerFeedback = item.feedback.toLowerCase();
      const modelId = item.modelId;
      const mode = item.mode;
      
      // Initialize model stats if not exists
      if (!analysis.byModel[modelId]) {
        analysis.byModel[modelId] = { count: 0, keywords: {} };
        keywords.forEach(keyword => {
          analysis.byModel[modelId].keywords[keyword] = 0;
        });
      }
      
      // Increment mode counter
      analysis.byMode[mode].count++;
      analysis.byModel[modelId].count++;
      
      // Check for each keyword
      keywords.forEach(keyword => {
        if (lowerFeedback.includes(keyword)) {
          analysis.keywordFrequency[keyword]++;
          analysis.byMode[mode].keywords[keyword]++;
          analysis.byModel[modelId].keywords[keyword]++;
        }
      });
    });
    
    return analysis;
  } catch (error) {
    console.error('Error in getFeedbackTextAnalysis:', error);
    throw error;
  }
}