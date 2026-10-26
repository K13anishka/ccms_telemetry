import { useState } from 'react';
import { loginUser, registerUser } from '../api.js';
import './Login.css';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'signup';

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isSignUp && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const session = isSignUp
        ? await registerUser(username.trim(), password, email.trim())
        : await loginUser(username.trim(), password);
      onLogin(session, isSignUp);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-circle">⚡</div>
          <h1 className="login-title">CCMS Enterprise</h1>
          <p className="login-desc">Centralized Street-Light & Feeder Monitoring</p>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${!isSignUp ? 'active' : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-tab ${isSignUp ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Sign Up
          </button>
        </div>

        {error && <div className="login-error-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>

          {isSignUp && (
            <div className="login-field">
              <label>Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          )}

          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={isSignUp ? 6 : undefined}
              required
            />
          </div>

          {isSignUp && (
            <div className="login-field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
              />
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={busy}>
            {busy ? 'Please wait…' : isSignUp ? 'Create Account →' : 'Sign In to Control Console →'}
          </button>
        </form>

        <div className="login-footer">
          {isSignUp ? (
            <span>Already have an account? <a href="#signin" onClick={(e) => { e.preventDefault(); switchMode('signin'); }}>Sign in</a></span>
          ) : (
            <span>New here? <a href="#signup" onClick={(e) => { e.preventDefault(); switchMode('signup'); }}>Create an account</a></span>
          )}
        </div>
      </div>
    </div>
  );
}
