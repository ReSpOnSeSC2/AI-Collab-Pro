# AI Collaboration Hub Architecture

This document outlines the architecture of the AI Collaboration Hub system, focusing on the Advanced Collaboration Engine that enables multiple LLMs to collaborate on user prompts.

## System Overview

```
                                      +-----------------+
                                      |                 |
                                      |  Client (Web)   |
                                      |                 |
                                      +--------+--------+
                                               |
                                               | HTTP/WebSocket
                                               |
+---------------+    +------------------+    +-v--------------+    +---------------+
|               |    |                  |    |                |    |               |
| MongoDB       <----+ Session & Data   <----+ Express Server <----+ Redis PubSub  |
| (Persistence) |    | Management       |    | (API Gateway)  |    | (Real-time)   |
|               |    |                  |    |                |    |               |
+---------------+    +------------------+    +--------+-------+    +-------^-------+
                                                      |                    |
                                                      |                    |
                     +--------------------------------v--------------------+
                     |                                                     |
                     |                  Model Context Protocol             |
                     |                                                     |
                     +-----+----------------+----------------+-------------+
                           |                |                |
                           v                v                v
                     +----------+    +----------+    +----------+
                     |          |    |          |    |          |
                     | Agent 1  |    | Agent 2  |    | Agent N  |
                     | (LLM)    |    | (LLM)    |    | (LLM)    |
                     |          |    |          |    |          |
                     +----------+    +----------+    +----------+
```

## Component Breakdown

### Client Layer
- **Web Client**: Browser-based interface built with vanilla JavaScript that displays the collaboration process and results.
- **WebSocket Client**: Maintains a real-time connection to stream agent thoughts and updates.

### Server Layer
- **Express Server**: Node.js/Express.js application that serves as the API gateway and handles HTTP requests.
- **WebSocket Server**: Handles real-time bidirectional communication between the server and client.
- **API Routes**: RESTful endpoints for collaboration settings, authentication, and file uploads.

### Model Context Protocol (MCP)
- **Collaboration Engine**: Orchestrates the multi-agent workflow based on selected collaboration modes.
- **Prompt Manager**: Constructs prompts for each agent based on collaboration context.
- **Response Processor**: Processes, validates, and reconciles agent responses.
- **Cost Estimator**: Monitors and estimates API costs of agent interactions.

### Data Layer
- **Session Manager**: Tracks user sessions and collaboration contexts.
- **MongoDB**: Persistent storage for user data, session history, and collaboration results.
- **Redis PubSub**: Facilitates real-time communication and event broadcasting.

### LLM Integration
- **Agent Interface**: Standardized communication protocol for different LLM providers.
- **Provider Adapters**: Specific implementations for Claude, ChatGPT, Gemini, Grok, DeepSeek, and Llama.

## Request Flow

1. **Client to API**: User submits a collaboration request to the Express server with prompt and mode selection.
2. **API to MCP**: Express routes the request to the Model Context Protocol.
3. **MCP to Agents**: MCP breaks down the task based on selected collaboration mode:
   - Constructs appropriate prompts for each agent
   - Manages turn-taking and interaction rules
   - Sets up sandbox execution environment
4. **Agents to MCP**: LLM agents process their prompts and return responses.
5. **MCP to Redis**: Intermediate thoughts, critiques, and votes are published to Redis channels.
6. **Redis to Client**: WebSocket server subscribes to Redis channels and forwards events to the client.
7. **MCP to API**: Final consolidated answer is returned to the API.
8. **API to Client**: Response is returned to the client and also streamed via WebSocket.

## Data Model

### Session Messages

```
SessionMessages {
  message_id: ObjectId (Primary Key)
  session_id: ObjectId (Foreign Key to Sessions)
  agent_id: String (e.g., 'claude', 'gemini', 'user', 'system')
  timestamp: DateTime
  role: String (e.g., 'user_prompt', 'agent_draft', 'agent_critique', 'agent_vote', 'system_summary')
  content_text: String
  token_count: Number
  parent_message_id: ObjectId (for threading)
  metadata: Object {
    collaboration_mode: String
    turn_number: Number
    phase: String
  }
}
```

### Cost Ledger

