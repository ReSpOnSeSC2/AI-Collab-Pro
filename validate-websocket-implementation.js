/**
 * WebSocket Implementation Validator
 * 
 * This script analyzes the connectionManager.js file to check for proper WebSocket heartbeat 
 * implementation and common issues.
 */

const fs = require('fs');
const path = require('path');

// Path to the connectionManager.js file
const connectionManagerPath = path.join(__dirname, 'public', 'js', 'connectionManager.js');

// Check if the file exists
if (!fs.existsSync(connectionManagerPath)) {
  console.error('Error: connectionManager.js not found at', connectionManagerPath);
  process.exit(1);
}

// Read the file
const code = fs.readFileSync(connectionManagerPath, 'utf8');

// Validation points
const validationPoints = [
  {
    name: 'WebSocket Path Configuration',
    check: () => {
      const wsPathMatch = code.match(/const\s+wsPath\s*=\s*['"]([^'"]+)['"]/);
      if (!wsPathMatch) {
        return { status: 'WARN', message: 'WebSocket path not found as a constant variable' };
      }
      const wsPath = wsPathMatch[1];
      if (!wsPath.startsWith('/api/')) {
        return { status: 'WARN', message: `WebSocket path "${wsPath}" might not match server configuration` };
      }
      return { status: 'PASS', message: `WebSocket path configured as: ${wsPath}` };
    }
  },
  {
    name: 'Heartbeat Mechanism (Client to Server)',
    check: () => {
      // Check for heartbeat interval
      const heartbeatIntervalMatch = code.match(/const\s+HEARTBEAT_INTERVAL\s*=\s*(\d+)/);
      if (!heartbeatIntervalMatch) {
        return { status: 'FAIL', message: 'No HEARTBEAT_INTERVAL constant found' };
      }
      
      // Check for heartbeat function
      const heartbeatFunctionPresent = code.includes('startHeartbeat');
      if (!heartbeatFunctionPresent) {
        return { status: 'FAIL', message: 'No startHeartbeat function found' };
      }
      
      // Check for ping message sending
      const pingMessageSending = code.includes('type: \'ping\'') || code.includes("type: 'ping'") || code.includes('type: "ping"');
      if (!pingMessageSending) {
        return { status: 'FAIL', message: 'No ping message sending detected' };
      }
      
      return { 
        status: 'PASS', 
        message: `Heartbeat interval: ${heartbeatIntervalMatch[1]}ms, with ping message sending` 
      };
    }
  },
  {
    name: 'Pong Message Handling',
    check: () => {
      const hasPongHandling = code.includes('data.type === \'pong\'') || 
                              code.includes("data.type === 'pong'") || 
                              code.includes('data.type === "pong"');
      
      if (!hasPongHandling) {
        return { status: 'FAIL', message: 'No pong message handling detected' };
      }
      
      const isAliveReset = code.includes('ws.isAlive = true');
      if (!isAliveReset) {
        return { status: 'WARN', message: 'Pong handling exists but might not reset isAlive flag' };
      }
      
      return { status: 'PASS', message: 'Proper pong message handling with isAlive flag reset' };
    }
  },
  {
    name: 'Ping Message Handling (Server to Client)',
    check: () => {
      const hasPingHandling = code.includes('data.type === \'ping\'') || 
                              code.includes("data.type === 'ping'") || 
                              code.includes('data.type === "ping"');
      
      if (!hasPingHandling) {
        return { status: 'FAIL', message: 'No ping message handling detected' };
      }
      
      const sendsPongResponse = code.includes('type: \'pong\'') || 
                              code.includes("type: 'pong'") || 
                              code.includes('type: "pong"');
      
      if (!sendsPongResponse) {
        return { status: 'FAIL', message: 'Ping handling exists but does not send pong response' };
      }
      
      return { status: 'PASS', message: 'Properly responds to ping messages with pong' };
    }
  },
  {
    name: 'Connection Termination Method',
    check: () => {
      const usesTerminate = code.includes('ws.terminate()');
      const usesClose = code.includes('ws.close(');
      
      if (usesTerminate && !usesClose) {
        return { 
          status: 'WARN', 
          message: 'Uses ws.terminate() but not ws.close() - might abruptly close connections' 
        };
      }
      
      if (!usesClose) {
        return { 
          status: 'WARN', 
          message: 'No explicit ws.close() call found - check how connections are closed' 
        };
      }
      
      return { 
        status: 'PASS', 
        message: `Uses proper ws.close() method${usesTerminate ? ' (and terminate for non-responsive connections)' : ''}` 
      };
    }
  },
  {
    name: 'Reconnection Logic',
    check: () => {
      const hasReconnectLogic = code.includes('reconnect') || code.includes('Reconnect');
      
      if (!hasReconnectLogic) {
        return { status: 'FAIL', message: 'No reconnection logic detected' };
      }
      
      const hasExponentialBackoff = code.includes('Math.pow') && code.includes('reconnect');
      
      if (!hasExponentialBackoff) {
        return { 
          status: 'WARN', 
          message: 'Reconnection logic exists but might not use exponential backoff' 
        };
      }
      
      const hasMaxRetryLimit = code.includes('MAX_RECONNECT_ATTEMPTS') || code.includes('maxRetries');
      
      if (!hasMaxRetryLimit) {
        return { 
          status: 'WARN', 
          message: 'Reconnection logic exists but might not have a maximum retry limit' 
        };
      }
      
      return { 
        status: 'PASS', 
        message: 'Proper reconnection logic with exponential backoff and retry limits' 
      };
    }
  },
  {
    name: 'Error Handling',
    check: () => {
      const hasErrorEvent = code.includes('ws.onerror');
      
      if (!hasErrorEvent) {
        return { status: 'FAIL', message: 'No WebSocket error event handling detected' };
      }
      
      const hasTryCatch = code.includes('try {') && code.includes('catch');
      
      if (!hasTryCatch) {
        return { 
          status: 'WARN', 
          message: 'Error event handled but might not use try/catch blocks for operations' 
        };
      }
      
      return { status: 'PASS', message: 'Proper error handling with both event handlers and try/catch blocks' };
    }
  }
];

