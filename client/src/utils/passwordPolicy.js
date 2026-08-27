export const passwordRequirements = [
  { key: 'length', label: '6–20 characters', test: (value) => value.length >= 6 && value.length <= 20 },
  { key: 'lowercase', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { key: 'uppercase', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { key: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { key: 'symbol', label: 'One symbol', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
];

export function validatePassword(value) {
  if (!value || value.length < 6 || value.length > 20) return 'Password must be between 6 and 20 characters';
  if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter';
  if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter';
  if (!/\d/.test(value)) return 'Password must include at least one number';
  if (!/[^A-Za-z0-9\s]/.test(value)) return 'Password must include at least one symbol';
  return null;
}

