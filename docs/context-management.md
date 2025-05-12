# Context Management System

The AI-Collab hub includes a robust context management system that enables persistent contexts across multiple user interactions. This document explains the features, implementation, and usage of the context management system.

## Prerequisites

To use the context management system, the following prerequisites must be met:

- **MongoDB**: A MongoDB instance must be available and configured in the `.env` file using the `MONGODB_URI` environment variable.
- **Mongoose**: The `mongoose` NPM package is required for MongoDB integration.

If MongoDB is not available or configured, the context management system will fail gracefully, allowing the AI-Collab hub to continue functioning without persistent context.

## Features

- **Persistent Context**: Maintain conversation history across multiple messages
- **Three Context Modes**:
  - **None**: Each message is handled independently (default)
  - **Summary**: A condensed summary of the conversation history is maintained
  - **Full**: Complete conversation history is retained and sent with each prompt
- **Context Size Management**:
  - Automatic context size calculation
  - Visual indicators when approaching context limits
  - Manual trimming of context when needed
  - Context reset functionality
- **MongoDB Integration**: Context is stored persistently using MongoDB
- **WebSocket Integration**: Context management is fully integrated with the WebSocket communication system

## Implementation

The context management system is implemented across several components:

### Server-Side Components

1. **Models**:
   - `src/models/Conversation.mjs`: MongoDB schema for storing conversation history
   - Includes document structure with messages, responses, and context metadata
   - Pre-save hook to calculate context size

2. **Services**:
   - `src/services/conversationService.mjs`: Service layer interfacing with MongoDB
   - Implements CRUD operations for conversation contexts
   - Contains logic for generating summaries and managing context size

3. **Context Manager**:
   - `src/lib/contextManager.mjs`: Abstraction layer between application and database service
   - Exposes methods for context operations used by WebSocket handlers
   - Defines context modes and their behavior

4. **WebSocket Integration**:
   - `src/wsHandler.mjs`: WebSocket handlers that integrate with context management
   - Handles context-related WebSocket messages

5. **API Routes**:
   - `src/api/context.mjs`: REST API endpoints for context management
   - Administrative operations for context management

### Client-Side Components

1. **Context UI Manager**:
   - `public/js/contextManager.js`: Client-side context management UI
   - Interface for switching between context modes
   - Handlers for WebSocket context events

2. **UI Integration**:
   - `public/css/context-manager.css`: Styling for context management UI elements
   - Responsive design for context controls

3. **Main App Integration**:
   - `public/js/main.js`: Integration with the main application flow

## Usage

### Context Modes

- **None**: Perfect for one-off questions with no context. Each message is treated independently.
- **Summary**: Good for longer conversations where the AI should have a general idea of the conversation topic without the full detail. Significantly reduces token usage compared to full context.
- **Full**: Best for complex, deep discussions where the full conversation history is important for continuity. Uses the most tokens.

### UI Controls

The context management UI includes:

- **Context Toggle Switch**: Quickly enable or disable context
- **Context Status Indicator**: Shows current context size and limit
- **Progress Bar**: Visual representation of context utilization
- **Mode Selector**: Switch between None, Summary, and Full modes
- **Reset Button**: Clear the conversation history
- **Trim Button**: Remove older messages to reduce context size

### Context Warning

When approaching the context limit (80% by default), a warning notification appears with options to:

1. Reset the context to start fresh
2. Trim the context to remove older messages

## Technical Details

### Context Size Calculation

Context size is calculated by summing the lengths of:
- All user messages
- All AI responses
- Context summary (if using summary mode)

The server automatically recalculates context size when messages are added, removed, or modified.

### Context Summarization

When in Summary mode, the system maintains a condensed representation of the conversation:
1. Initial summary is generated from the first message
2. Subsequent messages are analyzed for topics
3. Topics are added to the summary if not already included
4. Summary is limited to 500 characters

### Context Trimming

When the context exceeds predefined limits, the system can trim the conversation:
1. Removes oldest messages first
2. Continues removing until context is below 70% of the maximum
3. Always keeps the most recent exchange
4. Updates the summary if in Summary mode

## Database Schema

The MongoDB schema includes:

```javascript
const ConversationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true
  },
  contextMode: {
    type: String,
    enum: ['none', 'summary', 'full'],
    default: 'none'
  },
  summary: {
    type: String,
    default: ''
  },
  messages: [MessageSchema],
  contextSize: Number,
  maxContextSize: Number
}, { timestamps: true });
```

## WebSocket Messages

The system supports these WebSocket message types:

- `context_status`: Get current context status
- `reset_context`: Reset the conversation
- `trim_context`: Trim the context to reduce size
- `set_max_context_size`: Set a custom maximum context size
- `set_context_mode`: Change the context mode (none, summary, full)
- `context_warning`: Warning when context is nearing its limit

## Future Improvements

Potential enhancements for the context management system:

1. **AI-Powered Summarization**: Use AI models to generate better summaries of the conversation
2. **Semantic Context Trimming**: Remove less relevant messages instead of just the oldest ones
3. **Hierarchical Context**: Maintain multiple levels of context detail
4. **Context Search**: Allow searching through conversation history
5. **Context Export/Import**: Save and load conversation contexts