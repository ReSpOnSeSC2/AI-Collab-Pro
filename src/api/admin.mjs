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
};

// Apply auth middleware to all admin routes
router.use(authenticateUser);
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
        
        return {
          ...conversation,
          id: conversation._id.toString(),
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
    // For demo purposes, we'll return mock logs
    
    const now = new Date();
    const logs = [];
    
    // Generate sample logs for the last 24 hours
    for (let i = 0; i < 100; i++) {
      const timestamp = new Date(now);
      timestamp.setMinutes(now.getMinutes() - i * 15);
      
      const logTypes = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
      const logType = logTypes[Math.floor(Math.random() * logTypes.length)];
      
      const sources = ['server.js', 'database.js', 'auth.js', 'api.js', 'websocket.js', 'users.js'];
      const source = sources[Math.floor(Math.random() * sources.length)];
      
      const messages = {
        INFO: [
          'Server started on port 3001',
          'Connected to MongoDB database',
          'New user registered',
          'User logged in',
          'Configuration loaded from .env file'
        ],
        WARN: [
          'Failed login attempt',
          'Rate limit warning',
          'Database connection slow',
          'API endpoint deprecated',
          'Memory usage high'
        ],
        ERROR: [
          'API rate limit exceeded',
          'Database connection error',
          'Authentication failed',
          'File not found',
          'Internal server error'
        ],
        DEBUG: [
          'WebSocket connection established',
          'Request processed in 120ms',
          'Cache hit ratio: 78%',
          'Memory cleanup completed',
          'Background task scheduled'
        ]
      };
      
      const message = messages[logType][Math.floor(Math.random() * messages[logType].length)];
      
      logs.push({
        timestamp: timestamp.toISOString(),
        level: logType,
        source,
        message
      });
    }
    
    // Filter logs by level if requested
    const level = req.query.level;
    let filteredLogs = logs;
    
    if (level === 'error') {
      filteredLogs = logs.filter(log => log.level === 'ERROR');
    } else if (level === 'warn') {
      filteredLogs = logs.filter(log => ['ERROR', 'WARN'].includes(log.level));
    } else if (level === 'info') {
      filteredLogs = logs.filter(log => ['ERROR', 'WARN', 'INFO'].includes(log.level));
    }
    
    res.json({
      success: true,
      logs: filteredLogs
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

export default router;