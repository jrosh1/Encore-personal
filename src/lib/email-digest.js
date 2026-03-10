import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getSetting } from './db.js';

/**
 * Connect to the dedicated IMAP inbox and fetch recent emails.
 * Returns parsed emails from the last N days.
 */
export async function fetchRecentEmails(userId, daysBack = 7) {
    if (!userId) throw new Error("userId required");
    const host = await getSetting(userId, 'digest_imap_host');
    const port = parseInt(await getSetting(userId, 'digest_imap_port') || '993');
    const user = await getSetting(userId, 'digest_imap_user');
    const pass = await getSetting(userId, 'digest_imap_pass');

    if (!host || !user || !pass) {
        throw new Error('Digest inbox IMAP credentials not configured');
    }

    const client = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user, pass },
        logger: false,
    });

    const emails = [];

    try {
        await client.connect();

        const lock = await client.getMailboxLock('INBOX');
        try {
            const since = new Date();
            since.setDate(since.getDate() - daysBack);

            // Search for emails received in the last N days
            const messages = client.fetch(
                { since },
                { source: true, envelope: true }
            );

            for await (const msg of messages) {
                try {
                    const parsed = await simpleParser(msg.source);
                    emails.push({
                        id: msg.uid,
                        from: parsed.from?.text || 'Unknown',
                        subject: parsed.subject || '(no subject)',
                        date: parsed.date?.toISOString() || msg.envelope?.date?.toISOString() || '',
                        textBody: (parsed.text || '').slice(0, 2000), // Limit body size
                        htmlSnippet: stripHtml(parsed.html || '').slice(0, 1000),
                    });
                } catch {
                    // Skip unparseable emails
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
    } catch (err) {
        try { await client.logout(); } catch { /* ignore */ }
        throw err;
    }

    return emails.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Strip HTML tags to get plain text summary.
 */
function stripHtml(html) {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Build a digest summary from fetched emails.
 * Groups by sender and summarizes.
 */
export function buildDigestSummary(emails) {
    if (emails.length === 0) {
        return {
            subject: 'Encore Weekly Digest — No new emails',
            html: '<h2>🎵 Encore Weekly Digest</h2><p>No new emails from your subscribed artists this week.</p>',
            text: 'Encore Weekly Digest\n\nNo new emails from your subscribed artists this week.',
        };
    }

    // Group by sender
    const bySender = {};
    for (const email of emails) {
        const sender = email.from;
        if (!bySender[sender]) bySender[sender] = [];
        bySender[sender].push(email);
    }

    const senderCount = Object.keys(bySender).length;
    const subject = `Encore Weekly Digest — ${emails.length} email${emails.length !== 1 ? 's' : ''} from ${senderCount} artist${senderCount !== 1 ? 's' : ''}`;

    // Build HTML
    let html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
            <h1 style="color: #f59e0b; margin-bottom: 4px;">⚡ Encore Weekly Digest</h1>
            <p style="color: #999; margin-bottom: 24px;">${emails.length} email${emails.length !== 1 ? 's' : ''} from ${senderCount} source${senderCount !== 1 ? 's' : ''} this week</p>
    `;

    let text = `⚡ Encore Weekly Digest\n${emails.length} emails from ${senderCount} sources this week\n\n`;

    for (const [sender, senderEmails] of Object.entries(bySender)) {
        html += `
            <div style="background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 3px solid #f59e0b;">
                <h3 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 14px;">${escapeHtml(sender)}</h3>
        `;
        text += `━━━ ${sender} ━━━\n`;

        for (const email of senderEmails) {
            const dateStr = email.date ? new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            const snippet = email.htmlSnippet || email.textBody || '';
            const preview = snippet.slice(0, 200) + (snippet.length > 200 ? '...' : '');

            html += `
                <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #1a1a2e;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(email.subject)}</div>
                    <div style="font-size: 12px; color: #999; margin-bottom: 6px;">${dateStr}</div>
                    <div style="font-size: 13px; color: #bbb;">${escapeHtml(preview)}</div>
                </div>
            `;
            text += `  📧 ${email.subject} (${dateStr})\n     ${preview.slice(0, 150)}\n\n`;
        }

        html += '</div>';
        text += '\n';
    }

    html += '</div>';

    return { subject, html, text };
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Send the weekly digest email.
 */
export async function sendDigestEmail(userId) {
    if (!userId) throw new Error("userId required");
    const nodemailer = (await import('nodemailer')).default;

    const smtpHost = await getSetting(userId, 'smtp_host');
    const smtpPort = parseInt(await getSetting(userId, 'smtp_port') || '587');
    const smtpUser = await getSetting(userId, 'smtp_user');
    const smtpPass = await getSetting(userId, 'smtp_pass');
    const recipientEmail = await getSetting(userId, 'notification_email');

    if (!smtpHost || !smtpUser || !smtpPass || !recipientEmail) {
        throw new Error('SMTP or notification email not configured');
    }

    // Fetch emails from the digest inbox
    const emails = await fetchRecentEmails(userId, 7);

    // Build the digest
    const digest = buildDigestSummary(emails);

    // Send it
    const transport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
    });

    await transport.sendMail({
        from: `"Encore" <${smtpUser}>`,
        to: recipientEmail,
        subject: digest.subject,
        text: digest.text,
        html: digest.html,
    });

    return {
        sent: true,
        emailCount: emails.length,
        subject: digest.subject,
    };
}
