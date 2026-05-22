import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  User, Mail, Phone, Calendar, MapPin, 
  Edit2, Camera, ArrowLeft, Heart, MessageSquare,
  Globe, Send as SendIcon
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';


const ProfilePage = ({ currentUser, userId, onProfileUpdate }) => {
  const { id: paramId } = useParams();
  const id = paramId || userId;
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (location.state?.edit) {
      setIsEditing(true);
    }
  }, [location.state]);

  const [editData, setEditData] = useState({});
  const [newMemory, setNewMemory] = useState({ title: '', content: '' });
  const [profileFile, setProfileFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [lightBox, setLightBox] = useState({ isOpen: false, url: '' });
  const [toastMessage, setToastMessage] = useState('');
  const [imageError, setImageError] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };


  useEffect(() => {
    setImageError(false);
    fetchProfile();
  }, [id]);

  const fetchProfile = async () => {
    try {
      const { data } = await axios.get(`/api/profile/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setProfile(data);
      setEditData(data);
      setLoading(false);
      if (onProfileUpdate && Number(currentUser?.id) === Number(data.id)) {
        onProfileUpdate(data);
      }
    } catch (err) {
      console.error(err);
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
    
    // Ethiopian mobile validation: +251... or 09...
    const ethioMobileRegex = /^(?:\+251|0)[1-9]\d{8}$/;
    if (editData.mobile && !ethioMobileRegex.test(editData.mobile)) {
      showToast('Please enter a valid Ethiopian mobile number (e.g., +251912345678 or 0912345678)');
      return;
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

      await axios.put('/api/profile', { 
        ...editData, 
        profile_picture: finalProfilePicture,
        cover_photo: finalCoverPhoto
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setIsEditing(false);
      setProfileFile(null);
      setCoverFile(null);
      fetchProfile();
    } catch (err) {
      console.error(err);
      showToast('Failed to update profile: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };



  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading Profile...</div>;
  if (!profile) return <div style={{ textAlign: 'center', marginTop: '3rem' }}>Profile not found</div>;

  const isOwnProfile = Number(currentUser.id) === Number(profile.id);
  const isRestrictedUser = currentUser.role === 'user';

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
      {/* Header */}
      <header style={{ 
        background: 'white', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem',
        borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Profile</h1>
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
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Full Name / Nickname</label>
                          <input 
                            className="input-field" 
                            value={editData.nickname || ''} 
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
            ) : (
              <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Activity Feed</h3>
                <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                   <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                   <p>No recent activity from this user</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;
