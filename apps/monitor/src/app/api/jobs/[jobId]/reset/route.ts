import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Get EmProps API configuration from server-side environment variables
  const empropsApiUrl = process.env.EMPROPS_API_URL || process.env.NEXT_PUBLIC_EMPROPS_API_URL;
  const empropsApiKey = process.env.EMPROPS_API_KEY;

  if (!empropsApiUrl) {
    return NextResponse.json(
      { error: 'EmProps API URL not configured' },
      { status: 500 }
    );
  }

  if (!empropsApiKey) {
    return NextResponse.json(
      { error: 'EmProps API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Reset the job status to 'pending' so it can be retried
    const response = await fetch(`${empropsApiUrl}/jobs/${jobId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${empropsApiKey}`,
      },
      body: JSON.stringify({
        status: 'pending',
        started_at: null,
        completed_at: null,
        error_message: null,
        // Reset progress back to 0
        progress: 0
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: errorData.error || `Failed to reset job (status: ${response.status})` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Job has been reset to pending state and can now be retried.',
      data
    });

  } catch (error) {
    console.error('Error resetting job:', error);
    return NextResponse.json(
      { error: 'Internal server error while resetting job' },
      { status: 500 }
    );
  }
}