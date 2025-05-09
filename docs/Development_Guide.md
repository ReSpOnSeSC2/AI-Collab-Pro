# Development Guide

This guide provides essential information for developers working on the AI Collaboration Hub codebase.

## Project Structure

The AI Collaboration Hub follows a modular architecture with clear separation of concerns:

```
ai-collaboration-hub/
├── public/          # Static frontend assets
├── src/             # Backend source code
│   ├── api/         # API endpoints
│   ├── lib/         # Core libraries
│   │   ├── ai/      # AI model integrations
│   │   └── mcp/     # Model Context Protocol
│   └── config/      # Configuration files
├── docs/            # Documentation
└── uploads/         # User uploads (temporary)
```

## Development Environment Setup

### Prerequisites

- Node.js v16+ and npm
- Redis (for real-time features)
- MongoDB (for data persistence)
- API keys for supported LLM providers

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/org/ai-collaboration-hub.git
   cd ai-collaboration-hub
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the project root with the following variables:
   ```
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/ai-collab-hub
   REDIS_URL=redis://localhost:6379
   
   # API Keys
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   GEMINI_API_KEY=your_gemini_key
   XAI_API_KEY=your_xai_key
   DEEPSEEK_API_KEY=your_deepseek_key
   LLAMA_API_KEY=your_llama_key
   
   # Optional: Custom base URLs
   LLAMA_BASE_URL=https://your-llama-endpoint.com/v1
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   
   This will start:
   - Express server on port 3001
   - WebSocket server for real-time updates
   - File watchers for automatic reloading

5. **Access the application**
   Open your browser and navigate to:
   ```
   http://localhost:3001
   ```

## Core Components

### Model Context Protocol (MCP)

The Model Context Protocol is the heart of the AI Collaboration Hub, providing a standardized interface for AI model interactions.

#### Key Files

- `src/lib/mcp/index.mjs`: Main entry point for the MCP
- `src/lib/ai/index.mjs`: AI client initialization and management
- `src/lib/ai/collaboration.mjs`: Implementation of collaboration modes

#### Adding a New LLM Provider

1. Create a new client wrapper in `src/lib/ai/`:
   ```javascript
   // src/lib/ai/newProvider.mjs
   export async function streamNewProviderResponse(modelId, prompt, onChunk, onComplete, onError) {
     // Implementation details
   }
   ```

2. Add the provider to `src/lib/ai/index.mjs`:
   ```javascript
   // Initialize client
   let newProviderClient = null;
   const newProviderApiKey = process.env.NEW_PROVIDER_API_KEY;
   // ... setup code ...
   
   // Export client
   export const clients = {
     // ... existing clients ...
     newProvider: newProviderClient
   };
   
   // Update availability
   export const availability = {
     // ... existing availability ...
     newProvider: !!newProviderClient
   };
   ```

3. Create a model configuration JSON file in `public/config/`:
   ```json
   {
     "provider": "newProvider",
     "defaultModel": "default-model-id",
     "models": [
       {
         "id": "model-id-1",
         "name": "Model Name",
         "price": "$X.XX/M tokens",
         "contextLength": "XXK tokens",
         "description": "Model description",
         "features": ["Feature 1", "Feature 2"]
       }
     ]
   }
   ```

4. Update the collaboration engine to include the new provider.

### Collaboration Engine

The Collaboration Engine orchestrates interactions between multiple AI models based on predefined modes.

#### Key Files

- `src/lib/ai/collaboration.mjs`: Core collaboration logic
- `src/api/collaboration.mjs`: API endpoints for collaboration settings

#### Adding a New Collaboration Mode

1. Define the mode flow in `src/lib/ai/collaboration.mjs`:
   ```javascript
   async function executeNewModeCollaboration(prompt, models, style, options) {
     // Implementation of the new mode's workflow
   }
   
   // Add to the mode handler
   export async function executeCollaboration(prompt, mode, models, style, options) {
     switch (mode) {
       // ... existing modes ...
       case 'new_mode':
         return executeNewModeCollaboration(prompt, models, style, options);
       // ...
     }
   }
   ```

2. Update the available modes in `src/api/collaboration.mjs`:
   ```javascript
   const availableModes = [
     'round_table', 
     'sequential_critique_chain', 
     // ... other existing modes ...
     'new_mode'
   ];
   ```

3. Add UI components to support the new mode in the frontend.

### WebSocket Implementation

The WebSocket server enables real-time updates during collaboration sessions.

#### Key Files

- `src/wsHandler.mjs`: WebSocket server implementation
- `public/js/connectionManager.js`: Client-side WebSocket connection

#### WebSocket Event Types

- `join_session`: Connect to a specific collaboration session
- `request`: Send a prompt for processing
- `agent_thinking`: Indicate an agent is processing
- `agent_thought`: Stream an intermediate thought from an agent
- `agent_critique`: Stream a critique from one agent to another
- `agent_vote`: Share a vote from one agent
- `collaboration_result`: Deliver the final result

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "Collaboration Engine"

# Run with coverage report
npm run test:coverage
```

