import nodemailer from 'nodemailer';
import { getSetting, getAllSettings } from './db.js';

/**
 * Send a styled HTML email with new concert announcements.
 * @param {Array} newEvents - Array of event objects with artist_name
 */
export async function sendNewEventsEmail(newEvents) {
    if (!newEvents || newEvents.length === 0) return { sent: false, reason: 'No new events' };

    const settings = getAllSettings();
    const smtpHost = settings.smtp_host;
    const smtpPort = settings.smtp_port || '587';
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const notifyEmail = settings.notification_email;

    if (!smtpHost || !smtpUser || !smtpPass || !notifyEmail) {
        return { sent: false, reason: 'Email not configured. Set SMTP credentials in Settings.' };
    }

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: parseInt(smtpPort) === 465,
        auth: { user: smtpUser, pass: smtpPass },
    });

    const eventRows = newEvents.map(e => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #333; color: #e0e0e0;">${e.artist_name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333; color: #e0e0e0;">${e.date}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333; color: #e0e0e0;">${e.venue || 'TBA'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333; color: #e0e0e0;">${e.city}${e.state ? ', ' + e.state : ''}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">
        ${e.source_url ? `<a href="${e.source_url}" style="color: #a78bfa; text-decoration: none;">View →</a>` : '—'}
      </td>
    </tr>
  `).join('');

    const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🎵 New Concert Alerts</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">${newEvents.length} new show${newEvents.length > 1 ? 's' : ''} found</p>
      </div>
      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="text-align: left;">
              <th style="padding: 12px; color: #a78bfa; border-bottom: 2px solid #a78bfa;">Artist</th>
              <th style="padding: 12px; color: #a78bfa; border-bottom: 2px solid #a78bfa;">Date</th>
              <th style="padding: 12px; color: #a78bfa; border-bottom: 2px solid #a78bfa;">Venue</th>
              <th style="padding: 12px; color: #a78bfa; border-bottom: 2px solid #a78bfa;">Location</th>
              <th style="padding: 12px; color: #a78bfa; border-bottom: 2px solid #a78bfa;">Link</th>
            </tr>
          </thead>
          <tbody>
            ${eventRows}
          </tbody>
        </table>
      </div>
      <div style="padding: 16px 24px; text-align: center; color: #666; font-size: 12px;">
        Sent by your Concert Tracker • <a href="http://localhost:3000" style="color: #a78bfa;">Open Dashboard</a>
      </div>
    </div>
  `;

    try {
        await transporter.sendMail({
            from: smtpUser,
            to: notifyEmail,
            subject: `🎵 ${newEvents.length} New Concert${newEvents.length > 1 ? 's' : ''} Found!`,
            html,
        });
        return { sent: true, count: newEvents.length };
    } catch (err) {
        console.error('Email send error:', err.message);
        return { sent: false, reason: err.message };
    }
}

/**
 * Send a test email to verify SMTP configuration.
 */
export async function sendTestEmail() {
    const settings = getAllSettings();
    const smtpHost = settings.smtp_host;
    const smtpPort = settings.smtp_port || '587';
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_pass;
    const notifyEmail = settings.notification_email;

    if (!smtpHost || !smtpUser || !smtpPass || !notifyEmail) {
        return { sent: false, reason: 'Email not configured. Fill in all SMTP fields.' };
    }

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: parseInt(smtpPort) === 465,
        auth: { user: smtpUser, pass: smtpPass },
    });

    try {
        await transporter.sendMail({
            from: smtpUser,
            to: notifyEmail,
            subject: '🎵 Concert Tracker — Test Email',
            html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 32px; text-align: center;">
          <h1 style="color: #a78bfa; margin: 0;">✅ Email Works!</h1>
          <p style="color: #e0e0e0; margin-top: 16px;">Your Concert Tracker email notifications are configured correctly.</p>
        </div>
      `,
        });
        return { sent: true };
    } catch (err) {
        return { sent: false, reason: err.message };
    }
}
