# YouTube Analytics App - Context Document

## Purpose
A YouTube analytics app for creators that allows them to connect their YouTube channels, analyze stats with AI, and receive personalized insights and improvements. This is a virtual AI YouTube marketing analytics assistant with advanced animated text responses and intelligent data visualization.

## Key Features
- **AI-Powered Analytics**: Connect YouTube channels and receive personalized AI insights
- **Advanced Text Animation**: Character-by-character animated responses with smart punctuation timing
- **Batch-Based Reading**: Text appears in digestible 2-sentence chunks with natural pauses
- **Responsive Design**: Fluid layouts that adapt to all screen sizes without scrollbars
- **Smart Character Filtering**: Automatically removes problematic Unicode characters and replacement symbols

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

#### 1. **User Authentication Flow**
- Google OAuth sign-in (basic scopes: `openid email profile`)
- Supabase session management with hydration-safe header
- Sign in/out functionality with loading states
- Fixed hydration mismatch issues

#### 2. **YouTube Channel Connection**
- Separate popup-based OAuth flow for YouTube scopes
- Prevents session hijacking by YouTube Brand Accounts
- Stores YouTube tokens for the original signed-in user
- Supports multiple YouTube channels per user

#### 3. **Database Schema**
- `google_accounts` table: user_id, google_sub, account_email, access_token, refresh_token
- `channels` table: user_id, channel_id, title, thumbnails

#### 4. **Advanced AI Response System**
- **NeriaResponse Component**: Character-by-character animated text
- **Batch-Based Animation**: Text appears in 2-sentence chunks with 3-second pauses
- **Smart Punctuation Timing**: 1-second pauses after periods/exclamation marks, 0.5-second pauses after commas (except in numbers)
- **Unicode Character Filtering**: Automatically removes replacement characters ("��") and other problematic Unicode
- **Fade Transitions**: Smooth fade-out between text batches

#### 5. **Enhanced UI/UX**
- **CollectionHero Component**: Dedicated data collection interface with fixed status indicator
- **Responsive Layout**: Full-height design with fixed header/footer, no scrollbars
- **Fixed Status Indicator**: "COLLECTING DATA" positioned at bottom-left with responsive text sizing
- **Loading States**: Proper loading indicators during hydration and data collection

#### 6. **Technical Improvements**
- **Hydration Safety**: Resolved React hydration mismatch errors
- **Full-Height Layout**: Proper 100vh layout with fixed header (80px) and footer (51px)
- **Responsive Typography**: Fluid text sizing that scales with viewport width
- **Animation Performance**: Optimized CSS animations with proper timing

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
│   │   ├── add-youtube-channel/route.ts
│   │   ├── collect-youtube-data/route.ts    # Data collection endpoint
│   │   └── google/user-and-tokens/route.ts  # Token management
│   ├── dashboard/
│   │   ├── collection/page.tsx       # Data collection with AI animation
│   │   ├── [channelId]/page.tsx      # Channel-specific dashboard
│   │   └── page.tsx                  # Main dashboard
│   ├── youtube-connect/page.tsx       # YouTube OAuth popup initiator
│   ├── youtube-callback/page.tsx      # YouTube OAuth callback handler
│   ├── layout.tsx                     # Root layout with header/footer
│   └── page.tsx                       # Home page
├── components/
│   ├── AuthButtons.tsx                # Sign in/out buttons
│   ├── CollectionHero.tsx             # Data collection interface with fixed status
│   ├── Footer.tsx                     # Fixed bottom footer
│   ├── Header.tsx                     # Navigation header with hydration safety
│   ├── Hero.tsx                       # Landing page hero
│   ├── NeriaResponse.tsx              # AI response with batch animation
│   ├── OnboardHero.tsx                # Onboarding interface
│   └── YouTubeStats.tsx               # Channel statistics display
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
- [ ] Implement detailed channel analytics display with charts
- [ ] Add video-level analytics and performance metrics
- [ ] Create channel comparison functionality
- [ ] Add data export and reporting features
- [ ] Implement user preferences and customization
- [ ] Add real-time data updates and notifications
- [ ] Create mobile-responsive dashboard layouts
- [ ] Set up production environment variables and CI/CD
- [ ] Deploy to production with monitoring

## Important Notes

### Authentication & Security
- **Session Preservation**: The popup-based YouTube OAuth is crucial for preventing Brand Account session takeover
- **User ID Consistency**: Always use the `state` parameter to ensure YouTube data is associated with the correct user
- **Token Management**: YouTube access/refresh tokens are stored in `google_accounts` table and can be used for API calls
- **Multi-Channel Support**: A single user can connect multiple YouTube channels (personal + Brand Accounts)

### UI/UX Features
- **Hydration Safety**: All components are designed to prevent React hydration mismatch errors
- **Full-Height Layout**: Header (80px) and footer (51px) are fixed with content filling remaining space
- **Responsive Design**: All components adapt to different screen sizes without scrollbars
- **Animation System**: Character-by-character text animation with intelligent punctuation timing

### Animation System
- **Batch-Based Animation**: Text appears in 2-sentence chunks with 3-second pauses between batches
- **Punctuation Timing**: 1-second pause after sentence endings, 0.5-second pause after commas (except in numbers)
- **Character Filtering**: Automatically removes problematic Unicode characters and replacement symbols
- **Fade Transitions**: Smooth 0.5-second fade-out between text batches

### Performance Considerations
- **Animation Optimization**: Uses CSS transforms and will-change for smooth performance
- **Memory Management**: Proper cleanup of timers and animation delays
- **Loading States**: Skeleton loading during hydration to prevent layout shifts

## Common Issues & Solutions

### Authentication Issues
1. **"invalid_client" error**: Check Google Client ID/Secret in environment variables
2. **"redirect_uri_mismatch"**: Ensure redirect URIs in code match Google Console exactly
3. **Session replacement**: Use popup-based OAuth for secondary authentications
4. **Port conflicts**: App runs on localhost:3001 (port 3000 often in use)

### React & Hydration Issues
1. **Hydration mismatch**: Ensure server and client render identical content initially. Use loading states during hydration.
2. **Unicode replacement characters**: The app automatically filters problematic Unicode characters from AI responses
3. **Animation timing issues**: Character animation uses cumulative delays with punctuation pauses for natural timing

### UI/UX Issues
1. **No scrollbars**: Layout uses fixed header/footer with flex-1 main content for full-height design
2. **Text animation not working**: Ensure `animate-heroChar` CSS class is properly defined and characters have `data-char` attributes
3. **Responsive text issues**: Text sizing uses Tailwind responsive classes (`text-lg sm:text-xl md:text-2xl lg:text-3xl`)
