import prisma from './prisma';

// --- Artist helpers ---
export async function getAllArtists(userId) {
  if (!userId) throw new Error("userId required");

  const artists = await prisma.artist.findMany({
    where: { userId, is_member: false },
    orderBy: { name: 'asc' },
    include: {
      urls: { orderBy: { url_type: 'asc' } },
      members: {
        orderBy: { name: 'asc' },
        include: { urls: { orderBy: { url_type: 'asc' } } }
      },
      _count: {
        select: {
          events: { where: { date: { gte: new Date().toISOString().split('T')[0] } } }
        }
      }
    }
  });

  return artists.map(a => ({
    ...a,
    upcoming_count: a._count.events
  }));
}

export async function addArtist(userId, { name, musicbrainz_id, ticketmaster_id, image_url, is_member = false, parent_artist_id = null }) {
  if (!userId) throw new Error("userId required");

  try {
    const artist = await prisma.artist.create({
      data: {
        userId,
        name,
        musicbrainz_id: musicbrainz_id || null,
        ticketmaster_id: ticketmaster_id || null,
        image_url: image_url || null,
        is_member,
        parent_artist_id: parent_artist_id || null
      }
    });
    return artist.id;
  } catch (err) {
    if (err.code === 'P2002' && musicbrainz_id && !is_member) { // Prisma Unique Constraint Violation
      const existing = await prisma.artist.findUnique({
        where: { userId_musicbrainz_id: { userId, musicbrainz_id } }
      });
      if (existing) return existing.id;
    }
    throw err;
  }
}

export async function removeArtist(userId, id) {
  if (!userId) throw new Error("userId required");
  await prisma.artist.deleteMany({ where: { id: parseInt(id), userId } });
}

export async function addArtistUrl(userId, artist_id, url_type, url) {
  if (!userId) throw new Error("userId required");

  // Verify ownership first
  const artist = await prisma.artist.findFirst({ where: { id: artist_id, userId } });
  if (!artist) throw new Error("Artist not found or access denied");

  try {
    const artistUrl = await prisma.artistUrl.create({
      data: { artist_id, url_type, url }
    });
    return artistUrl.id;
  } catch (err) {
    if (err.code === 'P2002') return null; // Already exists
    throw err;
  }
}

export async function removeArtistUrl(userId, id) {
  if (!userId) throw new Error("userId required");

  const url = await prisma.artistUrl.findUnique({ where: { id: parseInt(id) }, include: { artist: true } });
  if (url && url.artist.userId === userId) {
    await prisma.artistUrl.delete({ where: { id: parseInt(id) } });
  }
}

// --- Event helpers ---
export async function getEvents(userId, { startDate, endDate, artistId, limit } = {}) {
  if (!userId) throw new Error("userId required");

  let where = { userId };
  if (startDate) where.date = { gte: startDate };
  if (endDate) where.date = { ...where.date, lte: endDate };
  if (artistId) where.artist_id = artistId;

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: 'asc' },
    take: limit,
    include: { artist: { select: { name: true } } }
  });

  return events.map(e => ({ ...e, artist_name: e.artist.name }));
}

export async function upsertEvent(userId, { artist_id, title, venue, city, state, country, date, time, source_url, source }) {
  if (!userId) throw new Error("userId required");

  try {
    const event = await prisma.event.upsert({
      where: {
        artist_id_title_date: { artist_id, title, date }
      },
      update: {
        source_url: source_url || undefined,
        time: time || undefined,
        state: state || undefined,
        country: country || undefined,
        source: source || 'unknown'
      },
      create: {
        userId,
        artist_id,
        title,
        venue: venue || null,
        city: city || null,
        state: state || null,
        country: country || null,
        date,
        time: time || null,
        source_url: source_url || null,
        source: source || 'unknown'
      }
    });
    // Prisma returns created info or updated info, no `changes` property directly, 
    // so we assume true to trigger sync updates properly.
    return { id: event.id, isNew: true };
  } catch (e) {
    console.error('Error upserting event:', e.message);
    return { id: null, isNew: false };
  }
}

export async function getNewEventsSince(userId, since) {
  if (!userId) throw new Error("userId required");

  const today = new Date().toISOString().split('T')[0];

  const events = await prisma.event.findMany({
    where: {
      userId,
      first_seen_at: { gte: new Date(since) },
      date: { gte: today }
    },
    orderBy: { date: 'asc' },
    include: { artist: { select: { name: true } } }
  });

  return events.map(e => ({ ...e, artist_name: e.artist.name }));
}

// --- Settings helpers ---
export async function getSetting(userId, key) {
  if (!userId) throw new Error("userId required");

  const row = await prisma.setting.findUnique({
    where: { userId_key: { userId, key } }
  });
  return row ? row.value : null;
}

export async function setSetting(userId, key, value) {
  if (!userId) throw new Error("userId required");

  await prisma.setting.upsert({
    where: { userId_key: { userId, key } },
    update: { value: String(value) },
    create: { userId, key, value: String(value) }
  });
}

export async function getAllSettings(userId) {
  if (!userId) throw new Error("userId required");

  const rows = await prisma.setting.findMany({ where: { userId } });
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// --- Venue helpers ---
export async function getAllVenues(userId) {
  if (!userId) throw new Error("userId required");
  return await prisma.venue.findMany({
    where: { userId },
    orderBy: { name: 'asc' }
  });
}

export async function addVenue(userId, { name, website_url, city, state, country }) {
  if (!userId) throw new Error("userId required");

  try {
    const venue = await prisma.venue.create({
      data: { userId, name, website_url, city, state, country: country || 'US' }
    });
    return venue.id;
  } catch (err) {
    if (err.code === 'P2002') {
      const existing = await prisma.venue.findUnique({ where: { userId_website_url: { userId, website_url } } });
      if (existing) return existing.id;
    }
    throw err;
  }
}

export async function removeVenue(userId, id) {
  if (!userId) throw new Error("userId required");
  await prisma.venue.deleteMany({ where: { id: parseInt(id), userId } });
}
