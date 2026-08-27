import { getDb } from '../database.js';
import { queueMonthEndReminders } from './notifications.js';

async function runMonthEndReminder() {
  const reminderDay = Number(process.env.REMINDER_DAY_OF_MONTH || 25);
  const now = new Date();
  if (!Number.isInteger(reminderDay) || now.getDate() !== reminderDay) return;
  const alreadyQueued = await getDb().prepare("SELECT id FROM notification_jobs WHERE notification_type = 'month_end_reminder' AND date(created_at) = date('now') LIMIT 1").get();
  if (alreadyQueued) return;
  await queueMonthEndReminders({
    message: process.env.REMINDER_MESSAGE || 'This is a friendly reminder that the month is ending soon. Please settle your rent and any outstanding bills on time.',
    createdBy: null,
  });
}

export function startNotificationScheduler() {
  if (process.env.ENABLE_AUTOMATIC_REMINDERS !== 'true') return;
  void runMonthEndReminder();
  const timer = setInterval(() => { void runMonthEndReminder(); }, 60 * 60 * 1000);
  timer.unref?.();
}

