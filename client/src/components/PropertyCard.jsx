import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Users, AlertCircle, Edit, Trash2, Loader2, Home } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { getPropertyTypeLabel, isApartmentProperty } from '../utils/propertyTypes';

const PropertyCard = ({ property, onEdit, onDelete, deleting = false }) => {
  const navigate = useNavigate();

  return (
    <div 
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group"
      onClick={() => navigate(`/properties/${property.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/properties/${property.id}`);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${property.name}`}
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors">{property.name}</h3>
            <div className="flex items-center text-gray-500 text-sm mt-1">
              <MapPin size={16} className="mr-1" />
              {property.location}
            </div>
          </div>
          <StatusBadge status={property.status || 'active'} />
        </div>

        <div className="mb-4">
          <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
            {getPropertyTypeLabel(property.type)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 py-4 border-t border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-1">Monthly Rent</p>
            <p className="font-semibold text-gray-900">KES {Number(property.monthly_rent || 0).toLocaleString()}</p>
          </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
              <p className="font-semibold text-gray-900">KES {Number(property.total_revenue || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Net Income</p>
              <p className={`font-semibold ${Number(property.net_income || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>KES {Number(property.net_income || 0).toLocaleString()}</p>
            </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-gray-600">
              <Users size={16} className="mr-1.5" />
              <span>{property.tenant_count || 0} Tenants</span>
            </div>
            <div className={`flex items-center ${property.open_issues_count > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
              <AlertCircle size={16} className="mr-1.5" />
              <span>{property.open_issues_count || 0} Issues</span>
            </div>
            {isApartmentProperty(property.type) && (
              <div className="flex items-center text-gray-600">
                <Home size={16} className="mr-1.5" />
                <span>{property.vacant_unit_count || 0}/{property.unit_count || 0} Vacant</span>
              </div>
            )}
          </div>
          <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
                <button onClick={() => onEdit(property)} aria-label={`Edit ${property.name}`} title="Edit property" className="p-1.5 text-gray-400 hover:text-primary rounded-md hover:bg-blue-50 transition-colors">
                <Edit size={18} />
              </button>
            )}
            {onDelete && (
                <button onClick={() => onDelete(property.id)} disabled={deleting} aria-label={`Delete ${property.name}`} title="Delete property" className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50">
                 {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;

