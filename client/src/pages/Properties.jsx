import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import PropertyCard from '../components/PropertyCard';
import Modal from '../components/Modal';
import client from '../api/client';
import { Plus, Loader2, Building2, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

const Properties = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'apartment',
    location: '',
    address: '',
    description: '',
    monthly_rent: '',
    status: 'active',
    rules: '',
    manager_name: '',
    manager_phone: '',
    manager_email: '',
    caretaker_name: '',
    caretaker_phone: '',
    caretaker_email: ''
  });

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const res = await client.get('/properties');
      if (res.data.success) {
        setProperties(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (property = null) => {
    if (property) {
      setEditingProperty(property);
      setFormData({
        name: property.name,
        type: property.type || 'apartment',
        location: property.location || '',
        address: property.address || '',
        description: property.description || '',
         monthly_rent: property.monthly_rent || '',
         status: property.status || 'active',
         rules: property.rules || '',
         manager_name: property.manager_name || '',
         manager_phone: property.manager_phone || '',
         manager_email: property.manager_email || '',
         caretaker_name: property.caretaker_name || '',
         caretaker_phone: property.caretaker_phone || '',
         caretaker_email: property.caretaker_email || ''
      });
    } else {
      setEditingProperty(null);
      setFormData({
        name: '',
        type: 'apartment',
        location: '',
        address: '',
        description: '',
         monthly_rent: '',
         status: 'active',
         rules: '',
         manager_name: '',
         manager_phone: '',
         manager_email: '',
         caretaker_name: '',
         caretaker_phone: '',
         caretaker_email: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingProperty) {
        const res = await client.put(`/properties/${editingProperty.id}`, formData);
        if (res.data.success) toast.success(res.data.pending ? 'Property change submitted for admin approval' : 'Property updated successfully');
      } else {
        const res = await client.post('/properties', formData);
        if (res.data.success) toast.success('Property added successfully');
      }
      setIsModalOpen(false);
      fetchProperties();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save property');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this property?')) {
      setDeletingId(id);
      try {
        const res = await client.delete(`/properties/${id}`);
        if (res.data.success) {
          toast.success(res.data.pending ? 'Deletion submitted for admin approval' : 'Property deleted');
          fetchProperties();
        }
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to delete property');
      } finally {
        setDeletingId(null);
      }
    }
  };

  const visibleProperties = properties.filter((property) => {
    const matchesSearch = `${property.name} ${property.location || ''}`.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !typeFilter || property.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <Layout title="Properties">
      <div className="mb-6 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <p className="text-gray-500">Manage your real estate portfolio</p>
          <p className="text-sm text-gray-400 mt-1">{properties.length} {properties.length === 1 ? 'property' : 'properties'} in your portfolio</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center space-x-2 bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium w-full lg:w-auto"
        >
          <Plus size={18} />
          <span>Add Property</span>
        </button>
      </div>

      {!loading && properties.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-2.5 text-gray-400" aria-hidden="true" />
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by property or area..." aria-label="Search properties" className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 outline-none focus:border-primary" />
          </div>
          <div className="relative sm:w-52">
            <Filter size={16} className="absolute left-3 top-3 text-gray-400" aria-hidden="true" />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter properties by type" className="w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 outline-none focus:border-primary">
              <option value="">All property types</option>
              <option value="rental">Legacy rental</option>
              <option value="airbnb">Airbnb</option>
              <option value="apartment">Apartment</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Building2 size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No properties found</h3>
          <p className="text-gray-500 mb-6">Get started by adding your first property.</p>
          <button 
            onClick={() => handleOpenModal()}
            className="inline-flex items-center space-x-2 bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm font-medium"
          >
            <Plus size={18} />
            <span>Add Property</span>
          </button>
        </div>
      ) : visibleProperties.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Search size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No matching properties</h3>
          <p className="text-gray-500">Try a different search term or clear the type filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visibleProperties.map(property => (
            <PropertyCard 
              key={property.id} 
              property={property} 
              onEdit={handleOpenModal}
              onDelete={(id) => handleDelete(id)}
              deleting={deletingId === property.id}
            />
          ))}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingProperty ? "Edit Property" : "Add New Property"}
      >
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property Name</label>
            <input 
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
              placeholder="e.g. Sunset Apartments"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white"
              >
                <option value="apartment">Apartment</option>
                <option value="airbnb">Airbnb</option>
                {formData.type === 'rental' && <option value="rental">Legacy rental</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (KES)</label>
              <input 
                type="number"
                name="monthly_rent"
                required={formData.type === 'airbnb'}
                min="0"
                value={formData.monthly_rent}
                onChange={handleInputChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
                placeholder={formData.type === 'airbnb' ? 'e.g. 45000' : 'Set rent on each House Unit'}
              />
            </div>
          </div>
          <div>
            <label htmlFor="property-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select id="property-status" name="status" value={formData.status} onChange={handleInputChange} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property rules (used in onboarding email)</label>
            <textarea name="rules" rows={3} value={formData.rules} onChange={handleInputChange} placeholder="Quiet hours, visitor policy, payment dates, parking rules..." className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none resize-none" />
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">House contacts</h3>
            <p className="mt-1 text-xs text-gray-500">These details are included in tenant onboarding messages.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input name="manager_name" value={formData.manager_name} onChange={handleInputChange} placeholder="Manager name" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              <input name="manager_phone" value={formData.manager_phone} onChange={handleInputChange} placeholder="Manager phone" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              <input name="manager_email" type="email" value={formData.manager_email} onChange={handleInputChange} placeholder="Manager email" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input name="caretaker_name" value={formData.caretaker_name} onChange={handleInputChange} placeholder="Caretaker name" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              <input name="caretaker_phone" value={formData.caretaker_phone} onChange={handleInputChange} placeholder="Caretaker phone" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              <input name="caretaker_email" type="email" value={formData.caretaker_email} onChange={handleInputChange} placeholder="Caretaker email" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location / Area</label>
            <input 
              type="text"
              name="location"
              required
              value={formData.location}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
              placeholder="e.g. Westlands, Nairobi"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
            <textarea 
              name="address"
              rows={2}
              value={formData.address}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none resize-none"
              placeholder="Detailed physical address..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <textarea 
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleInputChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none resize-none"
            />
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button 
              type="button" 
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-primary text-white hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              {isSaving ? 'Saving…' : editingProperty ? 'Update Property' : 'Save Property'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
};

export default Properties;

