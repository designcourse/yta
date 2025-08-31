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
- **Styling**: Tailwind CSS 4.0
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with Google OAuth
- **APIs**: YouTube Data API v3, YouTube Analytics API
- **AI**: OpenAI API for Neria AI assistant
- **3D Graphics**: Spline (@splinetool/react-spline)
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

#### 3. **Enhanced Database Schema**
- `google_accounts` table: user_id, google_sub, account_email, access_token, refresh_token, last_channel_used
- `channels` table: user_id, channel_id, title, thumbnails, subscriber_count, video_count, view_count, published_at
- `neria_context` table: channel_id, prompt_type, prompt_text for AI context storage
- `channel_questions` table: channel_id, user_id, question, answer for onboarding data
- `chat_threads` table: per-user and optional per-channel chat threads (title, metadata, timestamps)
- `chat_messages` table: thread_id, role (user|assistant), content, created_at
- `thread_summaries` table: thread_id, summary_text for compact conversation memory
- `memory_profile` table: per-user+channel long-term profile (goals, preferences, constraints)
- `channel_strategy` table: per-user+channel persisted plan_text used in coaching context

#### 4. **Advanced Neria AI System**
- **Real-time Streaming Responses**: Character-by-character streaming from OpenAI using Server-Sent Events (SSE)
- **NeriaResponse Component**: Character-by-character animated text with enhanced batch processing
- **Batch-Based Animation**: Text appears in 2-sentence chunks (4 for strategy responses) with intelligent pauses
- **Smart Punctuation Timing**: 1-second pauses after periods/exclamation marks, 0.5-second pauses after commas (except in numbers)
- **Unicode Character Filtering**: Comprehensive filtering of problematic Unicode characters and control sequences
- **Fade Transitions**: Smooth fade-out between text batches with improved performance
- **AI Strategy Generation**: OpenAI-powered channel analysis and growth strategies
- **Context-Aware Responses**: Maintains conversation context across multiple interactions
- **NeriaContainer Component**: Floating AI assistant window with minimize/detach functionality and streaming chat
- **Context Percentage Indicator**: Real-time visual display of conversation context usage with Cursor-style radial progress
- **GPT-4o Integration**: Premium AI model for highest quality responses and strategic insights
- **Token Counting**: Accurate context calculation using empirical estimation for optimal performance
- **AI-Powered Intent Detection**: Advanced natural language understanding system that analyzes user requests to determine appropriate actions (video title generation, navigation, analytics viewing, etc.) replacing brittle keyword matching with robust AI-driven intent recognition

#### 5. **Comprehensive Dashboard System**
- **DashboardLayout Component**: Unified layout with sidebar navigation and channel selector
- **DashboardSidebar Component**: Channel navigation with dynamic routing and "Add Channel" functionality
- **Channel-Specific Pages**: Dedicated routes for Latest Video, Video Planner, Best/Worst Performing, My Goals, Thumbnail Content
- **YouTubeStats Component**: Real-time analytics display with 90-day metrics, subscriber growth, view counts
- **Responsive Layout**: Full-height design with fixed sidebar (213px) and responsive content area
- **Loading States**: Enhanced loading indicators during data fetching and authentication
- **PromptBar Component**: Interactive input component with auto-resize and keyboard shortcuts

#### 6. **AI-Powered Video Planner**
- **Smart Title Generation**: GPT-4o powered video title suggestions based on channel context, user goals, and performance data
- **6-Card Layout**: Responsive grid layout with 300px minimum width cards that adapt to screen size
- **Database-Stored Avatars**: Efficient channel avatar loading from local database instead of YouTube API calls
- **24-Hour Caching**: Intelligent caching system to avoid unnecessary AI generation while maintaining freshness
- **Generate More Functionality**: One-click refresh for new title ideas with loading states
- **Neria Chat Integration**: Custom title generation via chat commands with real-time updates
- **Smart Redirect System**: Automatically redirects users to Video Planner when requesting titles from other pages
- **Context-Aware Prompts**: Incorporates user memory profiles, channel strategy, and latest video performance
- **Consistent Card Heights**: Fixed layout issues for varying title lengths with proper spacing

#### 7. **Advanced Data Collection & Analytics**
- **YouTube Analytics Integration**: Real-time data fetching with automatic token refresh
- **Enhanced Data Collection**: Channel statistics, subscriber counts, video metrics, account age calculation
- **Debug & Fix Endpoints**: Comprehensive debugging tools for channel associations and data integrity
- **Last Channel Tracking**: Remembers user's last viewed channel for improved UX
- **Comprehensive Data Wipe**: Enhanced cleanup functionality covering all tables (chat_threads, messages, profiles, etc.)
- **Error Handling**: Robust error handling with detailed logging and user feedback

