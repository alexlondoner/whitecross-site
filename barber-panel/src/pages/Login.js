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
      onLogin();
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #080808 0%, #0b0b0a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(115deg, transparent 0%, transparent 22%, rgba(212,175,55,0.08) 32%, rgba(212,175,55,0.16) 37%, rgba(212,175,55,0.08) 42%, transparent 52%, transparent 100%), linear-gradient(115deg, transparent 0%, transparent 58%, rgba(212,175,55,0.05) 66%, rgba(212,175,55,0.12) 71%, rgba(212,175,55,0.05) 76%, transparent 84%, transparent 100%)',
        pointerEvents: 'none'
      }} />

      <div style={{
        width: '100%',
        maxWidth: '420px',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{
          borderRadius: '18px',
          padding: '36px 34px 38px',
          border: '1px solid rgba(212,175,55,0.14)',
          background: 'linear-gradient(180deg, rgba(17,17,17,0.96) 0%, rgba(10,10,10,0.98) 100%)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(12px)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-1.5px', color: '#f0f0f0', lineHeight: 1 }}>sal</span>
              <div style={{ background: '#534AB7', padding: '2px 12px 5px', borderRadius: '8px', marginLeft: '5px' }}>
                <span style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-1.5px', color: '#fff', lineHeight: 1 }}>OWN</span>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#555', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '6px' }}>
              Salon Panel
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder=""
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '16px 18px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${error ? '#ff5252' : 'rgba(212,175,55,0.18)'}`,
                    borderRadius: '14px',
                    color: '#f8f4e7',
                    fontSize: '0.98rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
                  }}
                  onFocus={e => e.target.style.borderColor = '#d4af37'}
                  onBlur={e => e.target.style.borderColor = error ? '#ff5252' : 'rgba(212,175,55,0.18)'}
                  autoFocus
                />
              </div>

            <div style={{ marginBottom: '22px' }}>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder=""
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '16px 18px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${error ? '#ff5252' : 'rgba(212,175,55,0.18)'}`,
                    borderRadius: '14px',
                    color: '#f8f4e7',
                    fontSize: '0.98rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)'
                  }}
                  onFocus={e => e.target.style.borderColor = '#d4af37'}
                  onBlur={e => e.target.style.borderColor = error ? '#ff5252' : 'rgba(212,175,55,0.18)'}
                />
                {error && <p style={{ color: '#ff6a6a', fontSize: '0.8rem', marginTop: '10px', lineHeight: 1.5 }}>{error}</p>}
              </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: '100%',
                padding: '15px',
                background: loading || !email || !password ? 'rgba(212,175,55,0.28)' : 'linear-gradient(135deg, #f1d36d 0%, #d4af37 55%, #b8860b 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#0d0b06',
                fontWeight: '800',
                fontSize: '0.84rem',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                boxShadow: loading || !email || !password ? 'none' : '0 14px 24px rgba(212,175,55,0.2)'
              }}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;