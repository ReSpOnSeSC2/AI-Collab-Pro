/**
 * Passport Configuration
 * Sets up authentication strategies for the application
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'ai_collab';
const USERS_COLLECTION = 'users';

let db;
let usersCollection;

/**
 * Connect to MongoDB
 */
async function connectToDatabase() {
  try {
    console.log('Passport: Connecting to MongoDB...');
    
    const options = {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true
    };
    
    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    
    db = client.db(DB_NAME);
    usersCollection = db.collection(USERS_COLLECTION);
    
    console.log('Passport: Connected to MongoDB successfully');
    
    // Create indexes for users collection if they don't exist
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ googleId: 1 }, { sparse: true });
    
    return true;
  } catch (error) {
    console.error('Passport: Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

/**
 * Initialize Passport strategies
 */
export async function initializePassport() {
  try {
    await connectToDatabase();
    
    // Serialize the user ID to the session
    passport.serializeUser((user, done) => {
      done(null, user._id.toString());
    });
    
    // Deserialize user from the session
    passport.deserializeUser(async (id, done) => {
      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });
    
    // Google OAuth Strategy
    // Determine the callback URL based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Force production URL if we detect we're on Render
    const isRender = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_NAME;
    
    const baseUrl = process.env.BACKEND_URL || (isProduction || isRender
      ? 'https://ai-collab-pro.onrender.com' 
      : (process.env.NEXTAUTH_URL || 'http://localhost:3001'));
    
    const callbackURL = `${baseUrl}/api/auth/google/callback`;
    
    console.log('Passport Google OAuth Configuration:', {
      NODE_ENV: process.env.NODE_ENV,
      BACKEND_URL: process.env.BACKEND_URL,
      RENDER: process.env.RENDER,
      isProduction,
      isRender,
      baseUrl,
      callbackURL
    });
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      scope: ['profile', 'email'],
      proxy: true, // Trust proxy headers for correct callback URL
      passReqToCallback: true // Pass request to callback for dynamic URL handling
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
        let user = await usersCollection.findOne({ googleId: profile.id });
        
        if (!user) {
          // Try to find by email
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          if (email) {
            user = await usersCollection.findOne({ email: email.toLowerCase() });
          }
          
          if (user) {
            // Update existing user with Google ID
            await usersCollection.updateOne(
              { _id: user._id },
              { 
                $set: { 
                  googleId: profile.id,
                  profileImage: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
                  lastLogin: new Date()
                } 
              }
            );
            user.googleId = profile.id;
          } else {
            // Create new user
            const newUser = {
              googleId: profile.id,
              name: profile.displayName,
              email: email ? email.toLowerCase() : null,
              profileImage: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
              subscriptionTier: 'free',
              createdAt: new Date(),
              lastLogin: new Date()
            };
            
            const result = await usersCollection.insertOne(newUser);
            newUser._id = result.insertedId;
            user = newUser;
          }
        } else {
          // Update last login
          await usersCollection.updateOne(
            { _id: user._id },
            { $set: { lastLogin: new Date() } }
          );
        }
        
        return done(null, user);
      } catch (error) {
        console.error('Error in Google strategy:', error);
        return done(error, null);
      }
    }));
    
    console.log('Passport: Authentication strategies initialized');
    return true;
  } catch (error) {
    console.error('Error initializing Passport:', error);
    throw error;
  }
}

// Export Passport for use in other modules
export default passport;