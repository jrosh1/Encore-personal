import { NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/spotify';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET — OAuth callback from Spotify.
 * Exchanges the auth code for tokens and redirects back to the import page.
 */
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
            return NextResponse.redirect(new URL('/settings?spotify=error&msg=' + encodeURIComponent(error), request.url));
        }

        if (!code) {
            return NextResponse.redirect(new URL('/settings?spotify=error&msg=no_code', request.url));
        }

        if (!userId) {
            return NextResponse.redirect(new URL('/settings?spotify=error&msg=not_authenticated', request.url));
        }

        const url = new URL(request.url);
        const redirectUri = `${url.origin}/api/spotify/callback`;

        await exchangeCode(userId, code, redirectUri);

        // Redirect to import page on success
        return NextResponse.redirect(new URL('/import?spotify=connected', request.url));
    } catch (err) {
        console.error('Spotify callback error:', err);
        return NextResponse.redirect(
            new URL('/settings?spotify=error&msg=' + encodeURIComponent(err.message), request.url)
        );
    }
}
