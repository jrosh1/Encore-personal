import { getAllArtists, upsertEvent, getSetting, getNewEventsSince, getDb } from './db.js';
import { searchEvents, getEventsByAttraction, searchAttraction } from './ticketmaster.js';
import { scrapeWebsiteEvents, scrapeInstagramEvents, scrapeFacebookEvents } from './scraper.js';

/**
 * Cover band / tribute act detection.
 * Returns true if the event looks like it's from a cover/tribute band.
 */
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

    // Check title for tribute/cover patterns
    for (const pattern of COVER_BAND_PATTERNS) {
        if (pattern.test(title)) return true;
    }

    // Check if the event title contains the artist name with a suspicious suffix
    // e.g. "Red Hot Chili Peppers UK" or "Radiohead Project"
    for (const suffix of COVER_BAND_SUFFIXES) {
        const withSuffix = new RegExp(
            canonicalLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + suffix.source,
            'i'
        );
        if (withSuffix.test(title)) return true;
    }

    return false;
}

/**
 * Check if an artist name closely matches the canonical name.
 * Uses normalized comparison — not a fuzzy match, but handles common variations.
 */
function nameMatchesArtist(eventArtistName, canonicalName) {
    if (!eventArtistName) return true; // Can't filter, allow through
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const canonical = normalize(canonicalName);
    const event = normalize(eventArtistName);

    // Exact match after normalization
    if (event === canonical) return true;

    // One contains the other (for "Thom Yorke" matching "Thom Yorke Tomorrow's Modern Boxes")
    if (event.includes(canonical) || canonical.includes(event)) return true;

    return false;
}

/**
 * Sync events for a single artist from all sources.
 * Returns { newEvents: number, totalEvents: number }
 */
export async function syncArtistEvents(artist) {
    const apiKey = getSetting('ticketmaster_api_key');
    let newEvents = 0;
    let totalEvents = 0;

    // 1. Ticketmaster API — prefer attraction ID for precision
    if (apiKey) {
        const countryCode = getSetting('filter_country') || undefined;
        const stateCode = getSetting('filter_state') || undefined;
        const locationFilter = { countryCode, stateCode };

        try {
            let tmEvents = [];

            if (artist.ticketmaster_id) {
                // Use precise attraction-based lookup (no cover bands!)
                tmEvents = await getEventsByAttraction(artist.ticketmaster_id, apiKey, locationFilter);
            } else {
                // Fallback to keyword search + resolve attraction for next time
                tmEvents = await searchEvents(artist.name, apiKey, locationFilter);

                // Try to resolve and store attraction ID for future lookups
                try {
                    const attraction = await searchAttraction(artist.name, apiKey);
                    if (attraction?.id) {
                        const db = getDb();
                        db.prepare('UPDATE artists SET ticketmaster_id = ? WHERE id = ?')
                            .run(attraction.id, artist.id);
                    }
                } catch { /* non-fatal */ }
            }

            // Filter out cover/tribute band events
            for (const event of tmEvents) {
                if (isCoverBandEvent(event, artist.name)) {
                    console.log(`  ⚠ Filtered cover band event: "${event.title}" for ${artist.name}`);
                    continue;
                }
                const result = upsertEvent({ ...event, artist_id: artist.id });
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
                const result = upsertEvent({ ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) {
            console.error(`Website scrape error for ${urlObj.url}:`, err.message);
        }
    }

    // 3. Scrape Instagram
    const igUrls = urls.filter(u => u.url_type === 'instagram');
    for (const urlObj of igUrls) {
        try {
            const igEvents = await scrapeInstagramEvents(urlObj.url);
            for (const event of igEvents) {
                const result = upsertEvent({ ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) {
            console.error(`Instagram scrape error for ${urlObj.url}:`, err.message);
        }
    }

    // 4. Scrape Facebook
    const fbUrls = urls.filter(u => u.url_type === 'facebook');
    for (const urlObj of fbUrls) {
        try {
            const fbEvents = await scrapeFacebookEvents(urlObj.url);
            for (const event of fbEvents) {
                const result = upsertEvent({ ...event, artist_id: artist.id });
                if (result.isNew) newEvents++;
                totalEvents++;
            }
        } catch (err) {
            console.error(`Facebook scrape error for ${urlObj.url}:`, err.message);
        }
    }

    return { newEvents, totalEvents };
}

/**
 * Sync events for ALL tracked artists (bands + members) + venue schedules.
 * Returns summary of what was found.
 */
export async function syncAllArtists() {
    const artists = getAllArtists();
    const syncStart = new Date().toISOString();
    let totalNew = 0;
    let totalEvents = 0;

    for (const artist of artists) {
        // Sync the main artist
        const mainResult = await syncArtistEvents(artist);
        totalNew += mainResult.newEvents;
        totalEvents += mainResult.totalEvents;

        // Sync each member
        if (artist.members) {
            for (const member of artist.members) {
                member.urls = [];
                const db = getDb();
                member.urls = db.prepare('SELECT * FROM artist_urls WHERE artist_id = ?').all(member.id);
                const memberResult = await syncArtistEvents(member);
                totalNew += memberResult.newEvents;
                totalEvents += memberResult.totalEvents;
            }
        }
    }

    // Sync venue schedules
    try {
        const venueResult = await syncVenueSchedules(artists);
        totalNew += venueResult.newEvents;
        totalEvents += venueResult.totalEvents;
    } catch (err) {
        console.error('Venue sync error:', err.message);
    }

    // Update last sync time
    const { setSetting } = await import('./db.js');
    setSetting('last_sync', syncStart);

    return {
        syncedAt: syncStart,
        artistCount: artists.length,
        newEvents: totalNew,
        totalEvents,
    };
}

/**
 * Scrape event schedules from all tracked venues.
 * Matches scraped events against tracked artists to avoid duplicates and only store relevant events.
 */
async function syncVenueSchedules(artists) {
    const { getAllVenues } = await import('./db.js');
    const venues = getAllVenues();
    let newEvents = 0;
    let totalEvents = 0;

    if (venues.length === 0) return { newEvents, totalEvents };

    // Build a set of all tracked artist names (lowercased) for matching
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
        console.log(`  📍 Scraping venue: ${venue.name} (${venue.website_url})`);
        try {
            const venueEvents = await scrapeWebsiteEvents(venue.website_url);

            for (const event of venueEvents) {
                // Try to match this event to a tracked artist
                const eventTitle = (event.title || '').toLowerCase();
                let matchedArtist = null;

                for (const [name, artist] of allArtistNames) {
                    if (eventTitle.includes(name)) {
                        matchedArtist = artist;
                        break;
                    }
                }

                if (matchedArtist) {
                    // Store as an event for the matched artist — auto-dedups via upsert
                    const result = upsertEvent({
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
        } catch (err) {
            console.error(`  Venue scrape error for ${venue.name}:`, err.message);
        }
    }

    return { newEvents, totalEvents };
}