### Test Structure

- `test/unit/`: Unit tests for individual components
- `test/integration/`: Integration tests for API endpoints
- `test/e2e/`: End-to-end tests for complete workflows

### Adding Tests

1. Create a test file following the naming convention `*.test.js`
2. Import the testing framework and component to test:
   ```javascript
   import { describe, it, before, after } from 'mocha';
   import { expect } from 'chai';
   import { executeCollaboration } from '../../src/lib/ai/collaboration.mjs';
   ```
3. Write your tests:
   ```javascript
   describe('Collaboration Engine', () => {
     describe('Round Table Mode', () => {
       it('should coordinate multiple agents to produce a consensus answer', async () => {
         // Test implementation
       });
     });
   });
   ```

## Deployment

### Deployment Architecture

The AI Collaboration Hub uses a multi-tier deployment strategy:

- **Frontend**: Deployed on Vercel for optimal static content delivery
- **Backend API**: Deployed on Render for scalable compute
- **Database**: MongoDB Atlas for persistent storage
- **Real-time Infrastructure**: Redis Cloud for PubSub capabilities
- **Monitoring**: Grafana for observability

### Deployment Process

1. **Prepare for deployment**
   ```bash
   npm run build
   ```

2. **Deploy to staging**
   ```bash
   npm run deploy:staging
   ```
   This will deploy to the staging environment for testing.

3. **Run verification tests**
   ```bash
   npm run test:staging
   ```

4. **Deploy to production**
   ```bash
   npm run deploy:production
   ```

### Environment Variables

Ensure these environment variables are set in your deployment platform:

- Required API keys for all LLM providers
- `NODE_ENV=production`
- `PORT=3001` (or as required by your platform)
- `MONGODB_URI`: Connection string to MongoDB
- `REDIS_URL`: Connection string to Redis
- `API_RATE_LIMIT`: Rate limit for API calls
- `WEBSOCKET_HEARTBEAT_INTERVAL`: Interval for WebSocket heartbeats

## Performance Optimization

### Token Usage Optimization

Minimize token usage with these strategies:

1. **Dynamic Context Windows**: Adjust prompt lengths based on the complexity of the task
2. **Progressive Response Building**: Stream responses to avoid redundant generation
3. **Caching Common Queries**: Implement a response cache for frequently asked questions
4. **Efficient Prompt Construction**: Remove unnecessary context from prompts

### Response Time Optimization

Improve response times with these approaches:

1. **Parallel Processing**: Execute independent agent tasks concurrently
2. **Progressive Rendering**: Stream partial results to the client as they become available
3. **Model Selection**: Use smaller, faster models for initial drafts
4. **Warm Instances**: Keep connections to AI providers warm to avoid cold start penalties

## Troubleshooting

### Common Development Issues

**WebSocket Connection Failures**
- Check that the WebSocket server is running on the correct port
- Verify that client URLs match the server configuration
- Check for firewall or proxy issues blocking WebSocket connections

**API Rate Limiting**
- Implement token bucket rate limiting for provider API calls
- Add exponential backoff for retries on 429 errors
- Consider using multiple API keys with round-robin selection

**Memory Leaks**
- Monitor WebSocket connections for proper closure
- Implement timeouts for idle connections
- Use WeakMap/WeakSet for storing references to avoid circular dependencies

### Debugging Tools

1. **Enable Debug Logging**
   ```
   DEBUG=ai-collab:* npm run dev
   ```

2. **WebSocket Debugger**
   Access the WebSocket debug panel at:
   ```
   http://localhost:3001/debug/websocket
   ```

3. **Performance Monitoring**
   View real-time performance metrics at:
   ```
   http://localhost:3001/debug/performance
   ```

## Contributing

### Code Style and Guidelines

- Follow the ESLint configuration in the project
- Use async/await for asynchronous operations
- Document all public functions with JSDoc comments
- Keep functions small and focused on a single responsibility

### Pull Request Process

1. Create a feature branch from `develop`
2. Make your changes following the code style guidelines
3. Write or update tests for the changes
4. Submit a pull request to the `develop` branch
5. Address any review comments
6. Once approved, your PR will be merged

### Versioning

The project follows Semantic Versioning (SemVer):
- MAJOR version for incompatible API changes
- MINOR version for backward-compatible functionality
- PATCH version for backward-compatible bug fixes