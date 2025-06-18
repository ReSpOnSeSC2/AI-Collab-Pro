# Collaboration Metrics Dashboard and API Key Management

## Overview

This document describes the two major features added to the AI-Collab system:

1. **Collaboration Metrics Dashboard** - Track and analyze AI collaboration performance
2. **User API Key Management** - Allow users to provide their own API keys

## Collaboration Metrics Dashboard

### Features

#### 1. Real-time Metrics Tracking
- **Collaboration Quality Score**: Tracks quality scores over time for all collaborations
- **Model Performance Leaderboard**: Shows top-performing models based on quality, cost, and speed
- **Cost vs Quality Optimizer**: Visualizes the relationship between cost and quality for different models
- **Team Chemistry Analyzer**: Analyzes how well different AI models work together

#### 2. Dashboard Components

##### Summary Cards
- Total Collaborations
- Average Quality Score
- Total Cost
- Average Duration

##### Charts and Visualizations
- **Quality Trends Chart**: Line chart showing quality scores over time
- **Model Leaderboard**: Ranked list of models by performance
- **Cost vs Quality Scatter Plot**: Helps identify cost-effective models
- **Team Chemistry Radar Chart**: Shows consensus, diversity, and synergy scores

##### Cost Optimization Suggestions
- Automated suggestions for reducing costs while maintaining quality
- Model switching recommendations
- Collaboration type recommendations

### Database Schema

#### CollaborationMetrics Collection
```javascript
{
  sessionId: String,
  userId: String,
  timestamp: Date,
  collaborationType: String,
  models: [String],
  overallQualityScore: Number,
  totalCost: Number,
  totalDuration: Number,
  totalTokens: Number,
  modelMetrics: [{
    model: String,
    provider: String,
    responseTime: Number,
    tokenCount: Number,
    cost: Number,
    qualityScore: Number,
    errorRate: Number
  }],
  consensusScore: Number,
  diversityScore: Number,
  synergyScore: Number,
  userSatisfactionScore: Number,
  userFeedback: String
}
```

#### ModelLeaderboard Collection
```javascript
{
  model: String,
  provider: String,
  period: String,
  date: Date,
  metrics: {
    avgQualityScore: Number,
    avgResponseTime: Number,
    avgCost: Number,
    totalRequests: Number,
    errorRate: Number,
    userPreferenceScore: Number,
    collaborationSuccessRate: Number
  }
}
```

### API Endpoints

- `GET /api/metrics/dashboard?timeRange={day|week|month|quarter}` - Get dashboard data
- `GET /api/metrics/leaderboard?period={daily|weekly|monthly}` - Get model leaderboard
- `GET /api/metrics/cost-optimization` - Get cost optimization suggestions
- `GET /api/metrics/team-chemistry?timeRange={week|month|quarter}` - Get team chemistry analysis
- `GET /api/metrics/quality-trends?groupBy={hour|day|week}` - Get quality score trends

## User API Key Management

### Features

#### 1. Secure API Key Storage
- API keys are encrypted using AES-256-GCM before storage
- Only the last 4 characters are stored in plain text for identification
- Keys are validated when added

#### 2. Provider Support
- OpenAI (ChatGPT)
- Anthropic (Claude)
- Google (Gemini)
- DeepSeek
- Grok
- Llama

#### 3. Key Management UI
- Add/update API keys for each provider
- Test key validity
- Delete keys
- View usage statistics

### Database Schema

#### User Collection (Enhanced)
```javascript
{
  // ... existing fields ...
  apiKeys: [{
    provider: String,
    encryptedKey: String,
    keyId: String, // Last 4 chars
    isValid: Boolean,
    lastValidated: Date,
    addedAt: Date
  }],
  usage: {
    totalRequests: Number,
    totalCost: Number,
    lastRequestAt: Date
  },
  settings: {
    defaultModels: [String],
    preferredCollaborationType: String,
    costAlertThreshold: Number
  }
}
```

### API Endpoints

- `GET /api/api-keys` - Get user's API keys (masked)
- `POST /api/api-keys` - Add or update an API key
- `DELETE /api/api-keys/:provider` - Delete an API key
- `POST /api/api-keys/validate` - Validate an API key
- `GET /api/api-keys/status` - Get API key status for all providers

### Security Considerations

1. **Encryption**: API keys are encrypted using AES-256-GCM with a server-side encryption key
2. **Environment Variable**: `API_KEY_ENCRYPTION_KEY` must be set (generate with `openssl rand -hex 32`)
3. **Authentication**: All API key endpoints require user authentication
4. **Validation**: Keys are validated with the provider before storage

## Integration with Existing System

### AI Client Factory
The system now uses a client factory that:
1. First checks for user-provided API keys
2. Falls back to system API keys if user keys are not available
3. Caches clients for performance

### Metrics Recording
Metrics are automatically recorded when:
1. A collaboration completes (success or failure)
2. Individual model responses are received
3. User feedback is provided

### Usage Tracking
- User usage statistics are updated after each collaboration
- Cost alerts can be configured per user
- Usage data is displayed in the API keys management page

## Setup Instructions

1. **Environment Variables**
   ```bash
   # Generate encryption key
   openssl rand -hex 32
   
   # Add to .env file
   API_KEY_ENCRYPTION_KEY=your-generated-key-here
   ```

2. **Database Migration**
   The new collections will be created automatically when the application starts.

3. **Access the Features**
   - Metrics Dashboard: `/metrics-dashboard.html`
   - API Key Management: `/api-keys.html`

## Future Enhancements

1. **Metrics Dashboard**
   - Export metrics data to CSV/PDF
   - Custom date ranges
   - Model comparison tools
   - Predictive cost analysis

2. **API Key Management**
   - API key usage limits
   - Key rotation reminders
   - Team/organization key sharing
   - Billing integration

## Troubleshooting

### Common Issues

1. **Metrics not recording**
   - Ensure user is authenticated
   - Check MongoDB connection
   - Verify metrics service is running

2. **API keys not working**
   - Verify encryption key is set
   - Check key validity with provider
   - Ensure proper authentication

3. **Dashboard not loading**
   - Check browser console for errors
   - Verify API endpoints are accessible
   - Ensure Chart.js is loaded