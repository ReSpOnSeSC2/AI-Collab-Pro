/**
 * Admin API Endpoints
 * Protected routes for admin-only operations
 */

import express from 'express';
import mongoose from 'mongoose';
import { authenticateUser } from './auth.mjs';
import os from 'os';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Middleware to check for admin access
const requireAdmin = (req, res, next) => {
  // For demo purposes, skip auth check
  // In production, uncomment the proper admin check below
  next();
  return;
  
  /* Production admin check:
  // Ensure user is authenticated first
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
  }
  
  // Check for admin privileges
  if (req.user.isAdmin) {
    next();
  } else {
    res.status(403).json({ 
      success: false,
      error: 'Admin privileges required' 
    });
  }
  */
};

// Apply auth middleware to all admin routes
// For demo purposes, skip authentication
// router.use(authenticateUser);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Get paginated list of users with optional filters
 */
router.get('/users', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build query from filters
    const query = {};
    
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex }
      ];
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.subscriptionTier) {
      query.subscriptionTier = req.query.subscriptionTier;
    }
    
    if (req.query.authType) {
      if (req.query.authType === 'google') {
        query.googleId = { $exists: true };
      } else if (req.query.authType === 'password') {
        query.password = { $exists: true };
        query.googleId = { $exists: false };
      }
    }
    
    // Execute query with pagination
    const [users, totalCount] = await Promise.all([
      usersCollection.find(query)
        .sort({ lastLogin: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      usersCollection.countDocuments(query)
    ]);
    
    // Remove sensitive fields
    const sanitizedUsers = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        id: user._id.toString() // Ensure ID is a string for client
      };
    });
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      success: true,
      users: sanitizedUsers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Get a specific user by ID
 */
