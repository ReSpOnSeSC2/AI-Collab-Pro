/**
 * WebSocket Client Implementation Test
 * Tests the client-side WebSocket implementation against our fixes
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the client code to test
const connectionManagerPath = path.join(__dirname, 'public/js/connectionManager.js');
let clientImplementation = '';
try {
    clientImplementation = fs.readFileSync(connectionManagerPath, 'utf8');
    console.log('✅ Successfully read the connectionManager.js file');
} catch (err) {
    console.error('❌ Error reading the connectionManager.js file:', err.message);
    process.exit(1);
}

// Analyze client code for key patterns
const analysisResults = {
    pingPongHandling: clientImplementation.includes('data.type === \'ping\'') || 
                      clientImplementation.includes('type: \'ping\''),
    heartbeatInterval: clientImplementation.includes('heartbeatInterval'),
    wsClose: clientImplementation.includes('ws.close'),
    wsTerminate: clientImplementation.includes('ws.terminate'),
    handlesPingMessage: clientImplementation.includes('sendMessageToServer({ type: \'pong\''),
    debugPingPong: clientImplementation.includes('debug_ping') && clientImplementation.includes('debug_pong'),
    reconnectLogic: clientImplementation.includes('scheduleReconnect'),
};

console.log('\n🔍 WebSocket Client Implementation Analysis:');
console.log('------------------------------------------');
console.log(`Handles ping/pong messages: ${analysisResults.pingPongHandling ? '✅ Yes' : '❌ No'}`);
console.log(`Implements heartbeat interval: ${analysisResults.heartbeatInterval ? '✅ Yes' : '❌ No'}`);
console.log(`Uses ws.close() (browser-compatible): ${analysisResults.wsClose ? '✅ Yes' : '❌ No'}`);
console.log(`Uses ws.terminate() (potential issue): ${analysisResults.wsTerminate ? '❌ Yes (problem)' : '✅ No (good)'}`);
console.log(`Has reconnect logic: ${analysisResults.reconnectLogic ? '✅ Yes' : '❌ No'}`);
console.log(`Handles debug ping/pong: ${analysisResults.debugPingPong ? '✅ Yes' : '❌ No'}`);

// Check WebSocket URL path construction
const webSocketUrlPattern = clientImplementation.match(/const\s+wsPath\s*=\s*['"]([^'"]+)['"]/);
const webSocketUrl = webSocketUrlPattern ? webSocketUrlPattern[1] : 'Not found';
console.log(`WebSocket URL path: ${webSocketUrl}`);

// Test server availability (optional)
console.log('\n🖥️ Server Availability Check:');
console.log('---------------------------');
try {
    const serverProcess = await fetch('http://localhost:3001/api/check-api-status', {
        method: 'GET',
    });
    
    if (serverProcess.ok) {
        console.log('✅ Server appears to be running and API status endpoint is accessible');
        
        // Try to connect to WebSocket to test heartbeat (if server is running)
        try {
            console.log('\n🔌 Attempting WebSocket connection test...');
            const ws = new WebSocket('ws://localhost:3001/api/ws');
            
            ws.on('open', () => {
                console.log('✅ WebSocket connection established');
                
                // Send a ping message to test ping handling
                console.log('Sending ping message to test server response...');
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                
                // Close after a brief delay
                setTimeout(() => {
                    ws.close();
                    console.log('✅ WebSocket test completed and connection closed');
                }, 2000);
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    console.log(`Received message: ${message.type}`);
                    if (message.type === 'pong') {
                        console.log('✅ Received pong response to ping message');
                    }
                } catch (e) {
                    console.error('Error parsing message:', e);
                }
            });
            
            ws.on('error', (error) => {
                console.error('❌ WebSocket connection error:', error.message);
            });
            
            ws.on('close', () => {
                console.log('WebSocket connection closed');
            });
            
            // Allow some time for the connection test
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (wsErr) {
            console.error('❌ Error during WebSocket test:', wsErr.message);
        }
    } else {
        console.log('❌ Server does not appear to be running or API status endpoint is not accessible');
    }
} catch (e) {
    console.log('❌ Server does not appear to be running:', e.message);
}

// Summary of client implementation
console.log('\n📋 WebSocket Client Implementation Summary:');
console.log('----------------------------------------');

if (analysisResults.wsTerminate && !analysisResults.wsClose) {
    console.log('⚠️ ISSUE: The code uses ws.terminate() without ws.close() which can cause errors in browser environments');
} else if (analysisResults.wsClose && !analysisResults.wsTerminate) {
    console.log('✅ GOOD: The code correctly uses ws.close() which is compatible with browser environments');
} else if (analysisResults.wsClose && analysisResults.wsTerminate) {
    console.log('⚠️ MIXED: The code uses both ws.close() and ws.terminate(). Ensure terminate is only in commented code or properly guarded');
} else {
    console.log('❓ UNCLEAR: No WebSocket termination methods detected');
}

if (analysisResults.pingPongHandling && analysisResults.heartbeatInterval) {
    console.log('✅ GOOD: Proper heartbeat mechanism is implemented with ping/pong handling');
} else {
    console.log('⚠️ ISSUE: Heartbeat mechanism may be incomplete');
}

if (analysisResults.reconnectLogic) {
    console.log('✅ GOOD: Reconnection logic is implemented for handling disconnections');
} else {
    console.log('⚠️ ISSUE: No reconnection logic detected');
}

if (webSocketUrl === '/api/ws') {
    console.log('✅ GOOD: WebSocket URL path (/api/ws) matches the expected server configuration');
} else {
    console.log(`⚠️ NOTE: WebSocket URL path (${webSocketUrl}) may not match the server's expected path`);
}

console.log('\nTest completed.');