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

async function removeTestUsers() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const usersCollection = db.collection('users');
    
    // Remove test users (all users with example.com emails except the original user)
    const result = await usersCollection.deleteMany({
      email: { 
        $regex: '@example.com$',
        $ne: 'user@example.com' // Keep the original test user
      }
    });
    
    console.log(`Removed ${result.deletedCount} test users`);
    
    // Show remaining users
    const remainingUsers = await usersCollection.find({}).toArray();
    console.log(`\nRemaining users: ${remainingUsers.length}`);
    remainingUsers.forEach(user => {
      console.log(`- ${user.email} (${user.subscriptionTier || 'free'})`);
    });
    
  } catch (error) {
    console.error('Error removing test users:', error);
  } finally {
    await client.close();
  }
}

// Run the removal
removeTestUsers();