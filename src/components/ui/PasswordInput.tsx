import { InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  showLabel: string;
  hideLabel: string;
  className?: string;
}

/**
 * Single-line password input with a show/hide toggle. Shared by the Login
 * screen and the Add User "initial password" field so both get the same
 * stable, non-jittering control (`.password-field` / `.password-toggle` in
 * index.css) instead of two divergent implementations.
 */
export const PasswordInput = ({ showLabel, hideLabel, className, ...inputProps }: PasswordInputProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-field">
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        className={`modal-input password-field-input${className ? ` ${className}` : ''}`}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? hideLabel : showLabel}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
};
