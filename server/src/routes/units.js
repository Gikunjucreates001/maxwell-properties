import express from 'express';
import { getDb } from '../database.js';
import { createApproval, executeApproval } from '../services/approvals.js';
import { UNIT_STATUSES, WATER_BILLING_TYPES, cleanText, isApartmentProperty, parseAmount } from '../utils/validation.js';

const router = express.Router();

const unitSelect = `
  SELECT u.*, p.name as property_name, p.type as property_type,
    t.id as tenant_id, t.name as tenant_name
  FROM units u
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.unit_id = u.id AND t.status = 'active'
`;

function buildUnitPayload(body, current = {}) {
  return {
    property_id: body.property_id ?? current.property_id,
    house_id: cleanText(body.house_id, current.house_id || ''),
    rent_amount: body.rent_amount === undefined ? Number(current.rent_amount || 0) : parseAmount(body.rent_amount).value,
    water_billing_type: cleanText(body.water_billing_type, current.water_billing_type || 'included'),
    water_rate: body.water_rate === undefined ? Number(current.water_rate || 0) : parseAmount(body.water_rate).value,
    water_notes: cleanText(body.water_notes, current.water_notes),
    status: cleanText(body.status, current.status || 'ready'),
  };
}

function validateUnit(db, payload) {
  const property = db.prepare('SELECT id, type FROM properties WHERE id = ?').get(payload.property_id);
  if (!property) return 'Selected property was not found';
  if (!isApartmentProperty(property.type)) return 'House units are only available for apartment properties';
  if (!payload.house_id) return 'House ID is required';
  if (!Number.isFinite(payload.rent_amount) || payload.rent_amount < 0) return 'Rent must be zero or more';
  if (!WATER_BILLING_TYPES.includes(payload.water_billing_type)) return 'Choose a valid water billing type';
  if (!Number.isFinite(payload.water_rate) || payload.water_rate < 0) return 'Water rate must be zero or more';
  if (!UNIT_STATUSES.includes(payload.status)) return 'Choose a valid unit status';
  return null;
}

function createOrUpdateUnit(db, payload, id = null) {
  if (id == null) {
    const result = db.prepare(`
      INSERT INTO units (property_id, house_id, rent_amount, water_billing_type, water_rate, water_notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.house_id, payload.rent_amount, payload.water_billing_type, payload.water_rate, payload.water_notes, payload.status);
    return result.lastInsertRowid;
  }
  if (payload.status === 'maintenance' && db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active'").get(id)) throw new Error('An occupied unit cannot be placed under maintenance');
  db.prepare(`
    UPDATE units SET property_id = ?, house_id = ?, rent_amount = ?, water_billing_type = ?, water_rate = ?, water_notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(payload.property_id, payload.house_id, payload.rent_amount, payload.water_billing_type, payload.water_rate, payload.water_notes, payload.status, id);
  return id;
}

router.get('/', (req, res) => {
  try {
    const params = [];
    let query = unitSelect + ' WHERE 1 = 1';
    if (req.query.property_id) {
      query += ' AND u.property_id = ?';
      params.push(req.query.property_id);
    }
    query += ' ORDER BY u.house_id COLLATE NOCASE ASC';
    res.json({ success: true, data: getDb().prepare(query).all(...params) });
  } catch (error) {
    console.error('Get units error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/available', (req, res) => {
  try {
    const property = getDb().prepare('SELECT id, type FROM properties WHERE id = ?').get(req.query.property_id);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });
    if (!isApartmentProperty(property.type)) return res.json({ success: true, data: [] });
    const units = getDb().prepare(`${unitSelect} WHERE u.property_id = ? AND u.status = 'ready' AND t.id IS NULL ORDER BY u.house_id COLLATE NOCASE ASC`).all(property.id);
    res.json({ success: true, data: units });
  } catch (error) {
    console.error('Get available units error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const payload = buildUnitPayload(req.body || {});
    const validationError = validateUnit(db, payload);
    if (validationError) return res.status(400).json({ success: false, error: validationError });
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'unit', action: 'create', payload, reason: `Create house unit ${payload.house_id}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Unit submitted for admin approval' });
    }
    const id = createOrUpdateUnit(db, payload);
    res.status(201).json({ success: true, data: db.prepare(`${unitSelect} WHERE u.id = ?`).get(id) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) return res.status(409).json({ success: false, error: 'That House ID already exists in this property' });
    console.error('Create unit error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const current = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'House unit not found' });
    const payload = buildUnitPayload(req.body || {}, current);
    const validationError = validateUnit(db, payload);
    if (validationError) return res.status(400).json({ success: false, error: validationError });
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'unit', entityId: current.id, action: 'update', payload, reason: `Update house unit ${current.house_id}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Unit update submitted for admin approval' });
    }
    const id = createOrUpdateUnit(db, payload, current.id);
    res.json({ success: true, data: db.prepare(`${unitSelect} WHERE u.id = ?`).get(id) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) return res.status(409).json({ success: false, error: 'That House ID already exists in this property' });
    console.error('Update unit error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(req.params.id);
    if (!unit) return res.status(404).json({ success: false, error: 'House unit not found' });
    if (req.user.role === 'manager') {
      const approval = createApproval({ requestedBy: req.user.id, entityType: 'unit', entityId: unit.id, action: 'delete', payload: {}, reason: `Delete house unit ${unit.house_id}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Unit deletion submitted for admin approval' });
    }
    if (db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active'").get(unit.id)) return res.status(400).json({ success: false, error: 'Cannot delete an occupied unit' });
    if (db.prepare('SELECT id FROM expenses WHERE unit_id = ?').get(unit.id)) return res.status(400).json({ success: false, error: 'Cannot delete a unit with expense history' });
    db.prepare('DELETE FROM units WHERE id = ?').run(unit.id);
    res.json({ success: true, data: { message: 'House unit deleted successfully' } });
  } catch (error) {
    console.error('Delete unit error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

