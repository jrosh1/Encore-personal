import cron from 'node-cron';
import { syncAllArtists } from './sync.js';
import { getNewEventsSince, getSetting, setSetting } from './db.js';
import { sendNewEventsEmail } from './emailer.js';

let scheduledTask = null;
let digestTask = null;

/**
 * Start the scheduler that periodically checks for new events
 * and sends a weekly newsletter digest.
 */
export function startScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
    }

    const intervalHours = parseInt(getSetting('poll_interval_hours') || '6');
    const cronExpression = `0 */${intervalHours} * * *`;

    console.log(`[Scheduler] Starting: poll every ${intervalHours} hours (cron: ${cronExpression})`);

    scheduledTask = cron.schedule(cronExpression, async () => {
        console.log(`[Scheduler] Running sync at ${new Date().toISOString()}`);
        try {
            const lastSync = getSetting('last_sync') || new Date(0).toISOString();
            const result = await syncAllArtists();
            console.log(`[Scheduler] Sync complete: ${result.newEvents} new events found`);

            if (result.newEvents > 0) {
                const newEvents = getNewEventsSince(lastSync);
                if (newEvents.length > 0) {
                    const emailResult = await sendNewEventsEmail(newEvents);
                    console.log(`[Scheduler] Email:`, emailResult);
                }
            }
        } catch (err) {
            console.error(`[Scheduler] Error:`, err.message);
        }
    });

    // Weekly newsletter digest — every Sunday at 10am
    if (digestTask) digestTask.stop();
    digestTask = cron.schedule('0 10 * * 0', async () => {
        console.log(`[Scheduler] Running weekly digest at ${new Date().toISOString()}`);
        try {
            const { sendDigestEmail } = await import('./email-digest.js');
            const result = await sendDigestEmail();
            console.log(`[Scheduler] Digest sent: ${result.emailCount} emails summarized`);
        } catch (err) {
            console.error(`[Scheduler] Digest error:`, err.message);
        }
    });
    console.log('[Scheduler] Weekly digest scheduled for Sundays at 10am');

    return scheduledTask;
}

export function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    if (digestTask) {
        digestTask.stop();
        digestTask = null;
    }
    console.log('[Scheduler] Stopped');
}
