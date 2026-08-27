import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { Plus, Edit, Trash2, Loader2, Search, Home, FileCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const isApartment = (property) => property && ['apartment', 'rental'].includes(property.type);
const blankForm = (propertyId = '') => ({ property_id: String(propertyId || ''), unit_id: '', name: '', email: '', phone: '', type: 'long-term', lease_start: '', lease_end: '', rent_amount: '', deposit_amount: '', physical_contract_received: false, contract_reference: '', status: 'active' });

const Tenants = () => {
  const [tenants, setTenants] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState(blankForm());
  const selectedProperty = properties.find((property) => String(property.id) === String(formData.property_id));

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tenantsRes, propsRes] = await Promise.all([client.get('/tenants'), client.get('/properties')]);
      if (tenantsRes.data.success) setTenants(tenantsRes.data.data);
      if (propsRes.data.success) setProperties(propsRes.data.data);
    } catch { toast.error('Could not load tenants'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const fetchUnits = async (propertyId) => {
    if (!propertyId) { setUnits([]); return; }
    try { const response = await client.get(`/units?property_id=${propertyId}`); setUnits(response.data.success ? response.data.data : []); }
    catch { setUnits([]); }
  };

  const openModal = async (tenant = null) => {
    if (!tenant && !properties.length) { toast.error('Add a property before adding a tenant'); return; }
    setEditingTenant(tenant);
    const next = tenant ? { property_id: String(tenant.property_id || ''), unit_id: tenant.unit_id ? String(tenant.unit_id) : '', name: tenant.name || '', email: tenant.email || '', phone: tenant.phone || '', type: tenant.type || 'long-term', lease_start: tenant.lease_start ? tenant.lease_start.split('T')[0] : '', lease_end: tenant.lease_end ? tenant.lease_end.split('T')[0] : '', rent_amount: tenant.rent_amount || '', deposit_amount: tenant.deposit_amount || '', physical_contract_received: Boolean(tenant.physical_contract_received), contract_reference: tenant.contract_reference || '', status: tenant.status || 'active' } : blankForm(properties[0]?.id);
    setFormData(next);
    await fetchUnits(next.property_id);
    setIsModalOpen(true);
  };

  const change = async (event) => {
    const { name, value, type, checked } = event.target;
    if (name === 'property_id') {
      setFormData((current) => ({ ...current, property_id: value, unit_id: '', rent_amount: '' }));
      await fetchUnits(value);
      return;
    }
    if (name === 'unit_id') {
      const unit = units.find((item) => String(item.id) === String(value));
      setFormData((current) => ({ ...current, unit_id: value, rent_amount: unit ? unit.rent_amount : current.rent_amount }));
      return;
    }
    setFormData((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = editingTenant ? await client.put(`/tenants/${editingTenant.id}`, formData) : await client.post('/tenants', formData);
      if (response.data.success) { toast.success(response.data.pending ? 'Tenant change submitted for admin approval' : editingTenant ? 'Tenant updated' : 'Tenant added'); setIsModalOpen(false); fetchData(); }
    } catch (error) { toast.error(error.response?.data?.error || 'Could not save tenant'); }
    finally { setIsSaving(false); }
  };

  const remove = async (tenant) => {
    if (!window.confirm(`Delete ${tenant.name}?`)) return;
    setDeletingId(tenant.id);
    try { const response = await client.delete(`/tenants/${tenant.id}`); if (response.data.success) { toast.success(response.data.pending ? 'Deletion submitted for admin approval' : 'Tenant deleted'); fetchData(); } }
    catch (error) { toast.error(error.response?.data?.error || 'Could not delete tenant'); }
    finally { setDeletingId(null); }
  };

  const visibleTenants = useMemo(() => tenants.filter((tenant) => `${tenant.name} ${tenant.email || ''} ${tenant.phone || ''} ${tenant.property_name || ''} ${tenant.house_id || ''}`.toLowerCase().includes(searchTerm.toLowerCase())), [tenants, searchTerm]);
  const availableUnits = units.filter((unit) => unit.status === 'ready' && (!unit.tenant_id || String(unit.tenant_id) === String(editingTenant?.id)));

  return (
    <Layout title="Tenants">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-gray-500">Register tenants and assign them to available House IDs.</p><p className="mt-1 text-sm text-gray-400">Managers can submit sensitive changes for admin approval.</p></div><div className="flex w-full gap-3 sm:w-auto"><div className="relative flex-1 sm:w-64"><Search size={18} className="absolute left-3 top-2.5 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search tenants..." aria-label="Search tenants" className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 outline-none focus:border-primary" /></div><button type="button" onClick={() => openModal()} disabled={!properties.length} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Plus size={18} /> Add Tenant</button></div></div>
      {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{['Tenant', 'Property / House', 'Lease dates', 'Rent', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{visibleTenants.map((tenant) => <tr key={tenant.id} className="hover:bg-gray-50"><td className="whitespace-nowrap px-5 py-4"><p className="font-medium text-gray-900">{tenant.name}</p><p className="text-sm text-gray-500">{tenant.email || 'No email'} · {tenant.phone || 'No phone'}</p></td><td className="whitespace-nowrap px-5 py-4"><p className="font-medium text-gray-900">{tenant.property_name}</p><p className="flex items-center gap-1 text-sm text-gray-500">{tenant.house_id ? <><Home size={13} /> House {tenant.house_id}</> : 'Airbnb tenant'}</p></td><td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600"><div>{tenant.lease_start ? new Date(tenant.lease_start).toLocaleDateString() : 'No start date'}</div><div>{tenant.lease_end ? new Date(tenant.lease_end).toLocaleDateString() : 'No end date'}</div></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-gray-900">KES {Number(tenant.rent_amount || 0).toLocaleString()}</td><td className="whitespace-nowrap px-5 py-4"><StatusBadge status={tenant.status} /></td><td className="whitespace-nowrap px-5 py-4 text-right"><button type="button" onClick={() => openModal(tenant)} className="mr-2 rounded-md bg-blue-50 p-2 text-blue-700 hover:bg-blue-100" aria-label={`Edit ${tenant.name}`}><Edit size={16} /></button><button type="button" onClick={() => remove(tenant)} disabled={deletingId === tenant.id} className="rounded-md bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50" aria-label={`Delete ${tenant.name}`}><Trash2 size={16} /></button></td></tr>)}{visibleTenants.length === 0 && <tr><td colSpan="6" className="px-5 py-12 text-center text-gray-500">{tenants.length ? 'No tenants match your search.' : 'No tenants yet. Add your first tenant to get started.'}</td></tr>}</tbody></table></div></div>}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTenant ? 'Edit Tenant' : 'Add Tenant'}>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Property</label><select name="property_id" required value={formData.property_id} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary"><option value="" disabled>Select a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {isApartment(property) ? 'Apartment' : 'Airbnb'}</option>)}</select></div>
          {isApartment(selectedProperty) && <div><label className="mb-1 block text-sm font-medium text-gray-700">House ID</label><select name="unit_id" required value={formData.unit_id} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary"><option value="" disabled>Select an available House ID</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.house_id} · KES {Number(unit.rent_amount).toLocaleString()}</option>)}</select>{availableUnits.length === 0 && <p className="mt-1 text-xs text-amber-700">There are no ready vacant House IDs for this property.</p>}</div>}
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Full name</label><input name="name" required value={formData.name} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-gray-700">Email</label><input name="email" type="email" value={formData.email} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div><div><label className="mb-1 block text-sm font-medium text-gray-700">Phone</label><input name="phone" value={formData.phone} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-gray-700">Lease start</label><input name="lease_start" type="date" value={formData.lease_start} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div><div><label className="mb-1 block text-sm font-medium text-gray-700">Lease end</label><input name="lease_end" type="date" value={formData.lease_end} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-gray-700">Rent (KES)</label><input name="rent_amount" required type="number" min="0" step="0.01" value={formData.rent_amount} onChange={change} readOnly={isApartment(selectedProperty)} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary read-only:bg-gray-100" />{isApartment(selectedProperty) && <p className="mt-1 text-xs text-gray-500">Taken from the selected House ID.</p>}</div><div><label className="mb-1 block text-sm font-medium text-gray-700">Deposit (KES)</label><input name="deposit_amount" type="number" min="0" step="0.01" value={formData.deposit_amount} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-gray-700">Tenant status</label><select name="status" value={formData.status} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary"><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div className="flex items-end"><label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"><input name="physical_contract_received" type="checkbox" checked={formData.physical_contract_received} onChange={change} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" /><FileCheck size={16} className="text-emerald-600" /> Physical contract received</label></div></div>
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Contract reference (optional)</label><input name="contract_reference" value={formData.contract_reference} onChange={change} placeholder="Filing reference or signed copy location" className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">Cancel</button><button type="submit" disabled={isSaving || (isApartment(selectedProperty) && !availableUnits.length && !editingTenant?.unit_id)} className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{isSaving ? 'Saving…' : editingTenant ? 'Save Changes' : 'Add Tenant'}</button></div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Tenants;

