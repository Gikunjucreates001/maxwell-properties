import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import PasswordRequirements from '../components/PasswordRequirements';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { validatePassword } from '../utils/passwordPolicy';
import { Check, Edit, KeyRound, Loader2, Plus, ShieldCheck, UserRound, UserRoundX, X } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyForm = { name: '', email: '', password: '' };

const Managers = () => {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManager, setEditingManager] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [resetRequests, setResetRequests] = useState([]);
  const [workingResetId, setWorkingResetId] = useState(null);

  useEffect(() => {
    fetchManagers();
    fetchResetRequests();
  }, []);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const response = await client.get('/managers');
      if (response.data.success) setManagers(response.data.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load managers');
    } finally {
      setLoading(false);
    }
  };

  const fetchResetRequests = async () => {
    try {
      const response = await client.get('/auth/password-reset/requests');
      if (response.data.success) setResetRequests(response.data.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load password reset requests');
    }
  };

  const reviewResetRequest = async (request, decision) => {
    setWorkingResetId(request.id);
    try {
      const response = await client.post(`/auth/password-reset/requests/${request.id}/${decision}`, decision === 'reject' ? { review_note: 'Reset request declined by the administrator' } : {});
      if (response.data.success) toast.success(response.data.data.message);
      fetchResetRequests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to review password reset request');
    } finally {
      setWorkingResetId(null);
    }
  };

  const openModal = (manager = null) => {
    setEditingManager(manager);
    setFormData(manager ? { name: manager.name, email: manager.email, password: '' } : { ...emptyForm });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!editingManager || formData.password) {
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = { name: formData.name.trim(), email: formData.email.trim().toLowerCase() };
      if (formData.password) payload.password = formData.password;
      const response = editingManager
        ? await client.put(`/managers/${editingManager.id}`, payload)
        : await client.post('/managers', { ...payload, password: formData.password });
      if (response.data.success) {
        toast.success(editingManager ? 'Manager updated' : 'Manager account created');
        setIsModalOpen(false);
        fetchManagers();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save manager');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleManager = async (manager) => {
    setWorkingId(manager.id);
    try {
      const response = await client.put(`/managers/${manager.id}`, { is_active: !manager.is_active });
      if (response.data.success) {
        toast.success(manager.is_active ? 'Manager deactivated' : 'Manager activated');
        fetchManagers();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update manager status');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <Layout title="Managers">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-gray-500">Create and manage staff accounts for your property team.</p>
          <p className="mt-1 text-sm text-gray-400">Managers can work with properties, tenants, payments, and issues.</p>
        </div>
        <button type="button" onClick={() => openModal()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-sm hover:bg-blue-700 sm:w-auto">
          <Plus size={18} /> Add manager
        </button>
      </div>

      {resetRequests.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm" aria-labelledby="password-reset-requests-title">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><KeyRound size={20} /></div>
            <div>
              <h2 id="password-reset-requests-title" className="font-semibold text-gray-900">Password reset requests</h2>
              <p className="mt-1 text-sm text-gray-600">Review manager requests here. Approving sends a one-time reset link to the manager’s email.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {resetRequests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">{request.requester_name}</p>
                  <p className="text-sm text-gray-500">{request.requester_email} · Requested {new Date(request.requested_at).toLocaleString()}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{request.status === 'approved' ? 'Reset email sent' : 'Awaiting approval'}</p>
                </div>
                {request.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => reviewResetRequest(request, 'approve')} disabled={workingResetId === request.id} className="inline-flex items-center gap-1 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"><Check size={15} /> Approve</button>
                    <button type="button" onClick={() => reviewResetRequest(request, 'reject')} disabled={workingResetId === request.id} className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"><X size={15} /> Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : managers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <ShieldCheck size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No managers yet</h2>
          <p className="mt-1 text-gray-500">Add a manager account when someone else needs access to the workspace.</p>
          <button type="button" onClick={() => openModal()} className="mt-5 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700">Add your first manager</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {managers.map((manager) => (
            <div key={manager.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary"><UserRound size={22} /></div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-gray-900">{manager.name}</h2>
                    <p className="truncate text-sm text-gray-500">{manager.email}</p>
                  </div>
                </div>
                <StatusBadge status={manager.is_active ? 'active' : 'inactive'} />
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500">{manager.auth_provider?.includes('google') ? 'Google sign-in available' : 'Password sign-in'} · Added {new Date(manager.created_at).toLocaleDateString()}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openModal(manager)} aria-label={`Edit ${manager.name}`} title="Edit manager" className="rounded-md bg-blue-50 p-2 text-blue-700 hover:bg-blue-100"><Edit size={16} /></button>
                  <button type="button" onClick={() => toggleManager(manager)} disabled={workingId === manager.id} className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${manager.is_active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                    {manager.is_active ? <UserRoundX size={15} /> : <UserRound size={15} />}
                    {manager.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingManager ? 'Edit manager' : 'Add manager'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">Manager accounts can access the day-to-day property workspace, but not this manager administration area.</p>
          <div>
            <label htmlFor="manager-name" className="mb-1 block text-sm font-medium text-gray-700">Full name</label>
            <input id="manager-name" type="text" required value={formData.name} onChange={(event) => setFormData((form) => ({ ...form, name: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" placeholder="e.g. Jane Wanjiku" />
          </div>
          <div>
            <label htmlFor="manager-email" className="mb-1 block text-sm font-medium text-gray-700">Email address</label>
            <input id="manager-email" type="email" required value={formData.email} onChange={(event) => setFormData((form) => ({ ...form, email: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" placeholder="manager@example.com" />
          </div>
          <div>
            <label htmlFor="manager-password" className="mb-1 block text-sm font-medium text-gray-700">{editingManager ? 'New password (optional)' : 'Password'}</label>
            <input id="manager-password" type="password" required={!editingManager} minLength={6} maxLength={20} autoComplete="new-password" value={formData.password} onChange={(event) => setFormData((form) => ({ ...form, password: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" placeholder={editingManager ? 'Leave blank to keep current password' : 'Choose a password'} />
            <PasswordRequirements value={formData.password} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{isSaving ? 'Saving…' : editingManager ? 'Update manager' : 'Create manager'}</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Managers;