#### 8. **Context Awareness & Model Optimization**
- **Real-time Context Tracking**: Visual indicator showing conversation context usage percentage
- **ContextIndicator Component**: Cursor-style radial progress bar with precise token calculations
- **Context Persistence**: Context percentage maintained across page refreshes and navigation
- **GPT-4o Upgrade**: Enhanced model configuration from gpt-4o-mini to gpt-4o for premium quality
- **Dynamic Model Management**: Database-driven model selection with fallback configuration
- **Token Estimation**: Reliable token counting without WebAssembly dependencies

#### 9. **Technical Improvements**
- **Hydration Safety**: Resolved React hydration mismatch errors
- **Sidebar Navigation**: Fixed 213px sidebar with responsive main content area
- **Responsive Typography**: Fluid text sizing that scales with viewport width
- **Animation Performance**: Optimized CSS animations with will-change properties
- **Code Organization**: Improved component separation and reusability

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
│   │   ├── youtube-stats/route.ts     # Real-time YouTube analytics
│   │   ├── get-youtube-channels/route.ts
│   │   ├── add-youtube-channel/route.ts
│   │   ├── collect-youtube-data/route.ts    # Enhanced data collection with debug/fix
│   │   ├── check-user-channels/route.ts     # Channel validation
│   │   ├── update-last-channel/route.ts     # Last channel tracking
│   │   ├── wipe-all-data/route.ts          # Data cleanup
│   │   ├── neria/                          # AI assistant endpoints
│   │   │   ├── generate-strategy/route.ts  # AI strategy generation
│   │   │   ├── next-question/route.ts      # Dynamic Q&A
│   │   │   ├── refine-plan/route.ts        # Plan refinement
│   │   │   ├── chat/route.ts               # Streaming chat with SSE, build context, store reply
│   │   │   ├── messages/route.ts           # List messages for a thread
│   │   │   └── threads/route.ts            # List threads by user/channel
│   │   └── google/user-and-tokens/route.ts  # Token management
│   ├── dashboard/
│   │   ├── collection/page.tsx             # Data collection with AI animation
│   │   ├── [channelId]/                    # Channel-specific routes
│   │   │   ├── page.tsx                    # Channel overview (redirects to latest-video)
│   │   │   ├── latest-video/page.tsx       # Latest video analytics
│   │   │   ├── planner/page.tsx            # AI-powered video planner
│   │   │   ├── best-performing/page.tsx    # Top performing content
│   │   │   ├── worst-performing/page.tsx   # Underperforming content analysis
│   │   │   ├── my-goals/page.tsx           # Goal setting and tracking
│   │   │   └── thumbnail-content/page.tsx  # Thumbnail optimization
│   │   └── page.tsx                        # Main dashboard (redirects to last channel)
│   ├── account/page.tsx                    # Account settings
│   ├── support/page.tsx                    # Support page
│   ├── onboard/page.tsx                    # User onboarding
│   ├── youtube-connect/page.tsx            # YouTube OAuth popup initiator
│   ├── youtube-callback/page.tsx           # YouTube OAuth callback handler
│   ├── layout.tsx                          # Root layout
│   └── page.tsx                            # Home page
├── components/
│   ├── AuthButtons.tsx                # Sign in/out buttons
│   ├── ChannelSelector.tsx            # Channel switching interface
│   ├── CollectionHero.tsx             # Data collection interface
│   ├── ConditionalLayout.tsx          # Conditional layout wrapper
│   ├── DashboardLayout.tsx            # Main dashboard layout with sidebar
│   ├── DashboardSidebar.tsx           # Navigation sidebar with channels
│   ├── Footer.tsx                     # Fixed bottom footer
│   ├── Header.tsx                     # Navigation header with hydration safety
│   ├── Hero.tsx                       # Landing page hero with staggered animations
│   ├── NeriaContainer.tsx             # Floating AI assistant window
│   ├── NeriaResponse.tsx              # Enhanced AI response with batch animation
│   ├── OnboardHero.tsx                # Onboarding interface
│   ├── PromptBar.tsx                  # Interactive input with auto-resize
│   ├── SplineBackground.tsx           # 3D animated background
│   └── YouTubeStats.tsx               # Comprehensive analytics dashboard
└── utils/
    ├── googleAuth.ts                   # Enhanced Google OAuth with token refresh
    ├── openai.ts                       # OpenAI integration for Neria AI
    └── supabase/
        ├── client.ts                   # Browser client
        ├── server.ts                   # Server client
        └── admin.ts                    # Admin client
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

