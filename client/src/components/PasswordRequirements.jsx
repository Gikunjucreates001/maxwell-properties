import React from 'react';
import { passwordRequirements } from '../utils/passwordPolicy';

const PasswordRequirements = ({ value }) => (
  <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label="Password requirements">
    {passwordRequirements.map((requirement) => {
      const valid = requirement.test(value);
      return (
        <li key={requirement.key} className={valid ? 'text-green-700' : 'text-gray-500'}>
          <span aria-hidden="true">{valid ? '✓' : '○'}</span> {requirement.label}
        </li>
      );
    })}
  </ul>
);

export default PasswordRequirements;

