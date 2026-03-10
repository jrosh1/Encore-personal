import { NextResponse } from 'next/server';
import { syncAllArtists } from '@/lib/sync';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    // Basic security: require a CRON_SECRET configured in Vercel
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const users = await prisma.user.findMany({ select: { id: true } });

        let totalNew = 0;
        let totalEvents = 0;
        let syncedUsers = 0;

        for (const user of users) {
            try {
                const result = await syncAllArtists(user.id);
                totalNew += result.newEvents;
                totalEvents += result.totalEvents;
                syncedUsers++;
            } catch (err) {
                console.error(`Error syncing for user ${user.id}:`, err);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Synced ${syncedUsers} users. Added ${totalNew} new events.`,
            newEvents: totalNew,
            totalEvents
        });
    } catch (err) {
        console.error('Global Cron Sync Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
