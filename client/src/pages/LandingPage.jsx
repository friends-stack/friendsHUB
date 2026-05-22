import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Zap, Globe, X, ChevronDown, Menu, Activity, MessageSquare } from 'lucide-react';
import DecoyZone from '../components/DecoyZone';

/* ─── Styles ─────────────────────────────────────────────── */
const TICKER_STYLE = `
  @keyframes tickerScroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .ticker-track {
    display: flex;
    gap: 1.5rem;
    animation: tickerScroll 28s linear infinite;
    width: max-content;
    will-change: transform;
  }
  .ticker-track:hover { animation-play-state: paused; }

  /* ── Horizontal Nav Menu ── */
  .hn-menu { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 0; }
  .hn-item { position: relative; }
  .hn-link {
    display: flex; align-items: center; gap: 4px;
    padding: 0.6rem 1.1rem;
    font-size: 0.8rem; font-weight: 600;
    letter-spacing: 0.5px; text-transform: uppercase;
    color: #1e293b; text-decoration: none;
    cursor: pointer; border: none; background: none;
    position: relative; white-space: nowrap;
    transition: color 0.2s;
  }
  .hn-link::after {
    content: ''; position: absolute; bottom: 4px; left: 1.1rem; right: 1.1rem;
    height: 3px; background: var(--primary); border-radius: 2px;
    transform: scaleX(0); transform-origin: left;
    transition: transform 0.25s ease;
  }
  .hn-link:hover { color: var(--primary-dark); }
  .hn-link:hover::after { transform: scaleX(1); }
  .hn-item:hover > .hn-dropdown { opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto; }
  .hn-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0;
    min-width: 200px; background: #fff;
    border-radius: 10px; padding: 0.5rem 0;
    box-shadow: 0 10px 40px rgba(0,0,0,0.12);
    border: 1px solid #e2e8f0;
    opacity: 0; visibility: hidden;
    transform: translateY(-8px);
    transition: opacity 0.22s ease, transform 0.22s ease, visibility 0.22s;
    z-index: 500;
  }
  .hn-sub {
    display: block; padding: 0.6rem 1.25rem;
    font-size: 0.83rem; color: #475569;
    text-decoration: none; cursor: pointer;
    transition: background 0.15s, color 0.15s;
    border-radius: 6px; margin: 0 4px;
  }
  .hn-sub:hover { background: #f1f5f9; color: #0f172a; }
  .hn-divider { height: 1px; background: #e2e8f0; margin: 0.4rem 1rem; }

  /* Mobile hamburger */
  .hn-burger { display:none; }
  .hn-mobile-menu {
    display:none; flex-direction:column; gap:0;
    background:#fff; border-top:1px solid #e2e8f0;
    padding: 0.5rem 0;
  }
  .hn-mobile-menu.open { display:flex; }
  .hn-mobile-link {
    padding:0.75rem 1.5rem; font-size:0.82rem; font-weight:700;
    letter-spacing:0.6px; text-transform:uppercase; color:#334155;
    border:none; background:none; text-align:left; cursor:pointer;
    transition:background 0.15s;
  }
  .hn-mobile-link:hover { background: var(--surface); color: var(--primary-dark); }
  @media (max-width: 768px) {
    .hn-menu { display:none; }
    .hn-burger { display:flex; }
  }
`;

