import { NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/spotify';

/**
 * GET — OAuth callback from Spotify.
 * Exchanges the auth code for tokens and redirects back to the import page.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
            return NextResponse.redirect(new URL('/settings?spotify=error&msg=' + encodeURIComponent(error), request.url));
        }

        if (!code) {
            return NextResponse.redirect(new URL('/settings?spotify=error&msg=no_code', request.url));
        }

        const url = new URL(request.url);
        const redirectUri = `http://127.0.0.1:${url.port || 3000}/api/spotify/callback`;

        await exchangeCode(code, redirectUri);

        // Redirect to import page on success
        return NextResponse.redirect(new URL('/import?spotify=connected', request.url));
    } catch (err) {
        console.error('Spotify callback error:', err);
        return NextResponse.redirect(
            new URL('/settings?spotify=error&msg=' + encodeURIComponent(err.message), request.url)
        );
    }
}
