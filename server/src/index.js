import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './database.js';
import { authenticateToken, requireRole } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import propertyRoutes from './routes/properties.js';
import tenantRoutes from './routes/tenants.js';
import paymentRoutes from './routes/payments.js';
import issueRoutes from './routes/issues.js';
import managerRoutes from './routes/managers.js';
import unitRoutes from './routes/units.js';
import expenseRoutes from './routes/expenses.js';
import approvalRoutes from './routes/approvals.js';
import notificationRoutes from './routes/notifications.js';
import { startNotificationScheduler } from './services/notificationScheduler.js';

if (process.env.NODE_ENV === 'production') {
  const requiredSecrets = [
    'ADMIN_JWT_SECRET',
    'MANAGER_JWT_SECRET',
    'ADMIN_JWT_REFRESH_SECRET',
    'MANAGER_JWT_REFRESH_SECRET',
  ];
  const missingSecrets = requiredSecrets.filter((name) => !process.env[name]);
  if (missingSecrets.length > 0) {
    throw new Error(`Missing required production secrets: ${missingSecrets.join(', ')}`);
  }
}

// Initialize the Supabase Postgres connection before accepting requests.
await initDb();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

// Middleware
app.use(helmet());
const configuredOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const deployedFrontendOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://maxwell-properties.vercel.app',
      'https://maxwell-properties-gikunjucreates001.vercel.app',
      'https://maxwell-properties-git-main-gikunjucreates001.vercel.app',
    ]
  : ['http://localhost:5173'];
const allowedOrigins = [...new Set([...configuredOrigins, ...deployedFrontendOrigins])];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  },
}));
app.use(express.json({ limit: '1mb' }));

// Rate Limiting for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { success: false, error: 'Too many login attempts from this IP, please try again after 15 minutes' }
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many password reset attempts. Please try again later.' },
});

// Routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/google', loginLimiter);
app.use('/api/auth/password-reset/request', passwordResetLimiter);
app.use('/api/auth/password-reset/complete', passwordResetLimiter);
app.use('/api/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/properties', authenticateToken, propertyRoutes);
app.use('/api/tenants', authenticateToken, tenantRoutes);
app.use('/api/payments', authenticateToken, paymentRoutes);
app.use('/api/issues', authenticateToken, issueRoutes);
app.use('/api/managers', authenticateToken, requireRole('admin'), managerRoutes);
app.use('/api/units', authenticateToken, unitRoutes);
app.use('/api/expenses', authenticateToken, expenseRoutes);
app.use('/api/approvals', authenticateToken, approvalRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'maxwell-properties-api' } });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message === 'Origin not allowed') {
    return res.status(403).json({ success: false, error: 'Request origin is not allowed' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Request body must be valid JSON' });
  }
  res.status(500).json({ success: false, error: 'Something broke on the server' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Maxwell Properties API running on port ${PORT}`);
  startNotificationScheduler();
});

