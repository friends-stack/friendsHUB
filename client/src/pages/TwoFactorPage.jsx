import React, { useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const TwoFactorPage = ({ setUser }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const userId = location.state?.userId;

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      const { data } = await axios.post('/api/auth/verify-2fa', { userId, token: code });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      navigate('/');
    } catch (err) {
      setError('Invalid 2FA code');
    }
  };

  if (!userId) return <Navigate to="/login" />;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card" 
        style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}
      >
        <h2 style={{ marginBottom: '1rem' }}>MFA Challenges</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Sensitive roles require TOTP verification.</p>
        <form onSubmit={handleVerify}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="000 000" 
            maxLength="6"
            style={{ textAlign: 'center', fontSize: '1.8rem', letterSpacing: '0.4rem', fontWeight: 'bold' }}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required 
          />
          {error && <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Verify Integrity</button>
        </form>
      </motion.div>
    </div>
  );
};

export default TwoFactorPage;
