import { getDb } from '../database.js';
import { isApartmentProperty } from '../utils/validation.js';

const CONDITION_CLAUSE = 'The tenant has checked and verified that all amenities are working fine and there are no broken items or issues with the house (including broken pipes, sockets, window panels, doors, etc.). If there are any issues, please report them to the house manager immediately for further assistance.';

function queueJob({ tenantId, channel, notificationType, recipient, subject, body, createdBy }) {
  if (!recipient) return null;
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO notification_jobs (tenant_id, channel, notification_type, recipient, subject, body, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId || null, channel, notificationType, recipient, subject || null, body, createdBy || null);
  void deliverNotification(result.lastInsertRowid);
  return result.lastInsertRowid;
}

async function deliverNotification(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM notification_jobs WHERE id = ?').get(jobId);
  if (!job || job.status !== 'queued') return;

  try {
    if (job.channel === 'email') {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Email provider is not configured');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [job.recipient], subject: job.subject || 'Maxwell Properties update', text: job.body }),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    } else {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) throw new Error('SMS provider is not configured');
      const params = new URLSearchParams({ To: job.recipient, From: process.env.TWILIO_FROM_NUMBER, Body: job.body });
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
      if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
    }
    db.prepare("UPDATE notification_jobs SET status = 'sent', sent_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?").run(jobId);
  } catch (error) {
    db.prepare("UPDATE notification_jobs SET status = 'failed', error = ? WHERE id = ?").run(error.message, jobId);
  }
}

export function queueTenantMessage({ tenant, notificationType, subject, body, createdBy }) {
  const ids = [];
  if (tenant.email) ids.push(queueJob({ tenantId: tenant.id, channel: 'email', notificationType, recipient: tenant.email, subject, body, createdBy }));
  if (tenant.phone) ids.push(queueJob({ tenantId: tenant.id, channel: 'sms', notificationType, recipient: tenant.phone, subject, body, createdBy }));
  return ids.filter(Boolean);
}

function getTenantCommunicationRecord(tenantId) {
  return getDb().prepare(`
    SELECT t.*, p.name as property_name, p.type as property_type, p.rules, p.manager_name, p.manager_phone, p.manager_email, p.caretaker_name, p.caretaker_phone, p.caretaker_email,
      u.house_id, u.rent_amount as unit_rent_amount, u.water_billing_type, u.water_rate, u.water_notes
    FROM tenants t
    JOIN properties p ON p.id = t.property_id
    LEFT JOIN units u ON u.id = t.unit_id
    WHERE t.id = ?
  `).get(tenantId);
}

