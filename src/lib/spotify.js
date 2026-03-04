import { getSetting, setSetting } from './db.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

/**
 * Get the Spotify OAuth authorization URL.
 */
export function getAuthUrl(redirectUri) {
    const clientId = getSetting('spotify_client_id');
    if (!clientId) throw new Error('Spotify Client ID not configured');

    const scopes = 'user-top-read user-follow-read';
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        show_dialog: 'true',
    });

    return `${AUTH_URL}?${params}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code, redirectUri) {
    const clientId = getSetting('spotify_client_id');
    const clientSecret = getSetting('spotify_client_secret');
    if (!clientId || !clientSecret) throw new Error('Spotify credentials not configured');

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify token exchange failed: ${text}`);
    }

    const data = await res.json();

    // Store tokens
    setSetting('spotify_access_token', data.access_token);
    setSetting('spotify_refresh_token', data.refresh_token);
    setSetting('spotify_token_expiry', String(Date.now() + data.expires_in * 1000));

    return data;
}

/**
 * Get a valid access token, refreshing if needed.
 */
async function getAccessToken() {
    let token = getSetting('spotify_access_token');
    const expiry = parseInt(getSetting('spotify_token_expiry') || '0');

    if (Date.now() > expiry - 60000) {
        // Refresh the token
        const refreshToken = getSetting('spotify_refresh_token');
        const clientId = getSetting('spotify_client_id');
        const clientSecret = getSetting('spotify_client_secret');

        if (!refreshToken || !clientId || !clientSecret) {
            throw new Error('Spotify not connected — please reconnect');
        }

        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });

        if (!res.ok) throw new Error('Failed to refresh Spotify token');

        const data = await res.json();
        token = data.access_token;
        setSetting('spotify_access_token', token);
        setSetting('spotify_token_expiry', String(Date.now() + data.expires_in * 1000));
        if (data.refresh_token) {
            setSetting('spotify_refresh_token', data.refresh_token);
        }
    }

    return token;
}

/**
 * Make an authenticated Spotify API request.
 */
async function spotifyFetch(endpoint) {
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Spotify API error ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * Get user's top artists across all time ranges.
 * Returns deduplicated array of { spotifyId, name, genres, imageUrl, popularity }
 */
export async function getTopArtists() {
    const timeRanges = ['long_term', 'medium_term', 'short_term'];
    const allArtists = new Map();

    for (const range of timeRanges) {
        let offset = 0;
        let hasMore = true;

        while (hasMore && offset < 100) {
            const data = await spotifyFetch(
                `/me/top/artists?time_range=${range}&limit=50&offset=${offset}`
            );

            for (const artist of data.items || []) {
                if (!allArtists.has(artist.id)) {
                    allArtists.set(artist.id, {
                        spotifyId: artist.id,
                        name: artist.name,
                        genres: artist.genres || [],
                        imageUrl: artist.images?.[0]?.url || null,
                        popularity: artist.popularity || 0,
                    });
                }
            }

            hasMore = data.items?.length === 50;
            offset += 50;
        }
    }

    return [...allArtists.values()];
}

/**
 * Get all artists the user follows on Spotify.
 * Uses cursor-based pagination.
 */
export async function getFollowedArtists() {
    const allArtists = new Map();
    let after = null;
    let hasMore = true;

    while (hasMore) {
        const params = after
            ? `?type=artist&limit=50&after=${after}`
            : '?type=artist&limit=50';

        const data = await spotifyFetch(`/me/following${params}`);
        const artists = data.artists;

        for (const artist of artists?.items || []) {
            if (!allArtists.has(artist.id)) {
                allArtists.set(artist.id, {
                    spotifyId: artist.id,
                    name: artist.name,
                    genres: artist.genres || [],
                    imageUrl: artist.images?.[0]?.url || null,
                    popularity: artist.popularity || 0,
                });
            }
        }

        after = artists?.cursors?.after || null;
        hasMore = !!after && (artists?.items?.length || 0) > 0;
    }

    return [...allArtists.values()];
}

/**
 * Get ALL unique artists (top + followed), deduplicated by Spotify ID.
 */
export async function getAllSpotifyArtists() {
    const [top, followed] = await Promise.all([
        getTopArtists().catch(() => []),
        getFollowedArtists().catch(() => []),
    ]);

    // Merge, dedup by spotifyId
    const merged = new Map();
    for (const a of [...top, ...followed]) {
        if (!merged.has(a.spotifyId)) {
            merged.set(a.spotifyId, { ...a, source: top.some(t => t.spotifyId === a.spotifyId) ? 'top' : 'followed' });
        }
    }

    return [...merged.values()].sort((a, b) => b.popularity - a.popularity);
}

/**
 * Check if Spotify is connected (has valid tokens).
 */
export function isSpotifyConnected() {
    const token = getSetting('spotify_access_token');
    const refreshToken = getSetting('spotify_refresh_token');
    return !!(token && refreshToken);
}
