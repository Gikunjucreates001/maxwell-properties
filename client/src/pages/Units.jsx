import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { Home, Loader2, Plus, Edit2, Trash2, Search, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';

const apartmentProperty = (property) => property && ['apartment', 'rental'].includes(property.type);
const emptyForm = (propertyId = '') => ({
  property_id: String(propertyId || ''),
  house_id: '',
  rent_amount: '',
  water_billing_type: 'included',
  water_rate: '0',
  water_notes: '',
  status: 'ready',
});

const Units = () => {
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [propertyId, setPropertyId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const selectedProperty = properties.find((property) => String(property.id) === String(propertyId));

  const fetchData = async () => {
    try {
      setLoading(true);
      const propertiesRes = await client.get('/properties');
      const nextProperties = propertiesRes.data.success ? propertiesRes.data.data : [];
      setProperties(nextProperties);
      const activePropertyId = propertyId || nextProperties.find(apartmentProperty)?.id || '';
      if (!propertyId && activePropertyId) setPropertyId(String(activePropertyId));
      const unitsRes = await client.get(`/units${activePropertyId ? `?property_id=${activePropertyId}` : ''}`);
      if (unitsRes.data.success) setUnits(unitsRes.data.data);
    } catch (error) {
      toast.error('Could not load house units');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [propertyId]);

  const visibleUnits = useMemo(() => units.filter((unit) => {
    const query = search.toLowerCase();
    return !query || `${unit.house_id} ${unit.property_name} ${unit.tenant_name || ''}`.toLowerCase().includes(query);
  }), [units, search]);

  const openModal = (unit = null) => {
    if (!selectedProperty || !apartmentProperty(selectedProperty)) {
      toast.error('Select an Apartment property before adding a house unit');
      return;
    }
    setEditingUnit(unit);
    setForm(unit ? {
      property_id: String(unit.property_id),
      house_id: unit.house_id || '',
      rent_amount: unit.rent_amount ?? '',
      water_billing_type: unit.water_billing_type || 'included',
      water_rate: unit.water_rate ?? '0',
      water_notes: unit.water_notes || '',
      status: unit.status || 'ready',
    } : emptyForm(selectedProperty.id));
    setModalOpen(true);
  };

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = editingUnit
        ? await client.put(`/units/${editingUnit.id}`, form)
        : await client.post('/units', form);
      if (response.data.success) {
        toast.success(response.data.pending ? 'Unit change submitted for admin approval' : editingUnit ? 'House unit updated' : 'House unit added');
        setModalOpen(false);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save house unit');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (unit) => {
    if (!window.confirm(`Delete House ID ${unit.house_id}?`)) return;
    setDeletingId(unit.id);
    try {
      const response = await client.delete(`/units/${unit.id}`);
      if (response.data.success) {
        toast.success(response.data.pending ? 'Deletion submitted for admin approval' : 'House unit deleted');
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not delete house unit');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout title="House Units">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-gray-500">Set up each apartment home before assigning a tenant.</p>
          <p className="mt-1 text-sm text-gray-400">Rent and water billing are saved per House ID.</p>
        </div>
        <button type="button" onClick={() => openModal()} disabled={!selectedProperty} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Plus size={18} /> Add House Unit
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} aria-label="Choose apartment property" className="rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary sm:w-72">
          <option value="">Choose an apartment property</option>
          {properties.filter(apartmentProperty).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search House IDs..." aria-label="Search House IDs" className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 outline-none focus:border-primary" />
        </div>
      </div>

      {!selectedProperty ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">Add or select an Apartment property to manage its House IDs.</div>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : visibleUnits.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Home size={42} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900">No house units yet</h2>
          <p className="mt-1 text-gray-500">Add the first House ID and its billing details.</p>
          <button type="button" onClick={() => openModal()} className="mt-5 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700">Add House Unit</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleUnits.map((unit) => (
            <article key={unit.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">House ID</p>
                  <h2 className="mt-1 text-xl font-bold text-gray-900">{unit.house_id}</h2>
                </div>
                <StatusBadge status={unit.status === 'ready' ? 'Ready' : 'Maintenance'} />
              </div>
              <div className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><span className="text-gray-500">Monthly rent</span><strong className="text-gray-900">KES {Number(unit.rent_amount).toLocaleString()}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-gray-500">Water</span><span className="text-right capitalize text-gray-900">{unit.water_billing_type}{unit.water_billing_type !== 'included' ? ` · KES ${Number(unit.water_rate).toLocaleString()}` : ''}</span></div>
                <div className="flex justify-between gap-3"><span className="text-gray-500">Occupancy</span><span className={unit.tenant_id ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>{unit.tenant_id ? unit.tenant_name : 'Vacant'}</span></div>
              </div>
              <div className="mt-5 flex gap-2 border-t border-gray-100 pt-4">
                <button type="button" onClick={() => openModal(unit)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"><Edit2 size={15} /> Edit</button>
                <button type="button" onClick={() => remove(unit)} disabled={deletingId === unit.id} className="rounded-lg bg-red-50 px-3 py-2 text-red-700 hover:bg-red-100 disabled:opacity-50" aria-label={`Delete ${unit.house_id}`}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingUnit ? `Edit ${editingUnit.house_id}` : 'Add House Unit'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800"><strong>{selectedProperty?.name}</strong> · Apartment unit setup</div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">House ID</label>
            <input name="house_id" required value={form.house_id} onChange={change} placeholder="e.g. A-101" className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Monthly rent (KES)</label>
              <input name="rent_amount" required type="number" min="0" step="0.01" value={form.rent_amount} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Unit status</label>
              <select name="status" value={form.status} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary">
                <option value="ready">Ready for Occupation</option>
                <option value="maintenance">Under Maintenance</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Water billing</label>
              <select name="water_billing_type" value={form.water_billing_type} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary">
                <option value="included">Included in rent</option>
                <option value="fixed">Fixed monthly amount</option>
                <option value="metered">Metered rate</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Water amount / rate (KES)</label>
              <input name="water_rate" type="number" min="0" step="0.01" value={form.water_rate} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Water billing notes</label>
            <textarea name="water_notes" rows={2} value={form.water_notes} onChange={change} placeholder="e.g. KES 15 per 1,000 litres" className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
          </div>
          {form.status === 'maintenance' && <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><Wrench size={16} /> This unit will stay out of the tenant allocation list.</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : editingUnit ? 'Save Changes' : 'Add Unit'}</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Units;