export function queuePaymentReceipts(paymentId, createdBy) {
  const db = getDb();
  const payment = db.prepare(`
    SELECT py.*, t.id as tenant_id, t.name as tenant_name, t.email, t.phone, p.name as property_name
    FROM payments py
    JOIN tenants t ON t.id = py.tenant_id
    JOIN properties p ON p.id = py.property_id
    WHERE py.id = ? AND py.status = 'paid'
  `).get(paymentId);
  if (!payment || payment.receipt_notifications_sent_at) return [];
  const body = `Hello ${payment.tenant_name},\n\nYour ${payment.payment_type} payment of KES ${Number(payment.amount).toLocaleString()} for ${payment.property_name} has been recorded as paid.\nPayment date: ${payment.payment_date || 'today'}.\n\nThank you,\nMaxwell Properties`;
  const ids = queueTenantMessage({ tenant: { id: payment.tenant_id, email: payment.email, phone: payment.phone }, notificationType: 'payment_receipt', subject: 'Payment receipt - Maxwell Properties', body, createdBy });
  if (ids.length) db.prepare('UPDATE payments SET receipt_notifications_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(paymentId);
  return ids;
}

export function queueOnboardingIfEligible(tenantId, createdBy) {
  const db = getDb();
  const tenant = getTenantCommunicationRecord(tenantId);
  if (!tenant || tenant.onboarding_sent_at) return [];
  if (!isApartmentProperty(tenant.property_type)) return [];
  const hasDeposit = db.prepare("SELECT id FROM payments WHERE tenant_id = ? AND payment_type = 'deposit' AND status = 'paid'").get(tenantId);
  const hasFirstRent = db.prepare("SELECT id FROM payments WHERE tenant_id = ? AND payment_type = 'rent' AND status = 'paid'").get(tenantId);
  if (!hasDeposit || !hasFirstRent) return [];

  const unitDetails = tenant.house_id
    ? `House ID: ${tenant.house_id}\nRent: KES ${Number(tenant.unit_rent_amount || tenant.rent_amount || 0).toLocaleString()} per month\nWater billing: ${tenant.water_billing_type || 'included'}${tenant.water_billing_type === 'included' ? '' : ` at KES ${Number(tenant.water_rate || 0).toLocaleString()}`}\nWater notes: ${tenant.water_notes || 'None'}`
    : `Rent: KES ${Number(tenant.rent_amount || 0).toLocaleString()} per month`;
  const contacts = `House Manager: ${tenant.manager_name || 'Not provided'}${tenant.manager_phone ? ` (${tenant.manager_phone})` : ''}${tenant.manager_email ? ` · ${tenant.manager_email}` : ''}\nCaretaker: ${tenant.caretaker_name || 'Not provided'}${tenant.caretaker_phone ? ` (${tenant.caretaker_phone})` : ''}${tenant.caretaker_email ? ` · ${tenant.caretaker_email}` : ''}`;
  const body = `Hello ${tenant.name},\n\nWelcome to ${tenant.property_name}. Your physical lease contract remains the signed source document.\n\nProperty rules:\n${tenant.rules || 'Please keep the property clean, respect neighbours, and report issues promptly.'}\n\nYour payment details:\n${unitDetails}\n\nYour contacts:\n${contacts}\n\nCondition Verification Clause:\n${CONDITION_CLAUSE}\n\nWelcome,\nMaxwell Properties`;
  const ids = queueTenantMessage({ tenant, notificationType: 'onboarding', subject: `Welcome to ${tenant.property_name}`, body, createdBy });
  if (ids.length) db.prepare('UPDATE tenants SET onboarding_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(tenantId);
  return ids;
}

export function queueOverdueMessages({ message, createdBy }) {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT DISTINCT t.id, t.name, t.email, t.phone, p.name as property_name
    FROM tenants t
    JOIN properties p ON p.id = t.property_id
    JOIN payments py ON py.tenant_id = t.id
    WHERE t.status = 'active' AND p.type IN ('apartment', 'rental') AND (py.status = 'overdue' OR (py.due_date < date('now') AND py.status != 'paid'))
  `).all();
  const ids = [];
  for (const tenant of tenants) {
    ids.push(...queueTenantMessage({ tenant, notificationType: 'overdue_reminder', subject: 'Overdue payment reminder - Maxwell Properties', body: `Hello ${tenant.name},\n\n${message}\n\nProperty: ${tenant.property_name}\nPlease contact the property team if you need assistance.`, createdBy }));
  }
  return { tenantCount: tenants.length, jobIds: ids };
}

export function queueMonthEndReminders({ message, createdBy }) {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT t.id, t.name, t.email, t.phone, p.name as property_name
    FROM tenants t JOIN properties p ON p.id = t.property_id
    WHERE t.status = 'active' AND p.type IN ('apartment', 'rental')
  `).all();
  const ids = [];
  for (const tenant of tenants) {
    ids.push(...queueTenantMessage({ tenant, notificationType: 'month_end_reminder', subject: 'Monthly payment reminder - Maxwell Properties', body: `Hello ${tenant.name},\n\n${message}\n\nProperty: ${tenant.property_name}\nThank you,\nMaxwell Properties`, createdBy }));
  }
  return { tenantCount: tenants.length, jobIds: ids };
}

export { CONDITION_CLAUSE };

