/**
 * Vote Model for MongoDB
 * Stores user votes and ratings for AI responses
 */

import mongoose from 'mongoose';

const VoteSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true
  },
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  modelId: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  questionType: {
    type: String,
    enum: [
      // STEM Fields
      'algebra',
      'geometry',
      'calculus',
      'statistics',
      'probability',
      'physics',
      'chemistry',
      'biology',
      'astronomy',
      'earth_science',
      'computer_science',
      'programming',
      'algorithms',
      'data_structures',
      'web_development',
      'mobile_development',
      'devops',
      'cybersecurity',
      'ai_and_ml',
      'deep_learning',
      'natural_language_processing',
      'computer_vision',
      'robotics',
      'data_science',
      'data_analysis',
      'big_data',
      'blockchain',
      'cryptocurrency',
      'quantum_computing',
      'engineering',
      'electrical_engineering',
      'mechanical_engineering',
      'civil_engineering',
      'biotechnology',
      'genetics',
      
      // Social Sciences
      'psychology',
      'sociology',
      'anthropology',
      'economics',
      'political_science',
      'international_relations',
      'history',
      'archaeology',
      'geography',
      'urban_planning',
      'demography',
      'linguistics',
      
      // Humanities
      'philosophy',
      'ethics',
      'logic',
      'literature',
      'creative_writing',
      'poetry',
      'drama',
      'religion',
      'theology',
      'classical_studies',
      'art_history',
      'visual_arts',
      'music',
      'music_theory',
      'film_studies',
      'media_studies',
      
      // Business & Finance
      'marketing',
      'advertising',
      'sales',
      'entrepreneurship',
      'management',
      'human_resources',
      'finance',
      'accounting',
      'investment',
      'real_estate',
      'banking',
      'insurance',
      'taxation',
      'e-commerce',
      
      // Health & Medicine
      'medicine',
      'anatomy',
      'physiology',
      'pharmacology',
      'nutrition',
      'fitness',
      'mental_health',
      'public_health',
      'epidemiology',
      'nursing',
      'dentistry',
      
      // Law & Politics
      'law',
      'constitutional_law',
      'criminal_law',
      'civil_law',
      'international_law',
      'politics',
      'government',
      'public_policy',
      'public_administration',
      
      // Other Categories
      'education',
      'pedagogy',
      'language_learning',
      'cooking',
      'culinary_arts',
      'gardening',
      'home_improvement',
      'travel',
      'tourism',
      'sports',
      'gaming',
      'game_design',
      'entertainment',
      'fashion',
      'lifestyle',
      'environment',
      'sustainability',
      'parenting',
      'relationships',
      'other'
    ],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  mode: {
    type: String,
    enum: ['individual', 'collaborative'],
    required: true
  },
  collaborationStyle: {
    type: String,
    default: null
  },
  feedback: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index for efficient lookups and to ensure one vote per user per response
VoteSchema.index({ userId: 1, sessionId: 1, messageId: 1, modelId: 1 }, { unique: true });

export const Vote = mongoose.model('Vote', VoteSchema);

export default Vote;