import express from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../database.js';
import { cleanEmail, cleanText, validatePassword } from '../utils/validation.js';

const router = express.Router();

const selectManager = `
  SELECT id, email, name, role, auth_provider, is_active, created_at
  FROM users
  WHERE role = 'manager'
`;

router.get('/', (req, res) => {
  try {
    const managers = getDb().prepare(`${selectManager} ORDER BY name COLLATE NOCASE ASC`).all();
    res.json({ success: true, data: managers });
  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/', (req, res) => {
  try {
    const name = cleanText(req.body?.name, '');
    const email = cleanEmail(req.body?.email);
    const password = req.body?.password;
    const passwordError = validatePassword(password);

    if (!name || !email || email === undefined || passwordError) {
      return res.status(400).json({
        success: false,
        error: !name ? 'Name is required' : email === undefined ? 'Enter a valid email address' : !email ? 'Email is required' : passwordError,
      });
    }

    const db = getDb();
    const passwordHash = bcrypt.hashSync(password, 12);
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, role, auth_provider, is_active)
      VALUES (?, ?, ?, 'manager', 'password', 1)
    `).run(email, passwordHash, name);

    const manager = db.prepare(`${selectManager} AND id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: manager });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: users.email')) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists' });
    }
    console.error('Create manager error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const manager = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'manager'").get(req.params.id);
    if (!manager) return res.status(404).json({ success: false, error: 'Manager not found' });

    const name = cleanText(req.body?.name, manager.name);
    const email = req.body?.email === undefined ? manager.email : cleanEmail(req.body.email);
    const password = req.body?.password;
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    if (email === undefined) return res.status(400).json({ success: false, error: 'Enter a valid email address' });

    let passwordHash = manager.password_hash;
    if (password !== undefined && password !== '') {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ success: false, error: passwordError });
      passwordHash = bcrypt.hashSync(password, 12);
    }

    const isActive = req.body?.is_active === undefined ? manager.is_active : req.body.is_active ? 1 : 0;
    db.prepare(`
      UPDATE users SET name = ?, email = ?, password_hash = ?, is_active = ?
      WHERE id = ? AND role = 'manager'
    `).run(name, email, passwordHash, isActive, manager.id);

    const updatedManager = db.prepare(`${selectManager} AND id = ?`).get(manager.id);
    res.json({ success: true, data: updatedManager });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: users.email')) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists' });
    }
    console.error('Update manager error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = getDb().prepare("UPDATE users SET is_active = 0 WHERE id = ? AND role = 'manager'").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Manager not found' });
    res.json({ success: true, data: { message: 'Manager deactivated successfully' } });
  } catch (error) {
    console.error('Deactivate manager error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

