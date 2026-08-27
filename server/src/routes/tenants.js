import express from 'express';
import { getDb } from '../database.js';
import { createApproval } from '../services/approvals.js';
import {
  TENANT_STATUSES,
  TENANT_TYPES,
  cleanEmail,
  cleanText,
  isValidDate,
  parseAmount,
  isApartmentProperty
} from '../utils/validation.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tenants = await db.prepare(`
      SELECT t.*, p.name as property_name
        , u.house_id, u.rent_amount as unit_rent_amount, u.water_billing_type, u.water_rate, u.water_notes
      FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN units u ON u.id = t.unit_id
    `).all();

    res.json({ success: true, data: tenants });
  } catch (error) {
    console.error('Get tenants error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const tenant = await db.prepare(`
      SELECT t.*, p.name as property_name
        , u.house_id, u.rent_amount as unit_rent_amount, u.water_billing_type, u.water_rate, u.water_notes
      FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE t.id = ?
    `).get(id);

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    tenant.payments = await db.prepare('SELECT * FROM payments WHERE tenant_id = ? ORDER BY created_at DESC').all(id);

    res.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Get single tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { property_id } = req.body || {};
    const unit_id = req.body?.unit_id ? Number(req.body.unit_id) : null;
    const name = cleanText(req.body?.name, '');
    const email = cleanEmail(req.body?.email);
    const phone = cleanText(req.body?.phone);
    const type = cleanText(req.body?.type, 'long-term');
    const lease_start = cleanText(req.body?.lease_start);
    const lease_end = cleanText(req.body?.lease_end);
    const status = cleanText(req.body?.status, 'active');
    const amount = parseAmount(req.body?.rent_amount);
    const depositAmount = parseAmount(req.body?.deposit_amount);
    const physical_contract_received = req.body?.physical_contract_received ? 1 : 0;
    const contract_reference = cleanText(req.body?.contract_reference);

    if (!name || !property_id) {
      return res.status(400).json({ success: false, error: 'Name and property_id are required' });
    }
    if (!await db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id)) {
      return res.status(400).json({ success: false, error: 'Selected property was not found' });
    }
    if (!TENANT_TYPES.includes(type) || !TENANT_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Choose valid tenant type and status' });
    }
    if (email === undefined) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }
    if (!isValidDate(lease_start) || !isValidDate(lease_end)) {
      return res.status(400).json({ success: false, error: 'Lease dates must use a valid date' });
    }
    if (lease_start && lease_end && lease_end < lease_start) {
      return res.status(400).json({ success: false, error: 'Lease end date cannot be before the start date' });
    }
    if (amount.error) {
      return res.status(400).json({ success: false, error: amount.error });
    }
    if (depositAmount.error) return res.status(400).json({ success: false, error: depositAmount.error });

    const property = await db.prepare('SELECT id, type FROM properties WHERE id = ?').get(property_id);
    let rentAmount = amount.value;
    if (isApartmentProperty(property.type)) {
      if (!unit_id || !Number.isInteger(unit_id)) return res.status(400).json({ success: false, error: 'Choose an available House ID for this apartment' });
      const unit = await db.prepare("SELECT * FROM units WHERE id = ? AND property_id = ? AND status = 'ready'").get(unit_id, property_id);
      if (!unit) return res.status(400).json({ success: false, error: 'Choose an available House ID for this apartment' });
      if (await db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active'").get(unit_id)) return res.status(409).json({ success: false, error: 'That House ID is already occupied' });
      rentAmount = unit.rent_amount;
    }

    const payload = { property_id: Number(property_id), unit_id, name, email, phone, type, lease_start, lease_end, rent_amount: rentAmount, deposit_amount: depositAmount.value, physical_contract_received, contract_reference, status };
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'tenant', action: 'create', payload, reason: `Register tenant ${name}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Tenant registration submitted for admin approval' });
    }

    const result = await db.prepare(`
      INSERT INTO tenants (property_id, unit_id, name, email, phone, type, lease_start, lease_end, rent_amount, deposit_amount, physical_contract_received, contract_reference, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(property_id, unit_id, name, email, phone, type, lease_start, lease_end, rentAmount, depositAmount.value, physical_contract_received, contract_reference, status);

    const newTenant = await db.prepare(`
      SELECT t.*, p.name as property_name
        , u.house_id, u.rent_amount as unit_rent_amount, u.water_billing_type, u.water_rate, u.water_notes
      FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);
    
    res.status(201).json({ success: true, data: newTenant });
  } catch (error) {
    if (error.code === '23505' || String(error.message).includes('idx_one_active_tenant_per_unit') || String(error.message).includes('UNIQUE constraint failed: tenants.unit_id')) {
      return res.status(409).json({ success: false, error: 'That House ID is already assigned to an active tenant' });
    }
    console.error('Create tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const currentTenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!currentTenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    const { property_id } = req.body || {};
    let unit_id = req.body?.unit_id === undefined ? currentTenant.unit_id : (req.body.unit_id ? Number(req.body.unit_id) : null);
    const name = cleanText(req.body?.name, '');
    const email = cleanEmail(req.body?.email);
    const phone = cleanText(req.body?.phone);
    const type = cleanText(req.body?.type, 'long-term');
    const lease_start = cleanText(req.body?.lease_start);
    const lease_end = cleanText(req.body?.lease_end);
    const status = cleanText(req.body?.status, 'active');
    const amount = parseAmount(req.body?.rent_amount);
    const depositAmount = parseAmount(req.body?.deposit_amount === undefined ? currentTenant.deposit_amount : req.body.deposit_amount);
    const physical_contract_received = req.body?.physical_contract_received === undefined ? currentTenant.physical_contract_received : (req.body.physical_contract_received ? 1 : 0);
    const contract_reference = req.body?.contract_reference === undefined ? currentTenant.contract_reference : cleanText(req.body.contract_reference);

    if (!name || !property_id) {
      return res.status(400).json({ success: false, error: 'Name and property_id are required' });
    }
    if (!await db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id)) {
      return res.status(400).json({ success: false, error: 'Selected property was not found' });
    }
    if (!TENANT_TYPES.includes(type) || !TENANT_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Choose valid tenant type and status' });
    }
    if (email === undefined) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }
    if (!isValidDate(lease_start) || !isValidDate(lease_end)) {
      return res.status(400).json({ success: false, error: 'Lease dates must use a valid date' });
    }
    if (lease_start && lease_end && lease_end < lease_start) {
      return res.status(400).json({ success: false, error: 'Lease end date cannot be before the start date' });
    }
    if (amount.error) {
      return res.status(400).json({ success: false, error: amount.error });
    }
    if (depositAmount.error) return res.status(400).json({ success: false, error: depositAmount.error });

    const property = await db.prepare('SELECT id, type FROM properties WHERE id = ?').get(property_id);
    let rentAmount = amount.value;
    if (isApartmentProperty(property.type)) {
      if (!unit_id || !Number.isInteger(unit_id)) return res.status(400).json({ success: false, error: 'Choose an available House ID for this apartment' });
      const unit = await db.prepare("SELECT * FROM units WHERE id = ? AND property_id = ? AND status = 'ready'").get(unit_id, property_id);
      if (!unit) return res.status(400).json({ success: false, error: 'Choose an available House ID for this apartment' });
      if (await db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active' AND id != ?").get(unit_id, id)) return res.status(409).json({ success: false, error: 'That House ID is already occupied' });
      rentAmount = unit.rent_amount;
    } else {
      unit_id = null;
    }

    const payload = { property_id: Number(property_id), unit_id, name, email, phone, type, lease_start, lease_end, rent_amount: rentAmount, deposit_amount: depositAmount.value, physical_contract_received, contract_reference, status };
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'tenant', entityId: id, action: 'update', payload, reason: `Update tenant ${name}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Tenant update submitted for admin approval' });
    }

    const result = await db.prepare(`
      UPDATE tenants 
      SET property_id = ?, unit_id = ?, name = ?, email = ?, phone = ?, type = ?, lease_start = ?, lease_end = ?, rent_amount = ?, deposit_amount = ?, physical_contract_received = ?, contract_reference = ?, status = ?
      WHERE id = ?
    `).run(property_id, unit_id, name, email, phone, type, lease_start, lease_end, rentAmount, depositAmount.value, physical_contract_received, contract_reference, status, id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const updatedTenant = await db.prepare(`
      SELECT t.*, p.name as property_name, u.house_id, u.rent_amount as unit_rent_amount, u.water_billing_type, u.water_rate, u.water_notes
      FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE t.id = ?
    `).get(id);
    
    res.json({ success: true, data: updatedTenant });
  } catch (error) {
    if (error.code === '23505' || String(error.message).includes('idx_one_active_tenant_per_unit') || String(error.message).includes('UNIQUE constraint failed: tenants.unit_id')) {
      return res.status(409).json({ success: false, error: 'That House ID is already assigned to an active tenant' });
    }
    console.error('Update tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    if (req.user.role === 'manager') {
      const approval = await createApproval({ requestedBy: req.user.id, entityType: 'tenant', entityId: id, action: 'delete', payload: {}, reason: `Delete tenant ${tenant.name}` });
      return res.status(202).json({ success: true, pending: true, data: approval, message: 'Tenant deletion submitted for admin approval' });
    }
    
    const paymentCount = (await db.prepare('SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?').get(id)).count;
    if (paymentCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete tenant with payment history' });
    }

    const result = await db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    res.json({ success: true, data: { message: 'Tenant deleted successfully' } });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

