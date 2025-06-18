#!/usr/bin/env node

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexus-ai-hub';

async function seedTestData() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const usersCollection = db.collection('users');
    
    // Create test users with different subscription tiers
    const testUsers = [
      // Pro users
      ...Array(15).fill(null).map((_, i) => ({
        name: `Pro User ${i + 1}`,
        email: `prouser${i + 1}@example.com`,
        password: 'password123',
        subscriptionTier: 'pro',
        status: 'active',
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // Random date in last 90 days
        lastLogin: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date in last 7 days
        isAdmin: false
      })),
      
      // Enterprise users
      ...Array(5).fill(null).map((_, i) => ({
        name: `Enterprise User ${i + 1}`,
        email: `enterprise${i + 1}@example.com`,
        password: 'password123',
        subscriptionTier: 'enterprise',
        status: 'active',
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
        lastLogin: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        isAdmin: false
      })),
      
      // Free users
      ...Array(30).fill(null).map((_, i) => ({
        name: `Free User ${i + 1}`,
        email: `freeuser${i + 1}@example.com`,
        password: 'password123',
        subscriptionTier: 'free',
        status: 'active',
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
        lastLogin: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Some haven't logged in for a while
        isAdmin: false
      }))
    ];
    
    // Insert test users
    const result = await usersCollection.insertMany(testUsers);
    console.log(`Inserted ${result.insertedCount} test users`);
    
    // Create some conversations for these users
    const conversationsCollection = db.collection('conversations');
    const userIds = result.insertedIds;
    
    const conversations = [];
    Object.values(userIds).forEach((userId, index) => {
      // Each user gets 1-5 random conversations
      const numConversations = Math.floor(Math.random() * 5) + 1;
      for (let i = 0; i < numConversations; i++) {
        conversations.push({
          userId: userId.toString(),
          title: `Conversation ${i + 1}`,
          models: ['claude', 'gemini', 'chatgpt'].slice(0, Math.floor(Math.random() * 3) + 1),
          mode: ['individual', 'collaborative', 'debate'][Math.floor(Math.random() * 3)],
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          lastActivity: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
          status: 'active'
        });
      }
    });
    
    if (conversations.length > 0) {
      const convResult = await conversationsCollection.insertMany(conversations);
      console.log(`Inserted ${convResult.insertedCount} test conversations`);
    }
    
    console.log('\nTest data seeded successfully!');
    console.log('Summary:');
    console.log('- 30 Free users');
    console.log('- 15 Pro users ($29/month each = $435 MRR)');
    console.log('- 5 Enterprise users ($99/month each = $495 MRR)');
    console.log('- Total MRR: $930');
    console.log('- Total users: 50 (plus any existing users)');
    
  } catch (error) {
    console.error('Error seeding test data:', error);
  } finally {
    await client.close();
  }
}

// Run the seeding
seedTestData();