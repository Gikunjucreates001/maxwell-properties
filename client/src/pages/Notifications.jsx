import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import client from '../api/client';
import { Loader2, Mail, MessageSquare, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const Notifications = () => {
  const [message, setMessage] = useState('');
  const [jobs, setJobs] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState('');

  const fetchJobs = async () => {
    try {
      const [jobsResponse, propertiesResponse] = await Promise.all([client.get('/notifications/jobs'), client.get('/properties')]);
      if (jobsResponse.data.success) setJobs(jobsResponse.data.data);
      if (propertiesResponse.data.success) setProperties(propertiesResponse.data.data);
    }
    catch { toast.error('Could not load message history'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchJobs(); }, []);

  const send = async (kind) => {
    if (!message.trim()) { toast.error('Write a message first'); return; }
    setSending(kind);
    try {
      const response = await client.post(`/notifications/${kind}`, { message });
      if (response.data.success) { toast.success(response.data.message); setMessage(''); fetchJobs(); }
    } catch (error) { toast.error(error.response?.data?.error || 'Could not queue messages'); }
    finally { setSending(''); }
  };

  const hasApartment = properties.some((property) => ['apartment', 'rental'].includes(property.type));

  return (
    <Layout title="Messages">
      <div className="mb-6"><p className="text-gray-500">Send reminders by email and SMS from one place.</p><p className="mt-1 text-sm text-gray-400">Receipts and onboarding messages are created automatically when payments are recorded.</p></div>
       {hasApartment ? <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Send a tenant message</h2><p className="mt-1 text-sm text-gray-500">Choose overdue tenants only, or remind all active tenants before month-end.</p><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} placeholder="Example: Hello, this is a reminder that rent is due by the 5th. Please send your payment confirmation after paying." className="mt-5 w-full resize-none rounded-lg border border-gray-300 px-3 py-3 outline-none focus:border-primary" /><div className="mt-4 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => send('overdue')} disabled={Boolean(sending)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"><Send size={16} />{sending === 'overdue' ? 'Queuing…' : 'Send to overdue tenants'}</button><button type="button" onClick={() => send('month-end')} disabled={Boolean(sending)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Send size={16} />{sending === 'month-end' ? 'Queuing…' : 'Send to active tenants'}</button></div></div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-6"><h2 className="text-lg font-semibold text-blue-950">Automatic messages</h2><div className="mt-4 space-y-4 text-sm text-blue-900"><p className="flex gap-3"><Mail size={18} className="mt-0.5 shrink-0" />Payment receipts are queued instantly after a payment is marked paid.</p><p className="flex gap-3"><MessageSquare size={18} className="mt-0.5 shrink-0" />After deposit and first rent are paid, the tenant receives onboarding details, contacts and unit billing.</p><p className="flex gap-3"><Send size={18} className="mt-0.5 shrink-0" />Scheduled month-end reminders can be enabled in the server settings.</p></div></div>
       </div> : <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">Tenant messaging is available for Apartment properties. Add an Apartment property to enable it.</div>}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Recent message jobs</h2>{loading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : jobs.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">No message jobs yet.</p> : <div className="mt-4 overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{['Created', 'Tenant', 'Channel', 'Type', 'Status'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{jobs.map((job) => <tr key={job.id}><td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{new Date(job.created_at).toLocaleString()}</td><td className="px-4 py-3 text-sm font-medium text-gray-900">{job.tenant_name || 'Tenant'}</td><td className="px-4 py-3 text-sm uppercase text-gray-600">{job.channel}</td><td className="px-4 py-3 text-sm capitalize text-gray-600">{job.notification_type.replaceAll('_', ' ')}</td><td className="px-4 py-3 text-sm capitalize text-gray-600">{job.status}</td></tr>)}</tbody></table></div>}</div>
    </Layout>
  );
};

export default Notifications;

