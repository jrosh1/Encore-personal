import { NextResponse } from 'next/server';
import { getAllArtists, addArtist, addArtistUrl, removeArtist, getDb, getSetting } from '@/lib/db';
import { searchArtist, getFullArtistInfo } from '@/lib/musicbrainz';
import { searchAttraction } from '@/lib/ticketmaster';
import { syncArtistEvents } from '@/lib/sync';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const artists = await getAllArtists(session.user.id);
        return NextResponse.json({ artists });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const { name, mbid } = await request.json();
        if (!name && !mbid) {
            return NextResponse.json({ error: 'Name or MBID required' }, { status: 400 });
        }

        let artistMbid = mbid;
        let artistName = name;

        // If no MBID provided, search MusicBrainz
        if (!artistMbid && artistName) {
            const results = await searchArtist(artistName);
            if (results.length === 0) {
                // Add without MusicBrainz data
                const id = await addArtist(userId, { name: artistName });
                return NextResponse.json({
                    artist: { id, name: artistName, members: [], urls: [] },
                    message: 'Artist added (not found on MusicBrainz)'
                });
            }

            // If multiple results, return them for user selection
            if (!mbid && results.length > 1) {
                // Auto-select first exact/close match, or return choices
                const exactMatch = results.find(r => r.name.toLowerCase() === artistName.toLowerCase());
                if (exactMatch) {
                    artistMbid = exactMatch.mbid;
                    artistName = exactMatch.name;
                } else {
                    artistMbid = results[0].mbid;
                    artistName = results[0].name;
                }
            } else {
                artistMbid = results[0].mbid;
                artistName = results[0].name;
            }
        }

        // Check if already tracked
        const existing = await prisma.artist.findFirst({
            where: { musicbrainz_id: artistMbid, is_member: false, userId }
        });
        if (existing) {
            return NextResponse.json({ error: 'Artist already tracked' }, { status: 409 });
        }

        // Get full info from MusicBrainz (members + URLs)
        const info = await getFullArtistInfo(artistMbid);

        // Add main artist
        // First, try to resolve Ticketmaster attraction ID for precise event lookups
        let ticketmasterId = null;
        const tmApiKey = await getSetting(userId, 'ticketmaster_api_key');
        if (tmApiKey) {
            try {
                const attraction = await searchAttraction(info.name || artistName, tmApiKey);
                if (attraction?.id) ticketmasterId = attraction.id;
            } catch { /* non-fatal */ }
        }

        const artistId = await addArtist(userId, {
            name: info.name || artistName,
            musicbrainz_id: artistMbid,
            ticketmaster_id: ticketmasterId,
        });

        // Add URLs for the main artist
        for (const urlObj of info.urls) {
            await addArtistUrl(userId, artistId, urlObj.type, urlObj.url);
        }

        // Add band members (if it's a group)
        const addedMembers = [];
        if (info.type === 'Group' && info.members.length > 0) {
            for (const member of info.members) {
                // Check if member already exists
                const existingMember = await prisma.artist.findFirst({
                    where: { musicbrainz_id: member.mbid, parent_artist_id: artistId, userId }
                });

                if (!existingMember) {
                    const memberId = await addArtist(userId, {
                        name: member.name,
                        musicbrainz_id: member.mbid,
                        is_member: true,
                        parent_artist_id: artistId,
                    });

                    // Get URLs for each member too
                    try {
                        const memberInfo = await getFullArtistInfo(member.mbid);
                        for (const urlObj of memberInfo.urls) {
                            await addArtistUrl(userId, memberId, urlObj.type, urlObj.url);
                        }
                    } catch {
                        // Non-critical, continue
                    }

                    addedMembers.push({ id: memberId, name: member.name, active: member.active });
                }
            }
        }

        // Trigger initial event sync
        let syncResult = { newEvents: 0, totalEvents: 0 };
        const allArtists = await getAllArtists(userId);
        const artist = allArtists.find(a => a.id === Number(artistId));

        if (artist) {
            try {
                syncResult = await syncArtistEvents(userId, artist);
            } catch (err) {
                console.error('Initial sync error:', err.message);
            }
        }

        return NextResponse.json({
            artist: {
                id: artistId,
                name: info.name || artistName,
                members: addedMembers,
                urls: info.urls,
            },
            sync: syncResult,
            message: `Added ${info.name} with ${addedMembers.length} members. Found ${syncResult.totalEvents} events.`
        });
    } catch (err) {
        console.error('Error adding artist:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }
        await removeArtist(session.user.id, parseInt(id));
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
