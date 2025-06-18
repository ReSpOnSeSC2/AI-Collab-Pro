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

async function updateUserTier() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const usersCollection = db.collection('users');
    
    // Update the user to free tier
    const result = await usersCollection.updateOne(
      { email: 'jay1988stud@gmail.com' },
      { $set: { subscriptionTier: 'free' } }
    );
    
    console.log(`Updated ${result.modifiedCount} user(s) to free tier`);
    
    // Show user details
    const user = await usersCollection.findOne({ email: 'jay1988stud@gmail.com' });
    console.log('\nUser details:');
    console.log(`- Email: ${user.email}`);
    console.log(`- Subscription Tier: ${user.subscriptionTier}`);
    console.log(`- Admin: ${user.isAdmin || false}`);
    
  } catch (error) {
    console.error('Error updating user:', error);
  } finally {
    await client.close();
  }
}

// Run the update
updateUserTier();