import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import client from '../api/client';
import { Banknote, Edit2, Filter, Loader2, Plus, Receipt, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const categories = [
  ['repair', 'Unit repair'],
  ['septic', 'Septic exhaustion'],
  ['manager_salary', 'Manager payment / salary'],
  ['caretaker', 'Caretaker payment'],
  ['cleaner', 'Cleaner payment'],
  ['custom', 'Custom maintenance / operating cost'],
];
const categoryLabels = Object.fromEntries(categories);
const emptyForm = (propertyId = '') => ({ property_id: String(propertyId || ''), unit_id: '', category: 'custom', description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), notes: '' });
const apartmentProperty = (property) => property && ['apartment', 'rental'].includes(property.type);

const Expenses = () => {
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const fetchData = async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (propertyFilter) query.set('property_id', propertyFilter);
      if (categoryFilter) query.set('category', categoryFilter);
      const [propertiesRes, expensesRes] = await Promise.all([client.get('/properties'), client.get(`/expenses?${query.toString()}`)]);
      if (propertiesRes.data.success) setProperties(propertiesRes.data.data);
      if (expensesRes.data.success) setExpenses(expensesRes.data.data);
    } catch (error) {
      toast.error('Could not load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [propertyFilter, categoryFilter]);

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0), [expenses]);

  const loadUnits = async (id) => {
    if (!id) { setUnits([]); return; }
    try {
      const response = await client.get(`/units?property_id=${id}`);
      setUnits(response.data.success ? response.data.data : []);
    } catch { setUnits([]); }
  };

  const openModal = async (expense = null) => {
    const propertyId = expense?.property_id || properties[0]?.id || '';
    setEditingExpense(expense);
    setForm(expense ? { property_id: String(expense.property_id), unit_id: expense.unit_id ? String(expense.unit_id) : '', category: expense.category || 'custom', description: expense.description || '', amount: expense.amount || '', expense_date: expense.expense_date || new Date().toISOString().slice(0, 10), notes: expense.notes || '' } : emptyForm(propertyId));
    await loadUnits(propertyId);
    setModalOpen(true);
  };

  const change = async (event) => {
    const { name, value } = event.target;
    if (name === 'category') {
      setForm((current) => ({ ...current, category: value, description: value === 'custom' ? '' : categoryLabels[value] }));
      return;
    }
    setForm((current) => ({ ...current, [name]: value, ...(name === 'property_id' ? { unit_id: '' } : {}) }));
    if (name === 'property_id') await loadUnits(value);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, description: form.category === 'custom' ? form.description : (form.description || categoryLabels[form.category]) };
      const response = editingExpense ? await client.put(`/expenses/${editingExpense.id}`, payload) : await client.post('/expenses', payload);
      if (response.data.success) {
        toast.success(response.data.pending ? 'Expense submitted for admin approval' : editingExpense ? 'Expense updated' : 'Expense logged');
        setModalOpen(false);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save expense');
    } finally { setSaving(false); }
  };

  const remove = async (expense) => {
    if (!window.confirm(`Delete this ${expense.category.replace('_', ' ')} expense?`)) return;
    setDeletingId(expense.id);
    try {
      const response = await client.delete(`/expenses/${expense.id}`);
      if (response.data.success) { toast.success(response.data.pending ? 'Deletion submitted for admin approval' : 'Expense deleted'); fetchData(); }
    } catch (error) { toast.error(error.response?.data?.error || 'Could not delete expense'); }
    finally { setDeletingId(null); }
  };

  return (
    <Layout title="Expenses">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-gray-500">Every repair and operating cost is deducted from net income.</p><p className="mt-1 text-sm text-gray-400">Unit repairs, septic, staff payments and custom costs are all tracked here.</p></div>
        <button type="button" onClick={() => openModal()} disabled={!properties.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Plus size={18} /> Log Expense</button>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2"><StatCard title="Visible deductions" value={`KES ${total.toLocaleString()}`} icon={Receipt} color="danger" /><StatCard title="Expense entries" value={expenses.length} icon={Banknote} color="secondary" /></div>
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row">
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2"><Filter size={16} className="text-gray-400" /><select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)} className="bg-transparent text-sm outline-none"><option value="">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none"><option value="">All expense categories</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
      {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : expenses.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm"><Receipt size={42} className="mx-auto mb-4 text-gray-300" /><h2 className="text-lg font-semibold text-gray-900">No expenses recorded</h2><p className="mt-1 text-gray-500">Log the first cost to keep net income accurate.</p></div> : <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{['Date', 'Description', 'Property / Unit', 'Category', 'Amount', 'Actions'].map((heading) => <th key={heading} className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{expenses.map((expense) => <tr key={expense.id} className="hover:bg-gray-50"><td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</td><td className="px-5 py-4"><p className="font-medium text-gray-900">{expense.description}</p>{expense.notes && <p className="mt-1 max-w-xs text-xs text-gray-500">{expense.notes}</p>}</td><td className="px-5 py-4 text-sm text-gray-600"><div>{expense.property_name}</div>{expense.house_id && <div className="text-xs text-primary">House {expense.house_id}</div>}</td><td className="whitespace-nowrap px-5 py-4 text-sm capitalize text-gray-600">{expense.category.replace('_', ' ')}</td><td className="whitespace-nowrap px-5 py-4 font-semibold text-red-700">− KES {Number(expense.amount).toLocaleString()}</td><td className="whitespace-nowrap px-5 py-4 text-right"><button type="button" onClick={() => openModal(expense)} className="mr-2 rounded-md bg-blue-50 p-2 text-blue-700 hover:bg-blue-100" aria-label="Edit expense"><Edit2 size={16} /></button><button type="button" onClick={() => remove(expense)} disabled={deletingId === expense.id} className="rounded-md bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-50" aria-label="Delete expense"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div></div>}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingExpense ? 'Edit Expense' : 'Log Expense'}>
        <form onSubmit={submit} className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Property</label><select name="property_id" required value={form.property_id} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary"><option value="" disabled>Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
          {apartmentProperty(properties.find((property) => String(property.id) === String(form.property_id))) && <div><label className="mb-1 block text-sm font-medium text-gray-700">House ID (optional)</label><select name="unit_id" value={form.unit_id} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary"><option value="">General property expense</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.house_id}</option>)}</select></div>}
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Category</label><select name="category" required value={form.category} onChange={change} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-primary">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {form.category === 'custom' ? <div><label className="mb-1 block text-sm font-medium text-gray-700">What was paid for?</label><input name="description" required value={form.description} onChange={change} placeholder="e.g. Replace corridor lights" className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div> : <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">This will be recorded as <span className="font-medium text-gray-900">{categoryLabels[form.category]}</span>.</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium text-gray-700">Amount (KES)</label><input name="amount" required type="number" min="0.01" step="0.01" value={form.amount} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div><div><label className="mb-1 block text-sm font-medium text-gray-700">Date</label><input name="expense_date" required type="date" value={form.expense_date} onChange={change} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div></div>
          <div><label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label><textarea name="notes" rows={2} value={form.notes} onChange={change} className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" /></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : editingExpense ? 'Save Changes' : 'Log Expense'}</button></div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Expenses;

