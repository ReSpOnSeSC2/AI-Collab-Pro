# Google OAuth Configuration Instructions

## Important: Update Google Cloud Console

You need to update your Google OAuth 2.0 credentials in the Google Cloud Console to add the production callback URL.

### Steps:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID (the one with ID: `764585655766-pecechdcnnemfli0l4ac503iqvibc1fb.apps.googleusercontent.com`)
5. In the **Authorized redirect URIs** section, add these URLs:
   - `https://ai-collab-pro.onrender.com/api/auth/google/callback` (Production backend)
   - `http://localhost:3001/api/auth/google/callback` (Local development - should already exist)

### Current Configuration in Code:

The application is now configured to use these URLs:
- **Backend URL**: `https://ai-collab-pro.onrender.com` (set via BACKEND_URL env var)
- **Frontend URL**: `https://ai-collab-pro.vercel.app` (set via FRONTEND_URL env var)
- **Google OAuth Callback**: `{BACKEND_URL}/api/auth/google/callback`

### How it Works:

1. User clicks "Sign in with Google" on the frontend
2. Frontend redirects to backend: `https://ai-collab-pro.onrender.com/api/auth/google`
3. Backend redirects to Google with callback URL: `https://ai-collab-pro.onrender.com/api/auth/google/callback`
4. After authentication, Google redirects back to the callback URL
5. Backend processes the authentication and redirects to frontend: `https://ai-collab-pro.vercel.app/hub.html`

### Environment Variables Added:

```env
BACKEND_URL=https://ai-collab-pro.onrender.com
FRONTEND_URL=https://ai-collab-pro.vercel.app
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000,https://ai-collab-pro.vercel.app,https://ai-collab-pro.onrender.com
```

### Deployment Notes:

Make sure these environment variables are set in your production deployments:
- On Render (backend): Set `BACKEND_URL`, `FRONTEND_URL`, and `ALLOWED_ORIGINS`
- On Vercel (frontend): Not needed for OAuth, but may be useful for API calls

### Testing:

After updating the Google Cloud Console and deploying with the new environment variables:
1. Clear your browser cookies/cache
2. Try signing in with Google from the production site
3. Check the network tab to ensure redirects go to the correct URLs