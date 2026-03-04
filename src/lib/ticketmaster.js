const BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

// Rate limit: 5 requests per second, but let's be conservative
let lastRequestTime = 0;

async function rateLimitedFetch(url) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < 250) {
        await new Promise(r => setTimeout(r, 250 - elapsed));
    }
    lastRequestTime = Date.now();

    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ticketmaster API error: ${res.status} — ${text.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * Search for events by artist name.
 * Returns array of normalized event objects.
 */
export async function searchEvents(artistName, apiKey, { countryCode, stateCode } = {}) {
    if (!apiKey) throw new Error('Ticketmaster API key is required');

    const allEvents = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages && page < 5) { // Max 5 pages
        const params = new URLSearchParams({
            apikey: apiKey,
            keyword: artistName,
            classificationName: 'music',
            size: '50',
            page: String(page),
            sort: 'date,asc',
        });
        if (countryCode) params.set('countryCode', countryCode);
        if (stateCode) params.set('stateCode', stateCode);

        const data = await rateLimitedFetch(`${BASE_URL}/events.json?${params}`);

        if (!data._embedded || !data._embedded.events) break;

        totalPages = data.page?.totalPages || 1;

        for (const event of data._embedded.events) {
            const venue = event._embedded?.venues?.[0];
            const normalized = {
                title: event.name || `${artistName} Live`,
                venue: venue?.name || 'TBA',
                city: venue?.city?.name || '',
                state: venue?.state?.stateCode || venue?.state?.name || '',
                country: venue?.country?.countryCode || '',
                date: event.dates?.start?.localDate || '',
                time: event.dates?.start?.localTime || '',
                source_url: event.url || '',
                source: 'ticketmaster',
            };
            if (normalized.date) {
                allEvents.push(normalized);
            }
        }

        page++;
    }

    return allEvents;
}

/**
 * Search for an attraction (artist) on Ticketmaster.
 * Returns the attraction ID for more precise event lookups.
 */
export async function searchAttraction(artistName, apiKey) {
    if (!apiKey) return null;

    const params = new URLSearchParams({
        apikey: apiKey,
        keyword: artistName,
        classificationName: 'music',
        size: '5',
    });

    try {
        const data = await rateLimitedFetch(`${BASE_URL}/attractions.json?${params}`);
        if (!data._embedded?.attractions?.length) return null;

        const attraction = data._embedded.attractions[0];
        return {
            id: attraction.id,
            name: attraction.name,
            image_url: attraction.images?.[0]?.url || null,
        };
    } catch {
        return null;
    }
}

/**
 * Get events by a specific attraction ID (more precise than keyword search).
 */
export async function getEventsByAttraction(attractionId, apiKey, { countryCode, stateCode } = {}) {
    if (!apiKey || !attractionId) return [];

    const params = new URLSearchParams({
        apikey: apiKey,
        attractionId: attractionId,
        classificationName: 'music',
        size: '100',
        sort: 'date,asc',
    });
    if (countryCode) params.set('countryCode', countryCode);
    if (stateCode) params.set('stateCode', stateCode);

    try {
        const data = await rateLimitedFetch(`${BASE_URL}/events.json?${params}`);
        if (!data._embedded?.events) return [];

        return data._embedded.events.map(event => {
            const venue = event._embedded?.venues?.[0];
            return {
                title: event.name || 'Live Event',
                venue: venue?.name || 'TBA',
                city: venue?.city?.name || '',
                state: venue?.state?.stateCode || venue?.state?.name || '',
                country: venue?.country?.countryCode || '',
                date: event.dates?.start?.localDate || '',
                time: event.dates?.start?.localTime || '',
                source_url: event.url || '',
                source: 'ticketmaster',
            };
        }).filter(e => e.date);
    } catch {
        return [];
    }
}
