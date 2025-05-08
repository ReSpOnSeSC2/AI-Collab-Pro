/**
 * Setup script to check and install dependencies for WebSocket testing
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if package.json exists
const packageJsonPath = path.join(__dirname, 'package.json');
let packageJson;

try {
  if (fs.existsSync(packageJsonPath)) {
    packageJson = require(packageJsonPath);
    console.log('Found package.json');
  } else {
    console.log('No package.json found, creating one');
    packageJson = {
      name: "websocket-heartbeat-test",
      version: "1.0.0",
      description: "Testing WebSocket heartbeat mechanism",
      main: "test-websocket-server.js",
      scripts: {
        "test": "node test-websocket-server.js"
      },
      dependencies: {}
    };
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }
} catch (error) {
  console.error('Error checking/creating package.json:', error);
  process.exit(1);
}

// Check for required dependencies
const requiredDependencies = ['ws', 'express'];
const missingDependencies = [];

for (const dep of requiredDependencies) {
  try {
    require.resolve(dep);
    console.log(`✓ Dependency ${dep} is installed`);
  } catch (e) {
    console.log(`✗ Dependency ${dep} is missing`);
    missingDependencies.push(dep);
  }
}

// Install missing dependencies
if (missingDependencies.length > 0) {
  console.log(`Installing missing dependencies: ${missingDependencies.join(', ')}`);
  
  try {
    execSync(`npm install ${missingDependencies.join(' ')}`, { stdio: 'inherit' });
    console.log('All dependencies installed successfully');
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    process.exit(1);
  }
} else {
  console.log('All required dependencies are already installed');
}

console.log('\nSetup complete!');
console.log('To run the test server: node test-websocket-server.js');
console.log('Then open http://localhost:3000/websocket-heartbeat-test.html in your browser');