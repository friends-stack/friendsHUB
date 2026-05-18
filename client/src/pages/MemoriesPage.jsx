import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, Plus, Trash2, ArrowLeft, Image as ImageIcon,
  Clock, Calendar, Heart, MessageCircle, Forward, Send, ThumbsUp, Download
} from 'lucide-react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import ShareModal from '../components/ShareModal';

const MemoriesPage = ({ user }) => {
  const navigate = useNavigate();
  const [memories, setMemories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newMemory, setNewMemory] = useState({ title: '', content: '' });
  const [mediaFile, setMediaFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [socket, setSocket] = useState(null);

  const [expandedComments, setExpandedComments] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  const [shareModal, setShareModal] = useState({ isOpen: false, url: '', title: '' });
  const [lightBox, setLightBox] = useState({ isOpen: false, url: '', type: 'image' });
  const [visualConfirm, setVisualConfirm] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger' });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  useEffect(() => {
    const s = io('http://localhost:5000', {
      auth: { token: localStorage.getItem('token') }
    });
    setSocket(s);

    s.on('new_comment', ({ memory_id, comment }) => {
      if (memory_id) {
        setMemories(prev => prev.map(m => 
          Number(m.id) === Number(memory_id) ? { ...m, comments: [...(m.comments || []), comment] } : m
        ));
      }
    });

    s.on('reactions_update', ({ target_id, target_type, reactions }) => {
      if (target_type === 'memory') {
        setMemories(prev => prev.map(m => 
          Number(m.id) === Number(target_id) ? { ...m, reactions } : m
        ));
      }
    });

    fetchMemories();
    return () => s.disconnect();
  }, []);


  const fetchMemories = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/memories', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMemories(data);
    } catch (err) { console.error(err); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setUploading(true);
    let finalMediaUrl = '';

    try {
      if (mediaFile) {
        const formData = new FormData();
        formData.append('image', mediaFile);
        const { data: uploadRes } = await axios.post('http://localhost:5000/api/upload', formData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        });
        finalMediaUrl = uploadRes.url;
      }

      await axios.post('http://localhost:5000/api/memories', {
        ...newMemory,
        media_url: finalMediaUrl
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setShowAdd(false);
      setNewMemory({ title: '', content: '' });
      setMediaFile(null);
      fetchMemories();
      showToast('New memory stored in the bank!');
    } catch (err) { 
      console.error(err); 
      showToast('Failed to save memory: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };


  const handleDelete = (id) => {
    setVisualConfirm({
      isOpen: true,
      title: 'Delete Memory',
      message: 'Are you sure you want to permanently delete this memory? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await axios.delete(`http://localhost:5000/api/memories/${id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          fetchMemories();
          showToast('Memory deleted successfully');
          setVisualConfirm(prev => ({ ...prev, isOpen: false }));
        } catch (err) { showToast('Delete failed'); }
      }
    });
  };

  const handleReaction = async (memoryId, type = 'like') => {
    try {
      await axios.post('http://localhost:5000/api/reactions', {
        target_id: memoryId,
        target_type: 'memory',
        reaction_type: type
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (err) { console.error(err); }
  };

  const handleComment = async (memoryId, content) => {
    try {
      await axios.post('http://localhost:5000/api/comments', {
        memory_id: memoryId,
        content
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (err) { console.error(err); }
  };

  const handleShare = (memoryId, title) => {
    const url = `${window.location.origin}/memories?id=${memoryId}`;
    setShareModal({ isOpen: true, url, title: title || 'Check out this memory!' });
  };

  const handleDownload = async (url) => {
    try {
      showToast('Starting download...');
      const response = await fetch(url);
      const blob = await response.blob();
      
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'memory-image.jpg',
          types: [{
            description: 'Image',
            accept: {'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png']}
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast('Download complete!');
      } else {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'memory-image.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Download failed', err);
        showToast('Download failed');
      }
    }
  };

  const toggleComments = (id) => {
    setExpandedComments(prev => ({ ...prev, [id]: !prev[id] }));
  };




  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif", position: 'relative' }}>
      <style>{`
        @media (max-width: 768px) {
          .memory-timeline { padding-left: 1rem !important; }
          .memory-card-container { gap: 1rem !important; }
          .memory-date-side { min-width: auto !important; margin-bottom: 0.5rem; }
          .memory-card { border-radius: 16px !important; }
          .memory-header { padding: 1rem !important; flex-direction: column; align-items: flex-start !important; gap: 1rem; }
        }
      `}</style>
      
      {/* Share Modal */}
      <ShareModal
        isOpen={shareModal.isOpen}
        onClose={() => setShareModal({ isOpen: false, url: '', title: '' })}
        url={shareModal.url}
        title={shareModal.title}
      />

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
      {lightBox.isOpen && (
        <div 
          onClick={() => setLightBox({ isOpen: false, url: '', type: 'image' })}
          style={{ 
            position: 'fixed', inset: 0, zIndex: 99999, 
            background: 'rgba(0,0,0,0.95)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' 
          }}
        >
          {lightBox.type === 'video' ? (
            <video src={lightBox.url} controls autoPlay style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: '8px' }} />
          ) : (
            <img src={lightBox.url} alt="Full View" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} />
          )}
        </div>
      )}

      {/* Visual Confirm Modal */}
      <AnimatePresence>
        {visualConfirm.isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <Trash2 size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{visualConfirm.title}</h3>
              </div>
              <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '2rem', fontSize: '0.95rem' }}>{visualConfirm.message}</p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setVisualConfirm(prev => ({ ...prev, isOpen: false }))} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={visualConfirm.onConfirm} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#ef4444', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }}>Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="memory-header" style={{ 
        background: 'white', padding: '1rem 2rem', borderBottom: '1px solid #e2e8f0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={24} color="#0f172a" />
          </button>
          <div>
            <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Memory Bank</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>A chronological vault of our best moments</p>
          </div>
        </div>
        {(user.role === 'authorized' || user.role === 'admin' || user.role === 'super_admin') && (
          <button 
            onClick={() => setShowAdd(true)}
            style={{ 
              background: '#00cfde', color: 'white', border: 'none', borderRadius: '8px', 
              padding: '0.6rem 1.2rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' 
            }}
          >
            <Plus size={20} /> New Memory
          </button>
        )}

      </header>

      <main style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1rem' }}>
        {/* Timeline View */}
        <div className="memory-timeline" style={{ position: 'relative', paddingLeft: '2rem' }}>
          <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '2px', background: '#e2e8f0' }} />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
            {memories.map((memory, index) => (
              <motion.div 
                key={memory.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                style={{ position: 'relative' }}
              >
                {/* Timeline Dot */}
                <div style={{ 
                  position: 'absolute', left: '-2.4rem', top: '0', width: '12px', height: '12px', 
                  borderRadius: '50%', background: '#00cfde', border: '4px solid white', boxShadow: '0 0 0 4px #f1f5f9' 
                }} />
                
                <div className="memory-card-container" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  <div className="memory-date-side" style={{ minWidth: '120px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      <Clock size={14} /> {new Date(memory.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="memory-card" style={{ 
                    flex: 1, minWidth: '300px', background: 'white', borderRadius: '24px', padding: '0', 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden'
                  }}>
                    {memory.media_url && (
                      <div 
                        style={{ position: 'relative', cursor: 'zoom-in' }}
                        onClick={(e) => { e.stopPropagation(); setLightBox({ isOpen: true, url: memory.media_url, type: 'image' }); }}
                      >
                        <img 
                          src={memory.media_url} 
                          alt={memory.title} 
                          style={{ 
                            width: '100%', 
                            maxHeight: '500px', 
                            objectFit: 'contain', 
                            background: '#f1f5f9',
                            display: 'block'
                          }} 
                        />
                        <div style={{ 
                          position: 'absolute', inset: 0, 
                          background: 'linear-gradient(to bottom, transparent 60%, rgba(0, 207, 222, 0.1) 100%)' 
                        }} />
                      </div>
                    )}
                    
                    <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#0f172a' }}>{memory.title}</h3>
                      <p style={{ color: '#64748b', lineHeight: '1.6', fontSize: '0.95rem', marginBottom: '1.5rem' }}>{memory.content}</p>
                      
                      <div style={{ marginBottom: '1.5rem' }}>
                        <button 
                          style={{ 
                            background: 'none', 
                            border: '1px solid #00cfde', 
                            color: '#00cfde', 
                            padding: '0.6rem 2rem', 
                            borderRadius: '100px', 
                            fontSize: '0.9rem', 
                            fontWeight: 600, 
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#00cfde'; e.currentTarget.style.color = 'white'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#00cfde'; }}
                        >
                          Read More
                        </button>
                      </div>

                      {/* Interaction Bar */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                        <button 
                          onClick={() => handleReaction(memory.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                        >
                          <ThumbsUp 
                            size={18} 
                            color={memory.reactions?.some(r => Number(r.user_id) === Number(user.id)) ? '#00cfde' : '#64748b'} 
                            fill={memory.reactions?.some(r => Number(r.user_id) === Number(user.id)) ? '#00cfde' : 'none'} 
                          />
                          {memory.reactions?.length > 0 && <span>{memory.reactions.length}</span>}
                        </button>
                        <button 
                          onClick={() => toggleComments(memory.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                        >
                          <MessageCircle size={18} />
                          {memory.comments?.length > 0 && <span>{memory.comments.length}</span>}
                        </button>
                        <button 
                          onClick={() => handleShare(memory.id, memory.title)}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                        >
                          <Forward size={18} />
                        </button>
                        {memory.media_url && (
                          <button 
                            onClick={() => handleDownload(memory.media_url)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                          >
                            <Download size={18} />
                          </button>
                        )}
                      </div>
                    </div>


                    {/* Comments Section (Toggled) */}
                    {expandedComments[memory.id] && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {memory.comments?.map(c => (
                            <div key={c.id} style={{ display: 'flex', gap: '0.75rem' }}>
                              <img src={c.profile_picture || `https://ui-avatars.com/api/?name=${c.nickname}`} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                              <div style={{ background: '#f1f5f9', padding: '0.5rem 0.75rem', borderRadius: '12px', flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.2rem' }}>{c.nickname}</div>
                                <div style={{ color: '#334155', fontSize: '0.9rem' }}>{c.content}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleComment(memory.id, e.target.comment.value);
                            e.target.comment.value = '';
                          }}
                          style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
                        >
                          <img src={user?.profile_picture || `https://ui-avatars.com/api/?name=${user?.nickname || 'U'}`} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                          <div style={{ flex: 1, position: 'relative' }}>
                            <input 
                              name="comment"
                              placeholder="Write a comment..."
                              style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 1rem', borderRadius: '20px', border: '1px solid #e2e8f0', background: '#f8fafc', outline: 'none' }}
                            />
                            <button type="submit" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#0ea5e9', cursor: 'pointer' }}>
                              <Send size={16} />
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <img src={memory.profile_picture || `https://ui-avatars.com/api/?name=${memory.nickname}`} style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Shared by {memory.nickname}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {(memory.user_id === user.id || user.role === 'admin' || user.role === 'super_admin') && (
                          <button onClick={() => handleDelete(memory.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.5rem' }}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Add Memory Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={() => setShowAdd(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
            >
              <h2 style={{ marginBottom: '1.5rem' }}>Store a New Moment</h2>
              <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Title</label>
                  <input 
                    className="input-field" required
                    value={newMemory.title} onChange={(e) => setNewMemory({ ...newMemory, title: e.target.value })} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>The Story</label>
                  <textarea 
                    className="input-field" required style={{ minHeight: '100px' }}
                    value={newMemory.content} onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })} 
                  />
                </div>
                 <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Upload Photo</label>
                  <input 
                    type="file" accept="image/*"
                    onChange={(e) => setMediaFile(e.target.files[0])}
                    style={{ fontSize: '0.85rem' }}
                  />
                  {mediaFile && <p style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '0.25rem' }}>✓ {mediaFile.name}</p>}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                   <button type="submit" disabled={uploading} className="btn-primary" style={{ flex: 1 }}>
                     {uploading ? 'Uploading...' : 'Save Memory'}
                   </button>
                   <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                </div>

              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MemoriesPage;