```
CostLedger {
  ledger_id: ObjectId (Primary Key)
  session_id: ObjectId (Foreign Key to Sessions)
  timestamp: DateTime
  model_id: String
  provider: String
  input_tokens: Number
  output_tokens: Number
  estimated_cost_usd: Number
  cost_cap_usd: Number
  capped: Boolean (whether the operation was capped due to budget constraints)
}
```

## Sandbox Execution Flow

1. **Sandbox Initialization**: For each agent turn, a secure execution environment is created.
2. **Prompt Sandboxing**: Prompts are preprocessed to prevent prompt injection and ensure proper boundaries.
3. **Execution**: The agent executes within the sandbox with restricted capabilities.
4. **Validation**: Response is validated for compliance with expected format and content policies.
5. **Integration**: Valid responses are integrated into the collaboration workflow.
6. **Termination**: Sandbox is terminated after use to prevent state contamination.

## Deployment Architecture

```
                   +----------------+
                   |                |
                   |  Vercel (CDN)  |
                   |  Frontend      |
                   |                |
                   +--------+-------+
                            |
                            v
+----------------+  +------+---------+  +----------------+
|                |  |                |  |                |
| MongoDB Atlas  <--+ Render         <--+ Redis Cloud    |
| (Persistence)  |  | Express Server |  | (PubSub)       |
|                |  |                |  |                |
+----------------+  +----------------+  +----------------+
                           |
                           v
                    +------------+
                    |            |
                    | Grafana    |
                    | Monitoring |
                    |            |
                    +------------+
```

## Component Justifications and Trade-offs

### Client-Side Architecture

**Vanilla JavaScript vs. Modern Framework**
- **Justification**: Vanilla JavaScript was chosen for simplicity and compatibility with existing systems.
- **Trade-offs**: Sacrifices the structure and state management of frameworks like React/Vue in favor of lighter weight and fewer dependencies.

### Server Architecture

**Express.js and WebSocket**
- **Justification**: Express provides a lightweight, flexible foundation for REST APIs, while WebSockets enable real-time communication essential for collaborative UI.
- **Trade-offs**: Requires manual management of connection state and reconnnection logic compared to Socket.io, but offers finer control and lower overhead.

### Model Context Protocol (MCP)

**Centralized Orchestration**
- **Justification**: MCP centralizes the complex logic of orchestrating multi-agent workflows, providing a consistent interface regardless of underlying models.
- **Trade-offs**: Introduces an abstraction layer that adds some overhead but significantly simplifies integration of new models and collaboration modes.

### Data Storage Strategy

**MongoDB + Redis**
- **Justification**: MongoDB provides flexible document storage for sessions and messages, while Redis handles fast, ephemeral real-time communication.
- **Trade-offs**: Requires maintaining two data systems instead of one but optimizes for different access patterns (persistence vs. real-time).

### Deployment Strategy

**Vercel + Render**
- **Justification**: Vercel optimizes static content delivery for the frontend, while Render handles the Node.js backend with WebSocket support.
- **Trade-offs**: Using multiple hosting platforms increases complexity but allows each component to use the most appropriate platform.

### Monitoring and Analytics

**Grafana + OpenTelemetry**
- **Justification**: Provides comprehensive visibility into system performance, API costs, and collaboration effectiveness.
- **Trade-offs**: Adds deployment complexity and infrastructure costs but enables data-driven optimization of the system.

## Security Considerations

### Authentication and Authorization
The system implements basic authentication with session tokens. User permissions determine access to collaboration features and model providers.

### Prompt Security
All user inputs and intermediate agent outputs pass through a prompt sanitization layer to prevent prompt injection attacks and ensure compliance with usage policies.

### API Key Management
Provider API keys are securely stored and never exposed to the client. The server acts as a proxy for all LLM requests.

### Rate Limiting
Implements tiered rate limiting to prevent abuse and manage API costs, with different limits based on user tiers.

## Future Extensibility

The architecture is designed to support future enhancements:
- Integration with RAG (Retrieval-Augmented Generation) systems
- Addition of new collaboration modes
- Integration with additional LLM providers
- Enhanced analytics and visualization of collaboration processes
- Team-based collaboration features with shared contexts