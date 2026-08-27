import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <Layout title="Page not found">
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md text-center">
          <p className="text-6xl font-bold text-primary">404</p>
          <h2 className="mt-4 text-2xl font-semibold text-gray-900">We can’t find that page</h2>
          <p className="mt-2 text-gray-600">The link may be outdated or the page may have moved.</p>
          <button type="button" onClick={() => navigate('/')} className="mt-6 rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700">
            Back to dashboard
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;

