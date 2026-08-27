import { getDb } from '../database.js';
import { isApartmentProperty } from '../utils/validation.js';

export async function createApproval({ requestedBy, entityType, entityId = null, action, payload, reason }) {
  const db = getDb();
  const result = await db.prepare(`
    INSERT INTO approval_requests (requested_by, entity_type, entity_id, action, payload_json, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(requestedBy, entityType, entityId == null ? null : String(entityId), action, JSON.stringify(payload), reason);

  return db.prepare(`
    SELECT ar.*, u.name as requester_name, u.email as requester_email
    FROM approval_requests ar
    JOIN users u ON u.id = ar.requested_by
    WHERE ar.id = ?
  `).get(result.lastInsertRowid);
}

async function ensureProperty(db, propertyId) {
  const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
  if (!property) throw new Error('Selected property was not found');
  return property;
}

async function ensureAvailableUnit(db, propertyId, unitId, excludeTenantId = null) {
  const unit = await db.prepare(`
    SELECT u.*, p.type as property_type
    FROM units u
    JOIN properties p ON p.id = u.property_id
    WHERE u.id = ? AND u.property_id = ?
  `).get(unitId, propertyId);
  if (!unit) throw new Error('Selected house unit was not found');
  if (!isApartmentProperty(unit.property_type)) throw new Error('House units are only available for apartment properties');
  if (unit.status !== 'ready') throw new Error('Selected house unit is under maintenance');
  const occupied = excludeTenantId == null
    ? await db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active'").get(unit.id)
    : await db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active' AND id != ?").get(unit.id, excludeTenantId);
  if (occupied) throw new Error('Selected house unit is already occupied');
  return unit;
}

async function applyProperty(db, action, payload, entityId) {
  if (action === 'create') {
    const result = await db.prepare(`
      INSERT INTO properties (name, type, location, address, description, monthly_rent, status, rules, manager_name, manager_phone, manager_email, caretaker_name, caretaker_phone, caretaker_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.name, payload.type, payload.location, payload.address, payload.description, payload.monthly_rent, payload.status, payload.rules, payload.manager_name, payload.manager_phone, payload.manager_email, payload.caretaker_name, payload.caretaker_phone, payload.caretaker_email);
    return result.lastInsertRowid;
  }
  if (action === 'delete') {
    const property = await ensureProperty(db, entityId);
    const hasHistory = await db.prepare(`
      SELECT
        EXISTS(SELECT 1 FROM tenants WHERE property_id = ?) AS has_tenants,
        EXISTS(SELECT 1 FROM payments WHERE property_id = ?) AS has_payments,
        EXISTS(SELECT 1 FROM issues WHERE property_id = ?) AS has_issues,
        EXISTS(SELECT 1 FROM units WHERE property_id = ?) AS has_units,
        EXISTS(SELECT 1 FROM expenses WHERE property_id = ?) AS has_expenses
    `).get(property.id, property.id, property.id, property.id, property.id);
    if (hasHistory.has_tenants || hasHistory.has_payments || hasHistory.has_issues || hasHistory.has_units || hasHistory.has_expenses) {
      throw new Error('Cannot delete a property with existing operational history');
    }
    await db.prepare('DELETE FROM properties WHERE id = ?').run(entityId);
    return entityId;
  }
  await ensureProperty(db, entityId);
  await db.prepare(`
    UPDATE properties
    SET name = ?, type = ?, location = ?, address = ?, description = ?, monthly_rent = ?, status = ?, rules = ?, manager_name = ?, manager_phone = ?, manager_email = ?, caretaker_name = ?, caretaker_phone = ?, caretaker_email = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.name, payload.type, payload.location, payload.address, payload.description, payload.monthly_rent, payload.status, payload.rules, payload.manager_name, payload.manager_phone, payload.manager_email, payload.caretaker_name, payload.caretaker_phone, payload.caretaker_email, entityId);
  return entityId;
}

async function applyUnit(db, action, payload, entityId) {
  if (action === 'create') {
    const property = await ensureProperty(db, payload.property_id);
    if (!isApartmentProperty(property.type)) throw new Error('Units can only be created for apartment properties');
    const result = await db.prepare(`
      INSERT INTO units (property_id, house_id, rent_amount, water_billing_type, water_rate, water_notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.house_id, payload.rent_amount, payload.water_billing_type, payload.water_rate, payload.water_notes, payload.status);
    return result.lastInsertRowid;
  }
  const unit = await db.prepare('SELECT * FROM units WHERE id = ?').get(entityId);
  if (!unit) throw new Error('House unit not found');
  if (action === 'delete') {
    if (await db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active'").get(entityId)) throw new Error('Cannot delete an occupied house unit');
    if (await db.prepare('SELECT id FROM expenses WHERE unit_id = ?').get(entityId)) throw new Error('Cannot delete a house unit with expense history');
    await db.prepare('DELETE FROM units WHERE id = ?').run(entityId);
    return entityId;
  }
  await ensureProperty(db, payload.property_id);
  if (payload.status === 'maintenance' && await db.prepare("SELECT id FROM tenants WHERE unit_id = ? AND status = 'active'").get(entityId)) {
    throw new Error('An occupied house unit cannot be placed under maintenance');
  }
  await db.prepare(`
    UPDATE units
    SET property_id = ?, house_id = ?, rent_amount = ?, water_billing_type = ?, water_rate = ?, water_notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(payload.property_id, payload.house_id, payload.rent_amount, payload.water_billing_type, payload.water_rate, payload.water_notes, payload.status, entityId);
  return entityId;
}

async function applyTenant(db, action, payload, entityId) {
  if (action === 'delete') {
    if (!await db.prepare('SELECT id FROM tenants WHERE id = ?').get(entityId)) throw new Error('Tenant not found');
    if (await db.prepare('SELECT id FROM payments WHERE tenant_id = ?').get(entityId)) throw new Error('Cannot delete a tenant with payment history');
    await db.prepare('DELETE FROM tenants WHERE id = ?').run(entityId);
    return entityId;
  }

  const property = await ensureProperty(db, payload.property_id);
  let rentAmount = Number(payload.rent_amount || 0);
  if (isApartmentProperty(property.type)) {
    if (!payload.unit_id) throw new Error('An apartment tenant must be assigned a house unit');
    const unit = await ensureAvailableUnit(db, payload.property_id, payload.unit_id, action === 'update' ? entityId : null);
    rentAmount = unit.rent_amount;
  }

  if (action === 'create') {
    const result = await db.prepare(`
      INSERT INTO tenants (property_id, unit_id, name, email, phone, type, lease_start, lease_end, rent_amount, deposit_amount, physical_contract_received, contract_reference, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.unit_id || null, payload.name, payload.email, payload.phone, payload.type, payload.lease_start, payload.lease_end, rentAmount, payload.deposit_amount, payload.physical_contract_received ? 1 : 0, payload.contract_reference, payload.status);
    return result.lastInsertRowid;
  }

  if (!await db.prepare('SELECT id FROM tenants WHERE id = ?').get(entityId)) throw new Error('Tenant not found');
  await db.prepare(`
    UPDATE tenants
    SET property_id = ?, unit_id = ?, name = ?, email = ?, phone = ?, type = ?, lease_start = ?, lease_end = ?, rent_amount = ?, deposit_amount = ?, physical_contract_received = ?, contract_reference = ?, status = ?
    WHERE id = ?
  `).run(payload.property_id, payload.unit_id || null, payload.name, payload.email, payload.phone, payload.type, payload.lease_start, payload.lease_end, rentAmount, payload.deposit_amount, payload.physical_contract_received ? 1 : 0, payload.contract_reference, payload.status, entityId);
  return entityId;
}

async function applyExpense(db, action, payload, entityId, reviewerId) {
  if (action === 'delete') {
    if (!await db.prepare('SELECT id FROM expenses WHERE id = ?').get(entityId)) throw new Error('Expense not found');
    await db.prepare('DELETE FROM expenses WHERE id = ?').run(entityId);
    return entityId;
  }
  await ensureProperty(db, payload.property_id);
  if (payload.unit_id && !await db.prepare('SELECT id FROM units WHERE id = ? AND property_id = ?').get(payload.unit_id, payload.property_id)) {
    throw new Error('Selected house unit was not found');
  }
  if (action === 'create') {
    const result = await db.prepare(`
      INSERT INTO expenses (property_id, unit_id, issue_id, category, description, amount, expense_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.unit_id || null, payload.issue_id || null, payload.category, payload.description, payload.amount, payload.expense_date, payload.notes, reviewerId);
    return result.lastInsertRowid;
  }
  if (!await db.prepare('SELECT id FROM expenses WHERE id = ?').get(entityId)) throw new Error('Expense not found');
  await db.prepare(`
    UPDATE expenses
    SET property_id = ?, unit_id = ?, category = ?, description = ?, amount = ?, expense_date = ?, notes = ?
    WHERE id = ?
  `).run(payload.property_id, payload.unit_id || null, payload.category, payload.description, payload.amount, payload.expense_date, payload.notes, entityId);
  return entityId;
}

async function applyIssue(db, action, payload, entityId, reviewerId) {
  if (action === 'delete') {
    if (!await db.prepare('SELECT id FROM issues WHERE id = ?').get(entityId)) throw new Error('Issue not found');
    await db.prepare('DELETE FROM issues WHERE id = ?').run(entityId);
    return entityId;
  }
  const property = await ensureProperty(db, payload.property_id);
  if (isApartmentProperty(property.type)) {
    if (!payload.unit_id) throw new Error('Apartment issues must specify a house unit');
    if (!await db.prepare('SELECT id FROM units WHERE id = ? AND property_id = ?').get(payload.unit_id, payload.property_id)) throw new Error('Selected house unit was not found');
  }
  const resolvedDate = ['resolved', 'closed'].includes(payload.status) ? (payload.resolved_date || new Date().toISOString().slice(0, 10)) : null;
  const repairCost = Number(payload.repair_cost || 0);
  if (action === 'create') {
    const result = await db.prepare(`
      INSERT INTO issues (property_id, unit_id, title, description, priority, status, category, reported_date, resolved_date, notes, repair_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.unit_id || null, payload.title, payload.description, payload.priority, payload.status, payload.category, payload.reported_date, resolvedDate, payload.notes, repairCost);
    if (repairCost > 0) {
      const expense = await db.prepare(`
        INSERT INTO expenses (property_id, unit_id, issue_id, category, description, amount, expense_date, notes, created_by)
        VALUES (?, ?, ?, 'repair', ?, ?, ?, ?, ?)
      `).run(payload.property_id, payload.unit_id || null, result.lastInsertRowid, `Repair: ${payload.title}`, repairCost, payload.reported_date, payload.notes, reviewerId);
      await db.prepare('UPDATE issues SET expense_id = ? WHERE id = ?').run(expense.lastInsertRowid, result.lastInsertRowid);
    }
    return result.lastInsertRowid;
  }
  const issue = await db.prepare('SELECT * FROM issues WHERE id = ?').get(entityId);
  if (!issue) throw new Error('Issue not found');
  await db.prepare(`
    UPDATE issues
    SET property_id = ?, unit_id = ?, title = ?, description = ?, priority = ?, status = ?, category = ?, reported_date = ?, resolved_date = ?, notes = ?, repair_cost = ?
    WHERE id = ?
  `).run(payload.property_id, payload.unit_id || null, payload.title, payload.description, payload.priority, payload.status, payload.category, payload.reported_date, resolvedDate, payload.notes, repairCost, entityId);
  if (issue.expense_id) {
    if (repairCost > 0) await db.prepare('UPDATE expenses SET property_id = ?, unit_id = ?, description = ?, amount = ?, expense_date = ?, notes = ? WHERE id = ?').run(payload.property_id, payload.unit_id || null, `Repair: ${payload.title}`, repairCost, payload.reported_date, payload.notes, issue.expense_id);
    else await db.prepare('DELETE FROM expenses WHERE id = ?').run(issue.expense_id);
  } else if (repairCost > 0) {
    const expense = await db.prepare(`
      INSERT INTO expenses (property_id, unit_id, issue_id, category, description, amount, expense_date, notes, created_by)
      VALUES (?, ?, ?, 'repair', ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.unit_id || null, entityId, `Repair: ${payload.title}`, repairCost, payload.reported_date, payload.notes, reviewerId);
    await db.prepare('UPDATE issues SET expense_id = ? WHERE id = ?').run(expense.lastInsertRowid, entityId);
  }
  return entityId;
}

async function applyPayment(db, action, payload, entityId) {
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(entityId);
  if (action === 'delete') {
    if (!payment) throw new Error('Payment not found');
    await db.prepare('DELETE FROM payments WHERE id = ?').run(entityId);
    return entityId;
  }
  if (!payload.property_id || !payload.tenant_id || !Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) throw new Error('Payment details are incomplete');
  if (!['deposit', 'rent', 'water', 'other'].includes(payload.payment_type)) throw new Error('Invalid payment type');
  if (!['paid', 'pending', 'overdue', 'partial'].includes(payload.status)) throw new Error('Invalid payment status');
  if (payload.method && !['mpesa', 'bank', 'cash', 'other'].includes(payload.method)) throw new Error('Invalid payment method');
  if (!await db.prepare('SELECT id FROM properties WHERE id = ?').get(payload.property_id)) throw new Error('Selected property was not found');
  const tenant = await db.prepare('SELECT id, property_id FROM tenants WHERE id = ?').get(payload.tenant_id);
  if (!tenant || String(tenant.property_id) !== String(payload.property_id)) throw new Error('Selected tenant does not belong to this property');
  if (action === 'create') {
    const result = await db.prepare(`
      INSERT INTO payments (property_id, tenant_id, amount, payment_type, status, method, payment_date, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.property_id, payload.tenant_id, Number(payload.amount), payload.payment_type, payload.status, payload.method, payload.payment_date, payload.due_date, payload.notes);
    return result.lastInsertRowid;
  }
  if (!payment) throw new Error('Payment not found');
  await db.prepare(`
    UPDATE payments
    SET property_id = ?, tenant_id = ?, amount = ?, payment_type = ?, status = ?, method = ?, payment_date = ?, due_date = ?, notes = ?, receipt_notifications_sent_at = CASE WHEN ? = 'paid' THEN receipt_notifications_sent_at ELSE NULL END
    WHERE id = ?
  `).run(payload.property_id, payload.tenant_id, Number(payload.amount), payload.payment_type, payload.status, payload.method, payload.payment_date, payload.due_date, payload.notes, payload.status, entityId);
  return entityId;
}

export async function executeApprovalInTransaction(db, approval, reviewerId) {
  const payload = JSON.parse(approval.payload_json);
  switch (approval.entity_type) {
    case 'property': return applyProperty(db, approval.action, payload, approval.entity_id);
    case 'unit': return applyUnit(db, approval.action, payload, approval.entity_id);
    case 'tenant': return applyTenant(db, approval.action, payload, approval.entity_id);
    case 'expense': return applyExpense(db, approval.action, payload, approval.entity_id, reviewerId);
    case 'issue': return applyIssue(db, approval.action, payload, approval.entity_id, reviewerId);
    case 'payment': return applyPayment(db, approval.action, payload, approval.entity_id);
    default: throw new Error('Unsupported approval type');
  }
}

export async function executeApproval(approval, reviewerId) {
  const db = getDb();
  return db.transaction((tx) => executeApprovalInTransaction(tx, approval, reviewerId))();
}