/* ─── Modal Overlay ───────────────────────────────────────── */
const GalleryModal = ({ item, onClose, onImageClick }) => {
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(6px)',
              zIndex: 2000,
            }}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 2100,
              background: '#fff',
              borderRadius: '20px',
              overflow: 'hidden',
              width: '90%',
              maxWidth: '620px',
              boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ width: '100%', height: '300px', overflow: 'hidden', position: 'relative' }}>
              <img src={item.url} alt={item.title}
                onClick={() => onImageClick(item.url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
              <button
                onClick={onClose}
                style={{
                  position: 'absolute', top: '1rem', right: '1rem',
                  background: 'rgba(0,0,0,0.55)', border: 'none',
                  borderRadius: '50%', width: '38px', height: '38px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff', backdropFilter: 'blur(4px)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.85)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.55)'}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '2rem 2rem 2.5rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 1rem' }}>
                {item.title}
              </h2>
              <p style={{ fontSize: '1rem', color: '#475569', lineHeight: 1.8, margin: '0 0 1.75rem', whiteSpace: 'pre-line' }}>
                {item.caption || 'No description provided.'}
              </p>
              <button
                onClick={onClose}
                style={{
                  padding: '0.55rem 1.6rem', border: '2px solid #0f172a',
                  borderRadius: '50px', background: 'transparent', color: '#0f172a',
                  fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.22s, color 0.22s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#0f172a'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0f172a'; }}
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/* ─── Ticker Card ─────────────────────────────────────────── */
const TickerCard = ({ item, onReadMore }) => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: '300px',
        background: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: hovered ? '0 20px 44px rgba(0,0,0,0.15)' : '0 4px 20px rgba(0,0,0,0.08)',
        transform: hovered ? 'translateY(-6px) scale(1.02)' : 'translateY(0) scale(1)',
        transition: 'box-shadow 0.35s ease, transform 0.35s ease',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      {/* Image */}
      <div style={{ width: '100%', height: '200px', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={item.url}
          alt={item.title}
          onClick={() => setLightBox({ isOpen: true, url: item.url })}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover', display: 'block',
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.5s ease',
            cursor: 'zoom-in'
          }}
        />
      </div>

      {/* Content */}
      <div style={{ padding: '1.25rem 1.25rem 1.75rem', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem', lineHeight: 1.4 }}>
          {item.title}
        </h3>
        <p style={{
          fontSize: '0.83rem', color: '#64748b',
          margin: '0 0 1.25rem', lineHeight: 1.7, flexGrow: 1,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {item.caption}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onReadMore(item); }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0f172a'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0f172a'; }}
          style={{
            alignSelf: 'flex-start',
            padding: '0.45rem 1.4rem',
            border: '2px solid #0f172a',
            borderRadius: '50px',
            background: 'transparent',
            color: '#0f172a',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.22s ease, color 0.22s ease',
          }}
        >
          Read More
        </button>
      </div>
    </div>
  );
};

/* ─── Landing Page ────────────────────────────────────────── */
const LandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [gallery, setGallery] = React.useState([]);
  const [selectedItem, setSelectedItem] = React.useState(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [showLogoModal, setShowLogoModal] = React.useState(false);
  const [lightBox, setLightBox] = React.useState({ isOpen: false, url: '' });

  React.useEffect(() => { fetchGallery(); }, []);

  const fetchGallery = async () => {
    try {
      const { data } = await axios.get('/api/gallery');
      setGallery(data.length > 0 ? data : [
        {
          id: 1,
          url: '/ethio_hero.png',
          title: 'Digital Ethio Connection',
          caption: 'Bridging hearts through the power of advanced network technology across the nation.',
        },
        {
          id: 2,
          url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&q=80&w=800',
          title: 'Connected Communities',
          caption: 'Building a stronger future together through seamless communication.',
        },
      ]);
    } catch (err) { console.error(err); }
  };

  // Duplicate cards for seamless infinite loop
  const tickerItems = gallery.length > 0 ? [...gallery, ...gallery] : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Inject keyframe CSS */}
      <style>{TICKER_STYLE}</style>

      {/* Modal */}
      <GalleryModal 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)} 
        onImageClick={(url) => setLightBox({ isOpen: true, url })}
      />

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

      {/* Universal Lightbox */}
      {lightBox.isOpen && (
        <div 
          onClick={() => setLightBox({ isOpen: false, url: '' })}
          style={{ 
            position: 'fixed', inset: 0, zIndex: 3000, 
            background: 'rgba(0,0,0,0.95)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' 
          }}
        >
          <img src={lightBox.url} alt="Full View" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}

      {/* ── Navbar ── */}
      <div style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 1000,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #e2e8f0',
        boxSizing: 'border-box',
      }}>
        <nav style={{
          padding: '0.6rem 2.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1400px',
          margin: '0 auto',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <div style={{ resize: 'both', overflow: 'hidden', width: '40px', height: '40px', minWidth: '20px', minHeight: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src="/logo.png" 
                alt="Logo" 
                onClick={() => setShowLogoModal(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
              />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '1px', color: 'var(--primary-dark)', whiteSpace: 'nowrap' }}>
              F.R.I.E.N.D.S
            </span>
          </div>

          {/* Horizontal Nav Links */}
          <ul className="hn-menu">
            <li className="hn-item">
              <button className="hn-link" onClick={() => navigate('/')}>Home</button>
            </li>
            <li className="hn-item">
              <button className="hn-link" style={{ display:'flex', alignItems:'center', gap:'3px' }}
                onClick={() => {}}>
                Gallery <ChevronDown size={13} />
              </button>
              <div className="hn-dropdown">
                <a className="hn-sub" onClick={() => navigate('/public-dashboard')}>Public Statistics</a>
                <div className="hn-divider" />
                <a className="hn-sub" onClick={() => navigate(user ? (user.restricted ? '/' : '/private') : '/login')}>Access Node</a>
              </div>
            </li>
            <li className="hn-item">
              <button className="hn-link" style={{ display:'flex', alignItems:'center', gap:'3px' }}
                onClick={() => {}}>
                Support <ChevronDown size={13} />
              </button>
              <div className="hn-dropdown">
                <a className="hn-sub" onClick={() => navigate('/support/self-portal')}>Interactive Self-Portal</a>
                <div className="hn-divider" />
                <a className="hn-sub" onClick={() => navigate('/support/5g-map')}>5G Coverage Map</a>
                <a className="hn-sub" onClick={() => navigate('/support/4g-map')}>4G Coverage Map</a>
              </div>
            </li>
            <li className="hn-item">
              <button className="hn-link" onClick={() => navigate('/support/logos')}>OUR LOGOS</button>
            </li>
          </ul>

          {/* CTA + Burger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
            {user ? (
              <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.55rem 1.4rem' }}
                onClick={() => navigate(user.restricted ? '/' : '/private')}>
                System Hub
              </button>
            ) : (
              <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.55rem 1.4rem', background: 'var(--primary-dark)' }}
                onClick={() => navigate('/public-dashboard')}>
                View Dashboard
              </button>
            )}
            <button
              className="hn-burger"
              onClick={() => setMobileOpen(o => !o)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0f172a', alignItems:'center' }}
            >
              <Menu size={22} />
            </button>
          </div>
        </nav>

        {/* Mobile dropdown */}
        <div className={`hn-mobile-menu${mobileOpen ? ' open' : ''}`}>
          <button className="hn-mobile-link" onClick={() => { navigate('/'); setMobileOpen(false); }}>Home</button>
          <button className="hn-mobile-link" onClick={() => { navigate(user ? (user.restricted ? '/' : '/private') : '/login'); setMobileOpen(false); }}>Gallery</button>
          <button className="hn-mobile-link" onClick={() => { navigate(user ? '/messaging' : '/login'); setMobileOpen(false); }}>Community</button>
          <button className="hn-mobile-link" onClick={() => { document.querySelector('footer')?.scrollIntoView({ behavior: 'smooth' }); setMobileOpen(false); }}>About</button>
        </div>
      </div>

      <main style={{ paddingTop: '80px' }}>

        {/* ── Horizontal Ticker Section ── */}
        <section style={{ padding: '4rem 0 5rem', overflow: 'hidden' }}>
          {/* Section heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', marginBottom: '3rem', padding: '0 2rem' }}
          >
            <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', fontWeight: 800, color: 'var(--primary-dark)', margin: '0 0 0.75rem' }}>
              Ethio Friends Hub
            </h1>
            <p style={{ color: '#64748b', fontSize: '1.1rem', margin: 0 }}>
              A glimpse into the memories that shape us.
            </p>
          </motion.div>

          {/* Fade edges */}
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '80px', zIndex: 2,
              background: 'linear-gradient(to right, #f8fafc, transparent)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: '80px', zIndex: 2,
              background: 'linear-gradient(to left, #f8fafc, transparent)',
              pointerEvents: 'none',
            }} />

            {/* Scrolling Track */}
            <div style={{ overflow: 'hidden', padding: '1rem 0 2rem' }}>
              <div className="ticker-track">
                {tickerItems.map((item, i) => (
                  <TickerCard
                    key={`${item.id}-${i}`}
                    item={item}
                    onReadMore={(item) => setSelectedItem(item)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Featured Services ── */}
        <section style={{ padding: '6rem 0', background: 'var(--surface)' }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary-dark)' }}>Interactive Portal & Maps</h2>
              <p style={{ color: 'var(--text-muted)' }}>Direct access to the official carrier resources for our community.</p>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
              <div onClick={() => navigate('/support/self-portal')} style={{ cursor: 'pointer' }}>
                <div className="glass-card" style={{ padding: '2.5rem', background: '#fff', textAlign: 'center', borderBottom: '5px solid var(--primary)' }}>
                  <Globe size={40} color="var(--primary-dark)" style={{ marginBottom: '1.5rem' }} />
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary-dark)' }}>Self-Portal</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Manage your account and services instantly through the interactive portal.</p>
                </div>
              </div>
              <div onClick={() => navigate('/support/5g-map')} style={{ cursor: 'pointer' }}>
                <div className="glass-card" style={{ padding: '2.5rem', background: '#fff', textAlign: 'center', borderBottom: '5px solid var(--secondary)' }}>
                  <Zap size={40} color="var(--secondary)" style={{ marginBottom: '1.5rem' }} />
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--secondary)' }}>5G Coverage</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Explore the lightning-fast 5G expansion across the country.</p>
                </div>
              </div>
              <div onClick={() => navigate('/support/4g-map')} style={{ cursor: 'pointer' }}>
                <div className="glass-card" style={{ padding: '2.5rem', background: '#fff', textAlign: 'center', borderBottom: '5px solid var(--accent)' }}>
                  <Activity size={40} color="var(--accent)" style={{ marginBottom: '1.5rem' }} />
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--accent)' }}>4G Coverage</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Check detailed reliability maps for high-speed 4G connectivity.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Why We Connect ── */}
        <section className="container" style={{ paddingBottom: '8rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>Why We Connect</h2>
            <p style={{ color: '#64748b', fontSize: '1.25rem' }}>
              A private sanctuary for those who understand the value of meaningful friendship.
            </p>
          </div>
          <div className="grid">
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', borderRadius: '40px' }}>
              <div style={{ background: '#f1f5f9', width: '60px', height: '60px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                <ShieldCheck size={30} color="#0f172a" />
              </div>
              <h3>Total Privacy</h3>
              <p>Your memories are encrypted and shielded from the outside world.</p>
            </div>
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', borderRadius: '40px' }}>
              <div style={{ background: '#f1f5f9', width: '60px', height: '60px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                <Globe size={30} color="#0f172a" />
              </div>
              <h3>Real Hub</h3>
              <p>A central stream to keep your favorite people in the loop, always.</p>
            </div>
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '5rem' }}>
          <DecoyZone user={user} />
        </div>
      </main>

      {/* Floating Support Widget */}
      <motion.div 
        whileHover={{ scale: 1.1, rotate: 5 }}
        whileTap={{ scale: 0.9 }}
        style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'var(--primary)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(141, 198, 63, 0.4)',
          cursor: 'pointer', zIndex: 1000
        }}
        onClick={() => navigate('/support/self-portal')}
      >
        <MessageSquare size={24} />
      </motion.div>

      {/* Footer */}
      <footer style={{ background: '#fff', padding: '5rem 0', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
        <div className="container">
          <p style={{ color: '#64748b' }}>© 2026 Friends Hub. All Rights Reserved. Community Edition.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
