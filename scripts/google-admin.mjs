/**
 * Google Admin User Script
 * Updates an existing Google-authenticated user with admin privileges
 */

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Get current script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'ai_collab';
const USERS_COLLECTION = 'users';

// Admin user details
const adminEmail = 'jay1988stud@gmail.com'; // Your email

async function updateGoogleAdminUser() {
  let client;
  
  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    console.log('Connected to MongoDB');
    const db = client.db(DB_NAME);
    const usersCollection = db.collection(USERS_COLLECTION);
    
    // Check if user exists
    const existingUser = await usersCollection.findOne({ email: adminEmail });
    
    if (!existingUser) {
      console.error(`User ${adminEmail} does not exist. Please sign in with Google first.`);
      return;
    }
    
    console.log(`User ${adminEmail} found. Updating to add admin privileges...`);
    
    // Update the user to make them an admin without changing authentication method
    const result = await usersCollection.updateOne(
      { email: adminEmail },
      { 
        $set: { 
          isAdmin: true,
          subscriptionTier: 'enterprise',
          lastUpdated: new Date()
        } 
      }
    );
    
    console.log(`User updated: ${result.modifiedCount} document(s) modified`);
    
    // Verify the admin status
    const adminUser = await usersCollection.findOne({ email: adminEmail });
    console.log('Admin user details:');
    console.log(`- Email: ${adminUser.email}`);
    console.log(`- Name: ${adminUser.name}`);
    console.log(`- Admin Status: ${adminUser.isAdmin ? 'Yes' : 'No'}`);
    console.log(`- Subscription Tier: ${adminUser.subscriptionTier}`);
    console.log(`- Google Authentication: ${adminUser.googleId ? 'Yes' : 'No'}`);
    
    console.log('\nAdmin setup complete! You can now log in with Google authentication and have admin privileges.');
    
  } catch (error) {
    console.error('Error updating admin user:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the function
updateGoogleAdminUser().catch(console.error);