import { NextResponse } from 'next/server';
import { getAllVenues, addVenue, removeVenue } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const venues = await getAllVenues(session.user.id);
        return NextResponse.json({ venues });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const { name, website_url, city, state, country } = await request.json();
        if (!name || !website_url) {
            return NextResponse.json({ error: 'Name and website URL are required' }, { status: 400 });
        }

        const id = await addVenue(userId, { name, website_url, city, state, country });
        return NextResponse.json({
            venue: { id, name, website_url, city, state, country },
            message: `Added ${name}`,
        });
    } catch (err) {
        if (err.message?.includes('P2002')) { // Prisma unique constraint error
            return NextResponse.json({ error: 'Venue already added' }, { status: 409 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        await removeVenue(session.user.id, parseInt(id));
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
