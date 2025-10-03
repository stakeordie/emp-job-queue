import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@emergexyz/db';

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;

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
    // Call the EmProps API retry endpoint with authentication
    // The API will now handle backing up the current state and allow retrying any status
    const response = await fetch(`${empropsApiUrl}/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${empropsApiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Job not found or retry endpoint not available' },
          { status: 404 }
        );
      }

      if (response.status === 400) {
        return NextResponse.json(
          { error: errorData.error || 'Invalid job ID or job cannot be retried' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: errorData.error || `Failed to retry job (status: ${response.status})` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: data.message || 'Job has been resubmitted with preserved workflow context.',
      data
    });

  } catch (error) {
    console.error('Error retrying job:', error);
    return NextResponse.json(
      { error: 'Internal server error while retrying job' },
      { status: 500 }
    );
  }
}