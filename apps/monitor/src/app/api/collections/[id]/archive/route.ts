import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const collection = await prisma.collection.update({
      where: { id },
      data: { archived: true }
    });

    return NextResponse.json({
      success: true,
      message: 'Collection archived successfully',
      collection
    });
  } catch (error) {
    console.error('Failed to archive collection:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to archive collection' },
      { status: 500 }
    );
  }
}