const BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'ConcertTracker/1.0.0 (personal-use)';

// Rate limiting: MusicBrainz requires max 1 req/sec
let lastRequestTime = 0;

async function rateLimitedFetch(url) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < 1100) {
        await new Promise(r => setTimeout(r, 1100 - elapsed));
    }
    lastRequestTime = Date.now();

    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
    });

    if (!res.ok) {
        throw new Error(`MusicBrainz API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

/**
 * Search for an artist by name. Returns top matches with MBIDs.
 */
export async function searchArtist(name) {
    const encoded = encodeURIComponent(name);
    const data = await rateLimitedFetch(
        `${BASE_URL}/artist/?query=artist:${encoded}&fmt=json&limit=8`
    );

    if (!data.artists || data.artists.length === 0) return [];

    return data.artists.map(a => ({
        mbid: a.id,
        name: a.name,
        type: a.type || 'Unknown', // Person, Group, etc.
        country: a.country || '',
        disambiguation: a.disambiguation || '',
        score: a.score || 0,
    }));
}

/**
 * Get band members for a group artist.
 * Returns array of { mbid, name, type, active } objects.
 */
export async function getArtistMembers(mbid) {
    const data = await rateLimitedFetch(
        `${BASE_URL}/artist/${mbid}?inc=artist-rels&fmt=json`
    );

    if (!data.relations) return [];

    const members = [];
    for (const rel of data.relations) {
        if (rel.type === 'member of band' && rel.direction === 'backward') {
            const endDate = rel.end || rel['end-date'];
            const isActive = !endDate || endDate === '';
            members.push({
                mbid: rel.artist.id,
                name: rel.artist.name,
                type: rel.artist.type || 'Person',
                active: isActive,
                begin: rel.begin || null,
                end: endDate || null,
            });
        }
    }

    return members;
}

/**
 * Get URLs associated with an artist (official website, socials, etc.)
 * Returns array of { type, url } objects.
 */
export async function getArtistUrls(mbid) {
    const data = await rateLimitedFetch(
        `${BASE_URL}/artist/${mbid}?inc=url-rels&fmt=json`
    );

    if (!data.relations) return [];

    const urlTypeMap = {
        'official homepage': 'website',
        'social network': 'social',
        'online community': 'social',
        'blog': 'website',
        'bandcamp': 'bandcamp',
        'streaming music': 'streaming',
        'purchase for download': 'store',
        'free streaming': 'streaming',
        'youtube': 'youtube',
    };

    const urls = [];
    for (const rel of data.relations) {
        if (rel.type && rel.url && rel.url.resource) {
            const rawUrl = rel.url.resource;
            let url_type = urlTypeMap[rel.type] || 'other';

            // More specific classification based on URL domain
            if (rawUrl.includes('instagram.com')) url_type = 'instagram';
            else if (rawUrl.includes('facebook.com')) url_type = 'facebook';
            else if (rawUrl.includes('twitter.com') || rawUrl.includes('x.com')) url_type = 'twitter';
            else if (rawUrl.includes('youtube.com')) url_type = 'youtube';
            else if (rawUrl.includes('bandcamp.com')) url_type = 'bandcamp';
            else if (rawUrl.includes('soundcloud.com')) url_type = 'soundcloud';
            else if (rawUrl.includes('spotify.com')) url_type = 'spotify';
            else if (rawUrl.includes('tiktok.com')) url_type = 'tiktok';

            urls.push({ type: url_type, url: rawUrl });
        }
    }

    return urls;
}

/**
 * Get full artist info: details + members + URLs in one go.
 * Makes 3 API calls (with rate limiting).
 */
export async function getFullArtistInfo(mbid) {
    // First call: get basic info + artist-rels (members)
    const data = await rateLimitedFetch(
        `${BASE_URL}/artist/${mbid}?inc=artist-rels+url-rels&fmt=json`
    );

    const members = [];
    const urls = [];

    if (data.relations) {
        for (const rel of data.relations) {
            // Members
            if (rel.type === 'member of band' && rel.direction === 'backward') {
                const endDate = rel.end || rel['end-date'];
                members.push({
                    mbid: rel.artist.id,
                    name: rel.artist.name,
                    type: rel.artist.type || 'Person',
                    active: !endDate || endDate === '',
                });
            }
            // URLs
            if (rel.url && rel.url.resource) {
                const rawUrl = rel.url.resource;
                let url_type = 'other';
                if (rawUrl.includes('instagram.com')) url_type = 'instagram';
                else if (rawUrl.includes('facebook.com')) url_type = 'facebook';
                else if (rawUrl.includes('twitter.com') || rawUrl.includes('x.com')) url_type = 'twitter';
                else if (rawUrl.includes('youtube.com')) url_type = 'youtube';
                else if (rawUrl.includes('bandcamp.com')) url_type = 'bandcamp';
                else if (rawUrl.includes('tiktok.com')) url_type = 'tiktok';
                else if (rel.type === 'official homepage') url_type = 'website';
                else if (rel.type === 'social network' || rel.type === 'online community') url_type = 'social';
                urls.push({ type: url_type, url: rawUrl });
            }
        }
    }

    return {
        mbid: data.id,
        name: data.name,
        type: data.type,
        country: data.country || '',
        members,
        urls,
    };
}
