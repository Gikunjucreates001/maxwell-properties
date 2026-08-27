import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import client from '../api/client';
import { Plus, Loader2, Filter, MessageSquare, MapPin, Calendar, Edit2, Trash2, CheckCircle, Wrench, Home } from 'lucide-react';
import toast from 'react-hot-toast';

const Issues = () => {
  const [issues, setIssues] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState(null);
  const [editingIssue, setEditingIssue] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingIssueId, setUpdatingIssueId] = useState(null);
  
  // Filters
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const [formData, setFormData] = useState({
    property_id: '',
    unit_id: '',
    title: '',
    description: '',
    priority: 'medium',
    category: 'other',
    status: 'open',
    notes: '',
    repair_cost: ''
  });

  const isApartment = (property) => property && ['apartment', 'rental'].includes(property.type);
  const selectedProperty = properties.find((property) => String(property.id) === String(formData.property_id));

  useEffect(() => {
    fetchData();
  }, [propertyFilter, statusFilter, priorityFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (propertyFilter) params.append('property_id', propertyFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);

      const [issuesRes, propsRes] = await Promise.all([
        client.get(`/issues?${params.toString()}`),
        client.get('/properties')
      ]);
      
      if (issuesRes.data.success) setIssues(issuesRes.data.data);
      if (propsRes.data.success) setProperties(propsRes.data.data);
    } catch (error) {
      toast.error('Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (issue = null) => {
    if (!issue && properties.length === 0) {
      toast.error('Add a property before reporting an issue');
      return;
    }
    setEditingIssue(issue);
    setFormData(issue ? {
      property_id: String(issue.property_id || ''),
      unit_id: issue.unit_id ? String(issue.unit_id) : '',
      title: issue.title || '',
      description: issue.description || '',
      priority: issue.priority || 'medium',
      category: issue.category || 'other',
      status: issue.status || 'open',
      notes: issue.notes || '',
      repair_cost: issue.repair_cost ?? ''
    } : {
      property_id: properties[0]?.id || '',
      unit_id: '',
      title: '',
      description: '',
      priority: 'medium',
      category: 'other',
      status: 'open',
      notes: '',
      repair_cost: ''
    });
    fetchUnits(issue?.property_id || properties[0]?.id || '');
    setIsModalOpen(true);
  };

  const fetchUnits = async (propertyId) => {
    if (!propertyId) { setUnits([]); return; }
    try {
      const response = await client.get(`/units?property_id=${propertyId}`);
      setUnits(response.data.success ? response.data.data : []);
    } catch { setUnits([]); }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'property_id') {
      setFormData(prev => ({ ...prev, property_id: value, unit_id: '' }));
      fetchUnits(value);
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = editingIssue
        ? await client.put(`/issues/${editingIssue.id}`, formData)
        : await client.post('/issues', formData);
      if (res.data.success) {
        toast.success(res.data.pending ? 'Issue change submitted for admin approval' : editingIssue ? 'Issue updated successfully' : 'Issue reported successfully');
        setIsModalOpen(false);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save issue');
    } finally {
      setIsSaving(false);
    }
  };

  const updateIssueStatus = async (id, newStatus) => {
    setUpdatingIssueId(id);
    try {
      const res = await client.put(`/issues/${id}`, { status: newStatus });
      if (res.data.success) {
        toast.success(res.data.pending ? 'Status change submitted for admin approval' : `Issue marked as ${newStatus.replace('_', ' ')}`);
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update status');
    } finally {
      setUpdatingIssueId(null);
    }
  };

  const deleteIssue = async (id) => {
    if (!window.confirm('Are you sure you want to delete this issue?')) return;
    setUpdatingIssueId(id);
    try {
      const res = await client.delete(`/issues/${id}`);
      if (res.data.success) {
        toast.success(res.data.pending ? 'Deletion submitted for admin approval' : 'Issue deleted');
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete issue');
    } finally {
      setUpdatingIssueId(null);
    }
  };

  return (
    <Layout title="Maintenance Issues">
      {/* Filters & Actions */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="flex items-center space-x-2 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2">
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
            className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 outline-none text-sm text-gray-700 w-full sm:w-32"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select 
            value={priorityFilter} 
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 outline-none text-sm text-gray-700 w-full sm:w-32"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          disabled={properties.length === 0}
          className="flex items-center justify-center space-x-2 bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium w-full md:w-auto shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={18} />
          <span>Report Issue</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : issues.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No issues found</h3>
          <p className="text-gray-500">Everything is running smoothly! No issues match your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {issues.map((issue) => (
            <div key={issue.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors">
              <div 
                className="p-4 sm:p-6 cursor-pointer"
                onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setExpandedIssue(expandedIssue === issue.id ? null : issue.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={expandedIssue === issue.id}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{issue.title}</h3>
                      <StatusBadge status={issue.status} />
                      <StatusBadge status={issue.priority} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                      <span className="flex items-center"><MapPin size={14} className="mr-1" /> {issue.property_name}</span>
                      {issue.house_id && <span className="flex items-center"><Home size={14} className="mr-1" /> House {issue.house_id}</span>}
                      <span className="flex items-center"><Calendar size={14} className="mr-1" /> {new Date(issue.created_at).toLocaleDateString()}</span>
                      <span className="capitalize px-2 py-0.5 bg-gray-100 rounded-full text-xs">{issue.category}</span>
                    </div>
                  </div>
                  
                  {/* Status quick actions - prevent row expansion when clicking these */}
                  <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                    {issue.status === 'open' && (
                      <button disabled={updatingIssueId === issue.id} onClick={() => updateIssueStatus(issue.id, 'in_progress')} className="px-3 py-1.5 text-sm bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md font-medium transition-colors disabled:opacity-50">
                        Start Work
                      </button>
                    )}
                    {(issue.status === 'open' || issue.status === 'in_progress') && (
                      <button disabled={updatingIssueId === issue.id} onClick={() => updateIssueStatus(issue.id, 'resolved')} className="px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-md font-medium transition-colors flex items-center disabled:opacity-50">
                        <CheckCircle size={14} className="mr-1" /> Resolve
                      </button>
                    )}
                    {issue.status === 'resolved' && (
                      <button disabled={updatingIssueId === issue.id} onClick={() => updateIssueStatus(issue.id, 'closed')} className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-medium transition-colors disabled:opacity-50">
                        Close
                      </button>
                    )}
                    <button onClick={() => handleOpenModal(issue)} aria-label={`Edit ${issue.title}`} title="Edit issue" className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md">
                      <Edit2 size={16} />
                    </button>
                    <button disabled={updatingIssueId === issue.id} onClick={() => deleteIssue(issue.id)} aria-label={`Delete ${issue.title}`} title="Delete issue" className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-md disabled:opacity-50">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {expandedIssue === issue.id && (
                <div className="px-4 sm:px-6 pb-6 pt-2 border-t border-gray-100 bg-gray-50">
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-1">Description</h4>
                    <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">{issue.description || 'No description provided.'}</p>
                  </div>
                  {issue.notes && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-1">Admin Notes</h4>
                      <p className="text-sm text-gray-700 bg-amber-50 p-3 rounded-lg border border-amber-100">{issue.notes}</p>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-700">
                    <span className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 font-medium text-red-700">Repair cost: KES {Number(issue.repair_cost || 0).toLocaleString()}</span>
                    {issue.expense_id && <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700">Logged as a property expense</span>}
                  </div>
                  {issue.resolved_date && <p className="mt-4 text-xs text-gray-500">Resolved on {new Date(issue.resolved_date).toLocaleDateString()}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingIssue ? 'Edit Issue' : 'Report New Issue'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
            <select
              name="property_id"
              required
              value={formData.property_id}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
            >
              <option value="" disabled>Select Property</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {isApartment(selectedProperty) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">House ID affected</label>
              <select name="unit_id" required value={formData.unit_id} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white">
                <option value="" disabled>Select the affected House ID</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.house_id}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title / Brief Issue</label>
            <input 
              type="text" name="title" required value={formData.title} onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
              placeholder="e.g. Leaking faucet in kitchen"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Repair cost (KES)</label>
            <input type="number" name="repair_cost" required min="0" step="0.01" value={formData.repair_cost} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none" placeholder="Enter 0 if no cost has been incurred yet" />
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Wrench size={13} /> This amount is automatically added to Expenses and deducted from net income.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                name="category" value={formData.category} onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="structural">Structural</option>
                <option value="appliance">Appliance</option>
                <option value="pest">Pest Control</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                name="priority" value={formData.priority} onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          {editingIssue && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select name="status" value={formData.status} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white">
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Detailed Description</label>
            <textarea 
              name="description" required rows={3} value={formData.description} onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none resize-none"
              placeholder="Provide more details about the issue..."
            />
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSaving} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 bg-primary text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50">
              {isSaving ? 'Saving…' : editingIssue ? 'Update Issue' : 'Report Issue'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Issues;

