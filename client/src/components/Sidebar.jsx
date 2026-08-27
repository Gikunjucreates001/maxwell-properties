import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  CreditCard, 
  AlertTriangle, 
  ShieldCheck,
  Home,
  Receipt,
  ClipboardCheck,
  MessageSquare,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from './BrandMark';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const { logout, user } = useAuth();
  const dashboardPath = user?.role === 'admin' ? '/admin' : '/manager';

  const navItems = [
    { to: dashboardPath, icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/properties', icon: Building2, label: 'Properties' },
    { to: '/tenants', icon: Users, label: 'Tenants' },
    { to: '/payments', icon: CreditCard, label: 'Payments' },
    { to: '/issues', icon: AlertTriangle, label: 'Issues' },
    { to: '/units', icon: Home, label: 'House Units' },
    { to: '/expenses', icon: Receipt, label: 'Expenses' },
    { to: '/notifications', icon: MessageSquare, label: 'Messages' },
    { to: '/approvals', icon: ClipboardCheck, label: 'Approvals' },
    ...(user?.role === 'admin' ? [{ to: '/admin/managers', icon: ShieldCheck, label: 'Managers' }] : []),
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
      <div className="flex items-center justify-between h-16 px-6 bg-slate-950">
        <div className="flex items-center space-x-3">
          <div className="bg-primary text-white p-1.5 rounded-lg leading-none">
            <BrandMark className="h-7 w-7" />
          </div>
          <span className="font-semibold text-lg tracking-wide hidden sm:block">Maxwell Properties</span>
        </div>
        <button className="lg:hidden text-gray-400 hover:text-white" onClick={() => setIsOpen(false)} aria-label="Close navigation menu">
          <X size={24} />
        </button>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === dashboardPath}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-primary text-white' 
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
            onClick={() => setIsOpen(false)}
          >
            <item.icon size={20} aria-hidden="true" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 bg-slate-950">
        <button
          onClick={logout}
          className="flex items-center space-x-3 px-4 py-3 w-full rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

