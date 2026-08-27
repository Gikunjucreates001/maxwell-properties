import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import Modal from './Modal';
import client from '../api/client';
import toast from 'react-hot-toast';
import PasswordRequirements from './PasswordRequirements';
import { validatePassword } from '../utils/passwordPolicy';
import { Menu } from 'lucide-react';

const Layout = ({ children, title }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const { user } = useAuth();

  useEffect(() => {
    document.title = `${title} · Maxwell Properties`;
  }, [title]);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    const passwordError = validatePassword(passwordForm.newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await client.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success(response.data?.pending ? 'Password change request sent to the administrator' : 'Password updated successfully');
      setIsPasswordModalOpen(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <button
                className="lg:hidden p-2 -ml-3 mr-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation menu"
              >
                <Menu size={24} />
              </button>
               <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">{title}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden sm:flex items-center space-x-2">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white font-semibold" aria-hidden="true">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <button type="button" onClick={() => setIsPasswordModalOpen(true)} className="text-left group">
                  <span className="block text-sm font-medium text-gray-700 group-hover:text-primary">{user?.name || 'User'}</span>
                  <span className="block text-xs text-gray-400 group-hover:text-primary capitalize">{user?.role || 'user'} · Change password</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title="Change password">
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">{user?.role === 'manager' ? 'Your new password will be applied after an administrator approves the request.' : 'Use a unique password to keep your property records secure.'}</p>
          <div>
            <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <input id="current-password" type="password" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((form) => ({ ...form, currentPassword: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={6} maxLength={20} required value={passwordForm.newPassword} onChange={(event) => setPasswordForm((form) => ({ ...form, newPassword: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
            <PasswordRequirements value={passwordForm.newPassword} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((form) => ({ ...form, confirmPassword: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-primary" />
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setIsPasswordModalOpen(false)} disabled={isSavingPassword} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSavingPassword} className="px-4 py-2 bg-primary text-white hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50">{isSavingPassword ? 'Updating…' : 'Update password'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Layout;

