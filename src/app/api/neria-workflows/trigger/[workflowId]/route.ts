import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { NeriaWorkflowEngine } from '@/utils/neria-workflows/engine';
import { getValidAccessToken } from '@/utils/googleAuth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    const body = await request.json();
    const { channelId, searchQuery, myChannelStats } = body;

    // Get user session
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access (customize this logic as needed)
    const { data: roleRow } = await supabase
      .from('google_accounts')
      .select('role_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    
    const { data: roles } = await supabase.from('user_roles').select('id,name');
    const adminRoleId = roles?.find(r => r.name === 'admin')?.id;
    const isAdmin = !!adminRoleId && roleRow?.role_id === adminRoleId;
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Prepare inputs based on workflow type
    let inputs: Record<string, any> = {
      userId: user.id,
    };

    if (workflowId === 'youtube-collection-analytics' && channelId) {
      // Get access token for YouTube workflows
      const token = await getValidAccessToken(user.id, channelId);
      if (!token.success) {
        return NextResponse.json({ 
          error: 'No YouTube access token available' 
        }, { status: 400 });
      }
      
      inputs = {
        ...inputs,
        accessToken: token.accessToken,
        channelId: channelId,
      };
    } else if (workflowId === 'competitor-analysis') {
      // Get access token for competitor analysis
      const token = await getValidAccessToken(user.id, channelId);
      if (!token.success) {
        return NextResponse.json({ 
          error: 'No YouTube access token available' 
        }, { status: 400 });
      }
      
      inputs = {
        ...inputs,
        accessToken: token.accessToken,
        channelId: channelId,
        searchQuery: searchQuery || 'design tutorials',
        myChannelStats: myChannelStats || { subscribers: 0, avgViews: 0 }
      };
    }

    // Execute workflow
    const engine = new NeriaWorkflowEngine();
    const execution = await engine.executeWorkflow(workflowId, inputs);

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      status: execution.status,
      message: `Workflow ${workflowId} triggered successfully`
    });

  } catch (error) {
    console.error('Workflow trigger error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to trigger workflow'
    }, { status: 500 });
  }
}
