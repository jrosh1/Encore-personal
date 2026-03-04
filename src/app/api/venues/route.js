import { NextResponse } from 'next/server';
import { getAllVenues, addVenue, removeVenue } from '@/lib/db';

export async function GET() {
    try {
        const venues = getAllVenues();
        return NextResponse.json({ venues });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { name, website_url, city, state, country } = await request.json();
        if (!name || !website_url) {
            return NextResponse.json({ error: 'Name and website URL are required' }, { status: 400 });
        }

        const id = addVenue({ name, website_url, city, state, country });
        return NextResponse.json({
            venue: { id, name, website_url, city, state, country },
            message: `Added ${name}`,
        });
    } catch (err) {
        if (err.message?.includes('UNIQUE')) {
            return NextResponse.json({ error: 'Venue already added' }, { status: 409 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
        removeVenue(parseInt(id));
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
