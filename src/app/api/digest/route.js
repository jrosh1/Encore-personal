import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET — preview the digest (fetch recent emails and build summary)
 */
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const { fetchRecentEmails, buildDigestSummary } = await import('@/lib/email-digest');
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '7');

        const emails = await fetchRecentEmails(userId, days);
        const digest = buildDigestSummary(emails);

        return NextResponse.json({
            emailCount: emails.length,
            subject: digest.subject,
            previewHtml: digest.html,
            emails: emails.map(e => ({
                from: e.from,
                subject: e.subject,
                date: e.date,
                preview: (e.htmlSnippet || e.textBody || '').slice(0, 200),
            })),
        });
    } catch (err) {
        console.error('[Digest GET] Error:', err);
        return NextResponse.json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3) }, { status: 500 });
    }
}

/**
 * POST — send the digest email now (manual trigger)
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const userId = session.user.id;

        const { sendDigestEmail } = await import('@/lib/email-digest');
        const result = await sendDigestEmail(userId);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[Digest POST] Error:', err);
        return NextResponse.json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3) }, { status: 500 });
    }
}
