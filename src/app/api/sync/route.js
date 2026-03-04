import { NextResponse } from 'next/server';
import { syncAllArtists } from '@/lib/sync';

export async function POST() {
    try {
        const result = await syncAllArtists();
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
