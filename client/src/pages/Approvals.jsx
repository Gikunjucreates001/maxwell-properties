import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import client from '../api/client';
import { Check, ClipboardCheck, Loader2, MessageCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const label = (value = '') => value.replaceAll('_', ' ');
const summary = (approval) => {
  const payload = approval.payload || {};
  if (approval.entity_type === 'unit') return payload.house_id ? `House ID ${payload.house_id}` : 'House unit';
  if (approval.entity_type === 'tenant') return payload.name || 'Tenant record';
  if (approval.entity_type === 'property') return payload.name || 'Property record';
  if (approval.entity_type === 'expense') return payload.description || 'Expense record';
  if (approval.entity_type === 'issue') return payload.title || 'Maintenance issue';
  if (approval.entity_type === 'payment') return `KES ${Number(payload.amount || 0).toLocaleString()} ${payload.payment_type || 'payment'}`;
  return 'Requested change';
};

const Approvals = () => {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const response = await client.get(`/approvals?status=${status}`);
      if (response.data.success) setApprovals(response.data.data);
    } catch (error) { toast.error('Could not load approval requests'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchApprovals(); }, [status]);

  const openDetails = async (approval) => {
    try {
      const response = await client.get(`/approvals/${approval.id}`);
      if (response.data.success) { setSelected(response.data.data); setComment(''); setReviewNote(response.data.data.review_note || ''); }
    } catch (error) { toast.error('Could not load request details'); }
  };

  const addComment = async (event) => {
    event.preventDefault();
    if (!comment.trim() || !selected) return;
    setSaving(true);
    try {
      const response = await client.post(`/approvals/${selected.id}/comments`, { comment });
      if (response.data.success) { setSelected((current) => ({ ...current, comments: [...(current.comments || []), response.data.data] })); setComment(''); toast.success('Discussion note added'); }
    } catch (error) { toast.error(error.response?.data?.error || 'Could not add note'); }
    finally { setSaving(false); }
  };

  const decide = async (decision) => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await client.post(`/approvals/${selected.id}/decision`, { status: decision, review_note: reviewNote });
      if (response.data.success) { toast.success(decision === 'approved' ? 'Approved and applied' : 'Request rejected'); setSelected(null); fetchApprovals(); }
    } catch (error) { toast.error(error.response?.data?.error || 'Could not review request'); }
    finally { setSaving(false); }
  };

  return (
    <Layout title="Pending Approvals">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-gray-500">Review sensitive changes submitted by managers.</p><p className="mt-1 text-sm text-gray-400">Discuss a request before approving it. Approved changes are applied immediately.</p></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
      </div>
      {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : approvals.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm"><ClipboardCheck size={42} className="mx-auto mb-4 text-gray-300" /><h2 className="text-lg font-semibold text-gray-900">No {status} requests</h2><p className="mt-1 text-gray-500">Requests will appear here when a manager submits a sensitive change.</p></div> : <div className="space-y-4">{approvals.map((approval) => <article key={approval.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><div className="rounded-lg bg-blue-50 p-3 text-primary"><ClipboardCheck size={20} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold capitalize text-gray-900">{label(approval.action)} {label(approval.entity_type)}</h2><StatusBadge status={approval.status} /></div><p className="mt-1 text-sm text-gray-700">{summary(approval)}</p><p className="mt-1 text-xs text-gray-500">Requested by {approval.requester_name} · {new Date(approval.created_at).toLocaleString()}</p><p className="mt-2 text-sm text-gray-600">{approval.reason}</p></div></div><button type="button" onClick={() => openDetails(approval)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><MessageCircle size={16} /> Review / discuss</button></div></article>)}</div>}

      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Review approval request">
        {selected && <div className="space-y-5">
          <div className="rounded-lg bg-gray-50 p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold capitalize text-gray-900">{label(selected.action)} {label(selected.entity_type)}</h2><StatusBadge status={selected.status} /></div><p className="mt-2 text-sm text-gray-700">{summary(selected)}</p><p className="mt-1 text-sm text-gray-500">{selected.reason}</p></div>
          <div><h3 className="mb-2 text-sm font-semibold text-gray-900">Requested details</h3><pre className="max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(selected.payload, null, 2)}</pre></div>
          <div><h3 className="mb-2 text-sm font-semibold text-gray-900">Discussion</h3><div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-3">{selected.comments?.length ? selected.comments.map((item) => <div key={item.id} className="rounded-md bg-gray-50 p-2 text-sm"><p className="font-medium text-gray-800">{item.author_name} <span className="font-normal capitalize text-gray-400">· {item.author_role}</span></p><p className="mt-1 text-gray-600">{item.comment}</p></div>) : <p className="text-sm text-gray-500">No notes yet.</p>}</div><form onSubmit={addComment} className="mt-3 flex gap-2"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a note or question..." className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary" /><button type="submit" disabled={saving || !comment.trim()} className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Add note</button></form></div>
          {user?.role === 'admin' && selected.status === 'pending' && <div><label className="mb-1 block text-sm font-medium text-gray-700">Admin decision note (optional)</label><textarea rows={2} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Explain the decision for the manager" className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => decide('rejected')} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"><X size={16} /> Reject</button><button type="button" onClick={() => decide('approved')} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={16} /> Approve & apply</button></div></div>}
        </div>}
      </Modal>
    </Layout>
  );
};

export default Approvals;

