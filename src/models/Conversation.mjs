/**
 * Conversation Model for MongoDB
 * Stores conversation history and context for AI-Collab
 */

import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['user', 'ai'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  responses: {
    type: Map,
    of: String,
    default: new Map()
  },
  models: {
    type: [String],
    default: []
  }
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true
  },
  contextMode: {
    type: String,
    enum: ['none', 'summary', 'full'],
    default: 'none'
  },
  summary: {
    type: String,
    default: ''
  },
  messages: {
    type: [MessageSchema],
    default: []
  },
  created: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  contextSize: {
    type: Number,
    default: 0
  },
  maxContextSize: {
    type: Number,
    default: 32000
  }
}, { timestamps: true });

// Compound index for efficient lookups
ConversationSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

// Calculate context size before saving
ConversationSchema.pre('save', function(next) {
  // Calculate the context size
  let size = 0;
  
  // Calculate size based on messages
  if (this.messages && this.messages.length > 0) {
    for (const message of this.messages) {
      // Add user message size
      if (message.content) {
        size += message.content.length;
      }
      
      // Add AI response sizes
      if (message.responses) {
        for (const [_, responseText] of message.responses.entries()) {
          size += responseText.length;
        }
      }
    }
  }
  
  // Add summary size
  if (this.summary) {
    size += this.summary.length;
  }
  
  this.contextSize = size;
  this.lastUpdated = new Date();
  next();
});

export const Conversation = mongoose.model('Conversation', ConversationSchema);

export default Conversation;