## Enhanced User Flow
1. User visits home page with animated Neria introduction
2. Clicks "Get Started" → redirects to sign-in page
3. Signs in with Google (basic scopes) → redirects to dashboard
4. Dashboard automatically redirects to last used channel or first channel
5. **Dashboard Navigation**:
   - Sidebar shows all connected channels with "Add Channel" button
   - Main sections: Latest Video, Video Planner, Best/Worst Performing
   - Secondary sections: My Goals, Thumbnail Content
6. **Channel Connection**: Click "Add Channel" → popup YouTube OAuth → data collection page
7. **Data Collection**: Automated YouTube API data fetching with real-time progress
8. **Neria AI Integration**: Contextual AI responses based on channel analytics
9. **Analytics Dashboard**: Real-time metrics, subscriber growth, performance insights
10. **Key**: Session preservation + last channel tracking for seamless UX

## Next Steps / TODO
### Analytics & Visualization
- [ ] Add interactive charts and graphs to analytics dashboard
- [ ] Implement video-level analytics with thumbnail analysis
- [ ] Create channel comparison functionality across multiple channels
- [ ] Add time-range selectors for analytics (7d, 30d, 90d, 1y)
- [ ] Develop performance prediction models

### Neria AI Enhancements
- [ ] Implement video content strategy generation
- [ ] Add thumbnail A/B testing recommendations
- [ ] Create personalized growth plans based on channel metrics
- [ ] Develop competitor analysis features
- [ ] Add content calendar integration

### Dashboard Features
- [ ] Complete implementation of Best/Worst Performing pages
- [ ] Add goal setting and progress tracking
- [ ] Implement thumbnail content optimization tools
- [ ] Create video upload scheduling recommendations
- [ ] Add collaboration features for team channels

### Technical Improvements
- [ ] Add real-time data synchronization with WebSockets
- [ ] Implement data caching and background refresh
- [ ] Add mobile-responsive dashboard layouts
- [ ] Create data export and reporting features
- [ ] Set up production environment and monitoring
- [ ] Implement comprehensive error tracking and logging

## Important Notes

### Authentication & Security
- **Session Preservation**: The popup-based YouTube OAuth is crucial for preventing Brand Account session takeover
- **User ID Consistency**: Always use the `state` parameter to ensure YouTube data is associated with the correct user
- **Token Management**: YouTube access/refresh tokens are stored in `google_accounts` table and can be used for API calls
- **Multi-Channel Support**: A single user can connect multiple YouTube channels (personal + Brand Accounts)

### Dashboard & Navigation
- **Sidebar Navigation**: Fixed 213px sidebar with dynamic channel routing and navigation states
- **Channel Management**: Multi-channel support with last channel tracking and seamless switching
- **Route Protection**: Automatic redirects based on authentication and channel availability
- **Breadcrumb Navigation**: Clear navigation paths with active state indicators

### UI/UX Features
- **Hydration Safety**: All components designed to prevent React hydration mismatch errors
- **Responsive Layout**: Sidebar + main content area with responsive breakpoints
- **Enhanced Typography**: Improved font sizing and spacing across all components
- **Animation System**: Character-by-character text animation with enhanced batch processing
- **Interactive Elements**: Hover states, loading indicators, and micro-interactions throughout

### Analytics Integration
- **Real-Time Data**: Live YouTube Analytics API integration with automatic token refresh
- **Performance Metrics**: Subscriber growth, view counts, engagement rates, watch time
- **Date Range Analysis**: 90-day analytics with customizable time periods
- **Channel Insights**: Account age calculation, publishing frequency, content performance

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

## Neria Chat System & Context Memory Management

### Server-side context and memory
- **Pinned context assembly** (on `POST /api/neria/chat`):
  - **Channel meta**: title and external YouTube id from `channels` via the thread's `channel_id`.
  - **Memory profile**: long-term user+channel memory from `memory_profile` (goals, preferences, constraints).
  - **Latest stats**: summary from `stats_snapshots` for period `latest`, falling back to `latest_video_snapshots` if needed.
  - **Channel context**: `neria_context` rows for `channel_about` and `recent_video_titles` (parsed JSON list).
  - **Strategy plan**: persisted coaching plan from `channel_strategy.plan_text`.
  - These are merged into a single system prompt to ground replies in goals, constraints, channel context and current stats.
- **Conversation history**: last 12 messages from `chat_messages` are included to preserve short-term context while controlling token usage.
- **Storage**: user messages and assistant replies are appended to `chat_messages` under the thread.
- **Summarization**: if a thread exceeds 30 messages, a compact summary is generated and stored in `thread_summaries` to aid long-term recall without sending the entire history.
- **Thread resolution**: threads are looked up/created per user and optionally per channel (`chat_threads`), accepting either internal channel UUID or external YouTube `channel_id`.
- **Auth & access control**: all routes require an authenticated Supabase user; message/thread reads validate ownership.

