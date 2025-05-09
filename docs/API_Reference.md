# API Reference

This document provides a comprehensive reference for the AI Collaboration Hub API endpoints.

## Authentication

### POST /api/auth/login

Authenticates a user and creates a session.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name"
  },
  "token": "session_token"
}
```

### POST /api/auth/logout

Ends the current user session.

**Response:**
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

### GET /api/auth/session

Returns the current session information.

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

## Collaboration Engine

### GET /api/collaboration/config

Retrieves the current collaboration configuration.

**Response:**
```json
{
  "currentStyle": "balanced",
  "mode": "collaborative",
  "collaborationOrder": ["claude", "gemini", "chatgpt", "grok", "deepseek", "llama"],
  "availableStyles": [
    {
      "id": "balanced",
      "name": "Balanced",
      "description": "Equal participation from all models"
    },
    {
      "id": "contrasting",
      "name": "Contrasting",
      "description": "Emphasizes different perspectives"
    },
    {
      "id": "harmonious",
      "name": "Harmonious",
      "description": "Focuses on finding agreement"
    }
  ],
  "availableModes": ["collaborative", "individual"]
}
```

### POST /api/collaboration/style

Sets the collaboration style.

**Request Body:**
```json
{
  "style": "contrasting"
}
```

**Response:**
```json
{
  "success": true,
  "currentStyle": "contrasting",
  "message": "Collaboration style set to contrasting."
}
```

### POST /api/collaboration/mode

Sets the collaboration mode.

**Request Body:**
```json
{
  "mode": "round_table"
}
```

**Response:**
```json
{
  "success": true,
  "mode": "round_table",
  "message": "Collaboration mode set to round_table."
}
```

### POST /api/collaboration/session

Starts a new collaboration session.

**Request Body:**
```json
{
  "prompt": "Explain the impact of quantum computing on cryptography",
  "mode": "round_table",
  "style": "balanced",
  "models": ["claude", "gemini", "chatgpt"],
  "costCapDollars": 0.50
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "session_12345",
  "message": "Collaboration session started successfully."
}
```

## Model Context Protocol (MCP)

### POST /api/mcp/query

Sends a query to a single model.

**Request Body:**
```json
{
  "provider": "claude",
  "model": "claude-3.7-sonnet",
  "prompt": "Explain how neural networks work",
  "stream": true
}
```

**Response:**
```json
{
  "success": true,
  "responseId": "response_12345"
}
```

### GET /api/mcp/status/:providerId

Gets the status of a specific model provider.

**Response:**
```json
{
  "provider": "claude",
  "available": true,
  "models": ["claude-3.7-sonnet", "claude-3.7-opus"],
  "rateLimits": {
    "remaining": 95,
    "limit": 100,
    "resetAt": "2024-07-27T12:00:00Z"
  }
}
```

## Responses

### GET /api/responses

Gets a list of saved responses.

**Response:**
```json
{
  "responses": [
    {
      "id": "response_12345",
      "timestamp": "2024-07-27T10:30:00Z",
      "prompt": "Explain neural networks",
      "models": ["claude", "gemini"]
    }
  ]
}
```

### GET /api/responses/:responseId

Gets a specific saved response.

**Response:**
```json
{
  "id": "response_12345",
  "timestamp": "2024-07-27T10:30:00Z",
  "prompt": "Explain neural networks",
  "responses": [
    {
      "provider": "claude",
      "model": "claude-3.7-sonnet",
      "content": "Neural networks are...",
      "tokenCount": 450
    },
    {
      "provider": "gemini",
      "model": "gemini-2.5-pro",
      "content": "A neural network is...",
      "tokenCount": 380
    }
  ],
  "collaborationResult": {
    "mode": "round_table",
    "style": "balanced",
    "finalAnswer": "Neural networks are computational systems...",
    "tokenCount": 600
  }
}
```

### POST /api/responses/save

Saves the current response.

**Request Body:**
```json
{
  "sessionId": "session_12345",
  "title": "Neural Networks Explanation"
}
```

**Response:**
```json
{
  "success": true,
  "responseId": "response_12345",
  "message": "Response saved successfully"
}
```

## WebSocket Events

The WebSocket connection handles real-time events for collaboration sessions.

### Client to Server Events

- `join_session`: Join a collaboration session
  ```json
  {
    "type": "join_session",
    "sessionId": "session_12345"
  }
  ```

- `request`: Send a prompt request
  ```json
  {
    "type": "request",
    "prompt": "Explain quantum computing",
    "mode": "round_table",
    "style": "balanced",
    "models": ["claude", "gemini", "chatgpt"],
    "costCapDollars": 0.50
  }
  ```

### Server to Client Events

- `session_joined`: Confirmation of joining a session
  ```json
  {
    "type": "session_joined",
    "sessionId": "session_12345"
  }
  ```

- `agent_thinking`: Agent is processing
  ```json
  {
    "type": "agent_thinking",
    "agent": "claude",
    "model": "claude-3.7-sonnet"
  }
  ```

- `agent_thought`: Intermediate thought from an agent
  ```json
  {
    "type": "agent_thought",
    "agent": "claude",
    "model": "claude-3.7-sonnet", 
    "phase": "draft",
    "text": "Quantum computing leverages...",
    "tokens": 150
  }
  ```

- `agent_critique`: Critique from an agent
  ```json
  {
    "type": "agent_critique",
    "agent": "gemini",
    "target": "claude",
    "text": "The explanation could be improved by...",
    "tokens": 120
  }
  ```

- `agent_vote`: Vote from an agent
  ```json
  {
    "type": "agent_vote",
    "agent": "chatgpt",
    "target": "gemini",
    "reasoning": "This explanation is more comprehensive because...",
    "tokens": 80
  }
  ```

- `collaboration_result`: Final result of collaboration
  ```json
  {
    "type": "collaboration_result",
    "mode": "round_table",
    "style": "balanced",
    "text": "Quantum computing is a type of computation that...",
    "tokens": 500,
    "cost": 0.23
  }
  ```

- `error`: Error notification
  ```json
  {
    "type": "error",
    "message": "Error message",
    "code": "ERROR_CODE"
  }
  ```