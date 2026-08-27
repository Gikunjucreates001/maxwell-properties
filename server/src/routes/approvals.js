import express from 'express';
import { getDb } from '../database.js';
import { executeApprovalInTransaction } from '../services/approvals.js';
import { queueOnboardingIfEligible, queuePaymentReceipts } from '../services/notifications.js';

const router = express.Router();

function canAccessApproval(req, approval) {
  return req.user.role === 'admin' || approval.requested_by === req.user.id;
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const params = [];
    let query = `
      SELECT ar.*, requester.name as requester_name, requester.email as requester_email,
        reviewer.name as reviewer_name,
        (SELECT COUNT(*) FROM approval_comments ac WHERE ac.approval_id = ar.id) as comment_count
      FROM approval_requests ar
      JOIN users requester ON requester.id = ar.requested_by
      LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
      WHERE 1 = 1
    `;
    if (req.user.role !== 'admin') {
      query += ' AND ar.requested_by = ?';
      params.push(req.user.id);
    }
    if (status) {
      query += ' AND ar.status = ?';
      params.push(status);
    }
    query += ' ORDER BY CASE WHEN ar.status = \'pending\' THEN 0 ELSE 1 END, ar.created_at DESC';
    const approvals = db.prepare(query).all(...params).map((approval) => ({
      ...approval,
      payload: JSON.parse(approval.payload_json),
    }));
    res.json({ success: true, data: approvals });
  } catch (error) {
    console.error('Get approvals error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const approval = db.prepare(`
      SELECT ar.*, requester.name as requester_name, requester.email as requester_email, reviewer.name as reviewer_name
      FROM approval_requests ar
      JOIN users requester ON requester.id = ar.requested_by
      LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
      WHERE ar.id = ?
    `).get(req.params.id);
    if (!approval) return res.status(404).json({ success: false, error: 'Approval request not found' });
    if (!canAccessApproval(req, approval)) return res.status(403).json({ success: false, error: 'You do not have permission to view this approval' });
    const comments = db.prepare(`
      SELECT ac.*, u.name as author_name, u.role as author_role
      FROM approval_comments ac JOIN users u ON u.id = ac.author_id
      WHERE ac.approval_id = ? ORDER BY ac.created_at ASC
    `).all(req.params.id);
    res.json({ success: true, data: { ...approval, payload: JSON.parse(approval.payload_json), comments } });
  } catch (error) {
    console.error('Get approval error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/:id/comments', (req, res) => {
  try {
    const db = getDb();
    const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!approval) return res.status(404).json({ success: false, error: 'Approval request not found' });
    if (!canAccessApproval(req, approval)) return res.status(403).json({ success: false, error: 'You do not have permission to discuss this approval' });
    if (!comment) return res.status(400).json({ success: false, error: 'Comment is required' });
    const result = db.prepare('INSERT INTO approval_comments (approval_id, author_id, comment) VALUES (?, ?, ?)').run(req.params.id, req.user.id, comment);
    const saved = db.prepare(`
      SELECT ac.*, u.name as author_name, u.role as author_role
      FROM approval_comments ac JOIN users u ON u.id = ac.author_id WHERE ac.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error('Add approval comment error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/:id/decision', (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Only an admin can review approval requests' });
    const decision = req.body?.status;
    const reviewNote = typeof req.body?.review_note === 'string' ? req.body.review_note.trim() : null;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ success: false, error: 'Decision must be approved or rejected' });

    const db = getDb();
    let reviewedApproval = null;
    try {
      db.transaction(() => {
        const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ? AND status = \'pending\'').get(req.params.id);
        if (!approval) {
          const error = new Error('Pending approval request not found');
          error.code = 'NOT_FOUND';
          throw error;
        }
        reviewedApproval = approval;
        if (decision === 'approved') executeApprovalInTransaction(db, approval, req.user.id);
        const result = db.prepare(`
          UPDATE approval_requests
          SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP, executed_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE executed_at END
          WHERE id = ? AND status = 'pending'
        `).run(decision, req.user.id, reviewNote, decision, req.params.id);
        if (result.changes !== 1) {
          const error = new Error('This approval was already reviewed');
          error.code = 'CONFLICT';
          throw error;
        }
      })();
    } catch (error) {
      if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
      if (error.code === 'CONFLICT') return res.status(409).json({ success: false, error: error.message });
      return res.status(400).json({ success: false, error: error.message || 'The requested change could not be applied' });
    }
    if (decision === 'approved' && reviewedApproval?.entity_type === 'payment' && reviewedApproval.action !== 'delete') {
      try {
        queuePaymentReceipts(reviewedApproval.entity_id, req.user.id);
        const payment = db.prepare('SELECT tenant_id FROM payments WHERE id = ?').get(reviewedApproval.entity_id);
        if (payment) queueOnboardingIfEligible(payment.tenant_id, req.user.id);
      } catch (error) {
        console.error('Queue approved payment notifications error:', error);
      }
    }
    res.json({ success: true, data: { message: decision === 'approved' ? 'Approval accepted and change applied' : 'Approval rejected' } });
  } catch (error) {
    console.error('Review approval error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

