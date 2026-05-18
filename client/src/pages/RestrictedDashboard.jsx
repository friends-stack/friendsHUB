import React from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldAlert, Lock, User, LogOut, Info, 
  Zap, ChevronRight, Layout, Globe, BookOpen,
  Heart, Camera, MessageSquare
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';


const RestrictedDashboard = ({ user }) => {
  const navigate = useNavigate();
  const [showLogoModal, setShowLogoModal] = React.useState(false);
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };


  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--background)' }}>
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
      {/* Sidebar */}
      <aside style={{ 
        width: '280px', 
        background: 'var(--surface)', 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', paddingLeft: '0.5rem' }}>
          <div style={{ resize: 'both', overflow: 'hidden', width: '36px', height: '36px', minWidth: '20px', minHeight: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img 
              src="/logo.png" 
              alt="Logo" 
              onClick={() => setShowLogoModal(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
            />
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '1px', whiteSpace: 'nowrap' }}>F.R.I.E.N.D.S</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '2rem' }}>
          <button style={activeSidebarStyle} onClick={() => navigate('/messaging')}><MessageSquare size={18} /> Internal Pulse</button>
          <button style={activeSidebarStyle} onClick={() => navigate(`/profile/${user.id}`)}><User size={18} /> My Identity</button>
          <button style={lockedSidebarStyle}><Lock size={18} /> Admin Console</button>
        </nav>


        <button 
          onClick={handleLogout}
          style={{ 
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(239, 68, 68, 0.05)',
            color: 'var(--secondary)',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <LogOut size={18} /> Sign Out
        </button>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '3rem' }}>
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="container"
        >
          <header style={{ marginBottom: '3.5rem' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Account Status</h1>
            <p style={{ color: 'var(--text-muted)' }}>Digital Identity: <b>{user.email}</b></p>
          </header>

          <div className="glass-card" style={{ 
            border: '1px solid rgba(13, 148, 136, 0.2)', 
            padding: '2.5rem', 
            marginBottom: '3rem',
            background: 'linear-gradient(to right, #ffffff, #f0fdfa)'
          }}>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div style={{ background: 'rgba(13, 148, 136, 0.1)', padding: '1.5rem', borderRadius: '20px' }}>
                <ShieldAlert size={40} color="var(--secondary)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Restricted Access Protocol</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: '1.6', maxWidth: '800px' }}>
                  Your account has successfully integrated with our system hub. However, <b>Elevation Privileges</b> have not yet been granted to this identity. 
                  Until an administrator verifies your profile, internal communications and the secure hub will remain locked.
                </p>
                <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                  <button className="btn-primary" style={{ padding: '0.8rem 2rem' }}>Request Access Elevation</button>
                  <button className="btn-secondary" style={{ padding: '0.8rem 2rem' }} onClick={() => window.location.href = '/'}>Return to Home</button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '0.75rem', borderRadius: '10px' }}>
                  <Globe size={20} color="var(--accent)" />
                </div>
                <h4 style={{ margin: 0 }}>Public Directory</h4>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Access global documentation and public service assets intended for all registered users.</p>
            </div>

            <div className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '0.75rem', borderRadius: '10px' }}>
                  <BookOpen size={20} color="var(--accent)" />
                </div>
                <h4 style={{ margin: 0 }}>System Guide</h4>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Read our enterprise security guidelines and compliance standards for the Friends Info hub.</p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

const activeSidebarStyle = {
  display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
  padding: '1rem', borderRadius: '12px', border: 'none',
  background: 'rgba(15, 23, 42, 0.05)', color: 'var(--primary)',
  fontWeight: 600, cursor: 'pointer', transition: 'var(--transition)',
  textAlign: 'left'
};

const lockedSidebarStyle = {
  display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
  padding: '1rem', borderRadius: '12px', border: 'none',
  background: 'transparent', color: 'var(--text-muted)',
  cursor: 'not-allowed', transition: 'var(--transition)',
  textAlign: 'left', opacity: 0.5
};

export default RestrictedDashboard;
