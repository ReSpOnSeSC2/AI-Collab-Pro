const http = require('http');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');

// Create Express app
const app = express();

// Serve static files from current directory
app.use(express.static(__dirname));

// Simple HTTP response for the API status check
app.get('/api/check-api-status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
  server,
  path: '/api/ws'  // Match the path in connectionManager.js
});

// Configuration
const HEARTBEAT_INTERVAL = 30000; // How often server will ping clients (30s)
const CLIENT_TIMEOUT = 35000;     // How long to wait for client response (35s)

console.log('WebSocket server created with path: /api/ws');

// Heartbeat mechanism - check for dead clients
const heartbeat = () => {
  console.log(`Checking ${wss.clients.size} client(s) heartbeat status`);
  
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating client due to missed heartbeat');
      return ws.terminate();
    }

    // Mark as not responsive until we get a pong
    ws.isAlive = false;
    
    // Send ping to client
    try {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      console.log('Ping sent to client');
    } catch (e) {
      console.error('Error sending ping:', e.message);
      ws.terminate();
    }
  });
};

// Start heartbeat interval
const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL);

// When a client connects
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`Client connected from ${ip}`);
  
  // Mark client as alive on connect
  ws.isAlive = true;
  
  // Keep track of lastReceived time (to detect stale connections)
  ws.lastReceived = Date.now();
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    message: 'Welcome to WebSocket test server',
    timestamp: Date.now()
  }));

  // Handle messages from client
  ws.on('message', (message) => {
    try {
      // Update last received time
      ws.lastReceived = Date.now();
      
      // Parse the message
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      // Handle pong from client
      if (data.type === 'pong' || data.type === 'debug_pong') {
        console.log('Received pong from client');
        ws.isAlive = true;
        
        // Echo back a confirmation
        ws.send(JSON.stringify({
          type: 'system',
          message: 'Received your pong',
          timestamp: Date.now()
        }));
        return;
      }
      
      // Handle ping from client
      if (data.type === 'ping' || data.type === 'debug_ping') {
        console.log('Received ping from client, sending pong');
        ws.send(JSON.stringify({
          type: data.type === 'ping' ? 'pong' : 'debug_pong',
          timestamp: Date.now()
        }));
        return;
      }
      
      // Echo all other messages
      ws.send(JSON.stringify({
        type: 'echo',
        original: data,
        timestamp: Date.now()
      }));
      
    } catch (e) {
      console.error('Error handling message:', e);
      // Try to notify client
      try {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Failed to process message: ${e.message}`,
          timestamp: Date.now()
        }));
      } catch (sendError) {
        console.error('Failed to send error response:', sendError);
      }
    }
  });

  // Handle client disconnection
  ws.on('close', (code, reason) => {
    console.log(`Client disconnected. Code: ${code}, Reason: ${reason || 'No reason provided'}`);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle server shutdown
wss.on('close', () => {
  clearInterval(interval);
  console.log('WebSocket server closed');
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server is available at ws://localhost:${PORT}/api/ws`);
  console.log(`Test page: http://localhost:${PORT}/websocket-heartbeat-test.html`);
});