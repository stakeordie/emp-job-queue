import { NextRequest, NextResponse } from 'next/server';

// DELETE /api/machines/[machineId]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ machineId: string }> }
) {
  try {
    const { machineId } = await context.params;
    
    // Get the WebSocket URL from the request headers or query params
    // This should match the current connection
    const websocketUrl = request.headers.get('x-websocket-url') || 
                        request.nextUrl.searchParams.get('websocket_url') ||
                        'http://localhost:3001'; // Default fallback
    
    // Extract the base URL from the WebSocket URL
    const baseUrl = websocketUrl.replace(/^ws/, 'http').replace(/\?.*$/, '');
    
    // Make a request to the API server to delete the machine
    const response = await fetch(`${baseUrl}/api/machines/${machineId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API server error: ${response.status} ${errorText}`);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Machine ${machineId} deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting machine:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}