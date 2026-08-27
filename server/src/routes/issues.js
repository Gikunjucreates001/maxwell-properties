import express from 'express';
import { getDb } from '../database.js';
import { createApproval } from '../services/approvals.js';
import {
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  cleanText,
  isValidDate,
  today,
  isApartmentProperty,
  parseAmount
} from '../utils/validation.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { property_id, status, priority } = req.query;

    let query = `
      SELECT i.*, p.name as property_name, u.house_id
      FROM issues i
      LEFT JOIN properties p ON i.property_id = p.id
      LEFT JOIN units u ON u.id = i.unit_id
      WHERE 1=1
    `;
    const params = [];

    if (property_id) {
      query += ` AND i.property_id = ?`;
      params.push(property_id);
    }
    if (status) {
      query += ` AND i.status = ?`;
      params.push(status);
    }
    if (priority) {
      query += ` AND i.priority = ?`;
      params.push(priority);
    }

    query += ` ORDER BY i.created_at DESC`;

    const issues = db.prepare(query).all(...params);
    res.json({ success: true, data: issues });
  } catch (error) {
    console.error('Get issues error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const issue = db.prepare(`
      SELECT i.*, p.name as property_name, u.house_id
      FROM issues i
      LEFT JOIN properties p ON i.property_id = p.id
      LEFT JOIN units u ON u.id = i.unit_id
      WHERE i.id = ?
    `).get(id);

    if (!issue) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }

    res.json({ success: true, data: issue });
  } catch (error) {
    console.error('Get single issue error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { property_id } = req.body || {};
    const unit_id = req.body?.unit_id ? Number(req.body.unit_id) : null;
    const title = cleanText(req.body?.title, '');
    const description = cleanText(req.body?.description);
    const priority = cleanText(req.body?.priority, 'medium');
    const status = cleanText(req.body?.status, 'open');
    const category = cleanText(req.body?.category, 'other');
    const reported_date = cleanText(req.body?.reported_date, today());
    const resolved_date = cleanText(req.body?.resolved_date);
    const notes = cleanText(req.body?.notes);
    const repairCost = parseAmount(req.body?.repair_cost, { required: true });

    if (!property_id || !title) {
      return res.status(400).json({ success: false, error: 'Property ID and title are required' });
    }
    if (!db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id)) {
      return res.status(400).json({ success: false, error: 'Selected property was not found' });
    }
    if (!ISSUE_PRIORITIES.includes(priority) || !ISSUE_STATUSES.includes(status) || !ISSUE_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Choose valid issue details' });
    }
    if (!isValidDate(reported_date) || !isValidDate(resolved_date)) {
      return res.status(400).json({ success: false, error: 'Issue dates must use a valid date' });
    }
    if (repairCost.error) return res.status(400).json({ success: false, error: 'Repair cost is required and must be zero or more' });
    const property = db.prepare('SELECT id, type FROM properties WHERE id = ?').get(property_id);
    if (isApartmentProperty(property.type)) {
      if (!unit_id || !Number.isInteger(unit_id) || !db.prepare('SELECT id FROM units WHERE id = ? AND property_id = ?').get(unit_id, property_id)) return res.status(400).json({ success: false, error: 'Choose the House ID affected by this issue' });
    } else if (unit_id) {
      return res.status(400).json({ success: false, error: 'Airbnb issues do not use House IDs' });
    }
    const finalResolvedDate = (status === 'resolved' || status === 'closed') && !resolved_date ? today() : resolved_date;

    const result = db.prepare(`
      INSERT INTO issues (property_id, unit_id, title, description, priority, status, category, reported_date, resolved_date, notes, repair_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(property_id, unit_id, title, description, priority, status, category, reported_date, finalResolvedDate, notes, repairCost.value);
    if (repairCost.value > 0) {
      const expense = db.prepare(`
        INSERT INTO expenses (property_id, unit_id, issue_id, category, description, amount, expense_date, notes, created_by)
        VALUES (?, ?, ?, 'repair', ?, ?, ?, ?, ?)
      `).run(property_id, unit_id, result.lastInsertRowid, `Repair: ${title}`, repairCost.value, reported_date, notes, req.user.id);
      db.prepare('UPDATE issues SET expense_id = ? WHERE id = ?').run(expense.lastInsertRowid, result.lastInsertRowid);
    }

    const newIssue = db.prepare(`
      SELECT i.*, p.name as property_name, u.house_id
      FROM issues i
      LEFT JOIN properties p ON i.property_id = p.id
      LEFT JOIN units u ON u.id = i.unit_id
      WHERE i.id = ?
    `).get(result.lastInsertRowid);
    
    res.status(201).json({ success: true, data: newIssue });
  } catch (error) {
    console.error('Create issue error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const currentIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
    if (!currentIssue) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }

    const property_id = req.body?.property_id ?? currentIssue.property_id;
    const title = cleanText(req.body?.title, currentIssue.title);
    const description = cleanText(req.body?.description, currentIssue.description);
    const priority = cleanText(req.body?.priority, currentIssue.priority);
    const status = cleanText(req.body?.status, currentIssue.status);
    const category = cleanText(req.body?.category, currentIssue.category || 'other');
    const reported_date = cleanText(req.body?.reported_date, currentIssue.reported_date);
    let resolved_date = cleanText(req.body?.resolved_date, currentIssue.resolved_date);
    const notes = cleanText(req.body?.notes, currentIssue.notes);
    const unit_id = req.body?.unit_id === undefined ? currentIssue.unit_id : (req.body.unit_id ? Number(req.body.unit_id) : null);
    const repairCost = parseAmount(req.body?.repair_cost === undefined ? currentIssue.repair_cost : req.body.repair_cost, { required: true });

    if (!property_id || !title) {
      return res.status(400).json({ success: false, error: 'Property ID and title are required' });
    }
    if (!db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id)) {
      return res.status(400).json({ success: false, error: 'Selected property was not found' });
    }
    if (!ISSUE_PRIORITIES.includes(priority) || !ISSUE_STATUSES.includes(status) || !ISSUE_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: 'Choose valid issue details' });
    }
    if (!isValidDate(reported_date) || !isValidDate(resolved_date)) {
      return res.status(400).json({ success: false, error: 'Issue dates must use a valid date' });
    }
    if ((status === 'resolved' || status === 'closed') && !resolved_date) resolved_date = today();
    if (status !== 'resolved' && status !== 'closed') resolved_date = null;
    if (repairCost.error) return res.status(400).json({ success: false, error: 'Repair cost is required and must be zero or more' });
    const property = db.prepare('SELECT id, type FROM properties WHERE id = ?').get(property_id);
    if (isApartmentProperty(property.type)) {
      if (!unit_id || !Number.isInteger(unit_id) || !db.prepare('SELECT id FROM units WHERE id = ? AND property_id = ?').get(unit_id, property_id)) return res.status(400).json({ success: false, error: 'Choose the House ID affected by this issue' });
    } else if (unit_id) {
      return res.status(400).json({ success: false, error: 'Airbnb issues do not use House IDs' });
    }
    const payload = { property_id: Number(property_id), unit_id, title, description, priority, status, category, reported_date, resolved_date, notes, repair_cost: repairCost.value };
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'issue', entityId: id, action: 'update', payload, reason: `Update maintenance issue ${title}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Issue update submitted for admin approval' });
    }

    const result = db.prepare(`
      UPDATE issues
      SET property_id = ?, unit_id = ?, title = ?, description = ?, priority = ?, status = ?, category = ?, reported_date = ?, resolved_date = ?, notes = ?, repair_cost = ?
      WHERE id = ?
    `).run(property_id, unit_id, title, description, priority, status, category, reported_date, resolved_date, notes, repairCost.value, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }

    if (currentIssue.expense_id) {
      if (repairCost.value > 0) db.prepare('UPDATE expenses SET property_id = ?, unit_id = ?, description = ?, amount = ?, expense_date = ?, notes = ? WHERE id = ?').run(property_id, unit_id, `Repair: ${title}`, repairCost.value, reported_date, notes, currentIssue.expense_id);
      else db.prepare('DELETE FROM expenses WHERE id = ?').run(currentIssue.expense_id);
    } else if (repairCost.value > 0) {
      const expense = db.prepare(`
        INSERT INTO expenses (property_id, unit_id, issue_id, category, description, amount, expense_date, notes, created_by)
        VALUES (?, ?, ?, 'repair', ?, ?, ?, ?, ?)
      `).run(property_id, unit_id, id, `Repair: ${title}`, repairCost.value, reported_date, notes, req.user.id);
      db.prepare('UPDATE issues SET expense_id = ? WHERE id = ?').run(expense.lastInsertRowid, id);
    }

    const updatedIssue = db.prepare(`
      SELECT i.*, p.name as property_name 
      FROM issues i
      LEFT JOIN properties p ON i.property_id = p.id
      WHERE i.id = ?
    `).get(id);
    
    res.json({ success: true, data: updatedIssue });
  } catch (error) {
    console.error('Update issue error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
    if (!issue) return res.status(404).json({ success: false, error: 'Issue not found' });
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'issue', entityId: id, action: 'delete', payload: {}, reason: `Delete maintenance issue ${issue.title}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Issue deletion submitted for admin approval' });
    }
    
    const result = db.prepare('DELETE FROM issues WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }

    res.json({ success: true, data: { message: 'Issue deleted successfully' } });
  } catch (error) {
    console.error('Delete issue error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

