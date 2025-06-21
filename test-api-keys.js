/**
 * Test script to debug API key issues
 * Run with: node test-api-keys.js <userId>
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/User.mjs';
import apiKeyService from './src/services/apiKeyService.mjs';

dotenv.config();

const userId = process.argv[2];

if (!userId) {
    console.error('Usage: node test-api-keys.js <userId>');
    process.exit(1);
}

async function test() {
    try {
        console.log('🔍 Testing API Keys for userId:', userId);
        console.log('===================================\n');

        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-collab';
        console.log('📦 Connecting to MongoDB:', mongoUri);
        
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Find user directly
        console.log('🔍 Looking up user in database...');
        const user = await User.findById(userId);
        
        if (!user) {
            console.log('❌ User not found with ID:', userId);
            
            // Try to find any user
            const anyUser = await User.findOne({});
            if (anyUser) {
                console.log('\n📋 Sample user found:');
                console.log('  - ID:', anyUser._id.toString());
                console.log('  - Email:', anyUser.email);
                console.log('  - Name:', anyUser.name);
            }
            
            process.exit(1);
        }

        console.log('✅ User found:');
        console.log('  - ID:', user._id.toString());
        console.log('  - Email:', user.email);
        console.log('  - Name:', user.name);
        console.log('  - API Keys Count:', user.apiKeys ? user.apiKeys.length : 0);

        if (user.apiKeys && user.apiKeys.length > 0) {
            console.log('\n📋 Stored API Keys:');
            user.apiKeys.forEach(key => {
                console.log(`  - ${key.provider}: ${key.keyId} (Valid: ${key.isValid})`);
            });
        }

        // Test API key retrieval
        console.log('\n🔑 Testing API Key Retrieval:');
        const providers = ['anthropic', 'google', 'openai', 'grok', 'deepseek', 'llama'];
        
        for (const provider of providers) {
            try {
                const keyInfo = await apiKeyService.getApiKey(userId, provider);
                if (keyInfo) {
                    console.log(`  ✅ ${provider}: Found (source: ${keyInfo.source})`);
                } else {
                    console.log(`  ❌ ${provider}: Not found`);
                }
            } catch (error) {
                console.log(`  ❌ ${provider}: Error - ${error.message}`);
            }
        }

        // Test direct decryption
        console.log('\n🔐 Testing Direct Decryption:');
        for (const provider of providers) {
            const apiKey = user.getApiKey(provider);
            if (apiKey) {
                console.log(`  ✅ ${provider}: Decrypted successfully (length: ${apiKey.length})`);
            } else {
                console.log(`  ❌ ${provider}: No key or decryption failed`);
            }
        }

        // Check environment variables
        console.log('\n🌍 System API Keys (Environment):');
        console.log('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
        console.log('  - ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
        console.log('  - GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Set' : 'Not set');
        console.log('  - GROK_API_KEY:', process.env.GROK_API_KEY ? 'Set' : 'Not set');
        console.log('  - DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? 'Set' : 'Not set');
        console.log('  - LLAMA_API_KEY:', process.env.LLAMA_API_KEY ? 'Set' : 'Not set');
        console.log('  - API_KEY_ENCRYPTION_KEY:', process.env.API_KEY_ENCRYPTION_KEY ? 'Set' : 'Not set');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

test();