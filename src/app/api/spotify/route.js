import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { getAuthUrl, exchangeCode, isSpotifyConnected } from '@/lib/spotify';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET — returns Spotify auth URL or connection status
 */
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'status') {
            const hasClientId = await getSetting(userId, 'spotify_client_id');
            const connected = await isSpotifyConnected(userId);
            return NextResponse.json({
                connected,
                clientId: hasClientId ? '****' : null,
            });
        }

        // Generate auth URL — Spotify requires 127.0.0.1 not localhost
        const url = new URL(request.url);
        const redirectUri = `http://127.0.0.1:${url.port || 3000}/api/spotify/callback`;
        const authUrl = await getAuthUrl(userId, redirectUri);

        return NextResponse.json({ authUrl });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST — save Spotify credentials or disconnect
 */
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const body = await request.json();

        if (body.action === 'disconnect') {
            await setSetting(userId, 'spotify_access_token', '');
            await setSetting(userId, 'spotify_refresh_token', '');
            await setSetting(userId, 'spotify_token_expiry', '0');
            return NextResponse.json({ success: true, message: 'Disconnected from Spotify' });
        }

        // Save client credentials
        if (body.clientId) await setSetting(userId, 'spotify_client_id', body.clientId);
        if (body.clientSecret) await setSetting(userId, 'spotify_client_secret', body.clientSecret);

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
