import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  User, Mail, Phone, Calendar, MapPin, 
  Edit2, Camera, ArrowLeft, Heart, MessageSquare,
  Globe, Send as SendIcon, CheckCircle, Star, Utensils, Coffee, Users, Home
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';


const ProfilePage = ({ currentUser, userId, previewUser, onProfileUpdate, onBackToSelf, onOpenDirectory }) => {
  const { id: paramId } = useParams();
  const id = paramId || userId || currentUser?.id;
  const navigate = useNavigate();
  const location = useLocation();

  const isSelf = currentUser?.id && Number(id) === Number(currentUser.id);
  const initialProfile = isSelf && currentUser 
    ? currentUser 
    : (previewUser && Number(previewUser.id) === Number(id) ? previewUser : null);

  const [profile, setProfile] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const previousIdRef = useRef(id);

  useEffect(() => {
    if (location.state?.edit) {
      setIsEditing(true);
    }
  }, [location.state]);

  const [editData, setEditData] = useState(initialProfile || {});
  const [newMemory, setNewMemory] = useState({ title: '', content: '' });
  const [profileFile, setProfileFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(!initialProfile);
  const [uploading, setUploading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [lightBox, setLightBox] = useState({ isOpen: false, url: '' });
  const [toastMessage, setToastMessage] = useState('');
  const [imageError, setImageError] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Only reset edit mode and clear errors if navigating to a different profile ID
  useEffect(() => {
    if (previousIdRef.current !== id) {
      previousIdRef.current = id;
      setIsEditing(false);
      setImageError(false);
    }
    if (!profile) {
      if (isSelf && currentUser) {
        setProfile(currentUser);
        setEditData(currentUser);
      } else if (previewUser && Number(previewUser.id) === Number(id)) {
        setProfile(previewUser);
        setEditData(previewUser);
      }
    }
    fetchProfile();
  }, [id]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      const { data } = await axios.get(`/api/profile/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data) {
        setProfile(data);
        // Only initialize editData from fetched data if user is not currently actively editing
        setEditData(prev => (isEditing ? prev : data));
        if (onProfileUpdate && Number(currentUser?.id) === Number(data.id)) {
          onProfileUpdate(data);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching profile:', err);
      if (isSelf && currentUser) {
        setProfile(currentUser);
        setEditData(prev => (isEditing ? prev : currentUser));
      }
      setLoading(false);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      showToast('❌ Geolocation not supported by your browser');
      return;
    }

    setIsLocating(true);
    showToast('📍 Getting your GPS location... (allow access if prompted)');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          const response = await axios.get(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { headers: { 'Accept-Language': 'en' }, timeout: 8000 }
          );
          if (response.data && response.data.address) {
            const addr = response.data.address;
            const parts = [
              addr.road || addr.neighbourhood || '',
              addr.suburb || addr.village || addr.town || addr.city || '',
              addr.state || '',
              addr.country || ''
            ].filter(Boolean);
            const locationString = parts.join(', ');
            setEditData(prev => ({ ...prev, address: locationString }));
            showToast(`✅ Location found! (±${Math.round(accuracy)}m accuracy)`);
          } else {
            setEditData(prev => ({ ...prev, address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }));
            showToast('✅ GPS coordinates set!');
          }
        } catch (_) {
          setEditData(prev => ({ ...prev, address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }));
          showToast('✅ GPS coordinates set!');
        }
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
          showToast('❌ Permission denied — click the 🔒 icon in your browser address bar and allow Location');
        } else if (err.code === 2) {
          showToast('❌ GPS signal unavailable. Move to open area or check device settings.');
        } else {
          showToast('❌ GPS timed out. Make sure location is enabled on your device.');
        }
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    // Ethiopian mobile validation: +251... or 09... or 07... (allowing spaces/dashes)
    if (editData.mobile && editData.mobile.trim()) {
      const cleanMobile = editData.mobile.replace(/[\s\-]/g, '');
      const ethioMobileRegex = /^(?:\+251|0)[79]\d{8}$/;
      // Check if Ethiopian format or general international format
      if (!ethioMobileRegex.test(cleanMobile) && !/^\+?[0-9]{9,15}$/.test(cleanMobile)) {
        showToast('Please enter a valid mobile number (e.g. +251912345678 or 0912345678)');
        return;
      }
    }

    setUploading(true);
    let finalProfilePicture = editData.profile_picture;
    let finalCoverPhoto = editData.cover_photo;

    try {
      if (profileFile) {
        const formData = new FormData();
        formData.append('image', profileFile);
        const { data: uploadRes } = await axios.post('/api/upload', formData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        finalProfilePicture = uploadRes.url;
      }

      if (coverFile) {
        const formData = new FormData();
        formData.append('image', coverFile);
        const { data: uploadRes } = await axios.post('/api/upload', formData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        finalCoverPhoto = uploadRes.url;
      }

      const cleanData = {
        ...editData,
        mobile: editData.mobile ? editData.mobile.replace(/[\s\-]/g, '') : '',
        profile_picture: finalProfilePicture,
        cover_photo: finalCoverPhoto
      };

      const res = await axios.put('/api/profile', cleanData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const updated = {
        ...(profile || {}),
        ...cleanData,
        id: id
      };

      setProfile(updated);
      setEditData(updated);
      setIsEditing(false);
      setProfileFile(null);
      setCoverFile(null);
      showToast('✅ Profile updated successfully!');

      if (onProfileUpdate && Number(currentUser?.id) === Number(id)) {
        onProfileUpdate(updated);
      }
      fetchProfile();
    } catch (err) {
      console.error('Profile update error:', err);
      showToast('❌ Failed to update profile: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };



  const activeProfile = profile || (isSelf ? currentUser : (previewUser && Number(previewUser.id) === Number(id) ? previewUser : null));
  if (loading && !activeProfile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: '0.75rem', color: '#64748b' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading profile...</span>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!activeProfile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '60vh', gap: '1rem', color: '#64748b' }}>
        <User size={48} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>Profile Not Found</span>
        <span style={{ fontSize: '0.85rem' }}>The requested member profile could not be located.</span>
        {onOpenDirectory && (
          <button onClick={onOpenDirectory} style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            Back to All Members
          </button>
        )}
      </div>
    );
  }

  const isOwnProfile = Number(currentUser?.id) === Number(activeProfile.id);
  const isRestrictedUser = currentUser?.role === 'user';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        /* Mobile-First Default Styles (Stack vertically by default) */
        .profile-header-card {
          position: relative;
          background: white; 
          border-radius: 16px; 
          padding: 1.5rem; 
          box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
          margin-bottom: 1.5rem;
          display: flex; 
          flex-direction: column;
          align-items: flex-start;
          gap: 1.5rem;
          border: 1px solid #e2e8f0;
        }
        .profile-header-card > div {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1rem;
          width: 100%;
        }
        .profile-grid {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .edit-profile-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .address-row {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .address-row button {
          width: 100% !important;
          padding: 0.75rem !important;
          justify-content: center !important;
        }

        /* Desktop Adjustments (min-width: 769px) */
        @media (min-width: 769px) {
          .profile-header-card {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            padding: 2rem;
            margin-bottom: 2.5rem;
          }
          .profile-header-card > div {
            flex-direction: row;
            align-items: center;
            gap: 1.5rem;
            width: auto;
          }
          .profile-grid {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 2rem;
          }
          .edit-profile-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
          }
          .address-row {
            flex-direction: row;
            gap: 0.5rem;
          }
          .address-row button {
            width: auto !important;
            padding: 0 1rem !important;
          }
        }
        .mobile-profile-only { display: none; }
        .desktop-profile-only { display: block; }
        @media (max-width: 767px) {
          .mobile-profile-only {
            display: flex !important;
            flex-direction: column;
            gap: 0.75rem;
            padding: 0.65rem 0.65rem 84px 0.65rem;
            background: #f1f5f9;
            min-height: 100vh;
          }
          .desktop-profile-only {
            display: none !important;
          }
        }
      `}</style>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }} 
            animate={{ opacity: 1, y: 0, x: '-50%' }} 
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            style={{ 
              position: 'fixed', bottom: '2rem', left: '50%', zIndex: 9999, 
              background: '#334155', color: 'white', padding: '0.75rem 1.5rem', 
              borderRadius: '30px', fontWeight: 600, fontSize: '0.9rem', 
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' 
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Universal Lightbox */}
      <AnimatePresence>
        {lightBox.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightBox({ isOpen: false, url: '' })}
            style={{ 
              position: 'fixed', inset: 0, zIndex: 99999, 
              background: 'rgba(0,0,0,0.95)', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' 
            }}
          >
            <img src={lightBox.url} alt="Full View" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Mobile-Only Profile Layout (320px-767px) */}
      <div className="mobile-profile-only">
        {/* Green My Profile Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #065f2a 0%, #0b7a36 55%, #16a34a 100%)',
          borderRadius: '18px',
          padding: '0.75rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 6px 18px rgba(11, 122, 54, 0.22)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', zIndex: 2, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => {
                if (isEditing) setIsEditing(false);
                else if (onBackToSelf) onBackToSelf();
                else navigate(-1);
              }}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'white',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
              }}
              title="Go back"
            >
              <ArrowLeft size={18} color="#065f2a" />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isSelf ? 'My Profile' : `${activeProfile.nickname || activeProfile.full_name || 'Member'}'s Profile`}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.9)', marginTop: '0.1rem' }}>
                {isSelf ? 'Your Profile, Your Identity' : `Community Identity • ${activeProfile.role ? activeProfile.role.toUpperCase() : 'MEMBER'}`}
              </div>
            </div>
          </div>
          <div style={{ opacity: 0.24, flexShrink: 0, zIndex: 1 }}>
            <Users size={40} color="white" />
          </div>
        </div>

        {/* Centered Profile Hero Card */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          padding: '1.15rem 1rem 1.25rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
        }}>
          {isOwnProfile && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              style={{
                position: 'absolute',
                top: '0.85rem',
                right: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '999px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#0f172a',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                zIndex: 5
              }}
            >
              <Edit2 size={13} /> Edit Profile
            </button>
          )}

          {/* Subtle Mint Wave Background */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '54px', pointerEvents: 'none', zIndex: 0 }}>
            <svg viewBox="0 0 400 54" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
              <path d="M0,26 C90,4 200,48 310,18 C355,6 385,22 400,14 L400,54 L0,54 Z" fill="rgba(22, 163, 74, 0.12)" />
              <path d="M0,38 C120,18 240,50 400,26 L400,54 L0,54 Z" fill="rgba(11, 122, 54, 0.18)" />
            </svg>
          </div>

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', marginBottom: '0.65rem' }}>
              {(!activeProfile.profile_picture || imageError) ? (
                <div style={{
                  width: '88px',
                  height: '88px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #16a34a 0%, #0b7a36 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '2.2rem',
                  fontWeight: 900,
                  border: '3px solid #22c55e',
                  textTransform: 'uppercase',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.22)'
                }}>
                  {(activeProfile.nickname || activeProfile.full_name || activeProfile.email || 'U')[0]}
                </div>
              ) : (
                <img
                  src={activeProfile.profile_picture}
                  alt="Profile"
                  onError={() => setImageError(true)}
                  onClick={() => setLightBox({ isOpen: true, url: activeProfile.profile_picture })}
                  style={{
                    width: '88px',
                    height: '88px',
                    borderRadius: '50%',
                    border: '3px solid #22c55e',
                    objectFit: 'cover',
                    cursor: 'zoom-in',
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.2)'
                  }}
                />
              )}
              <span style={{
                position: 'absolute',
                bottom: '3px',
                right: '3px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#16a34a',
                border: '2.5px solid white'
              }} />
              {isOwnProfile && isEditing && !isRestrictedUser && (
                <label style={{
                  position: 'absolute',
                  bottom: '-2px',
                  left: '-2px',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '50%',
                  padding: '0.35rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Camera size={14} color="#0b7a36" />
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setProfileFile(e.target.files[0])} />
                </label>
              )}
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>
                {activeProfile.full_name || activeProfile.nickname || 'Unknown Identity'}
              </span>
              <CheckCircle size={18} fill="#16a34a" color="white" />
            </div>

            {activeProfile.email && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                marginTop: '0.45rem',
                background: '#dcfce7',
                border: '1px solid #bbf7d0',
                borderRadius: '999px',
                padding: '0.28rem 0.85rem',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: '#065f2a'
              }}>
                <Mail size={13} color="#16a34a" />
                <span>{activeProfile.email}</span>
              </div>
            )}
          </div>
        </div>

        {isEditing ? (
          /* Mobile Edit Form */
          <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Edit Personal Identity</h3>
              <button type="button" onClick={() => setIsEditing(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '999px', padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Full Name / Nickname</label>
                <input className="input-field" style={{ marginBottom: 0 }} value={editData.nickname || ''} onChange={(e) => setEditData({ ...editData, nickname: e.target.value })} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Mobile Number</label>
                <input className="input-field" style={{ marginBottom: 0 }} placeholder="+251..." value={editData.mobile || ''} onChange={(e) => setEditData({ ...editData, mobile: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Gender</label>
                <select className="input-field" style={{ marginBottom: 0 }} value={editData.gender || ''} onChange={(e) => setEditData({ ...editData, gender: e.target.value })}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              {!isRestrictedUser && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Telegram Username</label>
                    <input className="input-field" style={{ marginBottom: 0 }} placeholder="@username" value={editData.telegram_username || ''} onChange={(e) => setEditData({ ...editData, telegram_username: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Location</label>
                    <div style={{ display: 'flex', gap: '0.45rem' }}>
                      <input className="input-field" style={{ marginBottom: 0, flex: 1 }} placeholder="City, Country" value={editData.address || ''} onChange={(e) => setEditData({ ...editData, address: e.target.value })} />
                      <button type="button" onClick={handleGetLocation} disabled={isLocating} style={{ padding: '0 0.75rem', borderRadius: '10px', background: '#dcfce7', color: '#065f2a', border: '1px solid #bbf7d0', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                        {isLocating ? '...' : '📍 GPS'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Bio / Intro</label>
                    <textarea className="input-field" style={{ marginBottom: 0, minHeight: '72px' }} value={editData.bio || ''} onChange={(e) => setEditData({ ...editData, bio: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: '#334155' }}>Favorite Food &amp; Drink</label>
                    <input className="input-field" style={{ marginBottom: 0 }} value={editData.fav_food_drink || ''} onChange={(e) => setEditData({ ...editData, fav_food_drink: e.target.value })} />
                  </div>
                </>
              )}
              <button type="submit" disabled={uploading} style={{ width: '100%', padding: '0.75rem', borderRadius: '999px', background: '#0b7a36', color: 'white', border: 'none', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                {uploading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Intro Card */}
            <div style={{
              background: 'white',
              borderRadius: '18px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}>
              <div style={{
                background: 'linear-gradient(90deg, #0b7a36 0%, #16a34a 70%, #bbf7d0 100%)',
                padding: '0.5rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: 'white',
                fontWeight: 800,
                fontSize: '0.88rem'
              }}>
                <User size={16} color="white" />
                <span>Intro</span>
              </div>
              <div style={{ padding: '0.8rem 0.9rem' }}>
                {!isRestrictedUser && (
                  <p style={{ margin: '0 0 0.85rem', fontSize: '0.86rem', color: '#0f172a', fontWeight: 500, lineHeight: 1.45 }}>
                    {activeProfile.bio || 'No bio yet. Add something about yourself!'}
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#334155', minWidth: 0 }}>
                    <Home size={14} color="#475569" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeProfile.address || 'Add location'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#334155', minWidth: 0 }}>
                    <Phone size={14} color="#475569" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeProfile.mobile || 'Add mobile'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#334155', minWidth: 0 }}>
                    <Calendar size={14} color="#475569" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Joined {activeProfile.created_at ? new Date(activeProfile.created_at).toLocaleDateString('en-GB') : 'Active'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#334155', minWidth: 0 }}>
                    <SendIcon size={14} color="#475569" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeProfile.telegram_username || 'Not linked'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#334155', minWidth: 0 }}>
                    <User size={14} color="#475569" style={{ flexShrink: 0 }} />
                    <span>{activeProfile.gender || 'Select gender'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Favourites Card */}
            {!isRestrictedUser && (
              <div style={{
                background: 'white',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}>
                <div style={{
                  background: 'linear-gradient(90deg, #0b7a36 0%, #16a34a 70%, #bbf7d0 100%)',
                  padding: '0.5rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '0.88rem'
                }}>
                  <Star size={16} fill="#fde047" color="#fde047" />
                  <span>Personal Favourites</span>
                </div>
                <div style={{
                  padding: '0.85rem 0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', color: '#0f172a' }}>
                    <Utensils size={16} color="#1e3a8a" style={{ flexShrink: 0 }} />
                    <span><strong>Food &amp; Drink:</strong> {activeProfile.fav_food_drink || 'Not specified'}</span>
                  </div>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: '#fef9c3',
                    border: '1px solid #fde68a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Coffee size={22} color="#b45309" />
                  </div>
                </div>
              </div>
            )}

            {/* Personal Identity Overview Card */}
            <div
              onClick={() => isOwnProfile && setIsEditing(true)}
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '1px solid #bbf7d0',
                borderRadius: '18px',
                padding: '0.8rem 0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.65rem',
                cursor: isOwnProfile ? 'pointer' : 'default',
                boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <User size={20} color="#065f2a" />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#065f2a' }}>Personal Identity Overview</div>
                  <div style={{ fontSize: '0.7rem', color: '#334155', fontWeight: 500 }}>
                    {isOwnProfile ? 'A quick view of your profile information' : 'Public community profile information'}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Tablet & Desktop Profile Layout (768px+ UNCHANGED) */}
      <div className="desktop-profile-only">
      {/* Header */}
      <header style={{ 
        background: 'white', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            type="button"
            onClick={() => {
              if (onBackToSelf) onBackToSelf();
              else navigate(-1);
            }} 
            style={{ 
              background: '#f1f5f9', border: 'none', cursor: 'pointer', padding: '0.5rem',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
            title="Go back"
          >
            <ArrowLeft size={20} color="#334155" />
          </button>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              {isSelf ? 'My Profile' : `${profile?.nickname || profile?.full_name || 'Member'}'s Profile`}
            </h1>
            {!isSelf && (
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Community Identity • {profile?.role ? profile.role.toUpperCase() : 'MEMBER'}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {onOpenDirectory && (
            <button
              type="button"
              onClick={onOpenDirectory}
              style={{
                padding: '0.45rem 0.85rem',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#334155',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s'
              }}
              title="View all community members and admins"
            >
              👥 All Members
            </button>
          )}

          {!isSelf && onBackToSelf && (
            <button
              type="button"
              onClick={onBackToSelf}
              style={{
                padding: '0.45rem 0.85rem',
                background: 'rgba(22, 163, 74, 0.1)',
                border: '1px solid #16a34a',
                borderRadius: '8px',
                color: '#16a34a',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s'
              }}
              title="Return to your own profile"
            >
              👤 My Profile
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
        {/* Clean Header (no cover photo banner) */}
        <div className="profile-header-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {(!profile.profile_picture || imageError) ? (
                <div 
                  style={{ 
                    width: '96px', 
                    height: '96px', 
                    borderRadius: '20px', 
                    background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    border: '1px solid #e2e8f0',
                    textTransform: 'uppercase',
                    boxShadow: '0 4px 12px rgba(141, 198, 63, 0.15)',
                    cursor: 'default'
                  }}
                >
                  {(profile.nickname || profile.email || 'U')[0]}
                </div>
              ) : (
                <img 
                  src={profile.profile_picture} 
                  alt="Profile" 
                  onError={() => setImageError(true)}
                  onClick={() => setLightBox({ isOpen: true, url: profile.profile_picture })}
                  style={{ width: '96px', height: '96px', borderRadius: '20px', border: '1px solid #e2e8f0', objectFit: 'cover', cursor: 'zoom-in' }}
                />
              )}
              {isOwnProfile && isEditing && !isRestrictedUser && (
                <label style={{ 
                  position: 'absolute', bottom: '-5px', right: '-5px', 
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: '50%', padding: '0.4rem', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Camera size={14} color="#64748b" />
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setProfileFile(e.target.files[0])} />
                </label>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.nickname || 'Unknown Identity'}</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</p>
            </div>
          </div>
          {isOwnProfile && !isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              style={{ 
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                background: 'white', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px', 
                padding: '0.5rem 1rem', 
                fontSize: '0.85rem',
                fontWeight: 600, 
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s',
                zIndex: 5
              }}
            >
              <Edit2 size={14} /> Edit Profile
            </button>
          )}
        </div>

        <div className="profile-grid">
          {/* Left Column: Stats & Socials */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '1rem' }}>Intro</h3>
              {!isRestrictedUser && <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#334155' }}>{profile.bio || "No bio yet. Add something about yourself!"}</p>}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: !isRestrictedUser ? '1.5rem' : '0rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
                  <MapPin size={16} /> {profile.address || "Add location"}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
                  <Calendar size={16} /> Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
                   <User size={16} /> {profile.gender || "Select gender"}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
                   <Phone size={16} /> {profile.mobile || "Add mobile number"}
                </div>
                {profile.telegram_username && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
                     <SendIcon size={16} /> {profile.telegram_username}
                  </div>
                )}
              </div>
            </div>

            {!isRestrictedUser && (
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '1rem' }}>Personal Favourites</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                   <div style={{ fontSize: '0.9rem', color: '#334155' }}>
                      <strong>Food & Drink:</strong> {profile.fav_food_drink || "Not specified"}
                   </div>
                </div>
              </div>
            )}
          </aside>

          {/* Right Column: Details or Edit Form */}
          <section>
            {isEditing ? (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
              >
                <h3 style={{ marginBottom: '2rem' }}>Edit Personal Identity</h3>
                <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {isRestrictedUser ? (
                    <>
                      <div className="edit-profile-grid">
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Full Name / Nickname</label>
                          <input 
                            className="input-field" 
                            value={editData.nickname || ''} 
                            onChange={(e) => setEditData({ ...editData, nickname: e.target.value })} 
                            required
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Mobile Number</label>
                          <input 
                            className="input-field" 
                            placeholder="+251..."
                            value={editData.mobile || ''} 
                            onChange={(e) => setEditData({ ...editData, mobile: e.target.value })} 
                            required
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Gender</label>
                          <select 
                            className="input-field"
                            value={editData.gender || ''}
                            onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
                            required
                          >
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Telegram Username</label>
                          <input 
                            className="input-field" 
                            placeholder="@username"
                            value={editData.telegram_username || ''} 
                            onChange={(e) => setEditData({ ...editData, telegram_username: e.target.value })} 
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Address / Location</label>
                        <div className="address-row">
                          <input 
                            className="input-field" 
                            value={editData.address || ''} 
                            onChange={(e) => setEditData({ ...editData, address: e.target.value })} 
                            style={{ flex: 1 }}
                            required
                          />
                          <button 
                            type="button"
                            onClick={handleGetLocation}
                            disabled={isLocating}
                            style={{ background: isLocating ? '#e2e8f0' : '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isLocating ? 'not-allowed' : 'pointer', color: '#334155', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          >
                            <MapPin size={16} /> {isLocating ? 'Locating...' : 'Locate'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="edit-profile-grid">
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Full Name</label>
                          <input 
                            className="input-field" 
                            value={editData.full_name || ''} 
                            placeholder="Enter your full name"
                            onChange={(e) => setEditData({ ...editData, full_name: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Nickname / Preferred Name</label>
                          <input 
                            className="input-field" 
                            value={editData.nickname || ''} 
                            placeholder="e.g. Teshome"
                            onChange={(e) => setEditData({ ...editData, nickname: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Mobile Number</label>
                          <input 
                            className="input-field" 
                            placeholder="+251..."
                            value={editData.mobile || ''} 
                            onChange={(e) => setEditData({ ...editData, mobile: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Date of Birth</label>
                          <input 
                            type="date"
                            className="input-field" 
                            value={editData.dob || ''} 
                            onChange={(e) => setEditData({ ...editData, dob: e.target.value })} 
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Gender</label>
                          <select 
                            className="input-field"
                            value={editData.gender || ''}
                            onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
                          >
                            <option value="">Select Gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Bio</label>
                        <textarea 
                          className="input-field" 
                          style={{ minHeight: '100px', resize: 'vertical' }}
                          value={editData.bio || ''} 
                          onChange={(e) => setEditData({ ...editData, bio: e.target.value })} 
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Address / Location</label>
                        <div className="address-row">
                          <input 
                            className="input-field" 
                            value={editData.address || ''} 
                            onChange={(e) => setEditData({ ...editData, address: e.target.value })} 
                            style={{ flex: 1 }}
                          />
                          <button 
                            type="button"
                            onClick={handleGetLocation}
                            disabled={isLocating}
                            style={{ background: isLocating ? '#e2e8f0' : '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isLocating ? 'not-allowed' : 'pointer', color: '#334155', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          >
                            <MapPin size={16} /> {isLocating ? 'Locating...' : 'Locate'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Telegram Username</label>
                        <input 
                          className="input-field" 
                          placeholder="@username"
                          value={editData.telegram_username || ''} 
                          onChange={(e) => setEditData({ ...editData, telegram_username: e.target.value })} 
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Favourite Food & Drink</label>
                        <input 
                          className="input-field" 
                          value={editData.fav_food_drink || ''} 
                          onChange={(e) => setEditData({ ...editData, fav_food_drink: e.target.value })} 
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Profile Picture</label>
                        <input 
                          type="file"
                          accept="image/*"
                          onChange={(e) => setProfileFile(e.target.files[0])}
                          style={{ fontSize: '0.8rem' }}
                        />
                      </div>
                    </>
                  )}


                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="submit" disabled={uploading} className="btn-primary" style={{ flex: 1, opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}>
                      {uploading ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button type="button" onClick={() => { setIsEditing(false); setProfileFile(null); }} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                  </div>

                </form>
              </motion.div>
            ) : !isOwnProfile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      Community Identity
                    </h3>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 800, 
                      padding: '0.3rem 0.75rem', 
                      borderRadius: '100px',
                      background: profile.role === 'super_admin' ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)' : profile.role === 'admin' ? 'rgba(22, 163, 74, 0.12)' : '#f1f5f9',
                      color: profile.role === 'super_admin' ? 'white' : profile.role === 'admin' ? '#16a34a' : '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      {profile.role === 'super_admin' ? '⭐ Founder & Super Admin' : profile.role === 'admin' ? '🛡️ Admin' : '👤 Community Member'}
                    </span>
                  </div>

                  <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 1.25rem' }}>
                    {profile.bio || "This member hasn't added a bio yet. They are an active, verified participant in the group."}
                  </p>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                    {profile.telegram_username && (
                      <a 
                        href={`https://t.me/${profile.telegram_username.replace(/^@/, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.6rem 1.1rem',
                          background: '#0284c7',
                          color: 'white',
                          borderRadius: '10px',
                          textDecoration: 'none',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          transition: 'all 0.2s',
                          boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                        }}
                      >
                        <SendIcon size={15} /> Message on Telegram
                      </a>
                    )}
                    {profile.mobile && (
                      <a 
                        href={`tel:${profile.mobile}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.6rem 1.1rem',
                          background: 'rgba(22, 163, 74, 0.1)',
                          border: '1px solid #16a34a',
                          color: '#16a34a',
                          borderRadius: '10px',
                          textDecoration: 'none',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          transition: 'all 0.2s'
                        }}
                      >
                        <Phone size={15} /> Call / Text
                      </a>
                    )}
                    {profile.email && (
                      <a 
                        href={`mailto:${profile.email}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.6rem 1.1rem',
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          color: '#334155',
                          borderRadius: '10px',
                          textDecoration: 'none',
                          fontSize: '0.85rem',
                          fontWeight: 600
                        }}
                      >
                        <Mail size={15} /> {profile.email}
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    Mutual Member Information
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Full Name</span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{profile.full_name || 'Not provided'}</strong>
                    </div>
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Preferred Name</span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{profile.nickname || 'Not provided'}</strong>
                    </div>
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Date of Birth</span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{profile.dob ? new Date(profile.dob).toLocaleDateString() : 'Not provided'}</strong>
                    </div>
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Gender</span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{profile.gender || 'Not specified'}</strong>
                    </div>
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Location</span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{profile.address || 'Not specified'}</strong>
                    </div>
                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Joined Community</span>
                      <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Active Member'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Personal Identity Overview</h3>
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                   <p style={{ margin: '0 0 1rem' }}>This is your public identity visible to all friends, admins, and founders.</p>
                   <button 
                     onClick={() => setIsEditing(true)} 
                     className="btn-primary" 
                     style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem' }}
                   >
                     <Edit2 size={15} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} /> Update My Details
                   </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      </div>
    </div>
  );
};

export default ProfilePage;
