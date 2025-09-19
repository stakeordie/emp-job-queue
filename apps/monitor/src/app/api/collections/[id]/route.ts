import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check if collection has any generations before deleting
    const generationCount = await prisma.miniapp_generation.count({
      where: { collection_id: id }
    });

    if (generationCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete collection with ${generationCount} existing generations. Archive it instead.`
        },
        { status: 400 }
      );
    }

    await prisma.collection.delete({
      where: { id }
    });

    return NextResponse.json({
      success: true,
      message: 'Collection deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete collection:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const collection = await prisma.collection.findUnique({
      where: { id },
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
            job_id: true,
            user_id: true
          },
          orderBy: {
            created_at: 'desc'
          }
        }
      }
    });

    if (!collection) {
      return NextResponse.json(
        { success: false, error: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      collection: {
        ...collection,
        generations: collection.miniapp_generation
      }
    });
  } catch (error) {
    console.error('Failed to fetch collection:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch collection' },
      { status: 500 }
    );
  }
}