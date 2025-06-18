# AI-Collab Deployment Guide

This guide covers deploying AI-Collab using Vercel (frontend), Render (backend), and MongoDB Atlas (database).

## Prerequisites

- GitHub account with your forked repository
- Vercel account (free tier works)
- Render account (free tier for testing, $7/month for production)
- MongoDB Atlas account (free tier available)
- Domain name (optional but recommended)

## Step 1: Prepare Your Repository

1. **Fork/Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/ai-collab.git
   cd ai-collab
   ```

2. **Remove Sensitive Data**
   - Ensure `.env` is in `.gitignore`
   - Never commit API keys or secrets
   - Use `.env.example` as a template

3. **Verify Configuration Files**
   - `vercel.json` - Frontend deployment config
   - `render.yaml` - Backend deployment config
   - `.env.example` - Environment template

## Step 2: MongoDB Atlas Setup

1. **Create a Cluster**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a free M0 cluster
   - Choose a region close to your users

2. **Configure Database Access**
   - Create a database user with a strong password
   - Note the username and password

3. **Configure Network Access**
   - Add `0.0.0.0/0` for Render access (or get Render's IP ranges)
   - For production, use specific IP ranges

4. **Get Connection String**
   - Click "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database password
   - Add database name: `mongodb+srv://...mongodb.net/ai_collab?retryWrites=true&w=majority`

## Step 3: Backend Deployment on Render

1. **Connect GitHub**
   - Sign in to [Render](https://render.com)
   - Connect your GitHub account
   - Authorize access to your repository

2. **Create Web Service**
   - Click "New" → "Web Service"
   - Select your AI-Collab repository
   - Configure:
     - **Name**: `ai-collab-backend`
     - **Region**: Choose closest to users
     - **Branch**: `main`
     - **Root Directory**: Leave blank
     - **Runtime**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `node src/server.mjs`

3. **Configure Environment Variables**
   
   Add these environment variables in Render dashboard:

   ```bash
   # Required
   NODE_ENV=production
   PORT=3001
   MONGODB_URI=your_mongodb_connection_string
   API_KEY_ENCRYPTION_KEY=generate_with_openssl_rand_hex_32
   JWT_SECRET=generate_random_string
   SESSION_SECRET=generate_random_string
   
   # Frontend URL (update after Vercel deployment)
   FRONTEND_URL=https://your-app.vercel.app
   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-domain.com
   
   # OAuth (optional)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   
   # Leave these empty to force users to provide their own
   OPENAI_API_KEY=
   ANTHROPIC_API_KEY=
   GEMINI_API_KEY=
   XAI_API_KEY=
   DEEPSEEK_API_KEY=
   LLAMA_API_KEY=
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your service URL: `https://ai-collab-backend.onrender.com`

## Step 4: Frontend Deployment on Vercel

1. **Import Project**
   - Go to [Vercel](https://vercel.com)
   - Click "Add New" → "Project"
   - Import your GitHub repository

2. **Configure Project**
   - **Framework Preset**: Other (no framework)
   - **Root Directory**: Leave blank
   - **Build Command**: Leave blank (static files)
   - **Output Directory**: `public`

3. **Update vercel.json**
   
   Edit the API destination in `vercel.json`:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/:path*",
         "destination": "https://your-backend.onrender.com/api/:path*"
       }
     ]
   }
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for deployment
   - Note your deployment URL: `https://your-app.vercel.app`

5. **Configure Custom Domain (Optional)**
   - In Vercel dashboard → Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

## Step 5: Post-Deployment Configuration

1. **Update Backend Environment**
   - Go back to Render dashboard
   - Update `FRONTEND_URL` with your Vercel URL
   - Update `ALLOWED_ORIGINS` to include your domains

2. **Test the Deployment**
   - Visit your frontend URL
   - Try creating an account
   - Test API key management
   - Test AI collaboration features

3. **Configure OAuth (Optional)**
   - Set up Google OAuth:
     - Go to [Google Cloud Console](https://console.cloud.google.com)
     - Create OAuth 2.0 credentials
     - Add authorized redirect URIs:
       - `https://your-backend.onrender.com/api/auth/google/callback`
     - Update environment variables in Render

## Step 6: Security Checklist

- [ ] All API keys removed from codebase
- [ ] Environment variables properly set
- [ ] HTTPS enabled on all domains
- [ ] CORS configured correctly
- [ ] MongoDB network access restricted
- [ ] API key encryption key generated securely
- [ ] JWT and session secrets are unique
- [ ] Rate limiting configured
- [ ] Security headers in place

## Step 7: Monitoring and Maintenance

1. **Set Up Monitoring**
   - Render provides basic health checks
   - Consider adding:
     - Uptime monitoring (UptimeRobot, Pingdom)
     - Error tracking (Sentry)
     - Analytics (Google Analytics, Plausible)

2. **Regular Maintenance**
   - Monitor MongoDB storage usage
   - Check Render logs for errors
   - Update dependencies regularly
   - Rotate secrets periodically

## Troubleshooting

### Frontend Issues

**Problem**: API calls failing
- Check browser console for CORS errors
- Verify `vercel.json` rewrites configuration
- Ensure backend URL is correct

**Problem**: Assets not loading
- Check file paths are relative
- Verify `public` directory structure
- Clear browser cache

### Backend Issues

**Problem**: Server crashes on Render
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure MongoDB connection string is correct

**Problem**: Cannot connect to MongoDB
- Verify network access settings in Atlas
- Check connection string format
- Ensure database user has correct permissions

### API Key Issues

**Problem**: API keys not working
- Ensure `API_KEY_ENCRYPTION_KEY` is set
- Check that keys are being encrypted/decrypted properly
- Verify provider API key format

## Cost Optimization

### Free Tier Limits
- **Vercel**: 100GB bandwidth/month
- **Render**: Spins down after 15 min inactivity
- **MongoDB Atlas**: 512MB storage

### Production Recommendations
- **Vercel**: Pro plan for commercial use ($20/month)
- **Render**: Starter plan for always-on ($7/month)
- **MongoDB**: M10 cluster for production ($57/month)

### Cost-Saving Tips
1. Use Vercel's edge caching for static assets
2. Implement request caching in backend
3. Use MongoDB indexes efficiently
4. Monitor and optimize API usage

## Building User Trust

### Transparency Features
1. **Security Page**: Already implemented at `/security.html`
2. **API Key Testing**: Users can test without saving
3. **Open Source**: Make repository public
4. **Documentation**: Keep docs updated

### Trust-Building Actions
1. **Security Audit**: Get professional security review
2. **Bug Bounty**: Offer rewards for security findings
3. **Terms of Service**: Add clear ToS and Privacy Policy
4. **Support**: Provide responsive support channels

### Marketing Trust
1. **Landing Page**: Highlight security features
2. **Demo Video**: Show encryption in action
3. **Testimonials**: Collect user feedback
4. **Badges**: Display security certifications

## Local Development

For local testing before deployment:

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your local settings

# Start the server
npm run dev

# Access at http://localhost:3001
```

## Support

- **Documentation**: Check `/docs` directory
- **Issues**: Report on GitHub Issues
- **Security**: Email security@ai-collab.com
- **Community**: Join our Discord server

---

Last updated: January 2025