# YouTube Analytics App - Context Document

## Purpose
A YouTube analytics app for creators that allows them to connect their YouTube channels, analyze stats with AI, and receive personalized insights and improvements. This is a virtual AI YouTube marketing analytics assistant.

## Tech Stack
- **Framework**: Next.js 15.5.0 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with Google OAuth
- **APIs**: YouTube Data API v3, YouTube Analytics API
- **External Libraries**: googleapis (for direct Google API access)

## Current Implementation Status

### ✅ Completed Features
1. **User Authentication Flow**
   - Google OAuth sign-in (basic scopes only: `openid email profile`)
   - Supabase session management
   - Sign in/out functionality in header

2. **YouTube Channel Connection**
   - Separate popup-based OAuth flow for YouTube scopes
   - Prevents session hijacking by YouTube Brand Accounts
   - Stores YouTube tokens for the original signed-in user
   - Supports multiple YouTube channels per user

3. **Database Schema**
   - `google_accounts` table: user_id, google_sub, account_email, access_token, refresh_token
   - `channels` table: user_id, channel_id, title, thumbnails

4. **UI Components**
   - Home page with authentication check
   - Dashboard with left sidebar showing connected channels
   - Header with sign in/out buttons

### 🔧 Key Technical Solutions

#### Brand Account Session Issue
**Problem**: Google OAuth with YouTube Brand Accounts replaces the main user session, causing authentication confusion.

**Solution**: Two-phase authentication:
1. **Phase 1**: Basic Google sign-in with minimal scopes → establishes primary user session
2. **Phase 2**: Popup-based YouTube OAuth → gets YouTube tokens but associates them with the original user via `state` parameter

#### File Structure
```
src/
├── app/
│   ├── auth/
│   │   ├── callback/route.ts          # Basic Google auth callback
│   │   └── signin/page.tsx            # Sign-in page
│   ├── api/
│   │   ├── youtube-connect/route.ts   # YouTube token exchange
│   │   ├── get-youtube-channels/route.ts
│   │   └── add-youtube-channel/route.ts
│   ├── dashboard/page.tsx             # Main dashboard
│   ├── youtube-connect/page.tsx       # YouTube OAuth popup initiator
│   ├── youtube-callback/page.tsx      # YouTube OAuth callback handler
│   ├── layout.tsx                     # Root layout with header
│   └── page.tsx                       # Home page
├── components/
│   └── AuthButtons.tsx                # Sign in/out buttons
└── utils/
    └── supabase/
        ├── client.ts                  # Browser client
        ├── server.ts                  # Server client
        └── admin.ts                   # Admin client
```

## Environment Variables Required
```env
NEXT_PUBLIC_SUPABASE_URL=https://vmgjrvwwfcomhexlgwds.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon_key]
SUPABASE_SERVICE_ROLE_KEY=[service_role_key]
NEXT_PUBLIC_GOOGLE_CLIENT_ID=[google_client_id]
GOOGLE_CLIENT_ID=[google_client_id]
GOOGLE_CLIENT_SECRET=[google_client_secret]
```

## Google Cloud Console Setup
- **OAuth 2.0 Client ID**: Web application
- **Authorized JavaScript origins**: 
  - `http://localhost:3000`
  - `http://localhost:3001`
- **Authorized redirect URIs**:
  - `https://vmgjrvwwfcomhexlgwds.supabase.co/auth/v1/callback` (Supabase auth)
  - `http://localhost:3000/youtube-callback`
  - `http://localhost:3001/youtube-callback`
- **APIs Enabled**: YouTube Data API v3, YouTube Analytics API

## Current User Flow
1. User visits home page
2. Clicks "Get Started" → redirects to sign-in page
3. Signs in with Google (basic scopes) → redirects to dashboard
4. Dashboard shows "Connect YouTube channel" button
5. Click button → opens popup with YouTube OAuth (YouTube scopes)
6. User selects YouTube account/channel → grants permissions
7. Popup closes, dashboard refreshes with new channels in sidebar
8. **Key**: Main session always preserved as original Google account

## Next Steps / TODO
- [ ] Implement channel analytics display
- [ ] Add AI-powered insights generation
- [ ] Create channel switching functionality
- [ ] Add video analytics
- [ ] Implement performance recommendations
- [ ] Add data visualization charts
- [ ] Set up production environment variables
- [ ] Deploy to production

## Important Notes
- **Session Preservation**: The popup-based YouTube OAuth is crucial for preventing Brand Account session takeover
- **User ID Consistency**: Always use the `state` parameter to ensure YouTube data is associated with the correct user
- **Token Management**: YouTube access/refresh tokens are stored in `google_accounts` table and can be used for API calls
- **Multi-Channel Support**: A single user can connect multiple YouTube channels (personal + Brand Accounts)

## Common Issues & Solutions
1. **"invalid_client" error**: Check Google Client ID/Secret in environment variables
2. **"redirect_uri_mismatch"**: Ensure redirect URIs in code match Google Console exactly
3. **Session replacement**: Use popup-based OAuth for secondary authentications
4. **Port conflicts**: App runs on localhost:3001 (port 3000 often in use)
