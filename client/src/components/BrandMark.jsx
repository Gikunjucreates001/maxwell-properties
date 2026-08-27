import React from 'react';

const BrandMark = ({ className = 'h-10 w-10' }) => (
  <svg className={className} viewBox="0 0 64 64" fill="none" role="img" aria-label="Maxwell Properties logo">
    <path d="M8 27 32 8l24 19" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 25h38v29H13z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="4" />
    <path d="M20 30v24M44 30v24M27 54V43h10v11" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="32" cy="34" r="11" fill="currentColor" fillOpacity=".2" stroke="#f59e0b" strokeWidth="2.5" />
    <path d="M25.5 41v-9l6.5 5 6.5-5v9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="50" cy="14" r="4" fill="#f59e0b" />
  </svg>
);

export default BrandMark;

