import { getAllArtists, upsertEvent, getSetting } from './db.js';
import { searchEvents, getEventsByAttraction, searchAttraction } from './ticketmaster.js';
import { scrapeWebsiteEvents, scrapeInstagramEvents, scrapeFacebookEvents } from './scraper.js';
import prisma from './prisma.js';

const COVER_BAND_PATTERNS = [
    /\btribut/i,
    /\bexperience\b/i,
    /\bcelebration\s+of\b/i,
    /\blegacy\b/i,
    /\bsymphonic\b/i,
    /\bcovers?\b/i,
    /\bre-?creation/i,
    /\bunjazzed\b/i,
    /\borchestra(?:l)?\b/i,
];

const COVER_BAND_SUFFIXES = [
    /\buk\b/i,
    /\busa?\b/i,
    /\bjr\.?\b/i,
    /\bproject\b/i,
    /\brevived\b/i,
    /\brevisited\b/i,
];

function isCoverBandEvent(event, canonicalArtistName) {
    const title = (event.title || '').toLowerCase();
    const canonicalLower = canonicalArtistName.toLowerCase().trim();

    for (const pattern of COVER_BAND_PATTERNS) {
        if (pattern.test(title)) return true;
    }

    for (const suffix of COVER_BAND_SUFFIXES) {
        const withSuffix = new RegExp(
            canonicalLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + suffix.source,
            'i'
        );
        if (withSuffix.test(title)) return true;
    }
    return false;
}

export async function syncArtistEvents(userId, artist) {
    if (!userId) throw new Error("userId required");
    const apiKey = await getSetting(userId, 'ticketmaster_api_key');
    let newEvents = 0;
    let totalEvents = 0;

    // 1. Ticketmaster API
    if (apiKey) {
        const countryCode = await getSetting(userId, 'filter_country') || undefined;
        const stateCode = await getSetting(userId, 'filter_state') || undefined;
        const locationFilter = { countryCode, stateCode };

        try {
            let tmEvents = [];
            if (artist.ticketmaster_id) {
                tmEvents = await getEventsByAttraction(artist.ticketmaster_id, apiKey, locationFilter);
            } else {
                tmEvents = await searchEvents(artist.name, apiKey, locationFilter);
                try {
                    const attraction = await searchAttraction(artist.name, apiKey);
                    if (attraction?.id) {
                        await prisma.artist.update({
                            where: { id: artist.id },
                            data: { ticketmaster_id: attraction.id }
                        });
                    }
                } catch { /* non-fatal */ }
            }

            for (const event of tmEvents) {
                if (isCoverBandEvent(event, artist.name)) continue;
                const result = await upsertEvent(userId, { ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) {
            console.error(`Ticketmaster error for ${artist.name}:`, err.message);
        }
    }

    // 2. Scrape band websites
    const urls = artist.urls || [];
    const websiteUrls = urls.filter(u => u.url_type === 'website' || u.url_type === 'bandcamp');
    for (const urlObj of websiteUrls) {
        try {
            const webEvents = await scrapeWebsiteEvents(urlObj.url);
            for (const event of webEvents) {
                const result = await upsertEvent(userId, { ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) { }
    }

    // 3. Scrape Instagram
    const igUrls = urls.filter(u => u.url_type === 'instagram');
    for (const urlObj of igUrls) {
        try {
            const igEvents = await scrapeInstagramEvents(urlObj.url);
            for (const event of igEvents) {
                const result = await upsertEvent(userId, { ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) { }
    }

    // 4. Scrape Facebook
    const fbUrls = urls.filter(u => u.url_type === 'facebook');
    for (const urlObj of fbUrls) {
        try {
            const fbEvents = await scrapeFacebookEvents(urlObj.url);
            for (const event of fbEvents) {
                const result = await upsertEvent(userId, { ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) { }
    }

    return { newEvents, totalEvents };
}

export async function syncAllArtists(userId) {
    if (!userId) throw new Error("userId required");
    const artists = await getAllArtists(userId);
    const syncStart = new Date().toISOString();
    let totalNew = 0;
    let totalEvents = 0;

    for (const artist of artists) {
        const mainResult = await syncArtistEvents(userId, artist);
        totalNew += mainResult.newEvents;
        totalEvents += mainResult.totalEvents;
    }

    try {
        const venueResult = await syncVenueSchedules(userId, artists);
        totalNew += venueResult.newEvents;
        totalEvents += venueResult.totalEvents;
    } catch (err) {
        console.error('Venue sync error:', err.message);
    }

    const { setSetting } = await import('./db.js');
    await setSetting(userId, 'last_sync', syncStart);

    return {
        syncedAt: syncStart,
        artistCount: artists.length,
        newEvents: totalNew,
        totalEvents,
    };
}

async function syncVenueSchedules(userId, artists) {
    const { getAllVenues } = await import('./db.js');
    const venues = await getAllVenues(userId);
    let newEvents = 0;
    let totalEvents = 0;

    if (venues.length === 0) return { newEvents, totalEvents };

    const allArtistNames = new Map();
    for (const artist of artists) {
        allArtistNames.set(artist.name.toLowerCase(), artist);
        if (artist.members) {
            for (const member of artist.members) {
                allArtistNames.set(member.name.toLowerCase(), member);
            }
        }
    }

    for (const venue of venues) {
        try {
            const venueEvents = await scrapeWebsiteEvents(venue.website_url);

            for (const event of venueEvents) {
                const eventTitle = (event.title || '').toLowerCase();
                let matchedArtist = null;

                for (const [name, artist] of allArtistNames) {
                    if (eventTitle.includes(name)) {
                        matchedArtist = artist;
                        break;
                    }
                }

                if (matchedArtist) {
                    const result = await upsertEvent(userId, {
                        ...event,
                        artist_id: matchedArtist.id,
                        venue: venue.name,
                        city: event.city || venue.city,
                        state: event.state || venue.state,
                        country: event.country || venue.country,
                        source: 'venue',
                    });
                    if (result.isNew) newEvents++;
                    totalEvents++;
                }
            }
        } catch (err) { }
    }

    return { newEvents, totalEvents };
}
