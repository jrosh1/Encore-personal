import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const artistId = searchParams.get('artistId');
        const limit = searchParams.get('limit');

        const events = await getEvents(userId, {
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            artistId: artistId ? parseInt(artistId) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });

        return NextResponse.json({ events });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
