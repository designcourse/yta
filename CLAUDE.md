# YouTube Analytics Project - CLAUDE.md

## Project Overview
This is a Next.js 15 application called "yt" that provides AI-powered YouTube analytics for creators. The project integrates with Google's YouTube API, Supabase for database management, and OpenAI for AI-powered insights through a character called "Neria".

## Tech Stack
- **Framework**: Next.js 15 with App Router
- **Database**: Supabase
- **Authentication**: Google OAuth via Supabase Auth
- **AI**: OpenAI API (GPT integration)
- **Styling**: Tailwind CSS 4
- **3D Graphics**: Spline (via @splinetool/react-spline)
- **Language**: TypeScript

## Key Features
- Google OAuth authentication for YouTube access
- YouTube channel data collection and analysis
- AI-powered insights via "Neria" (YouTube coaching assistant)
- Interactive 3D background with Spline
- Responsive design with modern UI components
- Real-time data synchronization with YouTube API

## Project Structure

### API Routes (`src/app/api/`)
- `collect-youtube-data/route.ts` - Main data collection endpoint with debug/fix functionality
- `youtube-connect/route.ts` - Google OAuth connection
- `add-youtube-channel/route.ts` - Channel management
- `neria/` - AI assistant endpoints:
  - `generate-strategy/route.ts`
  - `next-question/route.ts` 
  - `refine-plan/route.ts`
- `wipe-all-data/route.ts` - Data cleanup functionality

### Components (`src/components/`)
- `NeriaResponse.tsx` - Animated AI response component with typewriter effect
- `SplineBackground.tsx` - 3D animated background
- `Header.tsx`, `Footer.tsx` - Layout components
- `Hero.tsx`, `CollectionHero.tsx` - Landing page components
- `YouTubeStats.tsx` - Channel statistics display
- `PromptBar.tsx` - User input component

### Pages (`src/app/`)
- `/` - Landing page with authentication check
- `/dashboard/` - Main dashboard
- `/dashboard/collection/` - Data collection interface  
- `/dashboard/[channelId]/` - Individual channel analytics
- `/onboard/` - User onboarding flow
- `/youtube-connect/` - OAuth connection page

### Utilities (`src/utils/`)
- `googleAuth.ts` - Google OAuth token management
- `openai.ts` - OpenAI API integration
- `supabase/` - Database client configurations

## Database Schema (Supabase)
Based on the code analysis, the project uses these main tables:
- `channels` - YouTube channel information
- `google_accounts` - Google account data
- `neria_context` - AI conversation context storage

## Development Commands
```bash
npm run dev         # Development server with Turbopack
npm run build       # Production build with Turbopack  
npm run start       # Start production server
npm run lint        # Run ESLint
```

## Key Functionality

### Neria AI Assistant
- Provides personalized YouTube coaching
- Analyzes channel metrics (subscribers, videos, views, account age)
- Generates contextual responses based on channel data
- Stores conversation context for follow-up questions

### Data Collection Process
1. Authenticates with Google OAuth
2. Fetches YouTube channel statistics via YouTube Data API
3. Stores data in Supabase database
4. Generates AI-powered insights via OpenAI
5. Displays results with animated UI components

### UI/UX Features
- Staggered text animations with character-by-character reveal
- 3D Spline background for visual appeal
- Responsive design with clamp() CSS functions
- Modern typography using Geist font family
- Smooth transitions and hover effects

## Authentication Flow
1. User visits landing page
2. Redirects to dashboard if already authenticated
3. Google OAuth integration via Supabase Auth
4. YouTube API permissions granted
5. Channel data collection and analysis begins

## Recent Changes (Git Status)
Modified files indicate active development on:
- Data collection improvements (`route.ts`)
- Collection page enhancements (`page.tsx`) 
- Layout updates (`layout.tsx`)
- UI component refinements (`CollectionHero.tsx`, `NeriaResponse.tsx`)
- New Neria API endpoints and PromptBar component