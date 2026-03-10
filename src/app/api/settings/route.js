import { NextResponse } from 'next/server';
import { getAllSettings, setSetting } from '@/lib/db';
import { sendTestEmail } from '@/lib/emailer';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const settings = await getAllSettings(session.user.id);

        // Don't expose passwords in plain text
        if (settings.smtp_pass) {
            settings.smtp_pass = '••••••••';
        }
        if (settings.digest_imap_pass) {
            settings.digest_imap_pass = '••••••••';
        }
        return NextResponse.json({ settings });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const body = await request.json();
        const allowedKeys = [
            'notification_email',
            'poll_interval_hours',
            'spotify_client_id', 'spotify_client_secret',
            'filter_country', 'filter_state',
            'digest_imap_host', 'digest_imap_port', 'digest_imap_user', 'digest_imap_pass',
        ];

        for (const [key, value] of Object.entries(body)) {
            if (allowedKeys.includes(key)) {
                // Don't overwrite with masked value
                if (key === 'smtp_pass' && value === '••••••••') continue;
                if (key === 'digest_imap_pass' && value === '••••••••') continue;
                await setSetting(userId, key, value);
            }
        }

        return NextResponse.json({ success: true, message: 'Settings updated' });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    // POST is used for test email
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const result = await sendTestEmail(session.user.id);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
