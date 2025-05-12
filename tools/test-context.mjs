/**
 * Test script for context management functionality
 *
 * This script tests the core functions of the context management system:
 * - Creating a context
 * - Adding messages
 * - Changing context modes
 * - Retrieving formatted context
 * - Resetting context
 *
 * PREREQUISITES:
 * - MongoDB server must be running (either locally or remotely)
 * - Set MONGODB_URI environment variable if not using default localhost connection
 *
 * USAGE:
 * - Run with: node tools/test-context.mjs
 * - Optionally: MONGODB_URI=mongodb://user:pass@host:port/dbname node tools/test-context.mjs
 */

import mongoose from 'mongoose';
import * as ContextManager from '../src/lib/contextManager.mjs';

// Test configuration
const TEST_USER_ID = 'test-user-123';
const TEST_SESSION_ID = 'test-session-' + Date.now();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-collab';

// Main test function
async function runTests() {
  console.log('Context Management Test Script');
  console.log('=============================');
  
  try {
    // Connect to MongoDB
    console.log(`Connecting to MongoDB at ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');
    
    // Test 1: Create a new context
    console.log('\nTest 1: Create a new context');
    const context = await ContextManager.getOrCreateContext(TEST_USER_ID, TEST_SESSION_ID);
    console.log(`Created context with ID: ${context._id}`);
    console.log(`Initial context mode: ${context.contextMode}`);
    console.log(`Initial context size: ${context.contextSize} chars`);
    
    // Test 2: Add a message to the context
    console.log('\nTest 2: Add a message to the context');
    const message1 = {
      type: 'user',
      content: 'This is a test message to check if context management is working properly.',
      timestamp: new Date(),
      models: ['claude', 'gemini']
    };
    const msgResult1 = await ContextManager.addMessageToContext(TEST_USER_ID, TEST_SESSION_ID, message1);
    console.log(`Added message, new context size: ${msgResult1.contextSize} chars`);
    
    // Test 3: Add a response to the context
    console.log('\nTest 3: Add a response to the context');
    const response1 = "I'm responding to your test message. Context management appears to be working correctly.";
    const respResult1 = await ContextManager.addResponseToContext(TEST_USER_ID, TEST_SESSION_ID, 'claude', response1);
    console.log(`Added response, new context size: ${respResult1.contextSize} chars`);
    
    // Test 4: Get formatted context (should be empty in 'none' mode)
    console.log('\nTest 4: Get formatted context in "none" mode');
    const noneContext = await ContextManager.getFormattedContextHistory(TEST_USER_ID, TEST_SESSION_ID);
    console.log(`None mode context length: ${noneContext.length} chars`);
    console.log(`None mode context: ${noneContext || '[empty string]'}`);
    
    // Test 5: Switch to summary mode
    console.log('\nTest 5: Switch to summary mode');
    const summaryResult = await ContextManager.setContextMode(TEST_USER_ID, TEST_SESSION_ID, 'summary');
    console.log(`Set context mode to: ${summaryResult.mode}`);
    
    // Add another message for better summary
    const message2 = {
      type: 'user',
      content: 'How does the context summarization feature work in this application?',
      timestamp: new Date(),
      models: ['claude', 'gemini']
    };
    await ContextManager.addMessageToContext(TEST_USER_ID, TEST_SESSION_ID, message2);
    await ContextManager.addResponseToContext(TEST_USER_ID, TEST_SESSION_ID, 'claude', 
      "The context summarization extracts key topics from messages and builds a concise summary of the conversation.");
    
    // Test 6: Get formatted context in summary mode
    console.log('\nTest 6: Get formatted context in "summary" mode');
    const summaryContext = await ContextManager.getFormattedContextHistory(TEST_USER_ID, TEST_SESSION_ID);
    console.log(`Summary mode context length: ${summaryContext.length} chars`);
    console.log(`Summary context: ${summaryContext}`);
    
    // Test 7: Switch to full mode
    console.log('\nTest 7: Switch to full mode');
    const fullResult = await ContextManager.setContextMode(TEST_USER_ID, TEST_SESSION_ID, 'full');
    console.log(`Set context mode to: ${fullResult.mode}`);
    
    // Test 8: Get formatted context in full mode
    console.log('\nTest 8: Get formatted context in "full" mode');
    const fullContext = await ContextManager.getFormattedContextHistory(TEST_USER_ID, TEST_SESSION_ID);
    console.log(`Full mode context length: ${fullContext.length} chars`);
    console.log(`Full context (truncated): ${fullContext.substring(0, 100)}...`);
    
    // Test 9: Reset the context
    console.log('\nTest 9: Reset context');
    const resetResult = await ContextManager.resetContext(TEST_USER_ID, TEST_SESSION_ID);
    console.log(`Reset context, message count: ${resetResult.messageCount}`);
    console.log(`Context mode preserved: ${resetResult.contextMode}`);
    
    // Test 10: Verify context is empty after reset
    console.log('\nTest 10: Verify context after reset');
    const emptyContext = await ContextManager.getFormattedContextHistory(TEST_USER_ID, TEST_SESSION_ID);
    console.log(`Context after reset (length): ${emptyContext.length}`);
    console.log(`Context after reset: ${emptyContext || '[empty string]'}`);
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Error during tests:', error);
  } finally {
    // Clean up test data
    try {
      const context = await ContextManager.getOrCreateContext(TEST_USER_ID, TEST_SESSION_ID);
      if (context._id) {
        await mongoose.model('Conversation').deleteOne({ _id: context._id });
        console.log(`\nTest data cleaned up: Deleted conversation ${context._id}`);
      }
    } catch (err) {
      console.error('Error cleaning up test data:', err);
    }
    
    // Close MongoDB connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the tests
runTests().catch(console.error);