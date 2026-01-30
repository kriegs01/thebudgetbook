# Quick Setup Guide

This guide will help you get the Budget Book app running locally in under 5 minutes.

## Prerequisites

- Node.js v16 or higher
- npm (comes with Node.js)

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This installs all required packages including:
- React, React Router, and React DOM
- Supabase client
- Recharts for data visualization
- Lucide React for icons
- And more...

### 2. Configure Environment Variables

Create your local environment file:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and add your Supabase credentials:

```env
# Get these from your Supabase project dashboard
# Settings -> API
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: Gemini API key if using AI features
GEMINI_API_KEY=your-gemini-key-here
```

**Don't have Supabase set up yet?** See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed instructions.

### 3. Start Development Server

```bash
npm run dev
```

The app will start at `http://localhost:3000`

### 4. Open in Browser

Navigate to:
```
http://localhost:3000
```

You should see the Budget Book dashboard!

## Available Scripts

- `npm run dev` - Start development server (hot reload enabled)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Testing the App

### Dashboard (Default Page)
Visit `http://localhost:3000/` to see:
- Total balance overview
- Budget usage
- Credit utilization
- Recent transactions

### Supabase Demo Page
Visit `http://localhost:3000/supabase-demo` to test:
- Creating accounts
- Reading from database
- Updating balances
- Deleting accounts

This is a great way to verify your Supabase connection is working!

## Troubleshooting

### "Cannot resolve import @supabase/supabase-js"

**Solution**: Run `npm install` to ensure all dependencies are installed.

### "Missing Supabase environment variables"

**Solution**: Make sure `.env.local` exists and contains valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Port 3000 already in use

**Solution**: Either:
1. Stop the other process using port 3000
2. Or edit `vite.config.ts` to change the port number

### Build works but dev server doesn't

**Solution**: This shouldn't happen anymore! The latest code fixes this. Make sure you:
1. Pulled the latest changes
2. Ran `npm install`
3. Have `.env.local` configured

## Development vs Production

| Feature | Development (`npm run dev`) | Production (`npm run build`) |
|---------|----------------------------|------------------------------|
| Dependencies | Bundled by Vite | Loaded from CDN (esm.sh) |
| Hot Reload | ✅ Yes | ❌ No |
| Build Time | ~200ms startup | ~2s full build |
| Bundle Size | N/A (unbundled) | ~340 KB |
| Source Maps | ✅ Yes | ❌ No |
| Best For | Local development | Vercel deployment |

## Next Steps

Once the app is running locally:

1. **Explore the features**
   - Try adding an account
   - Create a biller
   - Set up savings jars

2. **Test Supabase integration**
   - Visit `/supabase-demo`
   - Create test accounts
   - Verify CRUD operations work

3. **Review documentation**
   - [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Database setup
   - [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) - Production deployment
   - [README.md](README.md) - Project overview

## Need Help?

- Check the browser console for errors
- Review [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for database issues
- See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for deployment problems

## Environment Files Checklist

- [x] `.env.example` - Template (committed to repo)
- [x] `.env.local` - Your local config (NOT committed, in .gitignore)
- [x] `.gitignore` - Contains `.env.local` entry

**Important**: Never commit `.env.local` to version control! It contains sensitive credentials.

## Summary

That's it! With just three commands, you should have the app running:

```bash
npm install                    # Install dependencies
cp .env.example .env.local    # Create environment file (then edit it)
npm run dev                    # Start the app
```

Happy budgeting! 💰
