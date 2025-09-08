import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { NeriaWorkflowEngine } from "@/utils/neria-workflows/engine";

// Simple per-process 24h cache keyed by user+channel
const previewCache = new Map<string, { expiresAt: number; payload: any }>();
const TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    const refresh = url.searchParams.get("refresh");
    
    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check cache first
    const cacheKey = `${user.id}:${channelId}`;
    const cached = previewCache.get(cacheKey);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, { 
        headers: { "Cache-Control": "public, max-age=86400" } 
      });
    }

    // Get valid access token
    const token = await getValidAccessToken(user.id, channelId);
    if (!token.success) {
      return NextResponse.json({ 
        error: token.error || "No YouTube access" 
      }, { status: 400 });
    }

    // Execute the collection composer workflow (modular approach)
    const engine = new NeriaWorkflowEngine();
    const execution = await engine.executeWorkflow('collection-composer', {
      accessToken: token.accessToken,
      channelId: channelId,
      userId: user.id,
    });

    if (execution.status === 'failed') {
      console.error('Workflow execution failed:', execution.errors);
      return NextResponse.json({ 
        error: 'Workflow execution failed', 
        details: execution.errors 
      }, { status: 500 });
    }

    // Debug: Log the execution results
    console.log('Workflow execution completed:', {
      status: execution.status,
      stepResultKeys: Object.keys(execution.stepResults),
      buildResponseKeys: execution.stepResults['build-response'] ? Object.keys(execution.stepResults['build-response']) : 'N/A'
    });

    // Extract the final response from workflow results
    const composeFinalResult = execution.stepResults['compose-final-result'];
    
    if (!composeFinalResult) {
      console.error('No compose-final-result step found. Available results:', Object.keys(execution.stepResults));
      throw new Error('Workflow completed but compose-final-result step result not found');
    }

    // The result should be directly in the step result, not nested under finalResponse
    const result = composeFinalResult;
    
    if (!result || typeof result !== 'object') {
      console.error('Compose final step result is invalid:', composeFinalResult);
      throw new Error('Workflow completed but no valid final response found');
    }

    // Cache the result
    previewCache.set(cacheKey, { 
      expiresAt: Date.now() + TTL_MS, 
      payload: result 
    });

    return NextResponse.json(result, { 
      headers: { 
        "Cache-Control": "public, max-age=86400",
        "X-Workflow-Execution-Id": execution.id,
        "X-Workflow-Duration": String(
          execution.endTime ? 
          execution.endTime.getTime() - execution.startTime.getTime() : 
          0
        )
      } 
    });

  } catch (error) {
    console.error("/api/collection/preview-workflow error", error);
    return NextResponse.json({ error: "Workflow execution failed" }, { status: 500 });
  }
}
