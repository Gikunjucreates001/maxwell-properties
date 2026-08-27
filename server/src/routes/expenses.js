import express from 'express';
import { getDb } from '../database.js';
import { createApproval } from '../services/approvals.js';
import { EXPENSE_CATEGORIES, cleanText, isApartmentProperty, isValidDate, parseAmount, today } from '../utils/validation.js';

const router = express.Router();
const expenseSelect = `
  SELECT e.*, p.name as property_name, u.house_id, i.title as issue_title, creator.name as creator_name
  FROM expenses e
  JOIN properties p ON p.id = e.property_id
  LEFT JOIN units u ON u.id = e.unit_id
  LEFT JOIN issues i ON i.id = e.issue_id
  LEFT JOIN users creator ON creator.id = e.created_by
`;

async function validateExpense(db, payload) {
  const property = await db.prepare('SELECT id, type FROM properties WHERE id = ?').get(payload.property_id);
  if (!property) return 'Selected property was not found';
  if (!payload.description) return 'Expense description is required';
  if (!EXPENSE_CATEGORIES.includes(payload.category)) return 'Choose a valid expense category';
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return 'Expense amount must be greater than zero';
  if (!isValidDate(payload.expense_date)) return 'Expense date must be valid';
  if (payload.unit_id) {
    if (!isApartmentProperty(property.type)) return 'Airbnb expenses do not use House IDs';
    if (!await db.prepare('SELECT id FROM units WHERE id = ? AND property_id = ?').get(payload.unit_id, payload.property_id)) return 'Selected House ID was not found';
  }
  return null;
}

function buildPayload(db, body, current = {}) {
  const amount = body.amount === undefined ? Number(current.amount || 0) : parseAmount(body.amount, { required: true }).value;
  return {
    property_id: body.property_id === undefined ? current.property_id : Number(body.property_id),
    unit_id: body.unit_id === undefined ? (current.unit_id || null) : (body.unit_id ? Number(body.unit_id) : null),
    issue_id: body.issue_id === undefined ? (current.issue_id || null) : (body.issue_id ? Number(body.issue_id) : null),
    category: cleanText(body.category, current.category || 'custom'),
    description: cleanText(body.description, current.description || ''),
    amount,
    expense_date: cleanText(body.expense_date, current.expense_date || today()),
    notes: cleanText(body.notes, current.notes),
  };
}

async function saveExpense(db, payload, id = null, createdBy) {
  if (id == null) {
    const result = await db.prepare(`
      INSERT INTO expenses (property_id, unit_id, issue_id, category, description, amount, expense_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.unit_id || null, payload.issue_id || null, payload.category, payload.description, payload.amount, payload.expense_date, payload.notes, createdBy);
    return result.lastInsertRowid;
  }
  await db.prepare(`
    UPDATE expenses SET property_id = ?, unit_id = ?, category = ?, description = ?, amount = ?, expense_date = ?, notes = ? WHERE id = ?
  `).run(payload.property_id, payload.unit_id || null, payload.category, payload.description, payload.amount, payload.expense_date, payload.notes, id);
  return id;
}

router.get('/', async (req, res) => {
  try {
    const params = [];
    let query = expenseSelect + ' WHERE 1 = 1';
    if (req.query.property_id) { query += ' AND e.property_id = ?'; params.push(req.query.property_id); }
    if (req.query.category) { query += ' AND e.category = ?'; params.push(req.query.category); }
    query += ' ORDER BY e.expense_date DESC, e.created_at DESC';
    res.json({ success: true, data: await getDb().prepare(query).all(...params) });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const expense = await getDb().prepare(`${expenseSelect} WHERE e.id = ?`).get(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: expense });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const payload = buildPayload(db, req.body || {});
    const validationError = await validateExpense(db, payload);
    if (validationError) return res.status(400).json({ success: false, error: validationError });
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'expense', action: 'create', payload, reason: `Log ${payload.category.replace('_', ' ')} expense` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Expense submitted for admin approval' });
    }
    const id = await saveExpense(db, payload, null, req.user.id);
    res.status(201).json({ success: true, data: await db.prepare(`${expenseSelect} WHERE e.id = ?`).get(id) });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const current = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Expense not found' });
    const payload = buildPayload(db, req.body || {}, current);
    const validationError = await validateExpense(db, payload);
    if (validationError) return res.status(400).json({ success: false, error: validationError });
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'expense', entityId: current.id, action: 'update', payload, reason: `Update expense ${current.description}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Expense update submitted for admin approval' });
    }
    const id = await saveExpense(db, payload, current.id, req.user.id);
    res.json({ success: true, data: await db.prepare(`${expenseSelect} WHERE e.id = ?`).get(id) });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const expense = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'expense', entityId: expense.id, action: 'delete', payload: {}, reason: `Delete expense ${expense.description}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Expense deletion submitted for admin approval' });
    }
    await db.prepare('DELETE FROM expenses WHERE id = ?').run(expense.id);
    res.json({ success: true, data: { message: 'Expense deleted successfully' } });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

