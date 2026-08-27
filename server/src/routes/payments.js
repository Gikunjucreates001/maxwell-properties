import express from 'express';
import { getDb } from '../database.js';
import { createApproval } from '../services/approvals.js';
import { queueOnboardingIfEligible, queuePaymentReceipts } from '../services/notifications.js';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  cleanText,
  isValidDate,
  parseAmount,
  today,
  PAYMENT_TYPES
} from '../utils/validation.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { property_id, tenant_id, status, from_date, to_date } = req.query;

    let query = `
      SELECT py.*, p.name as property_name, t.name as tenant_name, u.house_id
      FROM payments py
      LEFT JOIN properties p ON py.property_id = p.id
      LEFT JOIN tenants t ON py.tenant_id = t.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE 1=1
    `;
    const params = [];

    if (property_id) {
      query += ` AND py.property_id = ?`;
      params.push(property_id);
    }
    if (tenant_id) {
      query += ` AND py.tenant_id = ?`;
      params.push(tenant_id);
    }
    if (status) {
      query += ` AND py.status = ?`;
      params.push(status);
    }
    if (from_date) {
      query += ` AND py.payment_date >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      query += ` AND py.payment_date <= ?`;
      params.push(to_date);
    }

    query += ` ORDER BY py.created_at DESC`;

    const payments = await db.prepare(query).all(...params);
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const db = getDb();
    
    const total_collected = (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'").get()).total;
    const total_pending = (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'pending'").get()).total;
    const total_overdue = (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'overdue'").get()).total;

    const by_property = await db.prepare(`
      SELECT p.name as property_name, COALESCE(SUM(py.amount), 0) as total
      FROM properties p
      LEFT JOIN payments py ON p.id = py.property_id AND py.status = 'paid'
      GROUP BY p.id, p.name
    `).all();

    res.json({
      success: true,
      data: {
        total_collected,
        total_pending,
        total_overdue,
        by_property
      }
    });
  } catch (error) {
    console.error('Get payments summary error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const payment = await db.prepare(`
      SELECT py.*, p.name as property_name, t.name as tenant_name, u.house_id
      FROM payments py
      LEFT JOIN properties p ON py.property_id = p.id
      LEFT JOIN tenants t ON py.tenant_id = t.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE py.id = ?
    `).get(id);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('Get single payment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { property_id, tenant_id } = req.body || {};
    const payment_type = cleanText(req.body?.payment_type, 'rent');
    const status = cleanText(req.body?.status, 'pending');
    const method = cleanText(req.body?.method);
    const payment_date = cleanText(req.body?.payment_date, today());
    const due_date = cleanText(req.body?.due_date);
    const notes = cleanText(req.body?.notes);
    const parsedAmount = parseAmount(req.body?.amount, { required: true, allowZero: false });

    if (!property_id || !tenant_id || req.body?.amount === undefined) {
      return res.status(400).json({ success: false, error: 'Property ID, Tenant ID, and amount are required' });
    }
    if (parsedAmount.error) {
      return res.status(400).json({ success: false, error: parsedAmount.error });
    }
    if (!PAYMENT_TYPES.includes(payment_type) || !PAYMENT_STATUSES.includes(status) || (method && !PAYMENT_METHODS.includes(method))) {
      return res.status(400).json({ success: false, error: 'Choose a valid payment status and method' });
    }
    if (!isValidDate(payment_date) || !isValidDate(due_date)) {
      return res.status(400).json({ success: false, error: 'Payment dates must use a valid date' });
    }
    const tenant = await db.prepare('SELECT id, property_id FROM tenants WHERE id = ?').get(tenant_id);
    if (!await db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id) || !tenant) {
      return res.status(400).json({ success: false, error: 'Choose an existing property and tenant' });
    }
    if (String(tenant.property_id) !== String(property_id)) {
      return res.status(400).json({ success: false, error: 'Selected tenant does not belong to this property' });
    }

    const result = await db.prepare(`
      INSERT INTO payments (property_id, tenant_id, amount, payment_type, status, method, payment_date, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(property_id, tenant_id, parsedAmount.value, payment_type, status, method, payment_date, due_date, notes);

    const newPayment = await db.prepare(`
      SELECT py.*, p.name as property_name, t.name as tenant_name, u.house_id
      FROM payments py
      LEFT JOIN properties p ON py.property_id = p.id
      LEFT JOIN tenants t ON py.tenant_id = t.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE py.id = ?
    `).get(result.lastInsertRowid);
    
    if (status === 'paid') {
      await queuePaymentReceipts(newPayment.id, req.user.id);
      await queueOnboardingIfEligible(newPayment.tenant_id, req.user.id);
    }
    res.status(201).json({ success: true, data: newPayment });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { property_id, tenant_id } = req.body || {};
    const payment_type = cleanText(req.body?.payment_type, 'rent');
    const status = cleanText(req.body?.status, 'pending');
    const method = cleanText(req.body?.method);
    const payment_date = cleanText(req.body?.payment_date);
    const due_date = cleanText(req.body?.due_date);
    const notes = cleanText(req.body?.notes);
    const parsedAmount = parseAmount(req.body?.amount, { required: true, allowZero: false });

    if (!property_id || !tenant_id || req.body?.amount === undefined) {
      return res.status(400).json({ success: false, error: 'Property ID, Tenant ID, and amount are required' });
    }
    if (parsedAmount.error) {
      return res.status(400).json({ success: false, error: parsedAmount.error });
    }
    if (!PAYMENT_TYPES.includes(payment_type) || !PAYMENT_STATUSES.includes(status) || (method && !PAYMENT_METHODS.includes(method))) {
      return res.status(400).json({ success: false, error: 'Choose a valid payment status and method' });
    }
    if (!isValidDate(payment_date) || !isValidDate(due_date)) {
      return res.status(400).json({ success: false, error: 'Payment dates must use a valid date' });
    }
    const currentPayment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!currentPayment) return res.status(404).json({ success: false, error: 'Payment not found' });
    const tenant = await db.prepare('SELECT id, property_id FROM tenants WHERE id = ?').get(tenant_id);
    if (!await db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id) || !tenant) {
      return res.status(400).json({ success: false, error: 'Choose an existing property and tenant' });
    }
    if (String(tenant.property_id) !== String(property_id)) {
      return res.status(400).json({ success: false, error: 'Selected tenant does not belong to this property' });
    }

    if (req.user.role === 'manager') {
      const payload = { property_id: Number(property_id), tenant_id: Number(tenant_id), amount: parsedAmount.value, payment_type, status, method, payment_date, due_date, notes };
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'payment', entityId: id, action: 'update', payload, reason: `Correct payment record ${id}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Payment correction submitted for admin approval' });
    }

    const result = await db.prepare(`
      UPDATE payments 
      SET property_id = ?, tenant_id = ?, amount = ?, payment_type = ?, status = ?, method = ?, payment_date = ?, due_date = ?, notes = ?, receipt_notifications_sent_at = CASE WHEN ? = 'paid' THEN receipt_notifications_sent_at ELSE NULL END
      WHERE id = ?
    `).run(property_id, tenant_id, parsedAmount.value, payment_type, status, method, payment_date, due_date, notes, status, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    const updatedPayment = await db.prepare(`
      SELECT py.*, p.name as property_name, t.name as tenant_name, u.house_id
      FROM payments py
      LEFT JOIN properties p ON py.property_id = p.id
      LEFT JOIN tenants t ON py.tenant_id = t.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE py.id = ?
    `).get(id);
    
    if (status === 'paid') {
      await queuePaymentReceipts(updatedPayment.id, req.user.id);
      await queueOnboardingIfEligible(updatedPayment.tenant_id, req.user.id);
    }
    res.json({ success: true, data: updatedPayment });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'payment', entityId: id, action: 'delete', payload: {}, reason: `Delete payment record ${id}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Payment deletion submitted for admin approval' });
    }
    
    const result = await db.prepare('DELETE FROM payments WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, data: { message: 'Payment deleted successfully' } });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

