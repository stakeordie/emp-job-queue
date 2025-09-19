import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const collections = await prisma.collection.findMany({
      orderBy: {
        created_at: 'desc'
      },
      include: {
        _count: {
          select: {
            miniapp_generation: true
          }
        },
        miniapp_generation: {
          select: {
            id: true,
            status: true,
            created_at: true,
            job_id: true
          },
          orderBy: {
            created_at: 'desc'
          },
          take: 50 // Get recent 50 generations for each collection
        }
      }
    });

    return NextResponse.json({
      success: true,
      collections: collections.map(collection => ({
        ...collection,
        generations: collection.miniapp_generation
      }))
    });
  } catch (error) {
    console.error('Failed to fetch collections:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}