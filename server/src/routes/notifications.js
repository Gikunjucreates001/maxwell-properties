import express from 'express';
import { getDb } from '../database.js';
import { queueMonthEndReminders, queueOverdueMessages } from '../services/notifications.js';

const router = express.Router();

router.get('/jobs', async (req, res) => {
  try {
    const db = getDb();
    const jobs = await db.prepare(`
      SELECT nj.*, t.name as tenant_name, creator.name as creator_name
      FROM notification_jobs nj
      LEFT JOIN tenants t ON t.id = nj.tenant_id
      LEFT JOIN users creator ON creator.id = nj.created_by
      ORDER BY nj.created_at DESC LIMIT 100
    `).all();
    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Get notification jobs error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/overdue', async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });
    const result = await queueOverdueMessages({ message, createdBy: req.user.id });
    res.status(201).json({ success: true, data: result, message: `Message queued for ${result.tenantCount} overdue tenant${result.tenantCount === 1 ? '' : 's'}` });
  } catch (error) {
    console.error('Queue overdue messages error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/month-end', async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });
    const result = await queueMonthEndReminders({ message, createdBy: req.user.id });
    res.status(201).json({ success: true, data: result, message: `Reminder queued for ${result.tenantCount} active tenant${result.tenantCount === 1 ? '' : 's'}` });
  } catch (error) {
    console.error('Queue month-end reminders error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

