# Video Analysis State System

## Overview

This system provides intelligent, context-aware responses to "How is my latest video performing?" based on:
- **Video age** (< 3hr, 3-24hr, 24-48hr, >48hr)
- **User experience** (first video, new creator, established)
- **Data availability** (early metrics, YouTube API data, retention curves)

## Analysis Windows

### 1. **TOO_EARLY** (< 3 hours)
- **Data Available:** None (or very preliminary)
- **Guidance:** Tell user when stats unlock, explain what to expect

### 2. **EARLY_3H** (3-24 hours)
- **Data Available:** Early metrics from T+3hr cron job
- **Guidance:** Show 3hr stats, explain 24hr data coming soon

### 3. **STANDARD_24H** (24-48 hours)
- **Data Available:** Full YouTube API 24hr stats (views, CTR, AVD, etc.)
- **Guidance:** Complete 24hr analysis, mention retention data coming at 48hr

### 4. **FULL_48H** (> 48 hours)
- **Data Available:** Everything including retention curves
- **Guidance:** Comprehensive analysis with all metrics

## User Experience Levels

### 1. **FIRST_VIDEO** (1 video in system)
- No baseline for comparison
- Need more videos to establish patterns
- Focus on absolute performance and learning

### 2. **NEW_CREATOR** (2-9 videos in system)
- Limited baseline forming
- Early pattern detection
- Building confidence in insights

### 3. **ESTABLISHED** (10+ videos in system)
- Strong baseline established
- High-confidence comparisons
- Pattern recognition and optimization

## Response Matrix

| Window | Experience | Response Type |
|--------|-----------|---------------|
| TOO_EARLY | FIRST_VIDEO | "Stats unlock in X hours. First video, so no comparisons yet. Wait 24hr for YouTube data." |
| TOO_EARLY | NEW_CREATOR | "Stats unlock in X hours. Limited baseline, but forming patterns." |
| TOO_EARLY | ESTABLISHED | "Come back in X hours for comparison to your recent uploads." |
| EARLY_3H | FIRST_VIDEO | "3hr stats available, but no comparison data. Full analysis at 24hr." |
| EARLY_3H | NEW_CREATOR | "3hr stats with limited comparisons. More meaningful as you upload." |
| EARLY_3H | ESTABLISHED | "3hr stats comparing to last 10 uploads. Predicting performance." |
| STANDARD_24H | FIRST_VIDEO (only video) | "24hr stats ready. Need more videos for comparisons. Retention at 48hr." |
| STANDARD_24H | FIRST_VIDEO (has others) | "24hr stats! Comparing to your other videos. Retention at 48hr." |
| STANDARD_24H | NEW_CREATOR | "24hr verdict in. Comparisons improving with each upload." |
| STANDARD_24H | ESTABLISHED | "24hr performance analyzed vs baseline. Retention unlocks soon." |
| FULL_48H | FIRST_VIDEO | "All data available! But need more videos for accurate baselines." |
| FULL_48H | NEW_CREATOR | "Full analysis unlocked. Baseline still forming (~10 videos needed)." |
| FULL_48H | ESTABLISHED | "Complete analysis: CTR, retention, watch time vs established baseline." |

## Prepublish Analysis Integration

In **all cases**, the system:
1. Checks if user has uploaded rough cut for pre-publish analysis
2. If YES: References insights (hook score, pacing, flat spots) in response
3. If NO: Encourages uploading rough cut for AI analysis before publishing

## Implementation Files

### Core Logic
- **`src/utils/video-analysis-state.ts`**: State determination engine
  - `getVideoAnalysisState()`: Main function
  - `formatTimeRemaining()`: Human-readable countdowns
  - Response generation for each case

### Integration Points
- **`src/app/api/neria/context-bundle/route.ts`**: 
  - Fetches video data, early metrics, prepublish status
  - Calls `getVideoAnalysisState()`
  - Includes state in context bundle

- **`src/utils/context-formatter.ts`**:
  - Formats analysis state for Neria's system prompt
  - Displays availability indicators (✅/⏳)
  - Shows guidance section with specific instructions

### Database Checks
The system queries:
1. `video_metrics`: Video age, view count
2. `video_early_metrics`: T+3hr stats availability
3. `prepublish_videos`: Pre-publish analysis status
4. `video_metrics` (count): Total videos in system

## Example Neria Context

```
LATEST VIDEO:
"From UI Screenshot to Pixel Perfect Code?"
Published: 23 hours ago (3,395 views)

📊 ANALYSIS AVAILABILITY:
Window: EARLY 3H
User Experience: ESTABLISHED
T+3hr Stats: ✅ Available
T+24hr Stats: ⏳ Not yet
Retention Data: ⏳ Not yet (48hr)

🎯 GUIDANCE FOR USER:
Your 3-hour stats are in! I can compare this to your last 10 uploads and 
predict how it might perform. Full 24-hour data arrives in 1 hour and 
15 minutes for a complete picture.

💡 Pro tip: Upload your rough cut before publishing for AI-powered pre-publish 
analysis. I can identify flat spots, pacing issues, and hook strength before 
your video goes live.
```

## Guardrails for Neria

The system prompt includes explicit instructions:

```
CRITICAL: When user asks "How is my latest video performing?", use the 
GUIDANCE FOR USER section above. The guidance is tailored to video age, 
user experience, and data availability. Do NOT make up analysis windows 
or timelines - use the exact guidance provided.
```

This ensures Neria:
- Uses pre-computed guidance, not hallucinated timelines
- Provides accurate data availability info
- Sets correct expectations for each user type
- Always mentions prepublish analysis feature

## Testing

### Test Case 1: New User, Video < 3hr
**Input:** First video, uploaded 1hr ago
**Expected:** "Stats unlock in 2 hours. First video, so no comparisons. Wait 24hr for YouTube data."

### Test Case 2: Established, Video 6hr
**Input:** 15 videos in system, latest uploaded 6hr ago
**Expected:** "Your 3hr stats show... Comparing to baseline. Full 24hr analysis in 18 hours."

### Test Case 3: New User, Video 36hr, Only Video on Channel
**Input:** First video, 36hr old, no other videos exist
**Expected:** "24hr stats ready. Need more videos for comparisons. Retention unlocks in 12hr."

### Test Case 4: Established, Video 72hr
**Input:** 25 videos in system, latest 72hr old
**Expected:** "Complete analysis: CTR X%, retention Y%, comparing to baseline..."

## Benefits

1. **Accurate Expectations:** Users know exactly what data is available and when more unlocks
2. **Context-Aware:** Guidance changes based on user's journey stage
3. **Actionable:** Always includes next steps and timing
4. **Consistent:** Deterministic logic prevents hallucinations
5. **Encouraging:** Promotes prepublish analysis in all cases

## Future Enhancements

1. **Email Notifications:** Alert users when new analysis windows unlock
2. **Dashboard Indicators:** Visual timeline showing unlocked/pending data
3. **Comparison Highlights:** "This is X% better than your last video at 3hr mark"
4. **Predictive Analysis:** Use 3hr data to predict 24hr and 48hr performance

