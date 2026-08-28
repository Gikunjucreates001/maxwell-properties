export const PROPERTY_TYPES = ['rental', 'airbnb', 'apartment', 'deferred_residence'];
export const PROPERTY_STATUSES = ['active', 'inactive'];
export const TENANT_TYPES = ['long-term', 'short-term'];
export const TENANT_STATUSES = ['active', 'inactive'];
export const PAYMENT_STATUSES = ['paid', 'pending', 'overdue', 'partial'];
export const PAYMENT_METHODS = ['mpesa', 'bank', 'cash', 'other'];
export const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const ISSUE_CATEGORIES = ['plumbing', 'electrical', 'structural', 'appliance', 'pest', 'other'];
export const UNIT_STATUSES = ['ready', 'maintenance'];
export const WATER_BILLING_TYPES = ['included', 'fixed', 'metered'];
export const EXPENSE_CATEGORIES = ['repair', 'septic', 'manager_salary', 'caretaker', 'cleaner', 'custom'];
export const PAYMENT_TYPES = ['deposit', 'rent', 'water', 'other'];
export const APPROVAL_ENTITY_TYPES = ['property', 'tenant', 'unit', 'expense', 'issue', 'payment'];
export const APPROVAL_ACTIONS = ['create', 'update', 'delete'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

export const PASSWORD_RULES = {
  minLength: 6,
  maxLength: 20,
  pattern: /^(?=.{6,20}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).*$/,
};

export function cleanText(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export function cleanEmail(value) {
  const email = cleanText(value);
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : undefined;
}

export function validatePassword(value) {
  if (typeof value !== 'string' || !value) return 'Password is required';
  if (value.length < PASSWORD_RULES.minLength || value.length > PASSWORD_RULES.maxLength) {
    return `Password must be between ${PASSWORD_RULES.minLength} and ${PASSWORD_RULES.maxLength} characters`;
  }
  if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter';
  if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter';
  if (!/\d/.test(value)) return 'Password must include at least one number';
  if (!/[^A-Za-z0-9\s]/.test(value)) return 'Password must include at least one symbol';
  return null;
}

export function parseAmount(value, { required = false, allowZero = true } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? { error: 'Amount is required' } : { value: 0 };
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    return { error: allowZero ? 'Amount must be a valid positive number or zero' : 'Amount must be greater than zero' };
  }

  return { value: amount };
}

export function isValidDate(value) {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isApartmentProperty(type) {
  // Keep legacy rental records behaving like apartments while new records use
  // the explicit apartment/airbnb choices.
  return type === 'apartment' || type === 'rental';
}

