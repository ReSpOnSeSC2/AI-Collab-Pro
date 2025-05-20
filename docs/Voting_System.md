# AI Collaboration Hub - Voting and Feedback System

## Overview

The voting and feedback system adds detailed user feedback collection to the AI Collaboration Hub, capturing ratings and qualitative data for both individual and collaborative responses. The system is designed to:

1. Randomly select 2% of questions for feedback collection
2. Provide different voting interfaces based on the mode (individual or collaborative)
3. Track detailed analytics on response quality by model, question type, and collaboration mode
4. Store all data in a MongoDB database for analysis
5. Provide a comprehensive admin dashboard for analyzing the collected data

## Key Components

### Backend

1. **Vote Model (`Vote.mjs`)**
   - Stores user ratings, question details, feedback text, and metadata
   - Connects to the MongoDB database for persistent storage
   - Tracks both collaborative and individual mode ratings

2. **Vote Service (`voteService.mjs`)**
   - Handles vote recording and retrieval
   - Implements the 2% question selection algorithm
   - Provides statistical analysis functions for the admin dashboard

3. **API Routes (`votes.mjs`)**
   - RESTful endpoints for voting and retrieving statistics
   - Authorization checks to protect administrative endpoints
   - Endpoints for querying votes by various criteria

4. **WebSocket Integration**
   - Real-time vote submission through the existing WebSocket connection
   - Message handlers for vote events and confirmations

### Frontend

1. **Voting UI Component**
   - Mode-specific voting interfaces:
     - **Individual Mode**: Ranking interface to compare different models
     - **Collaborative Mode**: Rating scale from 1-10 for overall quality
   - Question type classification for better analytics
   - Optional text feedback field

2. **Admin Dashboard (`admin-voting.html`)**
   - Comprehensive analytics dashboard for administrators
   - Visualizations for comparing models and collaboration modes
   - Filtering by model, question type, and mode
   - Statistical analysis of user feedback
   - Export capabilities for further analysis

3. **JavaScript Modules**
   - `votingManager.js`: Handles UI rendering and vote submission
   - Integration with main.js for determining eligible questions

## Data Collection

The system collects the following data points:

### Question Categories

The voting system uses a comprehensive taxonomy of 100 question types organized into the following main categories:

1. **STEM Fields** - Including algebra, calculus, physics, chemistry, computer science, programming, AI, data science, engineering, etc.
2. **Social Sciences** - Including psychology, sociology, economics, political science, history, geography, etc.
3. **Humanities** - Including philosophy, ethics, literature, creative writing, religion, arts, music, etc.
4. **Business & Finance** - Including marketing, management, finance, accounting, real estate, etc.
5. **Health & Medicine** - Including medicine, anatomy, nutrition, mental health, epidemiology, etc.
6. **Law & Politics** - Including various areas of law, politics, government, policy, etc.
7. **Other Categories** - Including education, cooking, travel, sports, gaming, lifestyle, etc.

This detailed categorization enables granular analysis of AI performance across different knowledge domains.

1. **Rating Data**
   - For individual mode: Rankings of different models
   - For collaborative mode: 1-10 quality ratings

2. **Question Metadata**
   - Question text (for context)
   - Question type (categorized into 100 specific topics)
   - Time and date

3. **User Context**
   - User ID (anonymized)
   - Session information
   - Selected models
   - Collaboration mode and style (if applicable)

4. **Qualitative Data**
   - Optional free-text feedback from users
   - Analyzed for sentiment and common themes

## Analytics and Reporting

The admin dashboard provides several key views:

1. **Performance Metrics**
   - Average ratings by model, question type, and mode
   - Rating distribution analysis
   - Trend analysis over time

2. **Comparative Analysis**
   - Direct comparison between individual and collaborative modes
   - Relative performance of different AI models
   - Question type effectiveness analysis

3. **Feedback Analysis**
   - Sentiment analysis of text feedback
   - Common keyword and topic extraction
   - Correlation between ratings and feedback themes

## Implementation Details

### Sampling Logic

The system uses a deterministic hashing algorithm to select 2% of questions for voting. This ensures:

1. Consistent selection (same question always gets same result)
2. Even distribution across question types
3. Low performance impact on the main application

### Data Anonymization

All collected data is anonymized to protect user privacy:

1. User IDs are stored as hashed values
2. Questions are stored without identifying information
3. Admin access to raw data is restricted

### Integration Points

The voting system integrates with the existing application at these points:

1. In `main.js` after sending a user message - to determine eligibility
2. In `uiManager.js` after receiving AI responses - to display the voting UI
3. In `wsHandler.mjs` for handling vote submission messages

## Future Enhancements

Potential improvements for future versions:

1. A/B testing framework for different prompt strategies
2. More sophisticated natural language processing of feedback text
3. Machine learning models to predict user satisfaction
4. Real-time feedback dashboards for model performance monitoring
5. Integration with model training pipelines for continuous improvement

## Database Schema

The `Vote` schema in MongoDB includes:

```javascript
{
  userId: String,         // Anonymized user identifier  
  sessionId: String,      // Session tracking ID
  messageId: ObjectId,    // Reference to the conversation message
  modelId: String,        // AI model identifier (claude, gemini, etc.)
  rating: Number,         // Rating value (1-10)
  questionType: String,   // Categorized topic
  question: String,       // Original question text
  mode: String,           // 'individual' or 'collaborative'
  collaborationStyle: String, // Specific collaboration style if applicable
  feedback: String,       // Optional text feedback
  timestamp: Date         // When the vote was recorded
}
```