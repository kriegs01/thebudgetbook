# Vercel Deployment Guide

This document provides instructions for deploying the Budget Book application to Vercel.

## Quick Start

The application is now configured for automatic Vercel deployment. Simply push to your repository and Vercel will handle the build.

## Build Configuration

### Build Settings

The application uses the following build configuration:

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Framework Preset**: Vite

### Architecture

The app uses a **hybrid CDN + bundled** architecture:

#### External Dependencies (Loaded from esm.sh CDN)
- react @ 19.2.3
- react-dom @ 19.2.3
- react-router-dom @ 7.13.0
- recharts @ 3.7.0
- lucide-react @ 0.563.0
- @supabase/supabase-js @ 2.93.3

#### Bundled Code
- Application code (~340 KB)
- Custom components and pages
- Business logic and utilities

#### External Styling
- Tailwind CSS (via CDN)
- Google Fonts (Inter)

## Environment Variables

For production deployment, configure the following environment variables in Vercel:

### Required Variables

1. **VITE_SUPABASE_URL**
   - Your Supabase project URL
   - Format: `https://xxxxx.supabase.co`
   - Found in: Supabase Dashboard → Settings → API

2. **VITE_SUPABASE_ANON_KEY**
   - Your Supabase anonymous/public key
   - Format: Long JWT token string
   - Found in: Supabase Dashboard → Settings → API

### Optional Variables

3. **GEMINI_API_KEY**
   - If using Gemini AI features
   - Get from: Google AI Studio

### How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - Key: `VITE_SUPABASE_URL`
   - Value: Your Supabase URL
   - Environments: Production, Preview, Development (select as needed)
4. Click **Save**
5. Redeploy for changes to take effect

## Deployment Steps

### Automatic Deployment (Recommended)

1. **Connect Repository**
   ```bash
   # Push your changes
   git add .
   git commit -m "Your commit message"
   git push origin main
   ```

2. **Vercel Auto-Deploy**
   - Vercel detects the push
   - Runs `npm install`
   - Runs `npm run build`
   - Deploys to your domain

### Manual Deployment

If you need to deploy manually:

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

## Build Verification

To verify the build works before deploying:

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Build
npm run build

# Verify output
ls -lah dist/

# Preview locally
npm run preview
```

Expected output:
```
✓ 38 modules transformed
dist/index.html                  1.32 kB │ gzip:  0.65 kB
dist/assets/index-[hash].js    340.25 kB │ gzip: 84.16 kB
✓ built in 1.74s
```

## Troubleshooting

### Build Fails with "Cannot resolve import"

**Cause**: A dependency is being bundled instead of loaded externally.

**Solution**: 
1. Add the dependency to the import map in `index.html`
2. Add the dependency to `build.rollupOptions.external` in `vite.config.ts`

### App Shows Blank Page

**Possible causes**:

1. **Missing Environment Variables**
   - Check Vercel dashboard → Settings → Environment Variables
   - Ensure all required variables are set
   - Redeploy after adding variables

2. **Import Map Issues**
   - Check browser console for 404 errors on esm.sh
   - Verify dependency versions in import map match package.json

3. **Routing Issues**
   - Ensure `vercel.json` contains the SPA rewrite rule:
     ```json
     {
       "rewrites": [{ "source": "/(.*)", "destination": "/" }]
     }
     ```

### Console Errors about Supabase

**Cause**: Environment variables not set or incorrect.

**Solution**:
1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel
2. Check the values are correct (no extra spaces, quotes, etc.)
3. Redeploy after fixing

### 404 on Refresh or Direct URL Access

**Cause**: Missing SPA rewrite configuration.

**Solution**: Ensure `vercel.json` is present with the correct rewrite rule (it should already be there).

## Performance Optimization

### Current Optimization

- ✅ External dependencies cached by CDN
- ✅ Small bundle size (340 KB)
- ✅ Code splitting via Vite
- ✅ Gzip compression enabled

### Future Improvements

Consider these optimizations:

1. **Add Service Worker** for offline support
2. **Implement Code Splitting** by route
3. **Enable PWA features** for mobile
4. **Add Image Optimization** via Vercel Image

## Monitoring

After deployment, monitor:

1. **Vercel Dashboard**
   - Build times
   - Deployment status
   - Error logs

2. **Browser Console** (in production)
   - Check for import errors
   - Verify Supabase connection
   - Monitor performance

3. **Supabase Dashboard**
   - API usage
   - Database queries
   - Error logs

## Support

For issues:

1. Check build logs in Vercel dashboard
2. Review browser console for runtime errors
3. Consult `SUPABASE_SETUP.md` for database issues
4. Check Vercel documentation: https://vercel.com/docs

## Architecture Notes

### Why Import Maps?

The app uses import maps for several reasons:

1. **Smaller Deployments**: External dependencies not included in bundle
2. **Better Caching**: CDN-cached dependencies shared across sessions
3. **Faster Builds**: Less code to process during build
4. **Browser-Native**: No need for complex bundler configurations

### Dependency Management

When adding new npm packages:

1. Install via npm: `npm install package-name`
2. Add to import map in `index.html`:
   ```json
   "package-name": "https://esm.sh/package-name@^version"
   ```
3. Add to external list in `vite.config.ts`:
   ```typescript
   external: [..., 'package-name']
   ```
4. Test build: `npm run build`

## Checklist Before Deployment

- [ ] All changes committed and pushed
- [ ] Build succeeds locally (`npm run build`)
- [ ] Environment variables configured in Vercel
- [ ] Supabase database schema up to date
- [ ] No sensitive data in code
- [ ] .env.local not committed (check with `git status`)

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Documentation](https://vitejs.dev/guide/)
- [Supabase Documentation](https://supabase.com/docs)
- [Import Maps Specification](https://github.com/WICG/import-maps)
