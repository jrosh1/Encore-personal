import * as cheerio from 'cheerio';

/**
 * Scrape a band's website for tour/events/shows page.
 * Looks for common patterns: /tour, /shows, /events, /live, /dates, /concerts
 * Returns array of normalized event objects.
 */
export async function scrapeWebsiteEvents(websiteUrl) {
    if (!websiteUrl) return [];

    try {
        // First, fetch the main page and look for a tour/events link
        const mainHtml = await fetchPage(websiteUrl);
        if (!mainHtml) return [];

        const $ = cheerio.load(mainHtml);

        // Look for tour/events page links
        const tourPaths = ['tour', 'tours', 'shows', 'events', 'live', 'dates', 'concerts', 'gigs', 'on-tour'];
        let tourPageUrl = null;

        $('a[href]').each((_, el) => {
            const href = $(el).attr('href')?.toLowerCase() || '';
            const text = $(el).text()?.toLowerCase() || '';
            for (const path of tourPaths) {
                if (href.includes(`/${path}`) || text.includes(path)) {
                    let fullUrl = $(el).attr('href');
                    if (fullUrl.startsWith('/')) {
                        const base = new URL(websiteUrl);
                        fullUrl = `${base.origin}${fullUrl}`;
                    } else if (!fullUrl.startsWith('http')) {
                        fullUrl = `${websiteUrl.replace(/\/$/, '')}/${fullUrl}`;
                    }
                    tourPageUrl = fullUrl;
                    return false; // break
                }
            }
        });

        // If we found a tour page, scrape it; otherwise parse the main page
        let targetHtml = mainHtml;
        let targetUrl = websiteUrl;
        if (tourPageUrl && tourPageUrl !== websiteUrl) {
            const tourHtml = await fetchPage(tourPageUrl);
            if (tourHtml) {
                targetHtml = tourHtml;
                targetUrl = tourPageUrl;
            }
        }

        return parseEventsFromHtml(targetHtml, targetUrl);
    } catch (err) {
        console.error(`Error scraping ${websiteUrl}:`, err.message);
        return [];
    }
}

/**
 * Scrape public Instagram page for tour/show announcements.
 */
export async function scrapeInstagramEvents(instagramUrl) {
    // Instagram heavily restricts scraping; we'll try to get any public page data
    // Most useful data will come from band websites and Ticketmaster
    if (!instagramUrl) return [];

    try {
        const html = await fetchPage(instagramUrl);
        if (!html) return [];

        // Instagram's public pages contain some metadata we can parse
        const $ = cheerio.load(html);
        const events = [];

        // Look for meta description which sometimes has bio with tour info
        const description = $('meta[property="og:description"]').attr('content') || '';
        const bioText = $('meta[name="description"]').attr('content') || '';

        // Parse any tour/show mentions from the profile description
        const tourPattern = /(?:tour|show|concert|live|perform)/i;
        if (tourPattern.test(description) || tourPattern.test(bioText)) {
            // Found tour references; note the profile URL as a source
            console.log(`Instagram profile ${instagramUrl} mentions tours/shows in bio`);
        }

        return events;
    } catch (err) {
        console.error(`Error scraping Instagram ${instagramUrl}:`, err.message);
        return [];
    }
}

/**
 * Scrape public Facebook page/events for upcoming shows.
 */
export async function scrapeFacebookEvents(facebookUrl) {
    if (!facebookUrl) return [];

    try {
        // Try to access the /events page
        const eventsUrl = facebookUrl.replace(/\/$/, '') + '/events';
        const html = await fetchPage(eventsUrl);
        if (!html) return [];

        const $ = cheerio.load(html);
        const events = [];

        // Facebook event listings have structured data sometimes
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html());
                if (data['@type'] === 'Event' || data['@type'] === 'MusicEvent') {
                    events.push({
                        title: data.name || 'Live Event',
                        venue: data.location?.name || '',
                        city: data.location?.address?.addressLocality || '',
                        state: data.location?.address?.addressRegion || '',
                        country: data.location?.address?.addressCountry || '',
                        date: data.startDate ? data.startDate.split('T')[0] : '',
                        time: data.startDate?.includes('T') ? data.startDate.split('T')[1]?.replace('Z', '') : '',
                        source_url: data.url || facebookUrl,
                        source: 'facebook',
                    });
                }
            } catch { }
        });

        return events.filter(e => e.date);
    } catch (err) {
        console.error(`Error scraping Facebook ${facebookUrl}:`, err.message);
        return [];
    }
}

// --- Internal helpers ---

async function fetchPage(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
        });

        clearTimeout(timeout);

        if (!res.ok) return null;
        return await res.text();
    } catch {
        return null;
    }
}

/**
 * Parse events from HTML using common patterns.
 * Looks for structured data, common CSS patterns, and date-like text.
 */
