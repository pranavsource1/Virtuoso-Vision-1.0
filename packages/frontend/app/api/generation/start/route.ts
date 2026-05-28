/**
 * Next.js API route: POST /api/generation/{songId}
 * Triggers 3D music world generation on backend
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const songId = request.nextUrl.searchParams.get('songId');
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!songId) {
      return NextResponse.json({ error: 'Missing songId' }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // Trigger generation on backend
    const response = await fetch(
      `${backendUrl}/api/generation/music-world/${songId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Generation failed' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Generation API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
