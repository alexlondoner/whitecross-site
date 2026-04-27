import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

function getLoginErrorMessage(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-credential') return 'Wrong email or password.';
  if (code === 'auth/user-not-found') return 'No user found with this email.';
  if (code === 'auth/wrong-password') return 'Wrong email or password.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  if (code === 'auth/network-request-failed') return 'Network error. Check internet and try again.';
  return 'Login failed. Please try again.';
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idTokenResult = await userCredential.user.getIdTokenResult();
      const tenantId = idTokenResult.claims.tenantId;
      if (!tenantId) {
        setError('Access denied. No tenant assigned.');
        return;
      }
      onLogin(tenantId);
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '400px', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '3rem' }}>✂️</div>
        </div>

        <div style={{ background: '#111', border: '1px solid rgba(212,175,55,0.18)', borderRadius: '16px', padding: '36px 36px 40px', boxShadow: '0 0 60px rgba(0,0,0,0.7)' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#d4af37', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '6px' }}>
              I CUT WHITECROSS
            </h1>
            <p style={{ fontSize: '0.72rem', color: '#555', letterSpacing: '2px', textTransform: 'uppercase' }}>Admin Panel</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Email</label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="Enter your email" disabled={loading}
                style={{ width: '100%', padding: '14px 16px', background: 'var(--card2)', border: `1px solid ${error ? '#ff5252' : 'var(--border)'}`, borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#d4af37'}
                onBlur={e => e.target.style.borderColor = error ? '#ff5252' : 'var(--border)'}
                autoFocus />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Password</label>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="Enter password" disabled={loading}
                style={{ width: '100%', padding: '14px 16px', background: 'var(--card2)', border: `1px solid ${error ? '#ff5252' : 'var(--border)'}`, borderRadius: '8px', color: 'var(--text)', fontSize: '0.95rem', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#d4af37'}
                onBlur={e => e.target.style.borderColor = error ? '#ff5252' : 'var(--border)'} />
              {error && <p style={{ color: '#ff5252', fontSize: '0.78rem', marginTop: '8px' }}>{error}</p>}
            </div>

            <button type="submit" disabled={loading || !email || !password}
              style={{ width: '100%', padding: '14px', background: loading || !email || !password ? 'rgba(212,175,55,0.3)' : 'linear-gradient(135deg, #d4af37, #b8860b)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: '700', fontSize: '0.85rem', letterSpacing: '2px', textTransform: 'uppercase', cursor: loading || !email || !password ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;