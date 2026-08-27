import React from 'react';

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color = 'primary' }) => {
  const colorMap = {
    primary: 'bg-blue-100 text-blue-600',
    secondary: 'bg-teal-100 text-teal-600',
    accent: 'bg-amber-100 text-amber-600',
    danger: 'bg-red-100 text-red-600',
    success: 'bg-green-100 text-green-600'
  };

  const iconBg = colorMap[color] || colorMap.primary;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${iconBg}`}>
          <Icon size={24} />
        </div>
      </div>
      {(trend || trendValue) && (
        <div className="mt-4 flex items-center text-sm">
          {trend === 'up' && <span className="text-green-500 font-medium mr-2">↑ {trendValue}</span>}
          {trend === 'down' && <span className="text-red-500 font-medium mr-2">↓ {trendValue}</span>}
          <span className="text-gray-500">vs last month</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;

