import React from 'react';
import { WritableAtom, useAtom } from 'jotai';

interface CheckboxForAtomProps {
  atom: WritableAtom<boolean, [boolean], void>;
  label: string;
  className?: string;
}

const CheckboxForAtom: React.FC<CheckboxForAtomProps> = ({ atom, label, className }) => {
  const [value, setValue] = useAtom(atom);
  return (
    <label className={`flex items-center space-x-2 cursor-pointer ${className || ''}`}>
      <input
        type="checkbox"
        checked={value}
        onChange={e => setValue(e.target.checked)}
        className="rounded"
      />
      <span>{label}</span>
    </label>
  );
};

export default CheckboxForAtom;