// Run the validation
console.log('WebSocket Implementation Validator');
console.log('=================================\n');
console.log(`Analyzing: ${connectionManagerPath}\n`);

const results = validationPoints.map(point => {
  const result = point.check();
  return { name: point.name, ...result };
});

// Display results
let passCount = 0;
let warnCount = 0;
let failCount = 0;

results.forEach(result => {
  let statusSymbol = '';
  switch(result.status) {
    case 'PASS':
      statusSymbol = '✅ PASS:';
      passCount++;
      break;
    case 'WARN':
      statusSymbol = '⚠️ WARN:';
      warnCount++;
      break;
    case 'FAIL':
      statusSymbol = '❌ FAIL:';
      failCount++;
      break;
  }
  
  console.log(`${statusSymbol} ${result.name}`);
  console.log(`   ${result.message}`);
  console.log();
});

// Summary
console.log('Summary');
console.log('=======');
console.log(`Total checks: ${results.length}`);
console.log(`Passed: ${passCount}`);
console.log(`Warnings: ${warnCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  console.log('\n⚠️ Some critical issues were found in the WebSocket implementation');
} else if (warnCount > 0) {
  console.log('\n⚠️ Some potential issues were found in the WebSocket implementation');
} else {
  console.log('\n✅ The WebSocket implementation looks good!');
}

// Recommendations if needed
if (failCount > 0 || warnCount > 0) {
  console.log('\nRecommendations:');
  results.forEach(result => {
    if (result.status === 'FAIL' || result.status === 'WARN') {
      console.log(`- ${result.name}: ${result.message}`);
    }
  });
}