import React from 'react';

const StatusBadge = ({ status }) => {
  if (!status) return null;

  const normalizedStatus = status.toLowerCase().replace(/_/g, ' ');

  const getStatusColor = (s) => {
    switch (s) {
      case 'paid':
      case 'active':
      case 'resolved':
      case 'closed':
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
      case 'in progress':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'overdue':
      case 'urgent':
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'partial':
      case 'medium':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low':
      case 'open':
      case 'inactive':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${getStatusColor(normalizedStatus)}`}>
      {normalizedStatus}
    </span>
  );
};

export default StatusBadge;

