import { NextResponse } from 'next/server';
import { getAllSpotifyArtists, isSpotifyConnected } from '@/lib/spotify';
import { getDb } from '@/lib/db';

/**
 * GET — fetch all Spotify artists (top + followed), marking any already tracked.
 */
export async function GET() {
    try {
        if (!isSpotifyConnected()) {
            return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
        }

        const spotifyArtists = await getAllSpotifyArtists();

        // Check which are already tracked
        const db = getDb();
        const trackedNames = new Set(
            db.prepare('SELECT LOWER(name) as name FROM artists WHERE is_member = 0').all().map(r => r.name)
        );

        const artists = spotifyArtists.map(a => ({
            ...a,
            alreadyTracked: trackedNames.has(a.name.toLowerCase()),
        }));

        return NextResponse.json({
            artists,
            total: artists.length,
            alreadyTracked: artists.filter(a => a.alreadyTracked).length,
        });
    } catch (err) {
        console.error('Error fetching Spotify artists:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
