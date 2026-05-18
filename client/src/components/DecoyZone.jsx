import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Globe, Wifi } from 'lucide-react';

const DecoyZone = ({ user }) => {
  const navigate = useNavigate();
  const [clickCount, setClickCount] = useState(0);

  const handleClick = () => {
    if (user && !user.restricted && (user.role === 'authorized' || user.role === 'super_admin' || user.role === 'admin')) {
      navigate('/private');
    } else {
      setClickCount(prev => prev + 1);
    }
  };

  return (
    <motion.div 
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="glass-card"
      style={{ 
        cursor: clickCount > 10 ? 'default' : 'pointer', 
        width: '100%', 
        maxWidth: '500px', 
        textAlign: 'center',
        padding: '1.5rem',
        borderTop: '4px solid var(--primary)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <motion.div
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Globe size={24} color="var(--primary-dark)" />
        </motion.div>
        <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontWeight: 700 }}>Ethio Network Status</h4>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-around', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <ShieldCheck size={14} color="var(--primary)" /> 5G Certified
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Wifi size={14} color="var(--primary-dark)" /> Signal Stable
        </div>
      </div>

      <p style={{ marginTop: '1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
        {clickCount > 5 ? 'OPTIMIZING CONNECTION...' : `LINK SPEED: 1.2 Gbps | LAST UPDATE: ${new Date().toLocaleTimeString()}`}
      </p>
    </motion.div>
  );
};

export default DecoyZone;
