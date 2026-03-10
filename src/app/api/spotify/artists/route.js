import { NextResponse } from 'next/server';
import { getAllSpotifyArtists, isSpotifyConnected } from '@/lib/spotify';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

/**
 * GET — fetch all Spotify artists (top + followed), marking any already tracked.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const connected = await isSpotifyConnected(userId);
        if (!connected) {
            return NextResponse.json({ error: 'Spotify not connected' }, { status: 401 });
        }

        const spotifyArtists = await getAllSpotifyArtists(userId);

        // Check which are already tracked
        const trackedNamesSet = new Set();
        const trackedArtists = await prisma.artist.findMany({
            where: { is_member: false, userId },
            select: { name: true }
        });
        for (const r of trackedArtists) trackedNamesSet.add(r.name.toLowerCase());

        const artists = spotifyArtists.map(a => ({
            ...a,
            alreadyTracked: trackedNamesSet.has(a.name.toLowerCase()),
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
