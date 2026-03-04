import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const artistId = searchParams.get('artistId');
        const limit = searchParams.get('limit');

        const events = getEvents({
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
