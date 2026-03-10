import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET — fetch all venue events for the logged-in user
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const venueEvents = await prisma.venueEvent.findMany({
            where: { userId: session.user.id },
            include: {
                venue: {
                    select: { name: true, city: true, state: true, country: true },
                },
            },
            orderBy: { date: 'asc' },
        });

        return NextResponse.json({
            venueEvents: venueEvents.map(ve => ({
                id: ve.id,
                title: ve.title,
                date: ve.date,
                time: ve.time,
                source_url: ve.source_url,
                venue: ve.venue.name,
                city: ve.venue.city,
                state: ve.venue.state,
                country: ve.venue.country,
                source: 'venue-calendar',
            })),
        });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