function parseEventsFromHtml(html, sourceUrl) {
    const $ = cheerio.load(html);
    const events = [];

    // Strategy 1: JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            let data = JSON.parse($(el).html());
            if (!Array.isArray(data)) data = [data];

            for (const item of data) {
                const items = item['@graph'] || [item];
                for (const d of items) {
                    if (d['@type'] === 'Event' || d['@type'] === 'MusicEvent') {
                        events.push({
                            title: d.name || 'Live Event',
                            venue: d.location?.name || '',
                            city: d.location?.address?.addressLocality || '',
                            state: d.location?.address?.addressRegion || '',
                            country: d.location?.address?.addressCountry || '',
                            date: d.startDate ? d.startDate.split('T')[0] : '',
                            time: d.startDate?.includes('T') ? d.startDate.split('T')[1]?.replace(/[Z+-].*/, '') : '',
                            source_url: d.url || sourceUrl,
                            source: 'website',
                        });
                    }
                }
            }
        } catch { }
    });

    // Strategy 2: Look for Bandsintown / Songkick embedded widgets (iframes)
    $('iframe[src*="bandsintown"], iframe[src*="songkick"], iframe[src*="seated"]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
            // We can't parse inside iframes, but note the widget exists
            console.log(`Found embedded widget: ${src}`);
        }
    });

    // Strategy 3: Common event listing patterns
    const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/,                                    // 2025-03-15
        /(\w{3,9}\s+\d{1,2},?\s+\d{4})/,                         // March 15, 2025
        /(\d{1,2}\s+\w{3,9}\s+\d{4})/,                           // 15 March 2025
        /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/,                   // 03/15/2025
    ];

    const eventSelectors = [
        '.event', '.tour-date', '.show', '.concert', '.gig',
        '[class*="event"]', '[class*="tour"]', '[class*="show"]',
        '.dates li', '.tour-dates li', '.events-list li',
        'table.tour tr', 'table.dates tr', '.schedule-item',
    ];

    for (const selector of eventSelectors) {
        $(selector).each((_, el) => {
            const text = $(el).text().trim();
            if (text.length < 10 || text.length > 500) return;

            let date = null;
            for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                    date = normalizeDate(match[1]);
                    break;
                }
            }

            if (date) {
                // Try to extract venue and city
                const link = $(el).find('a').attr('href') || '';
                let eventUrl = link;
                if (link.startsWith('/')) {
                    const base = new URL(sourceUrl);
                    eventUrl = `${base.origin}${link}`;
                } else if (!link.startsWith('http') && link) {
                    eventUrl = sourceUrl;
                } else if (!link) {
                    eventUrl = sourceUrl;
                }

                // Simple extraction: split remaining text into venue and city
                const cleanText = text.replace(datePatterns[0], '').replace(datePatterns[1], '')
                    .replace(datePatterns[2], '').replace(datePatterns[3], '').trim();
                const parts = cleanText.split(/[,\n|•·–—-]+/).map(s => s.trim()).filter(Boolean);

                // Try to extract an actual title from the element
                const titleSelectors = [
                    'h1', 'h2', 'h3', 'h4', '.title', '.name', '.headliner',
                    '.event-name', '.event-title', 'a.title', 'span.title',
                    '[itemprop="name"]', '.summary', 'strong', 'b'
                ];
                let extractedTitle = null;
                for (const titleSel of titleSelectors) {
                    const t = $(el).find(titleSel).first().text().trim().replace(/\s+/g, ' ');
                    if (t && t.length > 2 && t.length < 100) {
                        extractedTitle = t;
                        break;
                    }
                }

                // Fallback: The biggest or first link in the event container is usually the artist name
                if (!extractedTitle) {
                    const firstLinkText = $(el).find('a').first().text().trim().replace(/\s+/g, ' ');
                    if (firstLinkText && firstLinkText.length > 2 && firstLinkText.length < 100) {
                        extractedTitle = firstLinkText;
                    }
                }

                // Clean up the final extractedTitle to just the first line (Removes "Live Show\nDate\nArtist" multi-line garbage)
                if (extractedTitle) {
                    extractedTitle = extractedTitle.split(/[\n|•·]+/).map(s => s.trim()).filter(Boolean)[0];
                    if (extractedTitle.length > 100) extractedTitle = extractedTitle.substring(0, 100) + '...';
                }

                events.push({
                    title: extractedTitle || 'Live Event',
                    venue: parts[0] || '',
                    city: parts[1] || '',
                    state: parts[2] || '',
                    country: '',
                    date,
                    time: '',
                    source_url: eventUrl,
                    source: 'website',
                });
            }
        });
    }

    // Deduplicate by date + venue
    const seen = new Set();
    return events.filter(e => {
        if (!e.date) return false;
        const key = `${e.date}-${e.venue}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Normalize various date formats to YYYY-MM-DD.
 */
function normalizeDate(dateStr) {
    try {
        // Already ISO format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;

        return d.toISOString().split('T')[0];
    } catch {
        return null;
    }
}