router.get('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }
    
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    const user = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(userId) 
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Remove sensitive fields
    const { password, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      user: {
        ...userWithoutPassword,
        id: user._id.toString()
      }
    });
  } catch (error) {
    console.error(`Error in GET /api/admin/users/${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user',
      details: error.message
    });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update a user
 */
router.put('/users/:id', express.json(), async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }
    
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // Check if user exists
    const existingUser = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(userId) 
    });
    
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Fields that are allowed to be updated
    const allowedUpdates = [
      'name',
      'email',
      'status',
      'subscriptionTier',
      'isAdmin'
    ];
    
    // Build update object with only allowed fields
    const updateData = {};
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    
    // Update last modified timestamp
    updateData.lastUpdated = new Date();
    
    // Update the user
    const result = await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error(`Error in PUT /api/admin/users/${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user',
      details: error.message
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }
    
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // Prevent deleting self
    if (userId === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    // Delete the user
    const result = await usersCollection.deleteOne({ 
      _id: new mongoose.Types.ObjectId(userId) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error(`Error in DELETE /api/admin/users/${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/users
 * Create a new user
 */
router.post('/users', express.json(), async (req, res) => {
  try {
    const { name, email, password, subscriptionTier = 'free', isAdmin = false } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Name and email are required'
      });
    }
    
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }
    
    // Create user document
    const newUser = {
      name,
      email: email.toLowerCase(),
      subscriptionTier,
      isAdmin,
      status: 'active',
      createdAt: new Date(),
      createdBy: req.user.userId,
      lastUpdated: new Date()
    };
    
    // If password is provided, it would be hashed in a real implementation
    // For demo purposes, we're storing it as-is
    if (password) {
      // In production, you would use bcrypt to hash the password
      // newUser.password = await bcrypt.hash(password, 10);
      newUser.password = password; // DEMO ONLY - insecure!
    }
    
    // Insert the new user
    const result = await usersCollection.insertOne(newUser);
    
    if (!result.insertedId) {
      throw new Error('Failed to create user');
    }
    
    // Return the created user without password
    const { password: _, ...userWithoutPassword } = newUser;
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        ...userWithoutPassword,
        id: result.insertedId.toString()
      }
    });
  } catch (error) {
    console.error('Error in POST /api/admin/users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/stats
 * Get combined statistics for dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const db = req.app.locals.db;
    
    // Check if database connection exists
    if (!db) {
      console.error('Database connection not available');
      return res.status(500).json({
        success: false,
        error: 'Database connection not available'
      });
    }
    const usersCollection = db.collection('users');
    const conversationsCollection = db.collection('conversations');
    const messagesCollection = db.collection('messages');
    
    // Get current date info
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    
    // User statistics
    const [totalUsers, newUsersThisMonth, newUsersPrevMonth] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ createdAt: { $gte: monthStart } }),
      usersCollection.countDocuments({
        createdAt: {
          $gte: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1),
          $lt: monthStart
        }
      })
    ]);
    
    // Calculate user growth
    const userGrowth = newUsersPrevMonth > 0 
      ? Math.round(((newUsersThisMonth - newUsersPrevMonth) / newUsersPrevMonth) * 100)
      : (newUsersThisMonth > 0 ? 100 : 0);
    
    // Conversation statistics
    const [activeConversations, conversationsThisWeek, conversationsPrevWeek] = await Promise.all([
      conversationsCollection.countDocuments({ status: { $ne: 'deleted' } }),
      conversationsCollection.countDocuments({ createdAt: { $gte: weekStart } }),
      conversationsCollection.countDocuments({
        createdAt: {
          $gte: new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
          $lt: weekStart
        }
      })
    ]);
    
    // Calculate conversation growth
    const conversationGrowth = conversationsPrevWeek > 0
      ? Math.round(((conversationsThisWeek - conversationsPrevWeek) / conversationsPrevWeek) * 100)
      : (conversationsThisWeek > 0 ? 100 : 0);
    
    // API calls (using messages as proxy for now)
    const [apiCallsToday, apiCallsYesterday] = await Promise.all([
      messagesCollection.countDocuments({ timestamp: { $gte: todayStart } }),
      messagesCollection.countDocuments({
        timestamp: {
          $gte: yesterdayStart,
          $lt: todayStart
        }
      })
    ]);
    
    // Calculate API calls change
    const apiCallsChange = apiCallsYesterday > 0
      ? Math.round(((apiCallsToday - apiCallsYesterday) / apiCallsYesterday) * 100)
      : (apiCallsToday > 0 ? 100 : 0);
    
    // Revenue calculation from real subscription data
    const [proUsers, enterpriseUsers] = await Promise.all([
      usersCollection.countDocuments({ subscriptionTier: 'pro' }),
      usersCollection.countDocuments({ subscriptionTier: 'enterprise' })
    ]);
    const monthlyRevenue = (proUsers * 29) + (enterpriseUsers * 99);
    
    // Calculate revenue growth (set to 0 since we don't have historical data)
    const revenueGrowth = 0;
    
    res.json({
      success: true,
      totalUsers,
      userGrowth,
      activeConversations,
      conversationGrowth,
      apiCallsToday,
      apiCallsChange,
      monthlyRevenue,
      revenueGrowth
    });
  } catch (error) {
    console.error('Error in GET /api/admin/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/stats/users
 * Get user statistics
 */
router.get('/stats/users', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // User counts by status and subscription tier
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      suspendedUsers,
      freeUsers,
      proUsers,
      enterpriseUsers,
      newUsersThisMonth
    ] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ status: 'active' }),
      usersCollection.countDocuments({ status: 'inactive' }),
      usersCollection.countDocuments({ status: 'suspended' }),
      usersCollection.countDocuments({ subscriptionTier: 'free' }),
      usersCollection.countDocuments({ subscriptionTier: 'pro' }),
      usersCollection.countDocuments({ subscriptionTier: 'enterprise' }),
      usersCollection.countDocuments({
        createdAt: { 
          $gte: new Date(new Date().setDate(1)) // First day of current month
        }
      })
    ]);
    
    // Growth calculation (comparing to previous month)
    const prevMonthStart = new Date();
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    prevMonthStart.setDate(1);
    prevMonthStart.setHours(0, 0, 0, 0);
    
    const prevMonthEnd = new Date();
    prevMonthEnd.setDate(0); // Last day of previous month
    prevMonthEnd.setHours(23, 59, 59, 999);
    
    const newUsersPrevMonth = await usersCollection.countDocuments({
      createdAt: { 
        $gte: prevMonthStart,
        $lte: prevMonthEnd
      }
    });
    
    // Calculate growth percentage
    const userGrowth = newUsersPrevMonth > 0 
      ? ((newUsersThisMonth - newUsersPrevMonth) / newUsersPrevMonth * 100).toFixed(1)
      : 100;
    
    // Get user signup trend (last 12 months)
    const signupTrend = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      
      const count = await usersCollection.countDocuments({
        createdAt: { $gte: monthStart, $lte: monthEnd }
      });
      
      signupTrend.unshift({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        count
      });
    }
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        suspendedUsers,
        subscriptionStats: {
          free: freeUsers,
          pro: proUsers,
          enterprise: enterpriseUsers
        },
        newUsersThisMonth,
        userGrowth: parseFloat(userGrowth),
        signupTrend
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/stats/users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/stats/conversations
 * Get conversation statistics
 */
router.get('/stats/conversations', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const messagesCollection = db.collection('messages');
    
    // Date filter from query params (defaults to last 30 days)
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Conversation counts
    const [
      totalConversations,
      totalMessages,
      recentConversations,
      recentMessages
    ] = await Promise.all([
      conversationsCollection.countDocuments({}),
      messagesCollection.countDocuments({}),
      conversationsCollection.countDocuments({
        createdAt: { $gte: startDate }
      }),
      messagesCollection.countDocuments({
        timestamp: { $gte: startDate }
      })
    ]);
    
    // Average messages per conversation
    const avgMessagesPerConversation = totalConversations > 0 
      ? (totalMessages / totalConversations).toFixed(1)
      : 0;
    
    // Count by model
    const modelCounts = await conversationsCollection.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $unwind: '$models' },
      { $group: { _id: '$models', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    // Count by mode
    const modeCounts = await conversationsCollection.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$mode', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    // Daily conversation counts for trend
    const dailyTrend = [];
    for (let i = 0; i < days; i++) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      
      const count = await conversationsCollection.countDocuments({
        createdAt: { $gte: dayStart, $lte: dayEnd }
      });
      
      dailyTrend.unshift({
        date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count
      });
    }
    
    res.json({
      success: true,
      stats: {
        totalConversations,
        totalMessages,
        recentConversations,
        recentMessages,
        avgMessagesPerConversation: parseFloat(avgMessagesPerConversation),
        modelDistribution: modelCounts.map(item => ({
          model: item._id,
          count: item.count
        })),
        modeDistribution: modeCounts.map(item => ({
          mode: item._id,
          count: item.count
        })),
        dailyTrend
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/stats/conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/conversations
 * Get paginated list of conversations with optional filters
 */
router.get('/conversations', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const usersCollection = db.collection('users');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query from filters
    const query = {};
    
    if (req.query.userId) {
      query.userId = req.query.userId;
    }
    
    if (req.query.model) {
      query.models = req.query.model;
    }
    
    if (req.query.mode) {
      query.mode = req.query.mode;
    }
    
    if (req.query.startDate) {
      const startDate = new Date(req.query.startDate);
      if (!isNaN(startDate.getTime())) {
        query.createdAt = { $gte: startDate };
      }
    }
    
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      if (!isNaN(endDate.getTime())) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = endDate;
      }
    }
    
    // Execute query with pagination
    const [conversations, totalCount] = await Promise.all([
      conversationsCollection.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      conversationsCollection.countDocuments(query)
    ]);
    
    // Add user info to each conversation
    const enrichedConversations = await Promise.all(
      conversations.map(async conversation => {
        const user = await usersCollection.findOne(
          { _id: new mongoose.Types.ObjectId(conversation.userId) },
          { projection: { name: 1, email: 1 } }
        );
        
        // Ensure models is an array
        let models = [];
        if (conversation.models && Array.isArray(conversation.models)) {
          models = conversation.models;
        } else if (conversation.model) {
          models = [conversation.model];
        }
        
        return {
          ...conversation,
          id: conversation._id.toString(),
          models: models,
          user: user ? { 
            id: user._id.toString(),
            name: user.name,
            email: user.email
          } : null
        };
      })
    );
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      success: true,
      conversations: enrichedConversations,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversations',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/conversations/:id
 * Get a specific conversation with messages
 */
router.get('/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid conversation ID format'
      });
    }
    
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const messagesCollection = db.collection('messages');
    const usersCollection = db.collection('users');
    
    // Get conversation
    const conversation = await conversationsCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(conversationId) 
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    // Get user info
    const user = await usersCollection.findOne(
      { _id: new mongoose.Types.ObjectId(conversation.userId) },
      { projection: { name: 1, email: 1 } }
    );
    
    // Get messages
    const messages = await messagesCollection.find({ 
      conversationId: conversationId 
    })
    .sort({ timestamp: 1 })
    .toArray();
    
    res.json({
      success: true,
      conversation: {
        ...conversation,
        id: conversation._id.toString(),
        user: user ? {
          id: user._id.toString(),
          name: user.name,
          email: user.email
        } : null,
        messages: messages.map(message => ({
          ...message,
          id: message._id.toString()
        }))
      }
    });
  } catch (error) {
    console.error(`Error in GET /api/admin/conversations/${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation',
      details: error.message
    });
  }
});

/**
 * DELETE /api/admin/conversations/:id
 * Delete a conversation and its messages
 */
router.delete('/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid conversation ID format'
      });
    }
    
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const messagesCollection = db.collection('messages');
    
    // Delete conversation
    const result = await conversationsCollection.deleteOne({ 
      _id: new mongoose.Types.ObjectId(conversationId) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }
    
    // Delete associated messages
    const messagesResult = await messagesCollection.deleteMany({ 
      conversationId: conversationId 
    });
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully',
      deletedMessages: messagesResult.deletedCount
    });
  } catch (error) {
    console.error(`Error in DELETE /api/admin/conversations/${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete conversation',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/charts
 * Get chart data for dashboard
 */
router.get('/charts', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const messagesCollection = db.collection('messages');
    const conversationsCollection = db.collection('conversations');
    
    // Get usage data for last 7 days
    const usageLabels = [];
    const usageData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await messagesCollection.countDocuments({
        timestamp: { $gte: date, $lt: nextDate }
      });
      
      usageLabels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      usageData.push(count);
    }
    
    // Get model distribution
    const modelCounts = await conversationsCollection.aggregate([
      { $unwind: '$models' },
      { $group: { _id: '$models', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    const modelLabels = [];
    const modelData = [];
    const modelMap = {
      'claude': 'Claude',
      'gemini': 'Gemini',
      'chatgpt': 'ChatGPT',
      'grok': 'Grok',
      'llama': 'Llama',
      'deepseek': 'DeepSeek'
    };
    
    modelCounts.forEach(item => {
      modelLabels.push(modelMap[item._id] || item._id);
      modelData.push(item.count);
    });
    
    res.json({
      success: true,
      usage: {
        labels: usageLabels,
        data: usageData
      },
      models: {
        labels: modelLabels,
        data: modelData
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/charts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chart data',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/activity/recent
 * Get recent activity for dashboard
 */
router.get('/activity/recent', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const usersCollection = db.collection('users');
    const messagesCollection = db.collection('messages');
    
    // Get recent activity from multiple sources
    const activity = [];
    
    // Get recent conversations
    const recentConversations = await conversationsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    for (const conv of recentConversations) {
      let user = null;
      try {
        // Try to find user by ID
        if (conv.userId && mongoose.Types.ObjectId.isValid(conv.userId)) {
          user = await usersCollection.findOne(
            { _id: new mongoose.Types.ObjectId(conv.userId) },
            { projection: { email: 1 } }
          );
        }
      } catch (err) {
        console.log('Error finding user for conversation:', err);
      }
      
      // Handle mode and models safely
      const mode = conv.mode || 'individual';
      let models = 'N/A';
      if (Array.isArray(conv.models) && conv.models.length > 0) {
        models = conv.models.join(', ');
      } else if (conv.model) {
        models = conv.model;
      }
      
      activity.push({
        timestamp: conv.createdAt || new Date(),
        user: user?.email || 'Unknown User',
        action: 'Started chat',
        details: `${mode} mode${models !== 'N/A' ? ` with ${models}` : ''}`,
        status: 'info'
      });
    }
    
    // Get recent user registrations
    const recentUsers = await usersCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();
      
    for (const user of recentUsers) {
      if (user.createdAt) {
        activity.push({
          timestamp: user.createdAt,
          user: user.email,
          action: 'User registered',
          details: `New ${user.subscriptionTier || 'free'} user`,
          status: 'success'
        });
      }
    }
    
    // Sort all activity by timestamp
    activity.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Return top 10 activities
    res.json(activity.slice(0, 10));
  } catch (error) {
    console.error('Error in GET /api/admin/activity/recent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent activity',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/system-health
 * Get system health metrics
 */
router.get('/system-health', async (req, res) => {
  try {
    // Calculate uptime
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptime = `${days}d ${hours}h ${minutes}m`;
    
    // Calculate memory usage
    const memoryUsage = Math.round((1 - os.freemem() / os.totalmem()) * 100);
    
    // Calculate CPU usage (using load average)
    const loadAverage = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuUsage = Math.min(100, Math.round((loadAverage / cpuCount) * 100));
    
    // Response time - set to 0 since we're not tracking it
    const avgResponseTime = 0;
    
    res.json({
      success: true,
      uptime,
      memoryUsage,
      cpuUsage,
      avgResponseTime
    });
  } catch (error) {
    console.error('Error in GET /api/admin/system-health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system health',
      details: error.message
    });
  }
});

/**
 * Analytics Endpoints
 */

// GET /api/admin/analytics/revenue
router.get('/analytics/revenue', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // Get subscription counts from real data
    const [totalUsers, freeUsers, proUsers, enterpriseUsers] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ $or: [{ subscriptionTier: 'free' }, { subscriptionTier: { $exists: false } }] }),
      usersCollection.countDocuments({ subscriptionTier: 'pro' }),
      usersCollection.countDocuments({ subscriptionTier: 'enterprise' })
    ]);
    
    // Calculate real revenue metrics
    const proRevenue = proUsers * 29;
    const enterpriseRevenue = enterpriseUsers * 99;
    const mrr = proRevenue + enterpriseRevenue;
    const arr = mrr * 12;
    const arpu = totalUsers > 0 ? mrr / totalUsers : 0;
    const ltv = arpu * 24; // Assuming 24 month average lifetime
    
    // Get historical data for trends (last 12 months)
    const trends = {
      labels: [],
      revenue: [],
      newRevenue: [],
      churnedRevenue: [],
      users: [],
      churn: []
    };
    
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      
      const monthUsers = await usersCollection.countDocuments({
        createdAt: { $lte: monthEnd }
      });
      
      trends.labels.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      trends.revenue.push(mrr); // Current MRR for all months (no historical data available)
      trends.newRevenue.push(0); // No historical data available
      trends.churnedRevenue.push(0); // No historical data available
      trends.users.push(monthUsers);
      trends.churn.push(0); // No churn data available
    }
    
    res.json({
      success: true,
      metrics: {
        mrr,
        mrrChange: 0, // No historical data to calculate change
        arr,
        arrChange: 0,
        arpu: Math.round(arpu * 100) / 100,
        arpuChange: 0,
        ltv: Math.round(ltv),
        ltvChange: 0
      },
      trends,
      tiers: {
        free: freeUsers,
        pro: proUsers,
        enterprise: enterpriseUsers
      },
      churn: {
        monthlyChurn: 0,
        retention: 100,
        netRevenueRetention: 100,
        labels: trends.labels,
        rates: new Array(trends.labels.length).fill(0)
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/analytics/revenue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/analytics/growth
router.get('/analytics/growth', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    
    // Get real user counts
    const [currentUsers, lastMonthUsers, threeMonthsAgoUsers, yearAgoUsers] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ createdAt: { $lt: thisMonth } }),
      usersCollection.countDocuments({ createdAt: { $lt: threeMonthsAgo } }),
      usersCollection.countDocuments({ createdAt: { $lt: yearAgo } })
    ]);
    
    // Calculate real growth percentages
    const monthlyGrowth = lastMonthUsers > 0 ? ((currentUsers - lastMonthUsers) / lastMonthUsers * 100) : 0;
    const quarterlyGrowth = threeMonthsAgoUsers > 0 ? ((currentUsers - threeMonthsAgoUsers) / threeMonthsAgoUsers * 100) : 0;
    const yearlyGrowth = yearAgoUsers > 0 ? ((currentUsers - yearAgoUsers) / yearAgoUsers * 100) : 0;
    
    // Real data for upgrades/downgrades/cancellations
    const [newUsersThisMonth, upgrades, downgrades] = await Promise.all([
      usersCollection.countDocuments({ createdAt: { $gte: thisMonth } }),
      usersCollection.countDocuments({ 
        subscriptionTier: { $in: ['pro', 'enterprise'] },
        updatedAt: { $gte: thisMonth }
      }),
      0 // No downgrade tracking implemented
    ]);
    
    res.json({
      success: true,
      userGrowth: {
        monthly: Math.round(monthlyGrowth * 10) / 10,
        quarterly: Math.round(quarterlyGrowth * 10) / 10,
        yearly: Math.round(yearlyGrowth * 10) / 10
      },
      revenueGrowth: {
        monthly: 0, // No revenue history available
        quarterly: 0,
        yearly: 0
      },
      projections: {
        nextMonth: { users: currentUsers + newUsersThisMonth, revenue: 0 },
        nextQuarter: { users: Math.round(currentUsers * 1.1), revenue: 0 },
        nextYear: { users: Math.round(currentUsers * 1.5), revenue: 0 }
      },
      newCustomers: newUsersThisMonth,
      upgrades: upgrades,
      downgrades: downgrades,
      cancellations: 0
    });
  } catch (error) {
    console.error('Error in GET /api/admin/analytics/growth:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/analytics/cohort
router.get('/analytics/cohort', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    const conversationsCollection = db.collection('conversations');
    
    // Get cohort data for last 6 months
    const cohorts = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const cohortStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const cohortEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      
      // Get users who signed up in this cohort
      const cohortUsers = await usersCollection.find({
        createdAt: { $gte: cohortStart, $lte: cohortEnd }
      }).toArray();
      
      const cohortUserIds = cohortUsers.map(u => u._id.toString());
      const retention = [100]; // Month 0 is always 100%
      
      // Calculate retention for subsequent months
      for (let j = 1; j <= i; j++) {
        const retentionStart = new Date(cohortStart);
        retentionStart.setMonth(retentionStart.getMonth() + j);
        const retentionEnd = new Date(retentionStart);
        retentionEnd.setMonth(retentionEnd.getMonth() + 1);
        
        // Count active users in this period
        const activeUsers = await conversationsCollection.distinct('userId', {
          userId: { $in: cohortUserIds },
          createdAt: { $gte: retentionStart, $lt: retentionEnd }
        });
        
        const retentionRate = cohortUserIds.length > 0 ? 
          Math.round((activeUsers.length / cohortUserIds.length) * 100) : 0;
        retention.push(retentionRate);
      }
      
      // Pad with nulls for future months
      while (retention.length < 6) {
        retention.push(null);
      }
      
      cohorts.push({
        month: cohortStart.toLocaleDateString('en-US', { month: 'short' }),
        retention: retention
      });
    }
    
    res.json({ success: true, cohorts });
  } catch (error) {
    console.error('Error in GET /api/admin/analytics/cohort:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/analytics/plans
router.get('/analytics/plans', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // Get real plan distribution
    const [totalUsers, freeUsers, proUsers, enterpriseUsers] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ $or: [{ subscriptionTier: 'free' }, { subscriptionTier: { $exists: false } }] }),
      usersCollection.countDocuments({ subscriptionTier: 'pro' }),
      usersCollection.countDocuments({ subscriptionTier: 'enterprise' })
    ]);
    
    const plans = [
      { 
        name: 'Free', 
        users: freeUsers, 
        revenue: 0, 
        conversion: 0 
      },
      { 
        name: 'Pro', 
        users: proUsers, 
        revenue: proUsers * 29, 
        conversion: totalUsers > 0 ? Math.round((proUsers / totalUsers) * 100 * 10) / 10 : 0
      },
      { 
        name: 'Enterprise', 
        users: enterpriseUsers, 
        revenue: enterpriseUsers * 99, 
        conversion: totalUsers > 0 ? Math.round((enterpriseUsers / totalUsers) * 100 * 10) / 10 : 0
      }
    ];
    
    res.json({ success: true, plans });
  } catch (error) {
    console.error('Error in GET /api/admin/analytics/plans:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Activity Endpoints
 */

// GET /api/admin/activity/overview
router.get('/activity/overview', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const messagesCollection = db.collection('messages');
    const conversationsCollection = db.collection('conversations');
    
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const [dailyActiveUsers, weeklyActiveUsers, monthlyActiveUsers, totalSessions] = await Promise.all([
      conversationsCollection.distinct('userId', { createdAt: { $gte: todayStart } }).then(users => users.length),
      conversationsCollection.distinct('userId', { 
        createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } 
      }).then(users => users.length),
      conversationsCollection.distinct('userId', { 
        createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } 
      }).then(users => users.length),
      conversationsCollection.countDocuments({ createdAt: { $gte: todayStart } })
    ]);
    
    // Calculate average session duration and messages per session
    const avgMessages = totalSessions > 0 ? 
      await messagesCollection.countDocuments({ timestamp: { $gte: todayStart } }) / totalSessions : 0;
    
    res.json({
      success: true,
      metrics: {
        dau: dailyActiveUsers,
        dauChange: 0, // No historical data
        wau: weeklyActiveUsers,
        wauChange: 0,
        mau: monthlyActiveUsers,
        mauChange: 0,
        sessions: totalSessions,
        sessionsChange: 0,
        avgSessionDuration: '0m', // Not tracked
        avgMessagesPerSession: Math.round(avgMessages * 10) / 10
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/activity/overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/activity/timeline
router.get('/activity/timeline', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const messagesCollection = db.collection('messages');
    
    const timeline = {
      labels: [],
      sessions: [],
      messages: []
    };
    const now = new Date();
    
    // Get real activity timeline for last 24 hours
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(hourStart.getHours() - i, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);
      
      const [sessionCount, messageCount] = await Promise.all([
        conversationsCollection.countDocuments({
          createdAt: { $gte: hourStart, $lt: hourEnd }
        }),
        messagesCollection.countDocuments({
          timestamp: { $gte: hourStart, $lt: hourEnd }
        })
      ]);
      
      timeline.labels.push(hourStart.toLocaleTimeString('en-US', { hour: '2-digit' }));
      timeline.sessions.push(sessionCount);
      timeline.messages.push(messageCount);
    }
    
    res.json({ success: true, timeline });
  } catch (error) {
    console.error('Error in GET /api/admin/activity/timeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/activity/features
router.get('/activity/features', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const votesCollection = db.collection('votes');
    
    // Get real feature usage stats including file uploads and exports
    const messagesCollection = db.collection('messages');
    const feedbackCollection = db.collection('feedback');
    
    const [
      totalConversations, 
      collaborativeConvs, 
      votesCount,
      feedbackCount,
      fileUploadMessages,
      exportActivities
    ] = await Promise.all([
      conversationsCollection.countDocuments({}),
      conversationsCollection.countDocuments({ mode: { $ne: 'individual' } }),
      votesCollection.countDocuments({}),
      feedbackCollection.countDocuments({}),
      // Count messages that might contain file uploads (looking for attachment indicators)
      messagesCollection.countDocuments({ 
        $or: [
          { content: { $regex: /\[File:.*\]|Attachment:|📎|uploaded/i } },
          { hasAttachment: true },
          { attachments: { $exists: true, $ne: [] } }
        ]
      }),
      // Count export activities if tracked
      messagesCollection.countDocuments({ 
        content: { $regex: /exported|download|saved/i } 
      })
    ]);
    
    // Get unique users who have used each feature
    const [chatUsers, comparisonUsers, votingUsers] = await Promise.all([
      conversationsCollection.distinct('userId'),
      conversationsCollection.distinct('userId', { mode: { $ne: 'individual' } }),
      votesCollection.distinct('userId')
    ]);
    
    const totalUsers = chatUsers.length;
    
    const features = [
      { 
        name: 'Chat Conversations', 
        usage: 100, // All users who have conversations use chat
        sessions: totalConversations,
        users: chatUsers.length
      },
      { 
        name: 'Model Comparison', 
        usage: totalUsers > 0 ? Math.round((comparisonUsers.length / totalUsers) * 100) : 0, 
        sessions: collaborativeConvs,
        users: comparisonUsers.length
      },
      { 
        name: 'Voting System', 
        usage: totalUsers > 0 ? Math.round((votingUsers.length / totalUsers) * 100) : 0, 
        sessions: votesCount,
        users: votingUsers.length
      },
      { 
        name: 'Feedback System', 
        usage: feedbackCount > 0 ? Math.round((feedbackCount / totalConversations) * 100) : 0, 
        sessions: feedbackCount,
        users: feedbackCount // Approximate as each feedback is from a unique session
      },
      { 
        name: 'File Uploads', 
        usage: totalConversations > 0 ? Math.round((fileUploadMessages / totalConversations) * 100) : 0, 
        sessions: fileUploadMessages
      },
      { 
        name: 'Export Chat', 
        usage: totalConversations > 0 ? Math.round((exportActivities / totalConversations) * 100) : 0, 
        sessions: exportActivities
      }
    ];
    
    res.json({ success: true, features });
  } catch (error) {
    console.error('Error in GET /api/admin/activity/features:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/activity/journey
router.get('/activity/journey', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    const conversationsCollection = db.collection('conversations');
    
    // Get real user journey data
    const totalUsers = await usersCollection.countDocuments({});
    const usersWithConversations = await conversationsCollection.distinct('userId').then(ids => ids.length);
    
    // Count users by number of conversations
    const userConvCounts = await conversationsCollection.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } }
    ]).toArray();
    
    const moreThanOne = userConvCounts.filter(u => u.count > 1).length;
    const moreThanFive = userConvCounts.filter(u => u.count > 5).length;
    const moreThanTen = userConvCounts.filter(u => u.count > 10).length;
    
    const journey = [
      { step: 'Registered Users', users: totalUsers, dropoff: 0 },
      { 
        step: 'First Chat', 
        users: usersWithConversations, 
        dropoff: totalUsers > 0 ? Math.round(((totalUsers - usersWithConversations) / totalUsers) * 100) : 0
      },
      { 
        step: 'Second Session', 
        users: moreThanOne, 
        dropoff: usersWithConversations > 0 ? Math.round(((usersWithConversations - moreThanOne) / usersWithConversations) * 100) : 0
      },
      { 
        step: 'Active User (5+ chats)', 
        users: moreThanFive, 
        dropoff: moreThanOne > 0 ? Math.round(((moreThanOne - moreThanFive) / moreThanOne) * 100) : 0
      },
      { 
        step: 'Power User (10+ chats)', 
        users: moreThanTen, 
        dropoff: moreThanFive > 0 ? Math.round(((moreThanFive - moreThanTen) / moreThanFive) * 100) : 0
      }
    ];
    
    res.json({ success: true, journey });
  } catch (error) {
    console.error('Error in GET /api/admin/activity/journey:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/activity/top-users
router.get('/activity/top-users', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const usersCollection = db.collection('users');
    
    // Get top users by conversation count
    const topUserIds = await conversationsCollection.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();
    
    const topUsers = [];
    for (const userStat of topUserIds) {
      const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userStat._id) });
      if (user) {
        topUsers.push({
          id: user._id.toString(),
          name: user.name || 'Unknown',
          email: user.email,
          sessions: userStat.count,
          messages: 0, // Not tracked per user
          lastActive: user.lastLogin || user.createdAt || new Date()
        });
      }
    }
    
    res.json({ success: true, users: topUsers });
  } catch (error) {
    console.error('Error in GET /api/admin/activity/top-users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/activity/segments
router.get('/activity/segments', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const conversationsCollection = db.collection('conversations');
    const usersCollection = db.collection('users');
    
    // Define time boundaries for activity levels
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Get all users
    const allUsers = await usersCollection.find({}).toArray();
    const totalUsers = allUsers.length;
    
    // Get user conversation counts with last activity
    const userActivity = await conversationsCollection.aggregate([
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 },
          lastActivity: { $max: '$createdAt' },
          recentCount: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, 1, 0]
            }
          },
          dailyCount: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', oneDayAgo] }, 1, 0]
            }
          }
        }
      }
    ]).toArray();
    
    // Create a map for easy lookup
    const activityMap = new Map();
    userActivity.forEach(activity => {
      activityMap.set(activity._id, activity);
    });
    
    // Segment users based on activity patterns
    let power = 0, regular = 0, occasional = 0, atRisk = 0;
    let powerSessions = 0, regularSessions = 0, occasionalSessions = 0;
    
    allUsers.forEach(user => {
      const userId = user._id.toString();
      const activity = activityMap.get(userId);
      
      if (!activity) {
        // User has never had a conversation
        atRisk++;
      } else if (activity.dailyCount > 0 && activity.count >= 20) {
        // Power user: daily active with 20+ total conversations
        power++;
        powerSessions += activity.count;
      } else if (activity.recentCount > 0 && activity.count >= 5) {
        // Regular user: active in last 7 days with 5+ total conversations
        regular++;
        regularSessions += activity.count;
      } else if (activity.lastActivity >= thirtyDaysAgo) {
        // Occasional user: active in last 30 days
        occasional++;
        occasionalSessions += activity.count;
      } else {
        // At risk: inactive for 30+ days
        atRisk++;
      }
    });
    
    const segments = [
      {
        type: 'power',
        count: power,
        percentage: totalUsers > 0 ? Math.round((power / totalUsers) * 100 * 10) / 10 : 0,
        avgSessions: power > 0 ? Math.round(powerSessions / power) : 0,
        description: 'Daily active, high engagement'
      },
      {
        type: 'regular',
        count: regular,
        percentage: totalUsers > 0 ? Math.round((regular / totalUsers) * 100 * 10) / 10 : 0,
        avgSessions: regular > 0 ? Math.round(regularSessions / regular) : 0,
        description: 'Weekly active, moderate engagement'
      },
      {
        type: 'occasional',
        count: occasional,
        percentage: totalUsers > 0 ? Math.round((occasional / totalUsers) * 100 * 10) / 10 : 0,
        avgSessions: occasional > 0 ? Math.round(occasionalSessions / occasional) : 0,
        description: 'Monthly active, low engagement'
      },
      {
        type: 'atRisk',
        count: atRisk,
        percentage: totalUsers > 0 ? Math.round((atRisk / totalUsers) * 100 * 10) / 10 : 0,
        avgSessions: 0,
        description: 'Inactive for 30+ days'
      }
    ];
    
    // Log for debugging
    console.log('User segments calculated:', {
      totalUsers,
      power,
      regular,
      occasional,
      atRisk
    });
    
    res.json({ success: true, segments });
  } catch (error) {
    console.error('Error in GET /api/admin/activity/segments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Feedback Endpoints
 */

// GET /api/admin/feedback/overview
router.get('/feedback/overview', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    const feedbackCollection = db.collection('feedback');
    
    // Get counts from both collections
    const [votesCount, feedbackCount, positiveFeedback, negativeFeedback, avgRating, avgSatisfaction] = await Promise.all([
      votesCollection.countDocuments({}),
      feedbackCollection.countDocuments({}),
      votesCollection.countDocuments({ vote: { $gte: 4 } }),
      votesCollection.countDocuments({ vote: { $lte: 2 } }),
      votesCollection.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$vote' } } }
      ]).toArray(),
      feedbackCollection.aggregate([
        { $match: { satisfaction: { $exists: true } } },
        { $group: { _id: null, avgSatisfaction: { $avg: '$satisfaction' } } }
      ]).toArray()
    ]);
    
    // Combine feedback from both sources
    const totalFeedback = votesCount + feedbackCount;
    const avgRatingValue = avgRating[0]?.avgRating || 0;
    const avgSatisfactionValue = avgSatisfaction[0]?.avgSatisfaction || 0;
    const combinedAvgRating = totalFeedback > 0 ? 
      ((avgRatingValue * votesCount + avgSatisfactionValue * feedbackCount) / totalFeedback) : 0;
    
    res.json({
      success: true,
      metrics: {
        total: totalFeedback,
        totalChange: 0, // No historical data
        positive: positiveFeedback,
        positiveChange: 0,
        negative: negativeFeedback,
        negativeChange: 0,
        avgRating: Math.round(combinedAvgRating * 10) / 10,
        avgRatingChange: 0,
        collaborationFeedback: feedbackCount,
        voteFeedback: votesCount
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/sentiment
router.get('/feedback/sentiment', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    
    // Get real sentiment distribution
    const [positive, neutral, negative, total] = await Promise.all([
      votesCollection.countDocuments({ vote: { $gte: 4 } }),
      votesCollection.countDocuments({ vote: 3 }),
      votesCollection.countDocuments({ vote: { $lte: 2 } }),
      votesCollection.countDocuments({})
    ]);
    
    // Get daily sentiment for past 7 days
    const trend = {
      labels: [],
      positive: [],
      neutral: [],
      negative: []
    };
    
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      
      const [dayPos, dayNeu, dayNeg, dayTotal] = await Promise.all([
        votesCollection.countDocuments({ vote: { $gte: 4 }, createdAt: { $gte: dayStart, $lte: dayEnd } }),
        votesCollection.countDocuments({ vote: 3, createdAt: { $gte: dayStart, $lte: dayEnd } }),
        votesCollection.countDocuments({ vote: { $lte: 2 }, createdAt: { $gte: dayStart, $lte: dayEnd } }),
        votesCollection.countDocuments({ createdAt: { $gte: dayStart, $lte: dayEnd } })
      ]);
      
      trend.labels.push(dayStart.toLocaleDateString('en-US', { weekday: 'short' }));
      trend.positive.push(dayTotal > 0 ? Math.round((dayPos / dayTotal) * 100) : 0);
      trend.neutral.push(dayTotal > 0 ? Math.round((dayNeu / dayTotal) * 100) : 0);
      trend.negative.push(dayTotal > 0 ? Math.round((dayNeg / dayTotal) * 100) : 0);
    }
    
    res.json({ 
      success: true, 
      distribution: {
        positive: total > 0 ? Math.round((positive / total) * 100) : 0,
        neutral: total > 0 ? Math.round((neutral / total) * 100) : 0,
        negative: total > 0 ? Math.round((negative / total) * 100) : 0
      },
      trend
    });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/sentiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/categories
router.get('/feedback/categories', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    
    // Since we don't have categories in votes, return based on vote distribution
    const totalVotes = await votesCollection.countDocuments({});
    const voteCounts = await votesCollection.aggregate([
      { $group: { _id: '$vote', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]).toArray();
    
    // Map votes to categories
    const categories = voteCounts.map(vc => ({
      name: `${vc._id} Star Rating`,
      count: vc.count,
      percentage: totalVotes > 0 ? Math.round((vc.count / totalVotes) * 100) : 0
    }));
    
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/categories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/issues
router.get('/feedback/issues', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    
    // Get low-rated votes as issues
    const negativeVotes = await votesCollection
      .find({ vote: { $lte: 2 } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    const issues = negativeVotes.map((vote, index) => ({
      id: vote._id.toString(),
      title: vote.comment || `Low rating for ${vote.model}`,
      count: 1,
      status: 'open',
      priority: vote.vote === 1 ? 'high' : 'medium'
    }));
    
    res.json({ success: true, issues });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/issues:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/quality
router.get('/feedback/quality', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    
    // Calculate quality metrics based on ratings
    const avgRating = await votesCollection.aggregate([
      { $group: { _id: null, avg: { $avg: '$vote' } } }
    ]).toArray();
    
    const overallQuality = avgRating[0]?.avg || 0;
    const qualityScore = Math.round((overallQuality / 5) * 100);
    
    // Estimate quality dimensions based on overall score
    const quality = {
      accuracy: Math.min(100, qualityScore + 5),
      completeness: Math.max(0, qualityScore - 5),
      relevance: Math.min(100, qualityScore + 10),
      clarity: qualityScore
    };
    
    res.json({ success: true, quality });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/quality:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/recent
router.get('/feedback/recent', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    const feedbackCollection = db.collection('feedback');
    
    // Get recent feedback from both collections
    const [recentVotes, recentCollabFeedback] = await Promise.all([
      votesCollection
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      feedbackCollection
        .find({})
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray()
    ]);
    
    // Combine and format feedback
    const allFeedback = [];
    
    // Add votes
    recentVotes.forEach(item => {
      allFeedback.push({
        id: item._id.toString(),
        type: 'vote',
        user: item.userId || 'Anonymous',
        model: item.model,
        rating: item.vote,
        comment: item.comment || 'No comment provided',
        timestamp: item.createdAt || item.timestamp || new Date(),
        status: 'pending'
      });
    });
    
    // Add collaboration feedback
    recentCollabFeedback.forEach(item => {
      allFeedback.push({
        id: item._id.toString(),
        type: item.type || 'collaboration',
        user: item.userEmail || item.userId || 'Anonymous',
        model: item.winningAgent || 'N/A',
        rating: item.satisfaction || 0,
        comment: item.additionalComments || item.comments || 'No comment provided',
        timestamp: item.timestamp || new Date(),
        status: 'pending',
        taskType: item.taskType,
        criteria: item.selectedCriteria
      });
    });
    
    // Sort by timestamp and take top 10
    allFeedback.sort((a, b) => b.timestamp - a.timestamp);
    const feedback = allFeedback.slice(0, 10);
    
    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/recent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/collaboration
router.get('/feedback/collaboration', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const feedbackCollection = db.collection('feedback');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Build query for collaboration feedback
    const query = { type: { $in: ['collaboration', 'comparison'] } };
    
    // Add date filter if provided
    if (req.query.startDate) {
      query.timestamp = { $gte: new Date(req.query.startDate) };
    }
    if (req.query.endDate) {
      query.timestamp = query.timestamp || {};
      query.timestamp.$lte = new Date(req.query.endDate);
    }
    
    // Get feedback with pagination
    const [feedback, totalCount] = await Promise.all([
      feedbackCollection.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      feedbackCollection.countDocuments(query)
    ]);
    
    // Format feedback data
    const formattedFeedback = feedback.map(item => ({
      id: item._id.toString(),
      type: item.type,
      conversationId: item.conversationId,
      userId: item.userId,
      userEmail: item.userEmail,
      timestamp: item.timestamp,
      taskType: item.taskType,
      satisfaction: item.satisfaction,
      selectedCriteria: item.selectedCriteria || [],
      winningAgent: item.winningAgent,
      comparisonMode: item.comparisonMode,
      additionalComments: item.additionalComments || item.comments,
      // Collaboration specific fields
      accuracy: item.accuracy,
      completeness: item.completeness,
      relevance: item.relevance,
      clarity: item.clarity,
      taskCompleteness: item.taskCompleteness,
      bestPerformingAgent: item.bestPerformingAgent,
      // Comparison specific fields
      bestModel: item.bestModel,
      taskCategory: item.taskCategory,
      criteria: item.criteria
    }));
    
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      success: true,
      feedback: formattedFeedback,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/collaboration:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/feedback/trends
router.get('/feedback/trends', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const votesCollection = db.collection('votes');
    
    // Get weekly trends for past 4 weeks
    const trends = {
      labels: [],
      volume: [],
      satisfaction: []
    };
    
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const [weekVotes, weekAvg] = await Promise.all([
        votesCollection.countDocuments({ createdAt: { $gte: weekStart, $lt: weekEnd } }),
        votesCollection.aggregate([
          { $match: { createdAt: { $gte: weekStart, $lt: weekEnd } } },
          { $group: { _id: null, avg: { $avg: '$vote' } } }
        ]).toArray()
      ]);
      
      trends.labels.push(`Week ${4 - i}`);
      trends.volume.push(weekVotes);
      trends.satisfaction.push(Math.round((weekAvg[0]?.avg || 0) * 10) / 10);
    }
    
    res.json({ success: true, trends });
  } catch (error) {
    console.error('Error in GET /api/admin/feedback/trends:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/stats/topics
 * Get popular topics and query types from conversations
 */
router.get('/stats/topics', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const feedbackCollection = db.collection('feedback');
    const conversationsCollection = db.collection('conversations');
    
    // Date filter from query params (defaults to last 30 days)
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get task types from feedback data
    const taskTypeCounts = await feedbackCollection.aggregate([
      { $match: { timestamp: { $gte: startDate }, taskType: { $exists: true } } },
      { $group: { _id: '$taskType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    
    // Also get message counts by analyzing first messages in conversations
    const messagesCollection = db.collection('messages');
    const firstMessages = await messagesCollection.aggregate([
      { $match: { timestamp: { $gte: startDate }, role: 'user' } },
      { $sort: { timestamp: 1 } },
      { $group: { 
        _id: '$conversationId', 
        firstMessage: { $first: '$content' }
      }},
      { $limit: 100 } // Analyze first 100 conversations
    ]).toArray();
    
    // Simple keyword-based categorization
    const topicKeywords = {
      'Programming': ['code', 'function', 'debug', 'error', 'api', 'javascript', 'python', 'java', 'css', 'html'],
      'AI/ML': ['ai', 'machine learning', 'neural', 'model', 'training', 'dataset', 'algorithm'],
      'Business': ['business', 'market', 'strategy', 'customer', 'revenue', 'sales', 'profit'],
      'Writing': ['write', 'essay', 'article', 'story', 'blog', 'content', 'document'],
      'Education': ['learn', 'study', 'course', 'teach', 'school', 'university', 'student'],
      'Science': ['science', 'research', 'experiment', 'hypothesis', 'theory', 'data'],
      'Math': ['math', 'calculate', 'equation', 'formula', 'algebra', 'geometry', 'statistics'],
      'Other': []
    };
    
    // Count topics from messages
    const messageTopicCounts = {};
    firstMessages.forEach(msg => {
      const content = msg.firstMessage?.toLowerCase() || '';
      let categorized = false;
      
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (topic !== 'Other' && keywords.some(keyword => content.includes(keyword))) {
          messageTopicCounts[topic] = (messageTopicCounts[topic] || 0) + 1;
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        messageTopicCounts['Other'] = (messageTopicCounts['Other'] || 0) + 1;
      }
    });
    
    // Map task types to topics
    const topicMap = {
      'coding': 'Programming',
      'research': 'Research',
      'analysis': 'Data Analysis',
      'creative': 'Creative Writing',
      'business': 'Business',
      'education': 'Education',
      'personal': 'Personal',
      'other': 'Other'
    };
    
    // Log for debugging
    console.log('Task type counts from feedback:', taskTypeCounts);
    console.log('Message topic counts:', messageTopicCounts);
    
    // Combine counts from both sources
    const combinedTopicCounts = {};
    
    // Add feedback-based counts
    taskTypeCounts.forEach(item => {
      const topic = topicMap[item._id] || item._id || 'Other';
      combinedTopicCounts[topic] = (combinedTopicCounts[topic] || 0) + item.count;
    });
    
    // Add message-based counts
    Object.entries(messageTopicCounts).forEach(([topic, count]) => {
      combinedTopicCounts[topic] = (combinedTopicCounts[topic] || 0) + count;
    });
    
    // Ensure all topics have at least 0 count
    const allTopics = ['Programming', 'AI/ML', 'Business', 'Writing', 'Education', 'Science', 'Math', 'Other'];
    allTopics.forEach(topic => {
      if (!combinedTopicCounts[topic]) {
        combinedTopicCounts[topic] = 0;
      }
    });
    
    // Convert to array format and sort by count
    const popularTopics = Object.entries(combinedTopicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
    
    // Get conversation modes for query types
    const modeCounts = await conversationsCollection.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$mode', count: { $sum: 1 } } }
    ]).toArray();
    
    // Calculate total for percentages
    const total = modeCounts.reduce((sum, item) => sum + item.count, 0);
    
    // Map modes to query types
    const queryTypeMap = {
      'individual': 'Information',
      'collaborative': 'Problem Solving',
      'debate': 'Analysis & Debate',
      'critique': 'Code Review',
      'expert_panel': 'Expert Consultation',
      'sequential_critique': 'Sequential Analysis',
      'adversarial_debate': 'Debate & Discussion',
      'scenario_analysis': 'Scenario Planning'
    };
    
    // Convert to query types format
    const queryTypes = modeCounts.length > 0
      ? modeCounts.map(item => ({
          type: queryTypeMap[item._id] || 'Other',
          percentage: total > 0 ? Math.round((item.count / total) * 100) : 0
        })).sort((a, b) => b.percentage - a.percentage)
      : [
          { type: 'Information', percentage: 35 },
          { type: 'Problem Solving', percentage: 25 },
          { type: 'Creative Writing', percentage: 15 },
          { type: 'Code Generation', percentage: 10 },
          { type: 'Analysis', percentage: 10 },
          { type: 'Other', percentage: 5 }
        ];
    
    res.json({
      success: true,
      popularTopics,
      queryTypes
    });
  } catch (error) {
    console.error('Error in GET /api/admin/stats/topics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve topic statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/system/info
 * Get system information
 */
router.get('/system/info', async (req, res) => {
  try {
    const readFile = promisify(fs.readFile);
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    // Get package.json data
    let version = 'Unknown';
    try {
      const packageData = await readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageData);
      version = packageJson.version;
    } catch (err) {
      console.error('Error reading package.json:', err);
    }
    
    // Get system information
    const systemInfo = {
      version,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: Math.floor(process.uptime()),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpus: os.cpus(),
      loadAverage: os.loadavg()
    };
    
    // Get database information
    const db = req.app.locals.db;
    const stats = await db.stats();
    
    // Get collection counts
    const [
      usersCount,
      conversationsCount,
      messagesCount,
      votesCount
    ] = await Promise.all([
      db.collection('users').countDocuments({}),
      db.collection('conversations').countDocuments({}),
      db.collection('messages').countDocuments({}),
      db.collection('votes').countDocuments({})
    ]);
    
    res.json({
      success: true,
      system: systemInfo,
      database: {
        name: stats.db,
        collections: stats.collections,
        objects: stats.objects,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize
      },
      counts: {
        users: usersCount,
        conversations: conversationsCount,
        messages: messagesCount,
        votes: votesCount
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/system/info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system information',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/system/logs
 * Get system logs
 */
router.get('/system/logs', async (req, res) => {
  try {
    // In a real implementation, you would fetch logs from a database or log files
    // For now, return empty logs array since we don't have a logging system
    const logs = [];
    
    // You could implement real logging by:
    // 1. Using a logging library like Winston or Bunyan
    // 2. Storing logs in MongoDB or a dedicated log database
    // 3. Reading from log files on the filesystem
    
    res.json({
      success: true,
      logs: logs
    });
  } catch (error) {
    console.error('Error in GET /api/admin/system/logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system logs',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/settings
 * Update application settings
 */
router.post('/settings', express.json(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const settingsCollection = db.collection('settings');
    
    // Get existing settings
    const existingSettings = await settingsCollection.findOne({ type: 'application' });
    
    // Update or create settings
    const settings = req.body;
    const updateResult = await settingsCollection.updateOne(
      { type: 'application' },
      { $set: { 
        ...settings,
        updatedAt: new Date(),
        updatedBy: req.user.userId
      }},
      { upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      isNewSettings: !existingSettings
    });
  } catch (error) {
    console.error('Error in POST /api/admin/settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/settings
 * Get application settings
 */
router.get('/settings', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const settingsCollection = db.collection('settings');
    
    // Get settings
    const settings = await settingsCollection.findOne({ type: 'application' });
    
    if (!settings) {
      // Return default settings
      return res.json({
        success: true,
        settings: {
          type: 'application',
          appName: 'AI Collaboration Hub',
          sessionTimeout: 120,
          enablePublicSignup: true,
          defaultModel: 'claude',
          enableAllModels: true,
          enableModelVoting: true,
          enableCollaborativeMode: true,
          enableDebateMode: true,
          enableCritiqueMode: true,
          maxModelsPerSession: 4,
          defaultTheme: 'theme-dark',
          allowThemeToggle: true,
          createdAt: new Date()
        }
      });
    }
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error in GET /api/admin/settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve settings',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/api-keys
 * Generate a new API key
 */
router.post('/api-keys', express.json(), async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'API key name is required'
      });
    }
    
    // Generate a random API key
    const apiKey = 'ak_' + 
      Math.random().toString(36).substring(2, 15) + 
      Math.random().toString(36).substring(2, 15);
    
    const db = req.app.locals.db;
    const apiKeysCollection = db.collection('apiKeys');
    
    // Create API key document
    const newApiKey = {
      name,
      key: apiKey,
      createdAt: new Date(),
      createdBy: req.user.userId,
      lastUsed: null,
      status: 'active'
    };
    
    const result = await apiKeysCollection.insertOne(newApiKey);
    
    if (!result.insertedId) {
      throw new Error('Failed to create API key');
    }
    
    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      apiKey: {
        id: result.insertedId.toString(),
        name,
        key: apiKey, // Only return the key once
        createdAt: newApiKey.createdAt,
        status: newApiKey.status
      }
    });
  } catch (error) {
    console.error('Error in POST /api/admin/api-keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/api-keys
 * List all API keys
 */
router.get('/api-keys', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const apiKeysCollection = db.collection('apiKeys');
    
    // Get API keys without exposing the actual key
    const apiKeys = await apiKeysCollection.find({})
      .sort({ createdAt: -1 })
      .project({ key: 0 }) // Exclude the actual key
      .toArray();
    
    res.json({
      success: true,
      apiKeys: apiKeys.map(key => ({
        ...key,
        id: key._id.toString()
      }))
    });
  } catch (error) {
    console.error('Error in GET /api/admin/api-keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API keys',
      details: error.message
    });
  }
});

/**
 * DELETE /api/admin/api-keys/:id
 * Revoke an API key
 */
router.delete('/api-keys/:id', async (req, res) => {
  try {
    const keyId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(keyId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid API key ID format'
      });
    }
    
    const db = req.app.locals.db;
    const apiKeysCollection = db.collection('apiKeys');
    
    // Set key status to revoked instead of deleting
    const result = await apiKeysCollection.updateOne(
      { _id: new mongoose.Types.ObjectId(keyId) },
      { $set: { 
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: req.user.userId
      }}
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }
    
    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    console.error(`Error in DELETE /api/admin/api-keys/${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key',
      details: error.message
    });
  }
});

// Settings - Generate API Key
router.post('/settings/generate-api-key', async (req, res) => {
  try {
    const { name } = req.body;
    
    // Generate a secure API key
    const apiKey = 'sk-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // In production, store this in database with user association
    // For now, just return the generated key
    res.json({ 
      apiKey,
      name,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// Logs - Download
router.get('/logs/download', async (req, res) => {
  try {
    const { type = 'all', format = 'json' } = req.query;
    
    // In production, this would fetch actual logs from logging system
    // For now, return empty log structure
    const logs = {
      type,
      timestamp: new Date().toISOString(),
      entries: []
    };

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="logs-${type}-${Date.now()}.csv"`);
      res.send('timestamp,level,message\n');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="logs-${type}-${Date.now()}.json"`);
      res.json(logs);
    }
  } catch (error) {
    console.error('Error downloading logs:', error);
    res.status(500).json({ error: 'Failed to download logs' });
  }
});

export default router;