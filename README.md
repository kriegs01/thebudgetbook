<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Budget Book v2

A modern, feature-rich budgeting application built with React, TypeScript, and Supabase.

View your app in AI Studio: https://ai.studio/apps/drive/1ycYQEQFQoXZUCpk8DStQVrpnPutXVJFd

## Features

- 📊 **Dashboard** - Overview of your financial status
- 💰 **Accounts** - Manage checking, savings, and credit card accounts
- 📝 **Billers** - Track recurring bills and payments
- 💳 **Installments** - Monitor payment plans and loans
- 🐷 **Savings** - Organize savings goals with virtual jars
- 📈 **Transactions** - Record and analyze spending
- 🗄️ **Supabase Integration** - Cloud database with real-time sync

## Run Locally

**Prerequisites:**  Node.js (v16 or higher)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   
   Copy the example file and add your credentials:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon/public key
   - `GEMINI_API_KEY` - (Optional) Your Gemini API key

3. **Set up Supabase database:**
   
   See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed instructions.

4. **Run the app:**
   ```bash
   npm run dev
   ```

5. **Access the app:**
   
   Open [http://localhost:3000](http://localhost:3000) in your browser

## Deploy to Production

This application is optimized for deployment on Vercel. See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for:
- Complete deployment instructions
- Environment variable configuration
- Troubleshooting common issues
- Performance optimization tips

**Quick Deploy:**
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/kriegs01/thebudgetbookv2)

Don't forget to configure environment variables in Vercel after deployment!

## Supabase Integration

This application uses Supabase as its backend database. Key features:

- ✅ Environment-based configuration (no hardcoded credentials)
- ✅ Type-safe TypeScript interfaces for all database tables
- ✅ Reusable service layer with CRUD operations
- ✅ Demo page for testing database operations
- ✅ Comprehensive documentation

For detailed setup instructions, see [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Project Structure

```
├── pages/              # Application pages/routes
├── src/
│   ├── services/       # Supabase service layer (CRUD operations)
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Utility functions and Supabase client
├── App.tsx             # Main application component
├── types.ts            # Legacy types (to be migrated)
└── constants.tsx       # Application constants
```

## Documentation

- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Complete Supabase integration guide
- [.env.example](.env.example) - Environment variable template

## Development vs Production

### Development
- Use `.env.local` for local configuration
- Test with Supabase Demo page at `/pages/SupabaseDemo.tsx`
- Permissive RLS policies for easier testing

### Production
- Configure environment variables in your hosting platform
- Implement strict Row Level Security (RLS) policies
- Enable user authentication
- Monitor database usage and performance

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly (especially Supabase integration)
4. Submit a pull request

## Security Notes

- ⚠️ Never commit `.env.local` or any file with credentials
- ⚠️ Use environment variables for all sensitive configuration
- ⚠️ Implement proper RLS policies before deploying to production
- ⚠️ Never expose your Supabase service role key in client code

## License

Private project - All rights reserved
