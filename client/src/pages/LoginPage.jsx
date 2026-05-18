import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, ArrowLeft, Mail, Lock as LockIcon } from 'lucide-react';

const LoginPage = ({ setUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [mobile, setMobile] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');

  const [error, setError] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    // Ethiopian mobile validation (simple regex for basic check during signup)
    const ethioMobileRegex = /^(?:\+251|0)[1-9]\d{8}$/;
    if (isSignup && mobile && !ethioMobileRegex.test(mobile)) {
      setError('Please enter a valid Ethiopian mobile number (e.g., +251912345678 or 0912345678)');
      return;
    }

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const payload = isSignup 
        ? { email, password, nickname, mobile, gender, address, telegram_username: telegramUsername }
        : { email, password };
      
      const { data } = await axios.post(`http://localhost:5000${endpoint}`, payload);
      
      if (isSignup) {
        setIsSignup(false);
        setError('success:Registration successful! You can now log in.');
      } else if (data.mfaRequired) {
        navigate('/mfa', { state: { userId: data.userId } });
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        if (data.user.restricted) {
          navigate('/');
        } else {
          navigate('/private');
        }
      }
    } catch (err) {
      if (isSignup) {
        setIsSignup(false);
        setError('success:Registration request processed. Please log in.');
      } else {
        setError(err.response?.data?.error || 'Authentication failed. Please check credentials.');
      }
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh', 
      background: 'var(--background)',
      backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.05), transparent)'
    }}>
      {/* Logo Modal */}
      {showLogoModal && (
        <div 
          onClick={() => setShowLogoModal(false)}
          style={{ 
            position: 'fixed', inset: 0, zIndex: 2000, 
            background: 'rgba(0,0,0,0.9)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' 
          }}
        >
          <img src="/logo.png" alt="Logo Full" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: '2rem', left: '2rem' }}>
        <button onClick={() => navigate('/')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ArrowLeft size={16} /> Back to Home
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card" 
        style={{ width: '100%', maxWidth: '440px', padding: '3rem' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ resize: 'both', overflow: 'hidden', width: '64px', height: '64px', minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src="/logo.png" 
                alt="Logo" 
                onClick={() => setShowLogoModal(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
              />
            </div>
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{isSignup ? 'Join our secure enterprise hub' : 'Access your secure workspace'}</p>
        </div>

        <form onSubmit={handleLogin}>
          {isSignup && (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Full Name / Nickname</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Muler" 
                  style={{ marginBottom: 0 }}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required 
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Mobile Number</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="+251..." 
                  style={{ marginBottom: 0 }}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required 
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Gender</label>
                <select 
                  className="input-field"
                  style={{ marginBottom: 0, width: '100%', background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '0.75rem 1rem' }}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Address / Location</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Bole, Addis Ababa" 
                  style={{ marginBottom: 0 }}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required 
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Telegram Username</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="@username" 
                  style={{ marginBottom: 0 }}
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  required 
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="email" 
                className="input-field" 
                placeholder="name@company.com" 
                style={{ paddingLeft: '3rem', marginBottom: 0 }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <LockIcon size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="password" 
                className="input-field" 
                placeholder="••••••••" 
                style={{ paddingLeft: '3rem', marginBottom: 0 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
          </div>

          {error && (
            <div style={{ 
              background: error.startsWith('success:') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${error.startsWith('success:') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              color: error.startsWith('success:') ? 'var(--success)' : 'var(--secondary)',
              fontSize: '0.85rem',
              textAlign: 'center'
            }}>
              {error.replace('success:', '')}
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}>
            {isSignup ? 'Register Account' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {isSignup ? 'Already have an account?' : "Don't have an account yet?"} 
          <span 
            onClick={() => setIsSignup(!isSignup)} 
            style={{ color: 'var(--accent)', cursor: 'pointer', marginLeft: '0.5rem', fontWeight: 600 }}
          >
            {isSignup ? 'Log in here' : 'Sign up for free'}
          </span>
        </p>
      </motion.div>
    </div>
  );
};

export default LoginPage;
