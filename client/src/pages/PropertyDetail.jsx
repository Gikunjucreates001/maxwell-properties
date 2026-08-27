import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import client from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { Loader2, ArrowLeft, MapPin, Building2, Banknote, Users, AlertTriangle, Home, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';

const PropertyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tenants'); // tenants, payments, issues

  useEffect(() => {
    fetchPropertyDetails();
  }, [id]);

  const fetchPropertyDetails = async () => {
    try {
      setLoading(true);
      const res = await client.get(`/properties/${id}`);
      if (res.data.success) {
        setProperty(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to fetch property details');
      navigate('/properties');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Property Details">
        <div className="flex justify-center items-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!property) return null;

  const tabs = [
    { id: 'tenants', name: 'Tenants', icon: Users, count: property.tenants?.length || 0 },
    { id: 'payments', name: 'Payments', icon: Banknote, count: property.recent_payments?.length || 0 },
    { id: 'issues', name: 'Issues', icon: AlertTriangle, count: property.open_issues?.length || 0 },
    ...(isApartment(property) ? [{ id: 'units', name: 'House Units', icon: Home, count: property.units?.length || 0 }] : []),
    { id: 'expenses', name: 'Expenses', icon: Receipt, count: property.expenses?.length || 0 },
  ];

  function isApartment(currentProperty) {
    return ['apartment', 'rental'].includes(currentProperty?.type);
  }

  return (
    <Layout title="Property Details">
      <div className="mb-6">
        <button 
          onClick={() => navigate('/properties')}
          className="flex items-center text-sm font-medium text-gray-500 hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} className="mr-1" />
          Back to Properties
        </button>

        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Building2 size={120} />
          </div>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center relative z-10 gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
                <StatusBadge status={property.status || 'active'} />
                <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full capitalize">
                  {property.type === 'rental' ? 'Apartment' : property.type}
                </span>
              </div>
              <div className="flex items-center text-gray-500">
                <MapPin size={16} className="mr-1" />
                <span>{property.location}</span>
                {property.address && <span className="mx-2">•</span>}
                {property.address && <span>{property.address}</span>}
              </div>
            </div>
            
             <div className="grid grid-cols-1 gap-4 rounded-lg border border-blue-100 bg-blue-50 p-4 sm:grid-cols-3">
               <div><p className="text-xs font-medium text-blue-600 mb-1">Monthly rent</p><p className="text-lg font-bold text-blue-900">KES {Number(property.monthly_rent || 0).toLocaleString()}</p></div>
               <div><p className="text-xs font-medium text-blue-600 mb-1">Expenses</p><p className="text-lg font-bold text-red-700">KES {Number(property.total_expenses || 0).toLocaleString()}</p></div>
               <div><p className="text-xs font-medium text-blue-600 mb-1">Net income</p><p className={`text-lg font-bold ${Number(property.net_income || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>KES {Number(property.net_income || 0).toLocaleString()}</p></div>
             </div>
          </div>
          {property.description && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-gray-600 text-sm">{property.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2
                ${activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon size={18} />
              <span>{tab.name}</span>
              <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {activeTab === 'tenants' && (
          <div>
               <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Tenants</h3>
              <button onClick={() => navigate('/tenants')} className="text-sm text-primary hover:underline font-medium">Manage All Tenants</button>
            </div>
            {property.tenants?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {property.tenants.map(tenant => (
                      <tr key={tenant.id} className="hover:bg-gray-50">
                         <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tenant.name}{tenant.house_id && <span className="ml-2 text-xs font-normal text-primary">· House {tenant.house_id}</span>}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{tenant.email}</div>
                          <div>{tenant.phone}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">KES {Number(tenant.rent_amount).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={tenant.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No tenants assigned to this property.</div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
             <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Payment History</h3>
              <button onClick={() => navigate('/payments')} className="text-sm text-primary hover:underline font-medium">Manage All Payments</button>
            </div>
            {property.recent_payments?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {property.recent_payments.map(payment => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(payment.payment_date || payment.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{payment.tenant_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">KES {Number(payment.amount).toLocaleString()} <span className="ml-1 text-xs font-normal capitalize text-gray-500">({payment.payment_type || 'rent'})</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{payment.method}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={payment.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No payment history found for this property.</div>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Reported Issues</h3>
              <button onClick={() => navigate('/issues')} className="text-sm text-primary hover:underline font-medium">Manage All Issues</button>
            </div>
            {property.open_issues?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {property.open_issues.map(issue => (
                      <tr key={issue.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{issue.title}{issue.house_id && <span className="ml-2 text-xs font-normal text-primary">· House {issue.house_id}</span>}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{issue.category}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={issue.priority} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={issue.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(issue.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">No issues reported for this property.</div>
            )}
          </div>
        )}

        {activeTab === 'units' && isApartment(property) && (
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 p-4"><h3 className="text-lg font-medium">House Units</h3><button onClick={() => navigate('/units')} className="text-sm font-medium text-primary hover:underline">Manage House Units</button></div>
            {property.units?.length ? <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">{property.units.map((unit) => <div key={unit.id} className="rounded-lg border border-gray-200 p-4"><div className="flex items-start justify-between"><h4 className="text-lg font-semibold text-gray-900">{unit.house_id}</h4><StatusBadge status={unit.status === 'ready' ? 'Ready' : 'Maintenance'} /></div><p className="mt-3 text-sm text-gray-600">Rent: <strong className="text-gray-900">KES {Number(unit.rent_amount).toLocaleString()}</strong></p><p className="text-sm text-gray-600">Water: <span className="capitalize">{unit.water_billing_type}</span>{unit.water_billing_type !== 'included' && ` · KES ${Number(unit.water_rate).toLocaleString()}`}</p><p className="mt-2 text-sm font-medium text-gray-700">{unit.tenant_id ? `Occupied by ${unit.tenant_name}` : 'Vacant'}</p></div>)}</div> : <div className="p-8 text-center text-gray-500">No House Units configured for this property.</div>}
          </div>
        )}

        {activeTab === 'expenses' && (
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 p-4"><h3 className="text-lg font-medium">Property Expenses</h3><button onClick={() => navigate('/expenses')} className="text-sm font-medium text-primary hover:underline">Manage Expenses</button></div>
            {property.expenses?.length ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Description</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th><th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Deduction</th></tr></thead><tbody className="divide-y divide-gray-200">{property.expenses.map((expense) => <tr key={expense.id}><td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</td><td className="px-6 py-4 text-sm text-gray-900">{expense.description}{expense.unit_id && <span className="ml-2 text-xs text-primary">· Unit expense</span>}</td><td className="px-6 py-4 text-sm capitalize text-gray-600">{expense.category.replace('_', ' ')}</td><td className="whitespace-nowrap px-6 py-4 font-semibold text-red-700">− KES {Number(expense.amount).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="p-8 text-center text-gray-500">No expenses recorded for this property.</div>}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PropertyDetail;