### Dashboard chat window integration
- **Where it renders**: `components/DashboardLayout.tsx` and `components/ClientDashboardLayout.tsx` include `NeriaContainer`, so the chat is available across dashboard pages.
- **Thread restoration**: on channel change/mount, `NeriaContainer` restores the last thread id from `localStorage` key `neria:lastThread:{channelId}`; if missing, it fetches the most recent thread for that channel via `GET /api/neria/threads?channelId=...`.
- **History loading**: messages are loaded via `GET /api/neria/messages?threadId=...` and shown in the window.
- **Send flow**: messages are optimistically added in the UI, then `POST /api/neria/chat` is called with `{ channelId, threadId, message }`. The response streams in real-time using Server-Sent Events, with text appearing character-by-character as generated. The `threadId` is persisted if newly created.
- **Per-channel memory**: last thread id is persisted per channel in `localStorage`, enabling seamless continuity as users navigate dashboard pages for the same channel.
- **UI behavior**: the chat window can be minimized or detached into a floating, draggable/resizable panel; state is managed via `NeriaContext` and component state.

### AI Intent Detection & Action System
- **Natural Language Understanding**: Advanced AI-powered system that analyzes user requests to determine appropriate actions, replacing brittle keyword matching with robust intent recognition
- **Action Types**: Supports multiple intent categories including `generate_video_titles`, `navigate_to_planner`, `navigate_to_goals`, `navigate_to_analytics`, `chat_only`, and extensible `other` actions
- **Smart Redirect Logic**: AI determines not only what action to take but whether navigation is needed and where to redirect based on current page context
- **Extensible Architecture**: Built for future expansion to handle additional app actions and navigation patterns as the platform grows
- **Context Awareness**: Intent analysis considers both the user's message and their current location in the app to make intelligent routing decisions

### Database Maintenance & Schema Compliance

**IMPORTANT: Whenever using the Supabase MCP server to examine the database schema, always verify and update the "wipe all data" API to ensure it includes all user-specific tables.**

**Automated Maintenance Instructions:**
1. **Schema Check**: When using `mcp_supabase_list_tables` to examine the database, compare the results against the tables deleted in `/api/wipe-all-data/route.ts`
2. **Required Action**: If any user-specific tables are missing from the wipe API, immediately update it to include those tables
3. **Table Categories to Include**:
   - All tables with `user_id` foreign keys
   - All tables with `channel_id` foreign keys (since channels belong to users)
   - Chat-related tables (`chat_threads`, `chat_messages`, `thread_summaries`)
   - User-generated content tables (`video_planner_ideas`, `memory_profile`, etc.)
4. **Tables to Exclude**: System tables (`model_settings`, `model_providers`, `temp_sync_data`)
5. **Update Pattern**: Add new table deletions in the channel-related section if they have `channel_id`, or in the user-specific section if they only have `user_id`

**Current Tables Included in Wipe API:** `neria_context`, `latest_video_snapshots`, `stats_snapshots`, `memory_profile`, `channel_strategy`, `channel_questions`, `collection_chunks`, `memory_longterm`, `video_planner_ideas`, `chat_messages`, `thread_summaries`, `chat_threads`, `channels`, `google_accounts`

## 📋 Recent Session Updates (January 2025)

### **Context Percentage Indicator Implementation**
- **ContextIndicator Component**: Created Cursor-style radial progress bar showing real-time context usage
- **Token Counting System**: Implemented reliable token estimation (3.5-4 chars/token) without WebAssembly dependencies
- **Context Persistence**: Enhanced messages API to calculate and return context percentage for page refresh persistence
- **Visual Integration**: 36px circular indicator with 3px stroke, 28% font scaling, positioned next to Neria avatar
- **Real-time Updates**: Context percentage calculated and sent with each streaming response

### **GPT-4o Model Upgrade**
- **Database Configuration**: Added GPT-4o to model_providers table (128k input, 4k output tokens)
- **Model Settings Update**: Switched current and fallback models from gpt-4o-mini to gpt-4o
- **Premium Quality**: Users now receive highest-tier AI responses for strategic YouTube coaching
- **Context Optimization**: Adjusted token calculations for GPT-4o's 4k output limit vs 8k on mini
- **Verification**: Debug logging confirmed successful model upgrade and proper token calculations

### **Enhanced Data Management**
- **Comprehensive Wipe**: Updated wipe-all-data API to include all newer tables (chat_threads, messages, profiles, etc.)
- **Thread Association**: Fixed channel ID resolution for proper context loading in chat threads
- **Context Loading**: Streamlined context retrieval across page loads and message history
- **Error Handling**: Improved debugging and error resolution for model configuration and context calculation
