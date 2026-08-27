import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { Plus, Edit, Trash2, Loader2, Filter, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]); // All tenants for the form
  const [filteredTenants, setFilteredTenants] = useState([]); // Tenants filtered by selected property
  
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  
  // Filters
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formData, setFormData] = useState({
    property_id: '',
    tenant_id: '',
    payment_type: 'rent',
    amount: '',
    status: 'paid',
    method: 'mpesa',
    payment_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, [propertyFilter, statusFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (propertyFilter) params.append('property_id', propertyFilter);
      if (statusFilter) params.append('status', statusFilter);

      const [paymentsRes, summaryRes, propsRes, tenantsRes] = await Promise.all([
        client.get(`/payments?${params.toString()}`),
        client.get('/payments/summary'),
        client.get('/properties'),
        client.get('/tenants') // Pre-fetch all to filter later in form
      ]);
      
      if (paymentsRes.data.success) setPayments(paymentsRes.data.data);
      if (summaryRes.data.success) setSummary(summaryRes.data.data);
      if (propsRes.data.success) setProperties(propsRes.data.data);
      if (tenantsRes.data.success) setTenants(tenantsRes.data.data);
    } catch (error) {
      toast.error('Failed to fetch payments data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (payment = null) => {
    if (!payment && properties.length === 0) {
      toast.error('Add a property before recording a payment');
      return;
    }
    if (!payment && tenants.length === 0) {
      toast.error('Add a tenant before recording a payment');
      return;
    }

    setEditingPayment(payment);
    setFormData(payment ? {
      property_id: String(payment.property_id || ''),
      tenant_id: String(payment.tenant_id || ''),
      payment_type: payment.payment_type || 'rent',
      amount: payment.amount || '',
      status: payment.status || 'paid',
      method: payment.method || 'mpesa',
      payment_date: payment.payment_date ? payment.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
      due_date: payment.due_date ? payment.due_date.split('T')[0] : '',
      notes: payment.notes || ''
    } : {
      property_id: '',
      tenant_id: '',
      payment_type: 'rent',
      amount: '',
      status: 'paid',
      method: 'mpesa',
      payment_date: new Date().toISOString().split('T')[0],
      due_date: '',
      notes: ''
    });
    setFilteredTenants(payment ? tenants.filter(t => String(t.property_id) === String(payment.property_id)) : []);
    setIsModalOpen(true);
  };

  const handlePropertyChange = (e) => {
    const propId = e.target.value;
    setFormData(prev => ({ ...prev, property_id: propId, tenant_id: '' }));
    
    // Filter tenants belonging to this property
    const matchingTenants = tenants.filter(t => String(t.property_id) === String(propId));
    setFilteredTenants(matchingTenants);
    
    // Auto-fill amount if tenant selected, but here we just wait for tenant selection
  };

  const handleTenantChange = (e) => {
    const tenantId = e.target.value;
    const tenant = tenants.find(t => String(t.id) === String(tenantId));
    const paymentAmount = formData.payment_type === 'deposit'
      ? tenant?.deposit_amount
      : formData.payment_type === 'water'
        ? (tenant?.water_billing_type === 'included' ? 0 : tenant?.water_rate)
        : tenant?.rent_amount;
    setFormData(prev => ({ 
      ...prev, 
      tenant_id: tenantId,
      amount: tenant ? (paymentAmount ?? '') : prev.amount 
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'payment_type') {
      const tenant = tenants.find(t => String(t.id) === String(formData.tenant_id));
      const paymentAmount = value === 'deposit'
        ? tenant?.deposit_amount
        : value === 'water'
          ? (tenant?.water_billing_type === 'included' ? 0 : tenant?.water_rate)
          : tenant?.rent_amount;
      setFormData(prev => ({ ...prev, payment_type: value, amount: tenant ? (paymentAmount ?? '') : prev.amount }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = editingPayment
        ? await client.put(`/payments/${editingPayment.id}`, formData)
        : await client.post('/payments', formData);
      if (res.data.success) {
        toast.success(res.data.pending ? 'Payment change submitted for admin approval' : editingPayment ? 'Payment updated successfully' : 'Payment recorded successfully');
        setIsModalOpen(false);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save payment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      setDeletingId(id);
      try {
        const res = await client.delete(`/payments/${id}`);
        if (res.data.success) {
          toast.success(res.data.pending ? 'Payment deletion submitted for admin approval' : 'Payment deleted');
          fetchData();
        }
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to delete payment');
      } finally {
        setDeletingId(null);
      }
    }
  };

  return (
    <Layout title="Payments">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          title="Total Collected" 
          value={`KES ${Number(summary?.total_collected || 0).toLocaleString()}`} 
          icon={Banknote} 
          color="success"
        />
        <StatCard 
          title="Total Pending" 
          value={`KES ${Number(summary?.total_pending || 0).toLocaleString()}`} 
          icon={Banknote} 
          color="secondary"
        />
        <StatCard 
          title="Total Overdue" 
          value={`KES ${Number(summary?.total_overdue || 0).toLocaleString()}`} 
          icon={Banknote} 
          color="danger"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Filters & Actions */}
        <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-3 py-2">
              <Filter size={16} className="text-gray-400" />
              <select 
                value={propertyFilter} 
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="bg-transparent outline-none text-sm text-gray-700 w-full sm:w-40"
              >
                <option value="">All Properties</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none text-sm text-gray-700 w-full sm:w-32"
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            disabled={properties.length === 0 || tenants.length === 0}
            className="flex items-center justify-center space-x-2 bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium w-full md:w-auto disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={18} />
            <span>Record Payment</span>
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(payment.payment_date || payment.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payment.tenant_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm capitalize text-gray-600">
                      {payment.payment_type || 'rent'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {payment.property_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      KES {Number(payment.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {payment.method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => handleOpenModal(payment)} aria-label="Edit payment" title="Edit payment" className="text-blue-600 hover:text-blue-900 p-1 rounded-md hover:bg-blue-50 transition-colors">
                        <Edit size={17} />
                      </button>
                      <button onClick={() => handleDelete(payment.id)} disabled={deletingId === payment.id} aria-label="Delete payment" title="Delete payment" className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                      No payment records found matching the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingPayment ? 'Edit Payment' : 'Record New Payment'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select
              name="property_id"
              required
              value={formData.property_id}
              onChange={handlePropertyChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
            >
              <option value="" disabled>Select Property</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment type</label>
            <select name="payment_type" value={formData.payment_type} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white">
              <option value="deposit">Deposit</option>
              <option value="rent">Rent</option>
              <option value="water">Water</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <select
              name="tenant_id"
              required
              disabled={!formData.property_id}
              value={formData.tenant_id}
              onChange={handleTenantChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white disabled:bg-gray-100"
            >
              <option value="" disabled>Select Tenant</option>
              {filteredTenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
              <input 
                type="number" name="amount" required value={formData.amount} onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
              <select
                name="method" value={formData.method} onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                name="status" value={formData.status} onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <input 
                type="date" name="payment_date" required value={formData.payment_date} onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
            <input type="date" name="due_date" value={formData.due_date} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea 
              name="notes" rows={2} value={formData.notes} onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none resize-none"
              placeholder="Transaction ID, reference, etc."
            />
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-primary text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50">
              {isSaving ? 'Saving…' : editingPayment ? 'Update Payment' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Payments;

