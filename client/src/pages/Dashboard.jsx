import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import StatCard from '../components/StatCard';
import client from '../api/client';
import { Building2, Banknote, Users, AlertTriangle, Loader2, RefreshCw, WalletCards, ClipboardCheck, Home, Receipt, MessageSquare } from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await client.get('/properties/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (error) {
      setError(true);
      toast.error('Failed to load dashboard statistics');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Dashboard">
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-gray-900">Dashboard unavailable</h2>
            <p className="mt-2 text-gray-600">We couldn’t load your latest figures. Check your connection and try again.</p>
            <button type="button" onClick={fetchStats} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700">
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard">
      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard 
          title="Total Properties" 
          value={stats?.total_properties || 0} 
          icon={Building2} 
          color="primary"
        />
        <StatCard 
          title="Monthly Expected Income" 
          value={`KES ${Number(stats?.monthly_expected_income || 0).toLocaleString()}`} 
          icon={Banknote} 
          color="success"
        />
        <StatCard 
          title="Active Tenants" 
          value={stats?.total_tenants || 0} 
          icon={Users} 
          color="secondary"
        />
        <StatCard 
          title="Open Issues" 
          value={stats?.open_issues || 0} 
          icon={AlertTriangle} 
          color="danger"
        />
        <StatCard
          title="Net Income"
          value={`KES ${Number(stats?.net_income || 0).toLocaleString()}`}
          icon={WalletCards}
          color="accent"
        />
        <StatCard
          title="Expenses"
          value={`KES ${Number(stats?.total_expenses || 0).toLocaleString()}`}
          icon={Banknote}
          color="danger"
        />
        {user?.role === 'admin' && (
          <StatCard
            title="Pending Approvals"
            value={stats?.pending_approvals || 0}
            icon={ClipboardCheck}
            color="accent"
          />
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="xl:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Revenue overview</h2>
            <p className="text-sm text-gray-500 mt-1">Paid payments over the last six months; expenses are reflected in Net Income.</p>
            </div>
            <button type="button" onClick={fetchStats} className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-blue-50" aria-label="Refresh dashboard" title="Refresh dashboard">
              <RefreshCw size={18} />
            </button>
          </div>
          <div className="h-80 w-full">
            {stats?.revenue_by_month && stats.revenue_by_month.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.revenue_by_month} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e40af" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `KES ${(value/1000)}k`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <Tooltip 
                    formatter={(value) => [`KES ${Number(value).toLocaleString()}`, 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#1e40af" fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                No revenue data available
              </div>
            )}
          </div>
        </div>

        {/* Side Column */}
        <div className="space-y-8">
          {/* Recent Payments */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Payments</h2>
              <button onClick={() => navigate('/payments')} className="text-sm text-primary hover:underline">View All</button>
            </div>
            <div className="space-y-4">
              {stats?.recent_payments && stats.recent_payments.length > 0 ? (
                  stats.recent_payments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-50">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{payment.tenant_name}</p>
                      <p className="text-xs text-gray-500">{payment.property_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm text-gray-900">KES {Number(payment.amount).toLocaleString()}</p>
                      <StatusBadge status={payment.status} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No recent payments</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate('/properties')} className="p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <Building2 size={20} />
                <span>Add Property</span>
              </button>
              <button onClick={() => navigate('/tenants')} className="p-3 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <Users size={20} />
                <span>Add Tenant</span>
              </button>
              <button onClick={() => navigate('/payments')} className="p-3 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <Banknote size={20} />
                <span>Record Payment</span>
              </button>
              <button onClick={() => navigate('/issues')} className="p-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <AlertTriangle size={20} />
                <span>Report Issue</span>
              </button>
              <button onClick={() => navigate('/units')} className="p-3 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <Home size={20} />
                <span>House Units</span>
              </button>
              <button onClick={() => navigate('/expenses')} className="p-3 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <Receipt size={20} />
                <span>Log Expense</span>
              </button>
              <button onClick={() => navigate('/notifications')} className="p-3 bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2">
                <MessageSquare size={20} />
                <span>Send Message</span>
              </button>
              {user?.role === 'admin' && <button onClick={() => navigate('/approvals')} className="p-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors font-medium text-sm flex flex-col items-center justify-center gap-2"><ClipboardCheck size={20} /><span>Review Approvals</span></button>}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;

