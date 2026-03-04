import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { getAuthUrl, exchangeCode, isSpotifyConnected } from '@/lib/spotify';

/**
 * GET — returns Spotify auth URL or connection status
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'status') {
            return NextResponse.json({
                connected: isSpotifyConnected(),
                clientId: getSetting('spotify_client_id') ? '****' : null,
            });
        }

        // Generate auth URL — Spotify requires 127.0.0.1 not localhost
        const url = new URL(request.url);
        const redirectUri = `http://127.0.0.1:${url.port || 3000}/api/spotify/callback`;
        const authUrl = getAuthUrl(redirectUri);

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
        const body = await request.json();

        if (body.action === 'disconnect') {
            setSetting('spotify_access_token', '');
            setSetting('spotify_refresh_token', '');
            setSetting('spotify_token_expiry', '0');
            return NextResponse.json({ success: true, message: 'Disconnected from Spotify' });
        }

        // Save client credentials
        if (body.clientId) setSetting('spotify_client_id', body.clientId);
        if (body.clientSecret) setSetting('spotify_client_secret', body.clientSecret);

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
