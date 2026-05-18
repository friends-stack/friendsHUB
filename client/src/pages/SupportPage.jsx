import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, Zap, Activity, ChevronLeft, ShieldCheck } from 'lucide-react';

const SupportPage = ({ user }) => {
  const { type } = useParams();
  const navigate = useNavigate();

  const contentMap = {
    'self-portal': {
      title: 'Ethio Interactive Self-Portal',
      subtitle: 'Manage your services and account in real-time.',
      icon: Globe,
      color: 'var(--primary)',
      bg: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
      features: ['Account Overview', 'Data Packages', 'Voice Plans', 'Value Added Services']
    },
    '5g-map': {
      title: '5G Coverage Explorer',
      subtitle: 'Mapping the future of connectivity across Ethiopia.',
      icon: Zap,
      color: 'var(--secondary)',
      bg: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
      features: ['Addis Ababa Core', 'Industrial Parks', 'Regional Hubs', 'Upcoming Deployment']
    },
    '4g-map': {
      title: '4G LTE Reliability Map',
      subtitle: 'High-speed broadband reach in every corner.',
      icon: Activity,
      color: 'var(--accent)',
      bg: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)',
      features: ['Nationwide Coverage', 'Signal Strength', 'Network Quality', 'Roaming Partners']
    },
    'logos': {
      title: 'Official Ethio Brand Assets',
      subtitle: 'Download and explore our visual identity system.',
      icon: ShieldCheck,
      color: 'var(--primary-dark)',
      bg: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
      features: ['Primary Logo Packages', 'Color Palette Guide', 'Typography System', 'Brand Guidelines']
    }
  };

  const pageInfo = contentMap[type] || contentMap['self-portal'];
  const Icon = pageInfo.icon;

  return (
    <div style={{ minHeight: '100vh', background: pageInfo.bg, color: 'var(--text)' }}>
      {/* Header */}
      <header style={{ padding: '1.5rem 2.5rem', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button 
          onClick={() => navigate('/')}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ChevronLeft size={20} /> Back
        </button>
        <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: pageInfo.color, width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.3px', color: 'var(--primary-dark)' }}>ETHIO SUPPORT</span>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '5rem', paddingBottom: '8rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', marginBottom: '4rem' }}
          >
            <h1 style={{ fontSize: '3.5rem', fontWeight: 800, color: 'var(--primary-dark)', marginBottom: '1rem' }}>
              {pageInfo.title}
            </h1>
            <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto' }}>
              {pageInfo.subtitle}
            </p>
          </motion.div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '3rem' }}>
            {/* Visual Prop */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card" 
              style={{ height: '400px', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
            >
              <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: 'radial-gradient(var(--primary) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              <Icon size={120} color={pageInfo.color} style={{ opacity: 0.8 }} />
              <div style={{ position: 'absolute', bottom: '2rem', left: '2rem', right: '2rem', textAlign: 'center' }}>
                 <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Digital Representation of {pageInfo.title}</p>
              </div>
            </motion.div>

            {/* Feature List */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.5rem' }}>
              {pageInfo.features.map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', background: '#fff', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)' }}
                >
                  <div style={{ color: 'var(--primary)' }}><ShieldCheck size={24} /></div>
                  <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{feature}</span>
                </motion.div>
              ))}
              
              <button className="btn-primary" style={{ marginTop: '1rem', padding: '1rem', justifyContent: 'center', fontSize: '1.1rem' }}>
                Access Module
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', background: '#fff' }}>
        <p>© 2026 Ethio Telecom Properties Integration. All Rights Reserved.</p>
      </footer>
    </div>
  );
};

export default SupportPage;
