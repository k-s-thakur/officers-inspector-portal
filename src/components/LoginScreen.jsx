import React, { useState } from 'react';
import { Shield, Lock, Phone, UserCheck, Key, HelpCircle, CheckCircle } from 'lucide-react';

export default function LoginScreen({ onLoginSuccess }) {
  const [userId, setUserId] = useState('SURV-101');
  const [password, setPassword] = useState('123456');
  const [selectedRole, setSelectedRole] = useState('Surveyor'); // Surveyor | Supervisor | Admin
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!userId) return;

    let userData = {
      id: userId,
      name: selectedRole === 'Surveyor' ? 'Amit Singh (अमित सिंह)' : selectedRole === 'Supervisor' ? 'Vikram Kumar (विक्रम कुमार)' : 'State Officer Admin (एडमिन)',
      role: selectedRole,
      district: 'Lucknow',
      block: 'Chinhat'
    };

    onLoginSuccess(userData);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--neutral-200)',
        maxWidth: '440px',
        width: '100%',
        padding: '2rem'
      }}>
        {/* Government Emblem / Logo Placeholder */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem',
            border: '2px solid var(--primary-border)'
          }}>
            <Shield size={36} />
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--neutral-900)' }}>
            Ayushman Card Verification Survey
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--neutral-500)', marginTop: '0.2rem' }}>
            आयुष्मान भारत कार्ड 3-पैरामीटर सत्यापन प्रणाली
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}>
          {/* Role Switcher Pills */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Select Portal Access Role</label>
            <div style={{ display: 'flex', background: 'var(--neutral-100)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
              {['Surveyor', 'Supervisor', 'Admin'].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setSelectedRole(r);
                    if (r === 'Surveyor') setUserId('SURV-101');
                    else if (r === 'Supervisor') setUserId('SUP-201');
                    else setUserId('ADM-301');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.2rem',
                    fontSize: '0.8rem',
                    fontWeight: selectedRole === r ? '700' : '500',
                    color: selectedRole === r ? 'var(--primary)' : 'var(--neutral-600)',
                    background: selectedRole === r ? 'white' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: selectedRole === r ? 'var(--shadow-sm)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Mobile Number / User ID *</label>
            <div style={{ position: 'relative' }}>
              <Phone size={18} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--neutral-400)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2.2rem' }}
                placeholder="Enter 10-digit mobile or User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password / OTP *</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--neutral-400)' }} />
              <input
                type="password"
                className="form-control"
                style={{ paddingLeft: '2.2rem' }}
                placeholder="Enter password or OTP"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', color: 'var(--neutral-600)' }}>
              <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} />
              Remember Me
            </label>
            <a href="#forgot" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }} onClick={(e) => { e.preventDefault(); alert("Please contact system admin to reset credentials."); }}>
              Forgot Password?
            </a>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
            Login to Dashboard &rarr;
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--neutral-200)', fontSize: '0.75rem', color: 'var(--neutral-500)' }}>
          Public Health & Family Welfare Department | Official Survey Portal
        </div>
      </div>
    </div>
  );
}
