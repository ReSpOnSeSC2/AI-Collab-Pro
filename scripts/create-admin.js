/**
 * Admin User Creation Script
 * Creates an admin user in the database or updates an existing user with admin privileges
 */

import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'ai_collab';
const USERS_COLLECTION = 'users';

// Admin user details
const adminEmail = 'jay1988stud@gmail.com'; // Your email
const adminName = 'Jay Admin';
const password = process.argv[2]; // Get password from command line argument

async function createOrUpdateAdmin() {
  if (!password) {
    console.error('Error: Password is required');
    console.log('Usage: node scripts/create-admin.js <password>');
    process.exit(1);
  }

  let client;
  
  try {
    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    console.log('Connected to MongoDB');
    const db = client.db(DB_NAME);
    const usersCollection = db.collection(USERS_COLLECTION);
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: adminEmail });
    
    if (existingUser) {
      console.log(`User ${adminEmail} already exists. Updating to add admin privileges...`);
      
      // Hash password if provided
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update the user to make them an admin
      const result = await usersCollection.updateOne(
        { email: adminEmail },
        { 
          $set: { 
            isAdmin: true,
            subscriptionTier: 'enterprise',
            password: hashedPassword, // Update password
            lastUpdated: new Date()
          } 
        }
      );
      
      console.log(`User updated: ${result.modifiedCount} document(s) modified`);
    } else {
      console.log(`Creating new admin user: ${adminEmail}`);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Create new admin user
      const newAdmin = {
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        subscriptionTier: 'enterprise',
        isAdmin: true,
        createdAt: new Date(),
        lastLogin: new Date()
      };
      
      const result = await usersCollection.insertOne(newAdmin);
      console.log(`Admin user created with ID: ${result.insertedId}`);
    }
    
    // Verify the admin status
    const adminUser = await usersCollection.findOne({ email: adminEmail });
    console.log('Admin user details:');
    console.log(`- Email: ${adminUser.email}`);
    console.log(`- Name: ${adminUser.name}`);
    console.log(`- Admin Status: ${adminUser.isAdmin ? 'Yes' : 'No'}`);
    console.log(`- Subscription Tier: ${adminUser.subscriptionTier}`);
    
    console.log('\nAdmin setup complete! You can now log in with these credentials.');
    
  } catch (error) {
    console.error('Error creating/updating admin user:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the function
createOrUpdateAdmin().catch(console.error);