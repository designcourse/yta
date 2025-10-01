"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';

interface RetentionDataPoint {
  time: number;
  timeLabel: string;
  retention: number;
}

interface Insight {
  time: number | string;
  pct: number;
  insight: string;
  suggestion: string;
}

interface HighlightMoment {
  time: number | string;
  caption?: string;
  title?: string;
}

interface FlatSpot {
  time: string;
  duration?: string;
  issue?: string;
}

interface RetentionChartProps {
  retention: Array<[string, number, number?]>; // [elapsedVideoTimeRatio, audienceWatchRatio, relativeRetentionPerformance]
  durationSec: number;
  insights?: Insight[];
  highlightMoments?: HighlightMoment[];
  flatSpots?: FlatSpot[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseTimeToSeconds(timeStr: string | number | undefined): number {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr || typeof timeStr !== 'string') return 0;
  
  // Handle pure numeric strings (e.g., "85" = 85 seconds)
  if (/^\d+$/.test(timeStr)) {
    return parseInt(timeStr);
  }
  
  // Handle formats: "0:30", "1:20", "30s", "1m 20s", etc.
  const mmss = timeStr.match(/^(\d+):(\d+)$/);
  if (mmss) return parseInt(mmss[1]) * 60 + parseInt(mmss[2]);
  
  const mins = timeStr.match(/(\d+)m/);
  const secs = timeStr.match(/(\d+)s/);
  const m = mins ? parseInt(mins[1]) : 0;
  const s = secs ? parseInt(secs[1]) : 0;
  return m * 60 + s;
}

export default function RetentionChart({ 
  retention, 
  durationSec, 
  insights = [], 
  highlightMoments = [], 
  flatSpots = [] 
}: RetentionChartProps) {
  console.log('[RetentionChart] Render with:', {
    retentionPoints: retention.length,
    durationSec,
    insightsCount: insights.length,
    highlightMomentsCount: highlightMoments?.length || 0,
    flatSpotsCount: flatSpots?.length || 0,
    highlightMoments,
    flatSpots
  });
  // Convert retention data to chart format
  const data: RetentionDataPoint[] = retention.map(([ratioStr, audienceWatchRatio]) => {
    // Ensure ratioStr is a string and handle both "25%" format and numeric 0.25 format
    const ratioValue = typeof ratioStr === 'string' 
      ? parseFloat(ratioStr.replace('%', '')) / 100
      : typeof ratioStr === 'number'
      ? ratioStr
      : 0;
    const timeInSeconds = ratioValue * durationSec;
    return {
      time: timeInSeconds,
      timeLabel: formatTime(timeInSeconds),
      retention: audienceWatchRatio * 100, // Convert to percentage
    };
  });

  // Process point markers (insights and highlights)
  const rawMarkers = [
    ...insights
      .filter(i => i.time !== undefined && i.time !== null)
      .map(i => ({
        time: parseTimeToSeconds(i.time),
        type: 'insight' as const,
        label: i.insight,
        detail: i.suggestion,
        pct: i.pct,
        color: i.pct < 40 ? '#ef4444' : i.pct < 60 ? '#f59e0b' : '#10b981'
      })),
    ...highlightMoments
      .filter(h => h.time !== undefined && h.time !== null)
      .map(h => ({
        time: parseTimeToSeconds(h.time),
        type: 'highlight' as const,
        label: h.caption || h.title || 'Highlight',
        detail: '',
        color: '#3b82f6',
        raw: h.time
      }))
  ];
  
  // Process flat spots as areas with duration
  const flatSpotAreas = flatSpots
    .filter(f => f.time !== undefined && f.time !== null)
    .map(f => {
      const startTime = parseTimeToSeconds(f.time);
      // Parse duration from strings like "138s" or use a default
      const durationMatch = f.duration?.match(/(\d+)s?/);
      const flatDuration = durationMatch ? parseInt(durationMatch[1]) : 30; // default 30s
      const endTime = Math.min(startTime + flatDuration, durationSec);
      
      return {
        startTime,
        endTime,
        label: f.issue || 'Flat spot',
        duration: f.duration,
        raw: f.time
      };
    })
    .filter(f => f.startTime >= 0 && f.startTime <= durationSec);
  
  console.log('[RetentionChart] Raw markers before filter:', rawMarkers.map(m => ({ type: m.type, time: m.time, raw: m.raw, label: m.label })));
  console.log('[RetentionChart] Duration limit:', durationSec);
  
  const markers = rawMarkers
    .filter(m => {
      const valid = m.time > 0 && m.time <= durationSec;
      if (!valid) console.log('[RetentionChart] Filtered out marker:', m.type, 'time:', m.time, 'raw:', m.raw, 'duration:', durationSec);
      return valid;
    })
    .sort((a, b) => a.time - b.time);
  
  console.log('[RetentionChart] Markers after filter:', markers.length);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, coordinate }: any) => {
    if (active && payload && payload.length) {
      const currentTime = payload[0].payload.time;
      const nearbyMarkers = markers.filter(m => Math.abs(m.time - currentTime) < 5);
      
      // Check if current time is inside any flat spot area
      const nearbyFlatSpots = flatSpotAreas.filter(area => 
        currentTime >= area.startTime && currentTime <= area.endTime
      );
      
      return (
        <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-lg max-w-xs">
          <p className="text-sm font-medium text-gray-900">
            {payload[0].payload.timeLabel}
          </p>
          <p className="text-sm text-gray-600">
            Retention: <span className="font-semibold text-blue-600">
              {payload[0].value.toFixed(1)}%
            </span>
          </p>
          {nearbyFlatSpots.map((area, idx) => (
            <div key={`flat-${idx}`} className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-xs font-semibold text-red-600">
                ⚠️ {area.label}
              </p>
              {area.duration && (
                <p className="text-xs text-gray-500 mt-1">Duration: {area.duration}</p>
              )}
            </div>
          ))}
          {nearbyMarkers.map((marker, idx) => (
            <div key={idx} className="mt-2 pt-2 border-t border-gray-200">
              <p className="text-xs font-semibold" style={{ color: marker.color }}>
                {marker.type === 'insight' ? '💡 ' : '⭐ '}
                {marker.label}
              </p>
              {marker.detail && (
                <p className="text-xs text-gray-500 mt-1">{marker.detail}</p>
              )}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="time"
              type="number"
              domain={[0, durationSec]}
              tickFormatter={formatTime}
              label={{ value: 'Video Time', position: 'insideBottom', offset: -5 }}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />
            <YAxis
              label={{ value: 'Retention %', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Flat spots as shaded areas */}
            {flatSpotAreas.map((area, idx) => (
              <ReferenceArea
                key={`flatspot-${idx}`}
                x1={area.startTime}
                x2={area.endTime}
                fill="#ef4444"
                fillOpacity={0.2}
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: '⚠️',
                  position: 'top',
                  fontSize: 14
                }}
              />
            ))}
            
            {/* Point markers as vertical lines */}
            {markers.map((marker, idx) => (
              <ReferenceLine
                key={`marker-${idx}`}
                x={marker.time}
                stroke={marker.color}
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: marker.type === 'insight' ? '💡' : '⭐',
                  position: 'top',
                  fontSize: 14
                }}
              />
            ))}

            <Line
              type="monotone"
              dataKey="retention"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Legend */}
      {markers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          {insights.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#10b981' }}></div>
              <span className="text-gray-600">💡 Insights</span>
            </div>
          )}
          {highlightMoments.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#3b82f6' }}></div>
              <span className="text-gray-600">⭐ Highlights</span>
            </div>
          )}
          {flatSpots.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#ef4444' }}></div>
              <span className="text-gray-600">⚠️ Flat Spots</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

