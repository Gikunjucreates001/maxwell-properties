import express from 'express';
import { getDb } from '../database.js';
import { createApproval } from '../services/approvals.js';
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  cleanText,
  parseAmount
} from '../utils/validation.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const properties = db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM tenants t WHERE t.property_id = p.id AND t.status = 'active') as tenant_count,
        (SELECT COUNT(*) FROM issues i WHERE i.property_id = p.id AND i.status != 'closed' AND i.status != 'resolved') as open_issues_count,
        (SELECT COALESCE(SUM(amount), 0) FROM payments py WHERE py.property_id = p.id AND py.status = 'paid') as total_revenue,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses e WHERE e.property_id = p.id) as total_expenses,
        (SELECT COALESCE(SUM(amount), 0) FROM payments py WHERE py.property_id = p.id AND py.status = 'paid') - (SELECT COALESCE(SUM(amount), 0) FROM expenses e WHERE e.property_id = p.id) as net_income,
        (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as unit_count,
        (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.status = 'ready' AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.unit_id = u.id AND t.status = 'active')) as vacant_unit_count
      FROM properties p
    `).all();

    res.json({ success: true, data: properties });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    
    const total_properties = db.prepare("SELECT COUNT(*) as count FROM properties").get().count;
    const monthly_expected_income = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN t.unit_id IS NOT NULL THEN COALESCE(u.rent_amount, t.rent_amount) ELSE t.rent_amount END), 0) as total
      FROM tenants t
      JOIN properties p ON p.id = t.property_id AND p.status = 'active'
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE t.status = 'active'
    `).get().total;
    const total_monthly_income = monthly_expected_income;
    const total_tenants = db.prepare("SELECT COUNT(*) as count FROM tenants WHERE status = 'active'").get().count;
    const open_issues = db.prepare("SELECT COUNT(*) as count FROM issues WHERE status != 'closed' AND status != 'resolved'").get().count;
    const total_expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses').get().total;
    const total_collected = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'").get().total;
    const net_income = total_collected - total_expenses;
    const pending_approvals = req.user.role === 'admin'
      ? db.prepare("SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'").get().count
      : db.prepare("SELECT COUNT(*) as count FROM approval_requests WHERE requested_by = ? AND status = 'pending'").get(req.user.id).count;
    
    const recent_payments = db.prepare(`
      SELECT py.*, p.name as property_name, t.name as tenant_name 
      FROM payments py
      LEFT JOIN properties p ON py.property_id = p.id
      LEFT JOIN tenants t ON py.tenant_id = t.id
      ORDER BY py.created_at DESC LIMIT 5
    `).all();

    // Calculate total paid revenue for the last 6 calendar months.
    const months = [];
    const date = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1, // 1-12
        name: d.toLocaleString('default', { month: 'short' })
      });
    }

    const revenueRows = db.prepare(`
      SELECT strftime('%Y-%m', payment_date) as month, COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE status = 'paid' AND payment_date IS NOT NULL
      GROUP BY strftime('%Y-%m', payment_date)
    `).all();
    const revenueByMonth = new Map(revenueRows.map((row) => [row.month, row.total]));

    const revenue_by_month = months.map(m => {
      const monthStr = `${m.year}-${m.month.toString().padStart(2, '0')}`;
      const monthLabel = new Date(m.year, m.month - 1).toLocaleString('default', { month: 'short' });
      return { month: monthLabel, total: revenueByMonth.get(monthStr) || 0 };
    });

    const expenseRows = db.prepare(`
      SELECT strftime('%Y-%m', expense_date) as month, COALESCE(SUM(amount), 0) as total
      FROM expenses GROUP BY strftime('%Y-%m', expense_date)
    `).all();
    const expensesByMonth = new Map(expenseRows.map((row) => [row.month, row.total]));
    const net_revenue_by_month = revenue_by_month.map((row, index) => {
      const month = months[index];
      const monthKey = `${month.year}-${month.month.toString().padStart(2, '0')}`;
      return { month: row.month, total: row.total - (expensesByMonth.get(monthKey) || 0) };
    });
    const recent_expenses = db.prepare(`
      SELECT e.*, p.name as property_name FROM expenses e JOIN properties p ON p.id = e.property_id
      ORDER BY e.created_at DESC LIMIT 5
    `).all();

    res.json({
      success: true,
      data: {
        total_properties,
        monthly_expected_income,
        total_monthly_income,
        total_tenants,
        open_issues,
        total_collected,
        total_expenses,
        net_income,
        pending_approvals,
        recent_payments,
        recent_expenses,
        net_revenue_by_month,
        revenue_by_month
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    if (!property) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    property.tenants = db.prepare(`
      SELECT t.*, u.house_id, u.rent_amount as unit_rent_amount, u.water_billing_type, u.water_rate, u.water_notes
      FROM tenants t LEFT JOIN units u ON u.id = t.unit_id
      WHERE t.property_id = ?
    `).all(id);
    property.recent_payments = db.prepare(`
      SELECT py.*, t.name as tenant_name
      FROM payments py
      LEFT JOIN tenants t ON py.tenant_id = t.id
      WHERE py.property_id = ?
      ORDER BY py.created_at DESC LIMIT 5
    `).all(id);
    property.open_issues = db.prepare(`
      SELECT i.*, u.house_id
      FROM issues i LEFT JOIN units u ON u.id = i.unit_id
      WHERE i.property_id = ? AND i.status != 'closed' AND i.status != 'resolved'
    `).all(id);
    property.units = db.prepare(`
      SELECT u.*, t.id as tenant_id, t.name as tenant_name
      FROM units u LEFT JOIN tenants t ON t.unit_id = u.id AND t.status = 'active'
      WHERE u.property_id = ? ORDER BY u.house_id COLLATE NOCASE ASC
    `).all(id);
    property.expenses = db.prepare('SELECT * FROM expenses WHERE property_id = ? ORDER BY expense_date DESC, created_at DESC LIMIT 10').all(id);
    property.total_collected = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE property_id = ? AND status = 'paid'").get(id).total;
    property.total_expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE property_id = ?').get(id).total;
    property.net_income = property.total_collected - property.total_expenses;

    res.json({ success: true, data: property });
  } catch (error) {
    console.error('Get single property error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const name = cleanText(req.body?.name, '');
    const type = cleanText(req.body?.type, '');
    const location = cleanText(req.body?.location);
    const address = cleanText(req.body?.address);
    const description = cleanText(req.body?.description);
    const rules = cleanText(req.body?.rules);
    const manager_name = cleanText(req.body?.manager_name);
    const manager_phone = cleanText(req.body?.manager_phone);
    const manager_email = cleanText(req.body?.manager_email);
    const caretaker_name = cleanText(req.body?.caretaker_name);
    const caretaker_phone = cleanText(req.body?.caretaker_phone);
    const caretaker_email = cleanText(req.body?.caretaker_email);
    const status = cleanText(req.body?.status, 'active');
    const amount = parseAmount(req.body?.monthly_rent);

    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'Name and type are required' });
    }
    if (!PROPERTY_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Choose a valid property type' });
    }
    if (!PROPERTY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Choose a valid property status' });
    }
    if (amount.error) {
      return res.status(400).json({ success: false, error: amount.error });
    }

    const result = db.prepare(`
      INSERT INTO properties (name, type, location, address, description, monthly_rent, status, rules, manager_name, manager_phone, manager_email, caretaker_name, caretaker_phone, caretaker_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, type, location, address, description, amount.value, status, rules, manager_name, manager_phone, manager_email, caretaker_name, caretaker_phone, caretaker_email);

    const newProperty = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: newProperty });
  } catch (error) {
    console.error('Create property error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const name = cleanText(req.body?.name, '');
    const type = cleanText(req.body?.type, '');
    const location = cleanText(req.body?.location);
    const address = cleanText(req.body?.address);
    const description = cleanText(req.body?.description);
    const rules = cleanText(req.body?.rules);
    const manager_name = cleanText(req.body?.manager_name);
    const manager_phone = cleanText(req.body?.manager_phone);
    const manager_email = cleanText(req.body?.manager_email);
    const caretaker_name = cleanText(req.body?.caretaker_name);
    const caretaker_phone = cleanText(req.body?.caretaker_phone);
    const caretaker_email = cleanText(req.body?.caretaker_email);
    const status = cleanText(req.body?.status, 'active');
    const amount = parseAmount(req.body?.monthly_rent);

    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'Name and type are required' });
    }
    if (!PROPERTY_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Choose a valid property type' });
    }
    if (!PROPERTY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Choose a valid property status' });
    }
    if (amount.error) {
      return res.status(400).json({ success: false, error: amount.error });
    }

    const currentProperty = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    if (!currentProperty) return res.status(404).json({ success: false, error: 'Property not found' });
    if (currentProperty.type !== type && db.prepare('SELECT id FROM units WHERE property_id = ? LIMIT 1').get(id)) {
      return res.status(400).json({ success: false, error: 'Property type cannot change while it has house units' });
    }
    const payload = { name, type, location, address, description, monthly_rent: amount.value, status, rules, manager_name, manager_phone, manager_email, caretaker_name, caretaker_phone, caretaker_email };
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'property', entityId: id, action: 'update', payload, reason: `Update property ${name}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Property update submitted for admin approval' });
    }

    const result = db.prepare(`
      UPDATE properties 
      SET name = ?, type = ?, location = ?, address = ?, description = ?, monthly_rent = ?, status = ?, rules = ?, manager_name = ?, manager_phone = ?, manager_email = ?, caretaker_name = ?, caretaker_phone = ?, caretaker_email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, type, location, address, description, amount.value, status, rules, manager_name, manager_phone, manager_email, caretaker_name, caretaker_phone, caretaker_email, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    const updatedProperty = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    res.json({ success: true, data: updatedProperty });
  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'property', entityId: id, action: 'delete', payload: {}, reason: `Delete property ${property.name}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Property deletion submitted for admin approval' });
    }
    
    const tenantCount = db.prepare('SELECT COUNT(*) as count FROM tenants WHERE property_id = ?').get(id).count;
    if (tenantCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete property with existing tenants' });
    }

    const paymentCount = db.prepare('SELECT COUNT(*) as count FROM payments WHERE property_id = ?').get(id).count;
    const issueCount = db.prepare('SELECT COUNT(*) as count FROM issues WHERE property_id = ?').get(id).count;
    const unitCount = db.prepare('SELECT COUNT(*) as count FROM units WHERE property_id = ?').get(id).count;
    const expenseCount = db.prepare('SELECT COUNT(*) as count FROM expenses WHERE property_id = ?').get(id).count;
    if (paymentCount > 0 || issueCount > 0 || unitCount > 0 || expenseCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete property with payment or issue history' });
    }

    const result = db.prepare('DELETE FROM properties WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Property not found' });
    }

    res.json({ success: true, data: { message: 'Property deleted successfully' } });
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

