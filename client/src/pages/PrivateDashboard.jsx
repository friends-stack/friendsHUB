import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, Users, Settings, ScrollText, 
  Send, Shield, ShieldCheck, LogOut, ChevronRight,
  Heart, Camera, User, Globe, Forward, MessageCircle, ThumbsUp, Download, ArrowLeft, Trash2,
  Lock, Video, Image as ImageIcon, Play, FileVideo, UserPlus, Paperclip, Phone, ArrowUp, ArrowDown,
  MoreVertical, Edit3, MoreHorizontal, Reply, X, Menu,
  Home, LayoutGrid, Bell, ChevronDown, ExternalLink,
  CheckCircle, AlertTriangle, TrendingUp, Check, BellRing, Search, Calendar
} from 'lucide-react';
import ShareModal from '../components/ShareModal';
import ProfilePage from './ProfilePage';
import SavingsTracker from '../components/SavingsTracker';

const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : window.location.origin;
const socket = io(socketUrl, { autoConnect: false });

const resolveImageUrl = (url) => {
  if (!url) return '';
  let clean = String(url).trim();
  if (clean.includes('localhost:5000/uploads/')) {
    clean = clean.substring(clean.indexOf('/uploads/'));
  }
  if (clean.startsWith('http://localhost:5000')) {
    clean = clean.replace('http://localhost:5000', window.location.origin);
  }
  return clean;
};

const handleImageError = (e, originalUrl) => {
  const img = e.currentTarget;
  if (!img) return;
  if (!img.dataset.proxied && originalUrl && !originalUrl.startsWith('data:')) {
    img.dataset.proxied = 'true';
    let cleanUrl = originalUrl;
    if (cleanUrl.includes('localhost:5000/uploads/')) {
      cleanUrl = cleanUrl.substring(cleanUrl.indexOf('/uploads/'));
    }
    img.src = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
    return;
  }
  img.style.display = 'none';
  const fallback = img.nextElementSibling;
  if (fallback && (fallback.classList.contains('image-fallback-container') || fallback.dataset.fallback === 'true')) {
    fallback.style.display = 'flex';
  }
};

const getOriginalFileName = (url) => {
  if (!url) return '';
  const filenameWithTimestamp = url.split('/').pop();
  const hyphenIndex = filenameWithTimestamp.indexOf('-');
  if (hyphenIndex !== -1) {
    return filenameWithTimestamp.substring(hyphenIndex + 1);
  }
  return filenameWithTimestamp;
};

const compressImage = (file, maxWidth = 1600, quality = 0.82) => {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return resolve(file);
    if (file.size <= 250 * 1024) return resolve(file);

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          resolve(file);
        } else {
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressed);
        }
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
};

const PrivateDashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };
  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem('private_active_tab') || 'logs';
  });
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem('private_active_tab', tab);
  };
  const [showMobileUserMenu, setShowMobileUserMenu] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all');
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('read_notif_ids') || '[]');
    } catch {
      return [];
    }
  });
  const [viewingProfileUserId, setViewingProfileUserId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState('all');

  const handleViewProfile = (targetUserId) => {
    setViewingProfileUserId(targetUserId);
    setActiveTab('profile');
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [pendingMedia, setPendingMedia] = useState({ url: '', type: 'text' });
  const [replyTarget, setReplyTarget] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [systemSettings, setSystemSettings] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [personalAssets, setPersonalAssets] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [vaultSubTab, setVaultSubTab] = useState('photo'); // photo or video
  const [uploadingVault, setUploadingVault] = useState(false);
  const [expandedComments, setExpandedComments] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  const [shareModal, setShareModal] = useState({ isOpen: false, url: '', title: '' });
  const messagesEndRef = useRef(null);
  const contentRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const sidebarRef = useRef(null);
  const fileInputRef = useRef(null);
  const [galleryFilePreview, setGalleryFilePreview] = useState(null);
  const [selectedGalleryFile, setSelectedGalleryFile] = useState(null);
  const [galleryTitle, setGalleryTitle] = useState('');
  const [isPostingGallery, setIsPostingGallery] = useState(false);
  const [galleryFormError, setGalleryFormError] = useState('');
  const galleryTitleInputRef = useRef(null);
  const [vaultFilePreview, setVaultFilePreview] = useState(null);
  const galleryFileInputRef = useRef(null);
  const galleryUrlInputRef = useRef(null);
  const vaultFileInputRef = useRef(null);
  const [lightBox, setLightBox] = useState({ isOpen: false, url: '', type: 'image', item: null });
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [visualPrompt, setVisualPrompt] = useState({ isOpen: false, title: '', placeholder: '', onConfirm: null, defaultValue: '' });
  const [visualConfirm, setVisualConfirm] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger' });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const scrollToTop = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  const scrollSidebarToTop = () => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollSidebarToBottom = () => {
    if (sidebarRef.current) {
      sidebarRef.current.scrollTo({ top: sidebarRef.current.scrollHeight, behavior: 'smooth' });
    }
  };


  useEffect(() => {
    let intervalId;

    if (activeTab === 'messages') {
      fetchMessages();
      // Automatic refresh: Poll new messages every 2.5 seconds
      intervalId = setInterval(() => {
        fetchMessages();
      }, 2500);
    }
    if (activeTab === 'users' || activeTab === 'members') fetchUsers();
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'admin') fetchSettings();
    if (activeTab === 'gallery') fetchGallery();
    if (activeTab === 'vault') fetchPersonalAssets();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    socket.auth = { token };
    socket.connect();

    fetchMessages();
    fetchNotifications();
    fetchUsers();
    if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'authorized' || user.created_by_admin === 1) {
      fetchLogs();
      fetchSettings();
      if (user.role === 'super_admin' || user.role === 'admin') {
        fetchGallery();
        fetchPersonalAssets();
      }
    }
    
    socket.emit('join_room', 'private');
    socket.on('receive_message', (msg) => {
      setMessages(prev => {
        if (!msg || !msg.id) return prev;
        if (prev.some(m => Number(m.id) === Number(msg.id))) return prev;
        return [...prev, msg];
      });
      fetchNotifications();
    });

    socket.on('new_notification', (notif) => {
      setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)]);
    });

    socket.on('message_edited', ({ messageId, content }) => {
      setMessages(prev => prev.map(m => Number(m.id) === Number(messageId) ? { ...m, content } : m));
    });

    socket.on('message_deleted', (messageId) => {
      setMessages(prev => prev.filter(m => Number(m.id) !== Number(messageId)));
    });

    socket.on('user_deleted', ({ id }) => {
      setUsers(prev => prev.filter(u => Number(u.id) !== Number(id)));
    });

    socket.on('new_comment', ({ gallery_id, personal_asset_id, comment }) => {
      if (gallery_id) {
        setGallery(prev => prev.map(g => {
          if (Number(g.id) !== Number(gallery_id)) return g;
          // Filter out temporary optimistic comments to prevent duplicate render
          const filteredComments = (g.comments || []).filter(c => 
            !(c.content === comment.content && c.nickname === comment.nickname && c.id > 1000000000000)
          );
          return { ...g, comments: [...filteredComments, comment] };
        }));
      }
      if (personal_asset_id) {
        setPersonalAssets(prev => prev.map(a => {
          if (Number(a.id) !== Number(personal_asset_id)) return a;
          // Filter out temporary optimistic comments to prevent duplicate render
          const filteredComments = (a.comments || []).filter(c => 
            !(c.content === comment.content && c.nickname === comment.nickname && c.id > 1000000000000)
          );
          return { ...a, comments: [...filteredComments, comment] };
        }));
      }
    });

    socket.on('reactions_update', ({ target_id, target_type, reactions }) => {
      if (target_type === 'gallery') {
        setGallery(prev => prev.map(g => 
          Number(g.id) === Number(target_id) ? { ...g, reactions } : g
        ));
      }
      if (target_type === 'personal_asset') {
        setPersonalAssets(prev => prev.map(a => 
          Number(a.id) === Number(target_id) ? { ...a, reactions } : a
        ));
      }
    });

    return () => {
      socket.off('receive_message');
      socket.off('message_edited');
      socket.off('message_deleted');
      socket.off('user_deleted');
      socket.off('new_comment');
      socket.off('reactions_update');
      socket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if ((activeTab === 'gallery' || activeTab === 'vault') && !(user?.role === 'super_admin' || user?.role === 'admin')) {
      setActiveTab('messages');
    }
    if (activeTab === 'users' && user?.role !== 'super_admin') {
      setActiveTab(user?.role === 'admin' ? 'gallery' : 'messages');
    }
  }, [activeTab, user?.role]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const prevLastId = lastMessageIdRef.current;
      
      // Only trigger scroll calculations if a brand new message ID has arrived
      if (lastMsg.id !== prevLastId) {
        const isMyMessage = Number(lastMsg.sender_id || lastMsg.senderId) === Number(user.id);
        const container = contentRef.current;
        
        // Check if the user is scrolled near the bottom (threshold of 200px)
        const isScrolledNearBottom = container 
          ? (container.scrollHeight - container.scrollTop - container.clientHeight < 200)
          : true;

        if (isMyMessage || isScrolledNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        
        lastMessageIdRef.current = lastMsg.id;
      }
    }
  }, [messages, user.id]);

  const fetchMessages = async () => {
    try {
      const { data } = await axios.get('/api/messages', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (Array.isArray(data)) {
        setMessages(prev => {
          const map = new Map();
          for (const m of prev) {
            if (m && m.id) map.set(Number(m.id), m);
          }
          for (const m of data) {
            if (m && m.id) map.set(Number(m.id), m);
          }
          return Array.from(map.values()).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
      }
    } catch (err) { console.error(err); }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await axios.get('/api/notifications', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (data && data.notifications) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.warn('Could not fetch notifications:', err.message);
    }
  };

  const unreadNotificationsCount = notifications.filter(n => !readNotifIds.includes(n.id)).length;
  const filteredNotifications = notifications.filter(item => {
    if (notifFilter === 'all') return true;
    return item.category === notifFilter;
  });

  const markAllNotificationsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadNotifIds(allIds);
    localStorage.setItem('read_notif_ids', JSON.stringify(allIds));
  };

  const markNotificationRead = (id) => {
    if (!readNotifIds.includes(id)) {
      const updated = [...readNotifIds, id];
      setReadNotifIds(updated);
      localStorage.setItem('read_notif_ids', JSON.stringify(updated));
    }
  };

  const fetchUsers = async () => {
    try {
      const endpoint = user?.role === 'super_admin' ? '/api/admin/users' : '/api/users';
      const { data } = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setUsers(data);
    } catch (err) {
      try {
        const { data } = await axios.get('/api/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setUsers(data);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const fetchLogs = async () => {
    try {
      const { data } = await axios.get('/api/admin/logs', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setLogs(data);
    } catch (err) { console.error(err); }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get('/api/admin/settings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSystemSettings(data);
    } catch (err) { console.error(err); }
  };

  const fetchGallery = async () => {
    try {
      const { data } = await axios.get('/api/gallery', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setGallery(data);
    } catch (err) { console.error(err); }
  };
 
  const fetchPersonalAssets = async () => {
    try {
      const { data } = await axios.get('/api/personal-assets', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setPersonalAssets(data);
    } catch (err) { console.error(err); }
  };

  const handleAddGallery = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setGalleryFormError('');

    const title = galleryTitle.trim();
    let file = selectedGalleryFile || (galleryFileInputRef.current && galleryFileInputRef.current.files && galleryFileInputRef.current.files[0]);

    if (!title) {
      setGalleryFormError('Please provide a title for the memory');
      showToast('Please provide a title for the memory');
      galleryTitleInputRef.current?.focus();
      return;
    }

    if (!file) {
      setGalleryFormError('Please select an image file to upload');
      showToast('Please select an image file to upload');
      return;
    }

    setIsPostingGallery(true);

    try {
      if (file.size > 250 * 1024) {
        file = await compressImage(file);
      }

      const postData = new FormData();
      postData.append('image', file);
      postData.append('title', title);
      postData.append('caption', '');

      const { data } = await axios.post('/api/admin/gallery', postData, {
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (data && data.item) {
        setGallery(prev => [data.item, ...prev.filter(item => item.id !== data.item.id)]);
      }

      setGalleryTitle('');
      setSelectedGalleryFile(null);
      setGalleryFilePreview(null);
      setGalleryFormError('');
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';

      showToast('New memory posted to gallery successfully!');
      fetchGallery();
    } catch (err) { 
      console.error('Gallery post error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to post gallery memory';
      setGalleryFormError(errMsg);
      showToast('Upload failed: ' + errMsg); 
    } finally {
      setIsPostingGallery(false);
    }
  };

  const handleUpdateGallery = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get('title');
    const caption = formData.get('caption');
    let url = formData.get('url') || editingItem.url;
    const file = formData.get('file');

    try {
      if (file && file.name) {
        const uploadData = new FormData();
        uploadData.append('image', file);
        const { data: uploadRes } = await axios.post('/api/admin/gallery/upload', uploadData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        });
        url = uploadRes.url;
      }

      await axios.put(`/api/admin/gallery/${editingItem.id}`, { title, caption, url }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setEditingItem(null);
      fetchGallery();
      showToast('Gallery item updated successfully!');
    } catch (err) { showToast('Update failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handleEditGalleryItem = async (id, updatedItem) => {
    try {
      if (updatedItem.type === 'personal') {
        await axios.put(`/api/personal-assets/${id}`, { title: updatedItem.title }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        fetchPersonalAssets();
        showToast('Caption updated successfully!');
        if (lightBox.isOpen && lightBox.item && lightBox.item.id === id) {
          setLightBox(prev => ({ ...prev, item: { ...prev.item, title: updatedItem.title } }));
        }
      } else {
        await axios.put(`/api/admin/gallery/${id}`, updatedItem, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        fetchGallery();
        showToast('Caption updated successfully!');
        if (lightBox.isOpen && lightBox.item && lightBox.item.id === id) {
          setLightBox(prev => ({ ...prev, item: { ...prev.item, title: updatedItem.title } }));
        }
      }
    } catch (err) {
      showToast('Update failed');
    }
  };

  const handleDeleteGallery = (id) => {
    setVisualConfirm({
      isOpen: true,
      title: 'Remove Memory',
      message: 'Are you sure you want to remove this memory from the public gallery?',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/admin/gallery/${id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          fetchGallery();
          showToast('Memory removed from gallery');
          setVisualConfirm(prev => ({ ...prev, isOpen: false }));
        } catch (err) { showToast('Delete failed'); }
      }
    });
  };

  const handleAddPersonalAsset = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get('title');
    const file = formData.get('file');
    const type = vaultSubTab; // photo or video

    if (!file || !file.name) return showToast('Please select a file');

    setUploadingVault(true);
    try {
      const uploadData = new FormData();
      uploadData.append('media', file);
      uploadData.append('title', title);
      uploadData.append('type', type);

      await axios.post('/api/personal-assets', uploadData, {
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      e.target.reset();
      setVaultFilePreview(null);
      fetchPersonalAssets();
      showToast('Asset added to vault');
    } catch (err) { 
      showToast('Upload failed: ' + (err.response?.data?.error || err.message)); 
    }
    setUploadingVault(false);
  };

  const handleDeletePersonalAsset = (id) => {
    setVisualConfirm({
      isOpen: true,
      title: 'Delete Asset',
      message: 'This will permanently delete this asset from your private vault. This action cannot be undone.',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/personal-assets/${id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          fetchPersonalAssets();
          showToast('Asset deleted permanently');
          setVisualConfirm(prev => ({ ...prev, isOpen: false }));
        } catch (err) { showToast('Delete failed'); }
      }
    });
  };

  const handlePersonalReaction = async (assetId, type = 'like') => {
    // Optimistic update
    setPersonalAssets(prev => prev.map(a => {
      if (Number(a.id) !== Number(assetId)) return a;
      const alreadyLiked = a.reactions?.some(r => Number(r.user_id) === Number(user.id));
      const newReactions = alreadyLiked
        ? a.reactions.filter(r => Number(r.user_id) !== Number(user.id))
        : [...(a.reactions || []), { user_id: user.id, reaction_type: type }];
      return { ...a, reactions: newReactions };
    }));

    try {
      const { data } = await axios.post('/api/reactions', {
        target_id: assetId,
        target_type: 'personal_asset',
        reaction_type: type
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setPersonalAssets(prev => prev.map(a => 
        Number(a.id) === Number(assetId) ? { ...a, reactions: data.reactions || a.reactions } : a
      ));
    } catch (err) {
      console.error(err);
      fetchPersonalAssets();
    }
  };

  const handlePersonalComment = async (assetId, content) => {
    if (!content.trim()) return;
    // Optimistic update — add comment instantly to local state
    const newComment = {
      id: Date.now(),
      content,
      nickname: user.nickname || user.email.split('@')[0],
      profile_picture: user.profile_picture || null,
      created_at: new Date().toISOString()
    };
    setPersonalAssets(prev => prev.map(a =>
      Number(a.id) === Number(assetId)
        ? { ...a, comments: [...(a.comments || []), newComment] }
        : a
    ));
    try {
      const { data } = await axios.post('/api/comments', {
        personal_asset_id: assetId,
        content
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Sync with real server data if server returns updated comments
      if (data.comments) {
        setPersonalAssets(prev => prev.map(a =>
          Number(a.id) === Number(assetId) ? { ...a, comments: data.comments } : a
        ));
      }
    } catch (err) {
      console.error(err);
      fetchPersonalAssets(); // revert on error
    }
  };

  const handlePersonalShare = (assetId, title) => {
    const url = `${window.location.origin}/private?id=${assetId}`;
    setShareModal({ isOpen: true, url, title: title || 'Check out this private moment!' });
  };

  const handleGalleryReaction = async (galleryId, type = 'like') => {
    // Optimistically update the state immediately
    setGallery(prev => prev.map(g => {
      if (Number(g.id) !== Number(galleryId)) return g;
      const alreadyLiked = g.reactions?.some(r => Number(r.user_id) === Number(user.id));
      const newReactions = alreadyLiked
        ? g.reactions.filter(r => Number(r.user_id) !== Number(user.id))
        : [...(g.reactions || []), { user_id: user.id, reaction_type: type }];
      return { ...g, reactions: newReactions };
    }));

    try {
      const { data } = await axios.post('/api/reactions', {
        target_id: galleryId,
        target_type: 'gallery',
        reaction_type: type
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Sync with real server data
      setGallery(prev => prev.map(g => 
        Number(g.id) === Number(galleryId) ? { ...g, reactions: data.reactions || g.reactions } : g
      ));
    } catch (err) {
      console.error(err);
      // Revert on error - re-fetch from server
      fetchGallery();
    }
  };

  const handleGalleryComment = async (galleryId, content) => {
    if (!content.trim()) return;
    // Optimistic update — add comment instantly to local state
    const newComment = {
      id: Date.now(),
      content,
      nickname: user.nickname || user.email.split('@')[0],
      profile_picture: user.profile_picture || null,
      created_at: new Date().toISOString()
    };
    setGallery(prev => prev.map(g =>
      Number(g.id) === Number(galleryId)
        ? { ...g, comments: [...(g.comments || []), newComment] }
        : g
    ));
    try {
      const { data } = await axios.post('/api/comments', {
        gallery_id: galleryId,
        content
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Sync with real server data if server returns updated comments
      if (data.comments) {
        setGallery(prev => prev.map(g =>
          Number(g.id) === Number(galleryId) ? { ...g, comments: data.comments } : g
        ));
      }
    } catch (err) {
      console.error(err);
      fetchGallery(); // revert on error
    }
  };

  const handleGalleryShare = (galleryId, title) => {
    const url = `${window.location.origin}/gallery?id=${galleryId}`;
    setShareModal({ isOpen: true, url, title: title || 'Check out this gallery item!' });
  };

  const handleDownload = async (url, title) => {
    try {
      showToast('Starting download...');
      const response = await fetch(url);
      const blob = await response.blob();
      
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: title ? `${title}.jpg` : 'download.jpg',
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
        link.download = title ? `${title}.jpg` : 'download.jpg';
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



  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !pendingMedia.url) return;
    const msgData = { 
      senderId: Number(user.id), 
      sender_id: Number(user.id),
      receiverId: null, // Broadcast from dashboard
      receiver_id: null,
      replyToId: replyTarget ? Number(replyTarget.id) : null,
      sender_email: user.email, 
      content: newMessage, 
      media_url: pendingMedia.url,
      media_type: pendingMedia.type,
      created_at: new Date().toISOString() 
    };
    socket.emit('send_message', msgData);
    setNewMessage('');
    setPendingMedia({ url: '', type: 'text' });
    setReplyTarget(null);
  };

  const scrollToMessage = (targetId) => {
    if (!targetId) return;
    const element = document.getElementById(`msg-${targetId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(targetId);
      setTimeout(() => {
        setHighlightedMsgId(null);
      }, 2000);
    }
  };

  const handleSaveEdit = async (messageId) => {
    if (!editingText.trim()) return;
    try {
      await axios.put(`/api/messages/${messageId}`, {
        content: editingText
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMessages(prev => prev.map(m => Number(m.id) === Number(messageId) ? { ...m, content: editingText } : m));
      setEditingMessageId(null);
      setEditingText('');
      showToast('Message updated!');
    } catch (err) {
      console.error(err);
      showToast('Failed to edit message');
    }
  };

  const handleDeleteMessage = (messageId) => {
    setVisualConfirm({
      isOpen: true,
      title: 'Delete Message',
      message: 'Are you sure you want to permanently delete this message? This action cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/messages/${messageId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          setMessages(prev => prev.filter(m => Number(m.id) !== Number(messageId)));
          showToast('Message deleted successfully! 🗑️');
          setVisualConfirm(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error(err);
          showToast('Failed to delete message');
        }
      }
    });
  };

  const handleDownloadFile = async (e, fileUrl, defaultName) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (window.showSaveFilePicker) {
        showToast('Opening destination folder picker...');
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        
        // Suggest name and trigger native Save As file picker
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName
        });
        
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast('File saved successfully! 🎉');
      } else {
        // Safe backward compatibility fallback
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = defaultName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Download started! Check browser downloads.');
      }
    } catch (err) {
      // Gracefully handle cancellation (AbortError) or networking issues
      console.log('Download picker flow status:', err);
    }
  };

  const promptMedia = () => {
    setVisualPrompt({
      isOpen: true,
      title: 'Attachment URL',
      placeholder: 'Paste media URL here...',
      defaultValue: '',
      onConfirm: (url) => {
        if (url) setPendingMedia({ url, type: 'image' });
        setVisualPrompt(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleChatFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast('Uploading file...');
      const formData = new FormData();
      formData.append('image', file, file.name);
      
      const { data } = await axios.post('/api/upload', formData, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const fileType = file.type.startsWith('image/') 
        ? 'image' 
        : file.type.startsWith('video/') 
        ? 'video' 
        : file.type.startsWith('audio/') 
        ? 'audio' 
        : 'file';

      setPendingMedia({ 
        url: data.url, 
        type: fileType,
        fileName: file.name
      });
      showToast('File attached!');
    } catch (err) {
      console.error(err);
      showToast('Upload failed');
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await axios.post('/api/admin/users/role', { userId, role: newRole }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      fetchUsers();
      showToast('User role updated successfully');
      fetchGallery();
      showToast('Profile updated successfully');
    } catch (err) { showToast('Update failed'); } 
  };

  const handleUpdateSetting = async (key, newValue) => {
    try {
      await axios.post('/api/admin/settings/toggle', { key, value: newValue }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      fetchSettings();
      showToast('System setting updated successfully! 🎉');
    } catch (err) { showToast('Setting update failed'); }
  };

  const handleToggleSetting = async (key, currentValue) => {
    const newValue = currentValue === 'true' ? 'false' : 'true';
    handleUpdateSetting(key, newValue);
  };

  const handleMakeCoverPhoto = async (url) => {
    try {
      await axios.post('/api/admin/users/cover-photo', { url }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      showToast('Cover photo updated!');
    } catch (err) { showToast('Update failed'); }
  };

  const TabButton = ({ id, icon: Icon, label, disabled = false, onClick }) => (
    <button 
      onClick={() => {
        if (!disabled) {
          if (id === 'profile') setViewingProfileUserId(null);
          setActiveTab(id);
          if (onClick) onClick();
        }
      }}

      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%',
        padding: '1rem',
        borderRadius: '12px',
        border: 'none',
        background: activeTab === id ? '#f1f5f9' : 'transparent',
        color: activeTab === id ? '#84cc16' : '#64748b',
        fontWeight: activeTab === id ? 700 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition)',
        textAlign: 'left',
        opacity: disabled ? 0.4 : 1
      }}
    >
      <Icon size={18} />
      <span style={{ flex: 1 }}>{label}</span>
      {activeTab === id && <ChevronRight size={14} />}
    </button>
  );

  return (
    <div className="dashboard-container" style={{ display: 'flex', height: '100vh', background: 'var(--background)', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .dashboard-container { flex-direction: row; }
        .mobile-app-header { display: none !important; }
        @media (max-width: 768px) {
          .dashboard-container { flex-direction: column !important; }
          .sidebar-nav { display: none !important; }
          .main-content { padding: 0 !important; height: calc(100vh - 64px) !important; width: 100% !important; }
          .mobile-app-header { display: flex !important; }
          .dashboard-header { display: none !important; }
          .mobile-bottom-nav { display: flex !important; }
          .grid { grid-template-columns: 1fr !important; }
          .header-logout-btn { display: none !important; }
          .mobile-menu-toggle { display: none !important; }
          .tab-buttons-container { overflow-x: auto; white-space: nowrap; padding-bottom: 0.5rem; }
          .glass-card { padding: 1rem !important; }
          .dashboard-section { padding: 0.75rem 0.75rem 80px 0.75rem !important; }
          .chat-input-form { margin-bottom: 70px !important; }
          .chat-messages-container { padding: 1rem 0.5rem !important; }
          .chat-message-bubble-wrapper { 
            width: auto !important;
            max-width: 95% !important; 
          }
        }
        .chat-input-field-container:focus-within {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15) !important;
        }
        .mobile-bottom-nav { 
          display: none; 
          position: fixed; bottom: 0; left: 0; right: 0; 
          height: 64px; background: white; border-top: 1px solid #e2e8f0;
          z-index: 1000; justify-content: space-around; align-items: center; padding: 0 0.5rem;
          box-shadow: 0 -2px 10px rgba(0,0,0,0.03);
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Responsive Vault Elements */
        .vault-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        .add-asset-form {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 16px;
          margin-bottom: 2rem;
        }
        @media (max-width: 768px) {
          .vault-header-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 1rem !important;
          }
          .vault-header-row > div {
            width: 100% !important;
            justify-content: space-between !important;
          }
          .vault-header-row button {
            flex: 1 !important;
            text-align: center !important;
          }
          .add-asset-form {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1rem !important;
          }
        }

        /* Responsive Enroll Form */
        .enroll-form {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .enroll-form {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1rem !important;
          }
          .enroll-form input, .enroll-form select {
            width: 100% !important;
            flex: none !important;
          }
          .enroll-form select {
            width: 100% !important;
          }
        }

        /* Responsive Memory elements */
        .memory-row-inputs {
          display: flex;
          gap: 1rem;
        }
        .memory-upload-container {
          display: flex;
          gap: 1rem;
          align-items: center;
        }
        @media (max-width: 768px) {
          .memory-row-inputs {
            flex-direction: column !important;
            gap: 0.75rem !important;
          }
          .memory-upload-container {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1rem !important;
          }
          .memory-upload-divider {
            display: none !important;
          }
          .memory-publish-btn {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
      
      {/* Share Modal */}
      <ShareModal
        isOpen={shareModal.isOpen}
        onClose={() => setShareModal({ isOpen: false, url: '', title: '' })}
        url={shareModal.url}
        title={shareModal.title}
        showToast={showToast}
      />

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }} 
            animate={{ opacity: 1, y: 0, x: '-50%' }} 
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            style={{ 
              position: 'fixed', bottom: '5.5rem', left: '50%', zIndex: 99999, 
              background: '#0f172a', color: 'white', padding: '0.85rem 1.75rem', 
              borderRadius: '30px', fontWeight: 600, fontSize: '0.9rem', 
              boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.35)',
              display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none',
              maxWidth: '90vw', textAlign: 'center'
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Notifications Drawer / Modal */}
      <AnimatePresence>
        {showNotificationsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3500,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'stretch'
            }}
            onClick={() => setShowNotificationsModal(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '460px',
                background: '#ffffff',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '-10px 0 35px rgba(0,0,0,0.2)',
                position: 'relative'
              }}
            >
              {/* Header */}
              <div style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffffff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16a34a'
                  }}>
                    <BellRing size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      Notifications
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                      {unreadNotificationsCount > 0 ? `${unreadNotificationsCount} unread alert${unreadNotificationsCount > 1 ? 's' : ''}` : 'All caught up'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {unreadNotificationsCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#475569',
                        padding: '0.45rem 0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                      title="Mark all as read"
                    >
                      <Check size={14} color="#16a34a" />
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNotificationsModal(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b'
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Filter Pills */}
              <div style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                gap: '0.4rem',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                background: '#fafafa'
              }}>
                {[
                  { key: 'all', label: `All (${notifications.length})` },
                  { key: 'message', label: '💬 Messages' },
                  { key: 'image', label: '🖼️ Images' },
                  { key: 'member', label: '👥 Members' },
                  { key: 'profile', label: '👤 Profile' },
                  { key: 'saving_missed', label: '⚠️ Missed' },
                  { key: 'saving_payment', label: '💰 Payments' },
                  { key: 'investment', label: '📈 Investments' }
                ].map(tab => {
                  const active = notifFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setNotifFilter(tab.key)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '20px',
                        border: active ? '1px solid #16a34a' : '1px solid #e2e8f0',
                        background: active ? '#16a34a' : '#ffffff',
                        color: active ? '#ffffff' : '#475569',
                        fontSize: '0.75rem',
                        fontWeight: active ? 700 : 500,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Notifications List */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                {filteredNotifications.length === 0 ? (
                  <div style={{
                    margin: 'auto',
                    textAlign: 'center',
                    padding: '2rem 1rem',
                    color: '#94a3b8'
                  }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 1rem',
                      color: '#94a3b8'
                    }}>
                      <BellRing size={28} />
                    </div>
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
                      No notifications
                    </div>
                    <div style={{ fontSize: '0.8rem' }}>
                      {notifFilter === 'all' 
                        ? "You're all caught up with recent activities!"
                        : `No notifications found under selected filter.`}
                    </div>
                  </div>
                ) : (
                  filteredNotifications.map(item => {
                    const isUnread = !readNotifIds.includes(item.id);
                    const getIconAndBg = () => {
                      switch (item.category) {
                        case 'message':
                          return { icon: <MessageCircle size={18} color="#2563eb" />, bg: '#eff6ff' };
                        case 'image':
                          return { icon: <ImageIcon size={18} color="#16a34a" />, bg: '#f0fdf4' };
                        case 'member':
                          return { icon: <Users size={18} color="#8b5cf6" />, bg: '#f5f3ff' };
                        case 'profile':
                          return { icon: <User size={18} color="#0284c7" />, bg: '#f0f9ff' };
                        case 'saving_missed':
                          return { icon: <AlertTriangle size={18} color="#ef4444" />, bg: '#fef2f2' };
                        case 'saving_payment':
                          return { icon: <CheckCircle size={18} color="#16a34a" />, bg: '#f0fdf4' };
                        case 'investment':
                          return { icon: <TrendingUp size={18} color="#d97706" />, bg: '#fffbeb' };
                        default:
                          return { icon: <Bell size={18} color="#64748b" />, bg: '#f1f5f9' };
                      }
                    };
                    const { icon, bg } = getIconAndBg();

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          markNotificationRead(item.id);
                          if (item.target_tab) {
                            setActiveTab(item.target_tab);
                            setShowNotificationsModal(false);
                          }
                        }}
                        style={{
                          background: isUnread ? '#f8fafc' : '#ffffff',
                          border: isUnread ? '1px solid #cbd5e1' : '1px solid #f1f5f9',
                          borderRadius: '16px',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          display: 'flex',
                          gap: '0.85rem',
                          boxShadow: isUnread ? '0 2px 8px rgba(0,0,0,0.04)' : 'none'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#16a34a'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = isUnread ? '#cbd5e1' : '#f1f5f9'; }}
                      >
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {icon}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                            <div style={{
                              fontWeight: isUnread ? 800 : 600,
                              fontSize: '0.9rem',
                              color: isUnread ? '#0f172a' : '#334155',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {item.title}
                            </div>
                            {isUnread && (
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#16a34a',
                                flexShrink: 0
                              }} />
                            )}
                          </div>

                          <div style={{
                            fontSize: '0.82rem',
                            color: '#64748b',
                            lineHeight: 1.4,
                            marginBottom: '0.5rem',
                            wordBreak: 'break-word'
                          }}>
                            {item.description}
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.72rem',
                            color: '#94a3b8'
                          }}>
                            <span>
                              {item.created_at ? new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                            </span>
                            {item.target_tab && (
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>
                                View {item.target_tab.toUpperCase()} →
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
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
            style={{ 
              position: 'fixed', inset: 0, zIndex: 3000, 
              background: 'rgba(0,0,0,0.95)', display: 'flex', 
              alignItems: 'center', justifyContent: 'center' 
            }}
          >
            {/* Top Bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3001 }}>
              <button 
                onClick={() => setLightBox({ isOpen: false, url: '', item: null })}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <ArrowLeft size={20} />
              </button>
              
              <button 
                onClick={(e) => { e.stopPropagation(); setShowPhotoOptions(true); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <MoreVertical size={20} />
              </button>
            </div>

            <div 
              onClick={() => setLightBox({ isOpen: false, url: '', item: null })}
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
            >
              {lightBox.type === 'video' ? (
                <video src={lightBox.url} controls autoPlay style={{ maxWidth: '95%', maxHeight: '95%', borderRadius: '8px' }} onClick={e => e.stopPropagation()} />
              ) : (
                <img 
                  src={resolveImageUrl(lightBox.url)} 
                  alt="Full View" 
                  referrerPolicy="no-referrer"
                  onError={(e) => handleImageError(e, lightBox.url)}
                  style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} 
                />
              )}
            </div>

            {/* Photo Options Bottom Sheet */}
            <AnimatePresence>
              {showPhotoOptions && (
                <motion.div 
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  style={{ 
                    position: 'absolute', bottom: 0, left: 0, right: 0, 
                    background: 'white', borderRadius: '32px 32px 0 0', 
                    padding: '1.5rem', zIndex: 3002,
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.5)'
                  }}
                >
                  <div style={{ width: '40px', height: '4px', background: '#e2e8f0', borderRadius: '2px', margin: '0 auto 1.5rem' }} />
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>


                    <button 
                      onClick={() => { 
                        setShowPhotoOptions(false);
                        setVisualPrompt({
                          isOpen: true,
                          title: 'Edit Caption',
                          placeholder: 'Enter new description...',
                          defaultValue: lightBox.item?.title || '',
                          onConfirm: (newTitle) => {
                            if (newTitle !== null) handleEditGalleryItem(lightBox.item.id, { ...lightBox.item, title: newTitle });
                            setVisualPrompt(prev => ({ ...prev, isOpen: false }));
                          }
                        });
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'none', border: 'none', width: '100%', cursor: 'pointer', borderRadius: '12px' }}
                    >
                      <Edit3 size={20} color="#64748b" />
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>Edit caption</span>
                    </button>

                    <button 
                      onClick={() => {
                        setShowPhotoOptions(false);
                        if (lightBox.item?.type === 'personal') handleDeletePersonalAsset(lightBox.item.id);
                        else handleDeleteGallery(lightBox.item.id);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'none', border: 'none', width: '100%', cursor: 'pointer', borderRadius: '12px' }}
                    >
                      <Trash2 size={20} color="#ef4444" />
                      <span style={{ fontWeight: 600, color: '#ef4444' }}>Delete photo</span>
                    </button>

                    <button 
                      onClick={() => handleDownload(lightBox.url)}
                      style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'none', border: 'none', width: '100%', cursor: 'pointer', borderRadius: '12px' }}
                    >
                      <Download size={20} color="#64748b" />
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>Save to phone</span>
                    </button>


                  </div>

                  <button 
                    onClick={() => setShowPhotoOptions(false)}
                    style={{ width: '100%', marginTop: '1rem', padding: '1.25rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Prompt Modal */}
      <AnimatePresence>
        {visualPrompt.isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(132, 204, 22, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#84cc16' }}>
                  <ImageIcon size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{visualPrompt.title}</h3>
              </div>
              <input 
                id="visual-prompt-input"
                autoFocus
                defaultValue={visualPrompt.defaultValue}
                onChange={e => visualPrompt.tempValue = e.target.value}
                placeholder={visualPrompt.placeholder}
                onKeyDown={e => {
                  if (e.key === 'Enter') visualPrompt.onConfirm(e.target.value);
                  if (e.key === 'Escape') setVisualPrompt(prev => ({ ...prev, isOpen: false }));
                }}
                style={{ width: '100%', padding: '1.25rem', borderRadius: '16px', border: '2px solid #f1f5f9', background: '#f8fafc', fontSize: '1rem', marginBottom: '1.5rem', outline: 'none', transition: 'all 0.2s' }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setVisualPrompt(prev => ({ ...prev, isOpen: false }))} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>Cancel</button>
                <button onClick={() => visualPrompt.onConfirm(document.getElementById('visual-prompt-input').value)} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#84cc16', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(132, 204, 22, 0.3)', transition: 'transform 0.2s' }}>Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Visual Confirm Modal */}
      <AnimatePresence>
        {visualConfirm.isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: visualConfirm.type === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: visualConfirm.type === 'danger' ? '#ef4444' : '#3b82f6' }}>
                  <Shield size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{visualConfirm.title}</h3>
              </div>
              <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '2rem', fontSize: '0.95rem' }}>{visualConfirm.message}</p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setVisualConfirm(prev => ({ ...prev, isOpen: false }))} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Go Back</button>
                <button onClick={visualConfirm.onConfirm} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: visualConfirm.type === 'danger' ? '#ef4444' : '#3b82f6', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: visualConfirm.type === 'danger' ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(59, 130, 246, 0.3)' }}>Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Sliding Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(4px)',
                zIndex: 9990
              }}
            />
            {/* Drawer Panel */}
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                position: 'fixed',
                top: 0,
                bottom: 0,
                left: 0,
                width: '300px',
                background: 'white',
                boxShadow: '20px 0 40px rgba(0,0,0,0.15)',
                zIndex: 9995,
                display: 'flex',
                flexDirection: 'column',
                padding: '2rem 1.5rem'
              }}
            >
              {/* Header with Close button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <img src="/logo.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '1px', color: '#16a34a' }}>F.R.I.E.N.D.S</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Nav buttons */}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
                <TabButton id="messages" icon={MessageSquare} label="Friends Chat" onClick={() => setMobileMenuOpen(false)} />
                <TabButton id="members" icon={Users} label="Community Members" onClick={() => setMobileMenuOpen(false)} />
                <TabButton id="profile" icon={User} label="My Profile" onClick={() => { setViewingProfileUserId(null); setMobileMenuOpen(false); }} />

                {(user.role === 'super_admin' || user.role === 'admin' || user.role === 'authorized' || user.created_by_admin === 1) && (
                  <>
                    <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }} />
                    {user.role === 'super_admin' && (
                      <TabButton id="users" icon={Users} label="Authority Matrix" onClick={() => setMobileMenuOpen(false)} />
                    )}
                    {(user.role === 'super_admin' || user.role === 'admin') && (
                      <>
                        <TabButton id="gallery" icon={ImageIcon} label="Gallery Curator" onClick={() => setMobileMenuOpen(false)} />
                        <TabButton id="vault" icon={Lock} label="Private Photos & Videos" onClick={() => setMobileMenuOpen(false)} />
                      </>
                    )}
                    <TabButton id="logs" icon={ScrollText} label="Friend's Saving" onClick={() => setMobileMenuOpen(false)} />
                    <TabButton id="admin" icon={Settings} label="Core Engine" onClick={() => setMobileMenuOpen(false)} />
                  </>
                )}
              </nav>

              {/* Sign Out */}
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                style={{ 
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.8rem 1.25rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'rgba(239, 68, 68, 0.05)',
                  color: 'var(--secondary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                <LogOut size={18} /> Sign Out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar */}

      <aside className="sidebar-nav" style={{ 
        width: '280px', 
        background: 'var(--surface)', 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', paddingLeft: '0.5rem' }}>
          <div style={{ resize: 'both', overflow: 'hidden', width: '40px', height: '40px', minWidth: '20px', minHeight: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img 
              src="/logo.png" 
              alt="Logo" 
              onClick={() => setShowLogoModal(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'zoom-in' }} 
            />
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '1px', color: '#16a34a', whiteSpace: 'nowrap' }}>F.R.I.E.N.D.S</span>
        </div>

        <nav 
          ref={sidebarRef}
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem', 
            flex: 1, 
            overflowY: 'auto',
            paddingRight: '4px',
            marginBottom: '1rem'
          }}
        >
          <TabButton id="messages" icon={MessageSquare} label="Friends Chat" />
          <TabButton id="members" icon={Users} label="Community Members" />
          <TabButton id="profile" icon={User} label="My Profile" onClick={() => setViewingProfileUserId(null)} />

          
          {(user.role === 'super_admin' || user.role === 'admin' || user.role === 'authorized' || user.created_by_admin === 1) && (
            <>
              <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }} />
              {user.role === 'super_admin' && (
                <TabButton id="users" icon={Users} label="Authority Matrix" />
              )}
              {(user.role === 'super_admin' || user.role === 'admin') && (
                <>
                  <TabButton id="gallery" icon={ImageIcon} label="Gallery Curator" />
                  <TabButton id="vault" icon={Lock} label="Private Photos & Videos" />
                </>
              )}
              <TabButton id="logs" icon={ScrollText} label="Friend's Saving" />
              <TabButton id="admin" icon={Settings} label="Core Engine" />
            </>
          )}
        </nav>

        <button 
          onClick={handleLogout}
          style={{ 
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.8rem 1.25rem',
            borderRadius: '12px',
            border: 'none',
            background: 'rgba(239, 68, 68, 0.05)',
            color: 'var(--secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            width: '100%'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
        >
          <LogOut size={18} /> Sign Out
        </button>
      </aside>

      {/* Main Content */}
      {activeTab === 'profile' ? (
        <div ref={contentRef} className="main-content" style={{ flex: 1, overflowY: 'auto', height: '100vh' }}>
          <ProfilePage 
            currentUser={user} 
            userId={viewingProfileUserId || user.id} 
            previewUser={viewingProfileUserId ? users.find(u => Number(u.id) === Number(viewingProfileUserId)) : user}
            onProfileUpdate={(updatedUser) => {
              if (typeof setUser !== 'undefined' && setUser) {
                setUser(updatedUser);
              }
              localStorage.setItem('user', JSON.stringify(updatedUser));
            }}
            onBackToSelf={() => setViewingProfileUserId(null)}
            onOpenDirectory={() => {
              setViewingProfileUserId(null);
              setActiveTab('members');
            }}
          />
        </div>
      ) : (
      <main ref={contentRef} className="main-content" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Dedicated Mobile Header Bar — Matches Mobile App Design */}
        <header className="mobile-app-header" style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Mobile Navigation Drawer Trigger & Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button 
              type="button"
              className="mobile-hamburger-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Toggle navigation menu"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                width: '38px',
                height: '38px',
                cursor: 'pointer',
                color: '#1e293b',
                padding: 0,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                flexShrink: 0
              }}
            >
              <Menu size={22} color="#1e293b" />
            </button>
            <div 
              onClick={() => { setActiveTab('logs'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <img 
                src="/logo.png" 
                alt="Friends Logo" 
                style={{ width: '32px', height: '32px', objectFit: 'contain' }} 
              />
              <span style={{ 
                fontWeight: 900, 
                fontSize: '1.2rem', 
                letterSpacing: '1.5px', 
                color: '#16a34a',
                fontFamily: "'Outfit', 'Inter', sans-serif"
              }}>
                F.R.I.E.N.D.S
              </span>
            </div>
          </div>

          {/* Right Action Icons: Bell & Avatar dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', position: 'relative' }}>
            <button 
              type="button"
              onClick={() => {
                setShowNotificationsModal(true);
                fetchNotifications();
              }}
              style={{ 
                position: 'relative', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                padding: '4px'
              }}
              title="Notifications"
            >
              <Bell size={22} color="#475569" />
              {unreadNotificationsCount > 0 && (
                <span style={{ 
                  position: 'absolute', 
                  top: '-4px', 
                  right: '-4px', 
                  minWidth: '18px', 
                  height: '18px', 
                  background: '#ef4444', 
                  color: 'white', 
                  borderRadius: '999px', 
                  border: '2px solid white', 
                  fontSize: '0.65rem', 
                  fontWeight: 800, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '0 3px', 
                  boxShadow: '0 2px 5px rgba(239,68,68,0.4)' 
                }}>
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            <div 
              onClick={() => setShowMobileUserMenu(prev => !prev)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
            >
              <div style={{ 
                width: '34px', 
                height: '34px', 
                borderRadius: '50%', 
                background: '#2563eb', 
                color: 'white', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontWeight: 800, 
                fontSize: '0.95rem',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
              }}>
                {(user?.nickname || user?.name || user?.email || 'E').charAt(0).toUpperCase()}
              </div>
              <ChevronDown size={18} color="#64748b" />
            </div>

            {showMobileUserMenu && (
              <div 
                style={{
                  position: 'absolute',
                  top: '45px',
                  right: 0,
                  background: 'white',
                  borderRadius: '16px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                  border: '1px solid #e2e8f0',
                  padding: '0.75rem',
                  zIndex: 2000,
                  minWidth: '180px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{user?.nickname || user?.email}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user?.role?.replace(/_/g, ' ')}</div>
                </div>
                <button 
                  onClick={() => { setActiveTab('members'); setShowMobileUserMenu(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', border: 'none', background: 'none', color: '#1e293b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', borderRadius: '8px' }}
                >
                  <Users size={16} /> Community Members
                </button>
                <button 
                  onClick={() => { setViewingProfileUserId(null); setActiveTab('profile'); setShowMobileUserMenu(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', border: 'none', background: 'none', color: '#1e293b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', borderRadius: '8px' }}
                >
                  <User size={16} /> My Profile
                </button>
                <button 
                  onClick={handleLogout}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', border: 'none', background: '#fef2f2', color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left', borderRadius: '8px' }}
                >
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        <header className="dashboard-header" style={{ 
          padding: '1.5rem 3rem', 
          background: 'var(--surface)', 
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'nowrap', minWidth: 0 }}>
            <button 
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              style={{
                display: 'none',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '8px',
                width: '40px',
                height: '40px',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <Menu size={20} />
            </button>
            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={24} color="var(--text)" />
            </button>
            {activeTab === 'messages' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'nowrap' }}>
                  <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    background: '#8b5cf6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '1rem',
                    flexShrink: 0
                  }}>
                    G
                  </div>
                  <div 
                    onClick={() => setActiveTab('members')}
                    style={{ cursor: 'pointer' }}
                    title="View Community Members & Mutual Profiles"
                  >
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#1e293b', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Friends Group
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', borderRadius: '100px' }}>
                        👥 {users.length > 0 ? `${users.length} Members` : 'Directory'}
                      </span>
                    </h2>
                  </div>
                </div>
            ) : (
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                  {activeTab === 'members' && '👥 Community Directory & Profiles'}
                  {activeTab === 'users' && 'System Authority Matrix'}
                  {activeTab === 'logs' && 'Friends Saving & Capital Management'}
                  {activeTab === 'admin' && 'Core Engine & Permissions'}
                  {activeTab === 'gallery' && 'Friends Gallery Curator'}
                  {activeTab === 'vault' && 'Private Photos & Videos Vault'}
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  {activeTab === 'members' && 'Mutual profile viewing for all members, admins & superadmins'}
                  {activeTab === 'users' && 'Configure member permissions and system access'}
                  {activeTab === 'logs' && 'Real-time savings pool and transaction ledgers'}
                  {activeTab === 'admin' && 'Advanced system configurations'}
                  {activeTab === 'gallery' && 'Shared memory assets and community posts'}
                  {activeTab === 'vault' && 'Secure private files and personal media'}
                </p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setShowNotificationsModal(true);
                fetchNotifications();
              }}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                color: '#475569',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#16a34a'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; }}
              title="Notifications"
            >
              <Bell size={20} />
              {unreadNotificationsCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  minWidth: '18px',
                  height: '18px',
                  background: '#ef4444',
                  color: 'white',
                  borderRadius: '999px',
                  border: '2px solid white',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  boxShadow: '0 2px 5px rgba(239,68,68,0.4)'
                }}>
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>

            <button 
              className="header-logout-btn"
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'var(--secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
            >
              <LogOut size={16} /> <span>Sign Out</span>
            </button>
          </div>
        </header>

        <section className="dashboard-section" style={{ 
          flex: 1, 
          padding: '2rem 3rem', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: 0,
          overflowY: activeTab === 'messages' ? 'hidden' : 'auto'
        }}>
          <AnimatePresence mode="wait">
            {activeTab === 'messages' && (
              <motion.div 
                key="messages"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
              >
                {/* Visual Graphic Banner Card representing focal point */}
                <div style={{
                  height: '130px',
                  margin: '0.75rem 1rem 0',
                  borderRadius: '16px',
                  backgroundImage: 'url("/chat-bg.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                  overflow: 'hidden',
                  flexShrink: 0
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(15, 23, 42, 0.75) 0%, rgba(15, 23, 42, 0.1) 100%)'
                  }} />
                  <div style={{ position: 'absolute', bottom: '1rem', left: '1.25rem', color: 'white' }}>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.4)', letterSpacing: '0.5px' }}>Friends Circle</h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.85, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>Real-time Friends Chat Stream</p>
                  </div>
                </div>

                <div 
                  ref={activeTab === 'messages' ? contentRef : null}
                  className="chat-messages-container"
                  style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '1.5rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1.25rem', 
                    background: '#f8fafc'
                  }}>
                  {messages.filter(msg => {
                    const sId = Number(msg.sender_id || msg.senderId);
                    const rId = msg.receiver_id || msg.receiverId === undefined ? null : Number(msg.receiver_id || msg.receiverId);
                    const myId = Number(user.id);
                    return sId === myId || rId === myId || rId === null;
                  }).map((msg, i) => (
                    <div 
                      key={i} 
                      id={`msg-${msg.id}`}
                      className="chat-message-bubble-wrapper"
                      style={{ 
                        alignSelf: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'flex-end' : 'flex-start',
                        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        transform: highlightedMsgId === msg.id ? 'scale(1.05)' : 'scale(1)',
                        zIndex: highlightedMsgId === msg.id ? 10 : 1,
                        filter: highlightedMsgId === msg.id ? 'drop-shadow(0 4px 12px rgba(59,130,246,0.35))' : 'none'
                      }}
                    >
                      <div style={{ 
                        background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? '#3b82f6' : '#ffffff',
                          color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'white' : '#1e293b',
                          padding: '1rem',
                          borderRadius: '20px',
                          border: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'none' : '1px solid #e2e8f0',
                          boxShadow: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          minWidth: '120px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                            {Number(msg.sender_id || msg.senderId) !== Number(user.id) ? (
                              <div 
                                onClick={() => {
                                  const targetId = msg.sender_id || msg.senderId;
                                  if (targetId) {
                                    setViewingProfileUserId(targetId);
                                    setActiveTab('profile');
                                  }
                                }}
                                style={{ 
                                  fontSize: '0.82rem', 
                                  color: '#16a34a', 
                                  marginBottom: '0.1rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                                title="Click to view profile"
                              >
                                👤 {msg.sender_email ? (msg.sender_email.split('@')[0].charAt(0).toUpperCase() + msg.sender_email.split('@')[0].slice(1)) : 'User'}
                              </div>
                            ) : (
                              <div />
                            )}
                            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', alignItems: 'center' }}>
                              {/* Reply Button for EVERY chat */}
                              <button 
                                onClick={() => setReplyTarget(msg)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '2px', display: 'flex', alignItems: 'center' }}
                                title="Reply to message"
                              >
                                <Reply size={12} />
                              </button>

                              {/* Download Button for EVERY chat with a media_url */}
                              {msg.media_url && (
                                <button 
                                  onClick={(e) => handleDownloadFile(e, msg.media_url, getOriginalFileName(msg.media_url) || 'download')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '2px', display: 'flex', alignItems: 'center' }}
                                  title="Download shared file"
                                >
                                  <Download size={12} />
                                </button>
                              )}

                              {Number(msg.sender_id || msg.senderId) === Number(user.id) && (
                                <button 
                                  onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.content || ''); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '2px', display: 'flex', alignItems: 'center' }}
                                  title="Edit message"
                                >
                                  <Edit3 size={12} />
                                </button>
                              )}
                              {(Number(msg.sender_id || msg.senderId) === Number(user.id) || ['admin', 'super_admin'].includes(user.role)) && (
                                <button 
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255, 255, 255, 0.8)' : '#ef4444', opacity: 0.6, padding: '2px', display: 'flex', alignItems: 'center' }}
                                  title="Delete message"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                          {msg.reply_content && (
                            <div 
                              onClick={() => scrollToMessage(msg.reply_to_id || msg.replyToId)}
                              style={{ 
                                background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.05)',
                                borderLeft: `3px solid ${ Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'white' : '#3b82f6' }`,
                                padding: '0.5rem 0.75rem',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                marginBottom: '0.5rem',
                                textAlign: 'left'
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: '0.75rem', color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'white' : '#3b82f6', marginBottom: '0.2rem' }}>
                                {msg.reply_sender_email}
                              </div>
                              <div style={{ color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.8)' : '#64748b' }}>
                                {msg.reply_content}
                              </div>
                            </div>
                          )}
                          {msg.media_url && (
                            msg.media_type === 'image' || msg.media_type === 'video' ? (
                              <div 
                                onClick={() => setLightBox({ isOpen: true, url: msg.media_url, type: msg.media_type || 'image', item: { ...msg, type: 'chat' } })}
                                style={{ cursor: 'zoom-in', marginBottom: '0.5rem', borderRadius: '12px', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}
                              >
                                <a 
                                  href={msg.media_url}
                                  onClick={(e) => handleDownloadFile(e, msg.media_url, getOriginalFileName(msg.media_url) || 'shared_media')}
                                  style={{ 
                                    position: 'absolute', 
                                    top: '10px', 
                                    left: '10px', 
                                    width: '28px', 
                                    height: '28px', 
                                    borderRadius: '50%', 
                                    background: 'rgba(0,0,0,0.4)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    color: 'white', 
                                    zIndex: 10, 
                                    cursor: 'pointer',
                                    border: 'none',
                                    backdropFilter: 'blur(4px)',
                                    textDecoration: 'none'
                                  }}
                                  title="Download media"
                                >
                                  <Download size={14} />
                                </a>
                                <div 
                                  onClick={(e) => { e.stopPropagation(); setLightBox({ isOpen: true, url: msg.media_url, type: msg.media_type || 'image', item: { ...msg, type: 'chat' } }); setShowPhotoOptions(true); }}
                                  style={{ position: 'absolute', top: '10px', right: '10px', width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 10, cursor: 'pointer' }}
                                >
                                  <MoreHorizontal size={16} />
                                </div>
                                {msg.media_type === 'video' ? (
                                  <div style={{ position: 'relative' }}>
                                    <video src={msg.media_url} style={{ maxWidth: '100%', display: 'block' }} />
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
                                        <Play size={20} fill="currentColor" />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <img src={msg.media_url} alt="Shared" style={{ maxWidth: '100%', display: 'block' }} />
                                )}
                              </div>
                            ) : msg.media_type === 'audio' ? (
                              <div style={{ marginBottom: '0.5rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <audio src={msg.media_url} controls style={{ width: '100%', maxWidth: '240px', outline: 'none' }} />
                                <a 
                                  href={msg.media_url}
                                  onClick={(e) => handleDownloadFile(e, msg.media_url, getOriginalFileName(msg.media_url) || 'audio_message.mp3')}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    padding: '8px', 
                                    borderRadius: '50%', 
                                    background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.15)' : '#f1f5f9', 
                                    color: 'inherit',
                                    cursor: 'pointer'
                                  }}
                                  title="Download audio"
                                >
                                  <Download size={14} />
                                </a>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                                <a 
                                  href={msg.media_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.75rem', 
                                    padding: '0.75rem 1rem', 
                                    background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.15)' : '#f1f5f9', 
                                    borderRadius: '12px', 
                                    color: 'inherit', 
                                    textDecoration: 'none',
                                    flex: 1,
                                    border: '1px solid rgba(0,0,0,0.05)',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  <Paperclip size={18} />
                                  <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                      {getOriginalFileName(msg.media_url) || 'Attached File'}
                                    </div>
                                  </div>
                                </a>
                                <button 
                                  onClick={(e) => handleDownloadFile(e, msg.media_url, getOriginalFileName(msg.media_url) || 'attached_document')}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    padding: '8px', 
                                    borderRadius: '50%', 
                                    background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.15)' : '#f1f5f9', 
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    border: 'none'
                                  }}
                                  title="Download file"
                                >
                                  <Download size={14} />
                                </button>
                              </div>
                            )
                          )}
                          {editingMessageId === msg.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                              <input 
                                type="text" 
                                value={editingText} 
                                onChange={(e) => setEditingText(e.target.value)} 
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(msg.id);
                                  if (e.key === 'Escape') { setEditingMessageId(null); setEditingText(''); }
                                }}
                                style={{
                                  background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
                                  border: '1px solid rgba(255,255,255,0.3)',
                                  borderRadius: '8px',
                                  padding: '0.4rem 0.8rem',
                                  color: 'inherit',
                                  fontSize: '0.95rem',
                                  outline: 'none',
                                  width: '100%'
                                }}
                                autoFocus
                              />
                              <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
                                <button 
                                  onClick={() => handleSaveEdit(msg.id)} 
                                  style={{ background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  Save
                                </button>
                                <button 
                                  onClick={() => { setEditingMessageId(null); setEditingText(''); }} 
                                  style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', border: 'none', borderRadius: '6px', padding: '0.25rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            msg.content && <div style={{ fontSize: '1rem', lineHeight: '1.5', fontWeight: 400, fontFamily: "'Outfit', 'Inter', sans-serif", wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                          )}
                        <div style={{ 
                          fontSize: '0.7rem', 
                          color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.95)' : '#94a3b8', 
                          textAlign: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'right' : 'left',
                          marginTop: '0.35rem',
                          textTransform: 'uppercase',
                          fontWeight: 500
                        }}>
                          {msg.created_at ? (() => {
                            try {
                              const d = new Date(msg.created_at);
                              return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });
                            } catch (e) {
                              return '';
                            }
                          })() : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ height: '40px', flexShrink: 0 }} />
                  <div ref={messagesEndRef} />
                </div>
                
                {pendingMedia.url && (
                  <div style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '20px', margin: '0 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                    <span>📎 Attached File: {pendingMedia.fileName || getOriginalFileName(pendingMedia.url)} ({pendingMedia.type.toUpperCase()})</span>
                    <button onClick={() => setPendingMedia({ url: '', type: 'text', fileName: '' })} style={{ border: 'none', background: 'none', color: 'white', fontWeight: 600, cursor: 'pointer' }}>X</button>
                  </div>
                )}

                {replyTarget && (
                  <div style={{ 
                    padding: '0.75rem 1rem',
                    background: '#f8fafc',
                    borderLeft: '4px solid #00cfde',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: '8px',
                    margin: '0 1.5rem 0.5rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#00cfde' }}>
                        Replying to {replyTarget.sender_email ? replyTarget.sender_email.split('@')[0] : 'User'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {replyTarget.content || (replyTarget.media_url ? '[File/Media Attachment]' : '')}
                      </div>
                    </div>
                    <button onClick={() => setReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                      <X size={18} />
                    </button>
                  </div>
                )}

                <form 
                  className="chat-input-form"
                  onSubmit={handleSendMessage} 
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    background: '#ffffff',
                    padding: '0.75rem 1.25rem',
                    borderTop: '1px solid #e2e8f0',
                    boxShadow: '0 -4px 12px rgba(0,0,0,0.03)',
                    position: 'relative',
                    zIndex: 2,
                    flexShrink: 0
                  }}
                >
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} 
                    title="Attach file from storage"
                  >
                    <Paperclip size={22} />
                  </button>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" 
                    onChange={handleChatFileUpload} 
                  />
                  
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()} 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      color: pendingMedia.url ? '#3b82f6' : '#64748b' 
                    }}
                    title="Upload media from storage"
                  >
                    <ImageIcon size={22} />
                  </button>
                  
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '24px',
                    padding: '3px 6px 3px 16px',
                    transition: 'all 0.2s',
                  }}
                  className="chat-input-field-container"
                  >
                    <input 
                      type="text" 
                      placeholder="Type a message..." 
                      style={{ 
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: '0.95rem',
                        color: '#1e293b',
                        padding: '0.65rem 0',
                        marginBottom: 0
                      }}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button type="submit" style={{ 
                      background: 'var(--primary)', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '50%',
                      width: '38px',
                      height: '38px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      marginLeft: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Community Members Directory Tab — accessible to all members, admins & superadmins */}
            {activeTab === 'members' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Header card with Search and Filter */}
                <div className="glass-card" style={{ padding: '1.75rem', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <Users size={24} color="#16a34a" /> Community Members & Admins
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        Browse mutual profiles of all group members, view details, and connect directly.
                      </p>
                    </div>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: 700, 
                      padding: '0.4rem 0.9rem', 
                      borderRadius: '100px', 
                      background: 'rgba(22, 163, 74, 0.1)', 
                      color: '#16a34a',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      👥 {users.filter(u => u.status !== 'deleted').length} Active Members
                    </span>
                  </div>

                  {/* Search and Role Filter Chips */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="text"
                        placeholder="Search by name, nickname, email, telegram, or phone..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.75rem 1rem 0.75rem 2.75rem',
                          borderRadius: '14px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          fontSize: '0.9rem',
                          outline: 'none',
                          transition: 'all 0.2s',
                          boxSizing: 'border-box'
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = '#ffffff'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                      />
                      {memberSearch && (
                        <button 
                          onClick={() => setMemberSearch('')}
                          style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700 }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Filter Pills */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginRight: '0.25rem' }}>Filter:</span>
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'super_admin', label: 'Super Admins' },
                        { id: 'admin', label: 'Admins' },
                        { id: 'member', label: 'Members' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setMemberRoleFilter(tab.id)}
                          style={{
                            padding: '0.35rem 0.85rem',
                            borderRadius: '100px',
                            border: memberRoleFilter === tab.id ? '1px solid #16a34a' : '1px solid #e2e8f0',
                            background: memberRoleFilter === tab.id ? 'rgba(22, 163, 74, 0.1)' : '#ffffff',
                            color: memberRoleFilter === tab.id ? '#16a34a' : '#64748b',
                            fontSize: '0.8rem',
                            fontWeight: memberRoleFilter === tab.id ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Directory Cards Grid */}
                {(() => {
                  const filtered = users.filter(u => {
                    if (u.status === 'deleted') return false;
                    const query = memberSearch.toLowerCase().trim();
                    const matchSearch = !query ||
                      (u.full_name && u.full_name.toLowerCase().includes(query)) ||
                      (u.nickname && u.nickname.toLowerCase().includes(query)) ||
                      (u.email && u.email.toLowerCase().includes(query)) ||
                      (u.telegram_username && u.telegram_username.toLowerCase().includes(query)) ||
                      (u.mobile && u.mobile.includes(query)) ||
                      (u.role && u.role.toLowerCase().includes(query));

                    if (memberRoleFilter === 'super_admin') return matchSearch && u.role === 'super_admin';
                    if (memberRoleFilter === 'admin') return matchSearch && u.role === 'admin';
                    if (memberRoleFilter === 'member') return matchSearch && (u.role === 'user' || u.role === 'authorized');
                    return matchSearch;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        <Users size={48} style={{ opacity: 0.25, marginBottom: '1rem' }} />
                        <h4 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>No members found</h4>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>Try refining your search keyword or clearing the filter.</p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.25rem' }}>
                      {filtered.map(u => {
                        const isSelfCard = Number(u.id) === Number(user.id);
                        const isSuperAdmin = u.role === 'super_admin';
                        const isAdmin = u.role === 'admin';

                        return (
                          <div 
                            key={u.id}
                            style={{
                              background: 'white',
                              borderRadius: '20px',
                              border: isSelfCard ? '2px solid #16a34a' : '1px solid #e2e8f0',
                              overflow: 'hidden',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              transition: 'all 0.2s',
                              position: 'relative'
                            }}
                          >
                            {/* Card Top Banner */}
                            <div style={{
                              height: '64px',
                              background: isSuperAdmin 
                                ? 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' 
                                : isAdmin 
                                  ? 'linear-gradient(135deg, #065f46 0%, #10b981 100%)' 
                                  : 'linear-gradient(135deg, #334155 0%, #64748b 100%)',
                              position: 'relative',
                              padding: '0.5rem 1rem',
                              display: 'flex',
                              justifyContent: 'flex-end',
                              alignItems: 'flex-start'
                            }}>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '100px',
                                background: 'rgba(255,255,255,0.22)',
                                color: 'white',
                                backdropFilter: 'blur(4px)',
                                letterSpacing: '0.5px'
                              }}>
                                {isSuperAdmin ? '⭐ Super Admin' : isAdmin ? '🛡️ Admin' : '👤 Member'}
                              </span>
                            </div>

                            {/* Card Body */}
                            <div style={{ padding: '1.25rem', paddingTop: '0', display: 'flex', flexDirection: 'column', flex: 1 }}>
                              {/* Avatar & You badge */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '-36px', marginBottom: '0.75rem' }}>
                                <div style={{ position: 'relative' }}>
                                  {u.profile_picture ? (
                                    <img 
                                      src={resolveImageUrl(u.profile_picture)} 
                                      alt={u.nickname || u.full_name} 
                                      onError={(e) => handleImageError(e, u.profile_picture)}
                                      style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '16px',
                                        objectFit: 'cover',
                                        border: '3px solid white',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                                        background: '#f8fafc'
                                      }}
                                    />
                                  ) : (
                                    <div style={{
                                      width: '64px',
                                      height: '64px',
                                      borderRadius: '16px',
                                      background: isSuperAdmin ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : isAdmin ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #475569, #334155)',
                                      color: 'white',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '1.6rem',
                                      fontWeight: 800,
                                      border: '3px solid white',
                                      boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
                                      textTransform: 'uppercase'
                                    }}>
                                      {(u.nickname || u.full_name || u.email || 'U')[0]}
                                    </div>
                                  )}
                                </div>
                                {isSelfCard && (
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#16a34a', background: 'rgba(22, 163, 74, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                                    (You)
                                  </span>
                                )}
                              </div>

                              {/* Names */}
                              <div style={{ marginBottom: '0.75rem' }}>
                                <h4 style={{ margin: '0 0 0.15rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {u.full_name || u.nickname || u.email.split('@')[0]}
                                </h4>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  {u.nickname && u.nickname !== u.full_name && (
                                    <span style={{ fontWeight: 600, color: '#16a34a' }}>@{u.nickname}</span>
                                  )}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>• {u.email}</span>
                                </div>
                              </div>

                              {/* Bio snippet */}
                              {u.bio && (
                                <p style={{ fontSize: '0.82rem', color: '#475569', margin: '0 0 0.75rem', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                  {u.bio}
                                </p>
                              )}

                              {/* Contact snippets */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.25rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                                {u.telegram_username && (
                                  <div style={{ fontSize: '0.8rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Send size={13} />
                                    <a 
                                      href={`https://t.me/${u.telegram_username.replace(/^@/, '')}`} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                                    >
                                      @{u.telegram_username.replace(/^@/, '')}
                                    </a>
                                  </div>
                                )}
                                {u.mobile && (
                                  <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Phone size={13} />
                                    <span>{u.mobile}</span>
                                  </div>
                                )}
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <Calendar size={13} />
                                  <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button 
                                  onClick={() => handleViewProfile(u.id)}
                                  style={{
                                    flex: 1,
                                    padding: '0.65rem 1rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: isSelfCard ? '#16a34a' : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                    color: 'white',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.45rem',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                    transition: 'transform 0.15s, opacity 0.15s'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                  <User size={15} /> {isSelfCard ? 'View My Profile' : 'View Full Profile'}
                                </button>

                                {u.telegram_username && (
                                  <a 
                                    href={`https://t.me/${u.telegram_username.replace(/^@/, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Message ${u.nickname || 'user'} on Telegram`}
                                    style={{
                                      width: '38px',
                                      height: '38px',
                                      borderRadius: '12px',
                                      border: '1px solid #cbd5e1',
                                      background: '#f8fafc',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#0284c7',
                                      textDecoration: 'none',
                                      transition: 'all 0.15s',
                                      flexShrink: 0
                                    }}
                                  >
                                    <Send size={16} />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* Authority Matrix Tab — strictly restricted to Super Admin */}
            {activeTab === 'users' && user.role === 'super_admin' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="glass-card" style={{ padding: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem', fontWeight: 800 }}>
                      <UserPlus size={22} color="var(--accent)" /> Enroll New Identity
                    </h3>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 700, 
                      padding: '0.35rem 0.85rem', 
                      borderRadius: '100px', 
                      background: 'rgba(22, 163, 74, 0.1)', 
                      color: '#16a34a',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      ⭐ Granted Full Dashboard & Admin Permissions
                    </span>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                    Enrolled identities receive full administrative permissions across all private areas: <strong>Private Photos & Videos (Vault)</strong>, <strong>Gallery Curator</strong>, <strong>My Profile</strong>, <strong>Friends Chat</strong>, and <strong>Friends Sharing / Savings</strong>. They can sign in directly with their email and password from the public portal via the secure triple-tap search gateway.
                  </p>

                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const newUser = Object.fromEntries(formData);
                    try {
                      await axios.post('/api/admin/users', newUser, {
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                      });
                      e.target.reset();
                      fetchUsers();
                      showToast('New identity enrolled with full admin permissions!');
                    } catch (err) { showToast(err.response?.data?.error || 'System rejection'); }
                  }} className="enroll-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Name / Nickname</label>
                      <input name="nickname" placeholder="e.g. Ermi or Alex" className="input-field" style={{ marginBottom: 0, width: '100%' }} required />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Full Name</label>
                      <input name="full_name" placeholder="e.g. Ermias Gesgis" className="input-field" style={{ marginBottom: 0, width: '100%' }} required />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Email Address</label>
                      <input name="email" type="email" placeholder="name@domain.com" className="input-field" style={{ marginBottom: 0, width: '100%' }} required />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Secured Password</label>
                      <input name="password" type="password" placeholder="••••••••••••" className="input-field" style={{ marginBottom: 0, width: '100%' }} required />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Telegram @Username (Optional)</label>
                      <input name="telegram_username" placeholder="e.g. @username" className="input-field" style={{ marginBottom: 0, width: '100%' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>Authority Role</label>
                      <select name="role" className="input-field" style={{ marginBottom: 0, width: '100%' }} defaultValue="admin">
                        <option value="admin">Admin (Full Access)</option>
                        {user.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                        <option value="authorized">Authorized</option>
                        <option value="user">Guest / User</option>
                      </select>
                    </div>

                    <div>
                      <button type="submit" className="btn-primary" style={{ width: '100%', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 700 }}>
                        <UserPlus size={16} /> Enroll Identity
                      </button>
                    </div>
                  </form>

                  {/* Subtle note about Super Admin role security rules */}
                  <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                    🛡️ <strong>Security Rule:</strong> Only the active Super Admin can designate others, modify their own role, or manage superuser privileges.
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(15, 23, 42, 0.02)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>IDENTITY</th>
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>ROLE</th>
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>TELEGRAM TRACKING</th>
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>STATUS</th>
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '1.25rem 2rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ fontWeight: 600 }}>{u.full_name || u.nickname || u.email.split('@')[0]}</div>
                                {u.nickname && u.full_name && u.nickname !== u.full_name && (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>@{u.nickname}</span>
                                )}
                                {u.role === 'super_admin' && (
                                  <span style={{ background: 'linear-gradient(135deg, #0575e6, #00f2fe)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>Owner</span>
                                )}
                                {u.role === 'admin' && (
                                  <span style={{ background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>Admin</span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                            </td>
                            <td style={{ padding: '1.25rem 2rem' }}>
                              <select 
                                value={u.role} 
                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                disabled={
                                  // If target user is a Super Admin: only they themselves can change their role (e.g. to demote)
                                  u.role === 'super_admin'
                                    ? u.email !== user.email
                                    : (u.email === user.email) // Regular users/admins cannot change their own role
                                }
                                style={{ 
                                  padding: '0.25rem 0.5rem', 
                                  borderRadius: '4px', 
                                  border: '1px solid var(--border)', 
                                  fontSize: '0.85rem',
                                  background: (u.role === 'super_admin' && u.email !== user.email) ? '#f8fafc' : 'white',
                                  cursor: (u.role === 'super_admin' && u.email !== user.email) ? 'not-allowed' : 'default'
                                }}
                              >
                                {/* Only show Super Admin option if current logged-in user is a Super Admin or target user is already a Super Admin */}
                                {(user.role === 'super_admin' || u.role === 'super_admin') && (
                                  <option value="super_admin">Super Admin</option>
                                )}
                                <option value="admin">Admin</option>
                                <option value="authorized">Authorized</option>
                                <option value="user">User</option>
                              </select>
                            </td>
                            <td style={{ padding: '1.25rem 2rem' }}>
                              {u.telegram_username ? (
                                <a 
                                  href={`https://t.me/${u.telegram_username.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.3rem 0.65rem',
                                    background: 'rgba(14, 165, 233, 0.08)',
                                    color: '#0284c7',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    border: '1px solid rgba(14, 165, 233, 0.25)',
                                    transition: 'all 0.2s'
                                  }}
                                  title={`Track @${u.telegram_username.replace(/^@/, '')} on Telegram`}
                                >
                                  <span>✈️</span>
                                  <span>{u.telegram_username.startsWith('@') ? u.telegram_username : `@${u.telegram_username}`}</span>
                                  <ExternalLink size={12} />
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                  Not linked
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '1.25rem 2rem' }}>
                               <span style={{ 
                                 padding: '0.25rem 0.75rem', 
                                 background: u.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                 color: u.status === 'active' ? 'var(--success)' : '#ef4444',
                                 borderRadius: '100px',
                                 fontSize: '0.7rem',
                                 fontWeight: 700,
                                 textTransform: 'uppercase'
                               }}>
                                 {u.status}
                               </span>
                            </td>
                            <td style={{ padding: '1.25rem 2rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingProfileUserId(u.id);
                                  setActiveTab('profile');
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.4rem 0.85rem',
                                  borderRadius: '8px',
                                  border: '1px solid #16a34a',
                                  background: 'rgba(22, 163, 74, 0.08)',
                                  color: '#16a34a',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  marginRight: '0.75rem',
                                  transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22, 163, 74, 0.08)'; e.currentTarget.style.color = '#16a34a'; }}
                                title={`View ${u.nickname || u.full_name || u.email}'s Profile`}
                              >
                                <User size={13} /> View Profile
                              </button>
                              {u.email !== user.email && u.role !== 'super_admin' && (
                                <button 
                                  onClick={() => {
                                    setVisualConfirm({
                                      isOpen: true,
                                      title: 'Remove Identity',
                                      message: `Are you sure you want to permanently remove ${u.nickname || u.email}? This cannot be undone.`,
                                      onConfirm: async () => {
                                        try {
                                          await axios.delete(`/api/admin/users/${u.id}`, {
                                            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                          });
                                          fetchUsers();
                                          showToast('Identity redacted');
                                          setVisualConfirm(prev => ({ ...prev, isOpen: false }));
                                        } catch (err) { showToast('Deletion rejected'); }
                                      }
                                    });
                                  }}
                                  style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                                >
                                  Terminate
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'gallery' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="glass-card" style={{ padding: '2rem' }}>
                  <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ImageIcon size={20} color="var(--accent)" /> Add New Memory
                  </h3>
                  <form onSubmit={handleAddGallery} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>Memory Title</label>
                      <input 
                        ref={galleryTitleInputRef}
                        name="title" 
                        value={galleryTitle}
                        onChange={(e) => {
                          setGalleryTitle(e.target.value);
                          if (galleryFormError) setGalleryFormError('');
                        }}
                        placeholder="Give this memory a catchy title..." 
                        className="input-field" 
                        style={{ marginBottom: 0, padding: '0.85rem 1.25rem', borderRadius: '14px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }} 
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>Upload Photo</label>
                      <label 
                        htmlFor="gallery-memory-file-input"
                        style={{ 
                          background: '#f8fafc', 
                          padding: '1.5rem', 
                          borderRadius: '16px', 
                          border: '2px dashed #cbd5e1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.65rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = 'rgba(22, 163, 74, 0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                      >
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                          <Camera size={24} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                            {galleryFilePreview ? 'Change Selected Image' : 'Click to select image from your device'}
                          </span>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>Supports PNG, JPG, JPEG, WEBP</p>
                        </div>
                        <input 
                          id="gallery-memory-file-input"
                          type="file" 
                          name="file" 
                          ref={galleryFileInputRef}
                          accept="image/*" 
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const objectUrl = URL.createObjectURL(f);
                              setGalleryFilePreview({ url: objectUrl, type: 'file', name: f.name });
                              if (galleryFormError) setGalleryFormError('');
                              const ready = await compressImage(f);
                              setSelectedGalleryFile(ready);
                            }
                          }}
                        />
                      </label>
                    </div>

                    {galleryFilePreview && (
                      <div style={{ 
                        position: 'relative', 
                        width: '100%', 
                        maxWidth: '380px', 
                        borderRadius: '16px', 
                        overflow: 'hidden', 
                        border: '1.5px solid #22c55e', 
                        background: '#f8fafc',
                        padding: '0.75rem',
                        boxShadow: '0 4px 14px rgba(34, 197, 94, 0.12)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            ✓ Selected Image Preview
                          </span>
                          <button 
                            type="button" 
                            onClick={() => {
                              setSelectedGalleryFile(null);
                              setGalleryFilePreview(null);
                              if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
                            }}
                            style={{ 
                              background: '#ef4444', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '50%', 
                              width: '22px', 
                              height: '22px', 
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}
                            title="Remove selected preview"
                          >
                            ✕
                          </button>
                        </div>
                        <img 
                          src={galleryFilePreview.url} 
                          alt="Preview" 
                          style={{ 
                            width: '100%', 
                            maxHeight: '220px', 
                            objectFit: 'contain', 
                            borderRadius: '12px',
                            background: '#ffffff'
                          }} 
                        />
                        {galleryFilePreview.name && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📁 {galleryFilePreview.name}
                          </div>
                        )}
                      </div>
                    )}

                    {galleryFormError && (
                      <div style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#b91c1c',
                        padding: '0.75rem 1rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <AlertTriangle size={18} /> {galleryFormError}
                      </div>
                    )}

                    <button 
                      type="submit" 
                      disabled={isPostingGallery}
                      className="memory-publish-btn" 
                      style={{ 
                        alignSelf: 'flex-start', 
                        padding: '0.85rem 2.25rem',
                        borderRadius: '14px',
                        border: 'none',
                        background: isPostingGallery ? '#64748b' : '#16a34a',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        cursor: isPostingGallery ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        boxShadow: isPostingGallery ? 'none' : '0 4px 14px rgba(22, 163, 74, 0.25)',
                        transition: 'all 0.25s ease',
                        opacity: isPostingGallery ? 0.8 : 1
                      }}
                      onMouseEnter={e => {
                        if (!isPostingGallery) {
                          e.currentTarget.style.background = '#0f172a';
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(15, 23, 42, 0.35)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isPostingGallery) {
                          e.currentTarget.style.background = '#16a34a';
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.boxShadow = '0 4px 14px rgba(22, 163, 74, 0.25)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      {isPostingGallery ? (
                        <>
                          <span style={{ 
                            width: '16px', height: '16px', border: '2px solid white', 
                            borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block',
                            animation: 'spin 0.8s linear infinite' 
                          }} />
                          Posting Memory...
                        </>
                      ) : (
                        <>
                          <ImageIcon size={18} /> Post Gallery
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="grid">
                  {gallery.map(item => (
                    <motion.div 
                      key={item.id} 
                      layout 
                      className="glass-card card-no-pad" 
                      style={{ 
                        padding: '0', 
                        position: 'relative', 
                        borderRadius: '24px', 
                        display: 'flex', 
                        flexDirection: 'column',
                        overflow: 'visible',
                        border: 'none',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                        background: 'white'
                      }}
                    >
                      <div style={{ cursor: 'pointer', position: 'relative' }} onClick={() => setLightBox({ isOpen: true, url: item.url, type: 'image', item })}>
                        <div 
                          onClick={(e) => { e.stopPropagation(); setLightBox({ isOpen: true, url: item.url, type: 'image', item }); setShowPhotoOptions(true); }}
                          style={{ position: 'absolute', top: '1rem', right: '1rem', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 10, cursor: 'pointer' }}
                        >
                          <MoreHorizontal size={20} />
                        </div>
                        <div style={{ 
                          position: 'relative', 
                          width: '100%', 
                          minHeight: '280px', 
                          maxHeight: '350px', 
                          background: '#f8fafc',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden'
                        }}>
                          <img 
                            src={resolveImageUrl(item.url)} 
                            alt={item.title || 'Community Memory'} 
                            referrerPolicy="no-referrer"
                            onError={(e) => handleImageError(e, item.url)}
                            style={{ 
                              width: '100%', 
                              height: '350px',
                              objectFit: 'contain', 
                              background: '#f8fafc',
                              display: 'block',
                              cursor: 'zoom-in'
                            }} 
                          />
                          <div 
                            className="image-fallback-container"
                            data-fallback="true"
                            style={{
                              display: 'none',
                              position: 'absolute',
                              inset: 0,
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'linear-gradient(135deg, #15803d 0%, #16a34a 60%, #059669 100%)',
                              color: 'white',
                              padding: '2rem',
                              textAlign: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{
                              width: '64px',
                              height: '64px',
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: '0.85rem',
                              boxShadow: '0 8px 20px rgba(0,0,0,0.15)'
                            }}>
                              <ImageIcon size={32} color="white" />
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.3rem', letterSpacing: '0.5px' }}>
                              {item.title || 'Community Memory'}
                            </div>
                            <div style={{ fontSize: '0.82rem', opacity: 0.9, maxWidth: '280px', lineHeight: 1.4 }}>
                              {item.caption || 'F.R.I.E.N.D.S Gallery Curator'}
                            </div>
                            <span style={{ 
                              marginTop: '1rem', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '0.4rem', 
                              padding: '0.35rem 0.85rem', 
                              borderRadius: '999px', 
                              background: 'rgba(255,255,255,0.22)', 
                              fontSize: '0.75rem', 
                              fontWeight: 700 
                            }}>
                              🖼️ Shared Memory
                            </span>
                          </div>
                          {/* Gradient Overlay */}
                          <div style={{ 
                            position: 'absolute', inset: 0, pointerEvents: 'none',
                            background: 'linear-gradient(to bottom, transparent 65%, rgba(34, 197, 94, 0.08) 100%)' 
                          }} />
                        </div>
                      </div>

                      <div style={{ padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{item.title}</h4>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.5' }}>{item.caption}</p>
                        
                        <div style={{ marginTop: 'auto' }}>
                          <button 
                            onClick={() => setEditingItem(item)}
                            style={{ 
                              background: 'none', 
                              border: '1px solid #22c55e', 
                              color: '#22c55e', 
                              padding: '0.6rem 1.5rem', 
                              borderRadius: '100px', 
                              fontSize: '0.85rem', 
                              fontWeight: 600, 
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#22c55e'; e.currentTarget.style.color = 'white'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#22c55e'; }}
                          >
                            Read More
                          </button>
                        </div>
                      </div>

                      {/* Interaction Bar — always visible including on mobile */}
                      <div className="card-interaction-bar" style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        gap: '1.5rem', padding: '1rem', borderTop: '1px solid #f1f5f9',
                        background: '#f8fafc',
                        borderBottomLeftRadius: '24px',
                        borderBottomRightRadius: '24px'
                      }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleGalleryReaction(item.id); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          <ThumbsUp 
                            size={18} 
                            color={item.reactions?.some(r => Number(r.user_id) === Number(user.id)) ? '#22c55e' : '#64748b'} 
                            fill={item.reactions?.some(r => Number(r.user_id) === Number(user.id)) ? '#22c55e' : 'none'} 
                          />
                          {item.reactions?.length > 0 && <span>{item.reactions.length}</span>}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleComments(item.id); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          <MessageCircle size={18} />
                          {item.comments?.length > 0 && <span>{item.comments.length}</span>}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleGalleryShare(item.id, item.title); }}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          <Forward size={18} />
                        </button>
                      </div>

                      {expandedComments[item.id] && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '0 1.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
                            {item.comments?.map(c => (
                              <div key={c.id} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                                <img src={c.profile_picture || `https://ui-avatars.com/api/?name=${c.nickname}`} style={{ width: '24px', height: '24px', borderRadius: '50%' }} alt="Avatar" />
                                <div style={{ background: '#f1f5f9', padding: '0.4rem 0.6rem', borderRadius: '8px', flex: 1 }}>
                                  <div style={{ fontWeight: 700 }}>{c.nickname}</div>
                                  <div style={{ color: '#1e293b' }}>{c.content}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              const input = e.target.comment;
                              handleGalleryComment(item.id, input.value);
                              input.value = '';
                            }}
                            style={{ position: 'relative', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                          >
                            <input 
                              name="comment"
                              placeholder="Add a comment..."
                              style={{ flex: 1, background: '#f1f5f9', border: 'none', borderRadius: '100px', padding: '0.5rem 1rem', outline: 'none', fontSize: '0.8rem' }}
                            />
                            <button type="submit" style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer' }}>
                              <Send size={16} />
                            </button>
                          </form>
                        </motion.div>
                      )}

                      {(user.role === 'admin' || user.role === 'super_admin') && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteGallery(item.id); }}
                          style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Edit Modal */}
                <AnimatePresence>
                  {editingItem && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
                      onClick={() => setEditingItem(null)}
                    >
                      <motion.div 
                        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="glass-card"
                        style={{ width: '100%', maxWidth: '600px', padding: '2.5rem', background: 'white' }}
                      >
                        <h3 style={{ marginBottom: '2rem' }}>Edit Memory Details</h3>
                        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                          <img src={editingItem.url} style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '12px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }} alt="Preview" />
                          <div style={{ flex: 1 }}>
                             <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Update Photo</label>
                             <input type="file" name="file" accept="image/*" form="edit-form" style={{ fontSize: '0.85rem' }} />
                          </div>
                        </div>

                        <form id="edit-form" onSubmit={handleUpdateGallery} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <input name="title" defaultValue={editingItem.title} placeholder="Title" className="input-field" required />
                          <textarea name="caption" defaultValue={editingItem.caption} placeholder="Caption" className="input-field" style={{ minHeight: '100px', resize: 'vertical' }} />
                          <input name="url" defaultValue={editingItem.url} placeholder="Or paste new URL" className="input-field" />
                          
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                             <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save Changes</button>
                             <button type="button" onClick={() => setEditingItem(null)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                          </div>
                        </form>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'vault' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="glass-card" style={{ padding: '2rem' }}>
                  <div className="vault-header-row">
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Lock size={20} color="var(--accent)" /> Private Photos & Videos
                    </h3>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.25rem', borderRadius: '12px' }}>
                      <button 
                        onClick={() => setVaultSubTab('photo')}
                        style={{ 
                          padding: '0.5rem 1.5rem', borderRadius: '10px', border: 'none', fontSize: '0.85rem', fontWeight: 600,
                          background: vaultSubTab === 'photo' ? 'white' : 'transparent',
                          color: vaultSubTab === 'photo' ? '#0f172a' : '#64748b',
                          boxShadow: vaultSubTab === 'photo' ? '0 4px 6px rgba(0,0,0,0.05)' : 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Photos
                      </button>
                      <button 
                        onClick={() => setVaultSubTab('video')}
                        style={{ 
                          padding: '0.5rem 1.5rem', borderRadius: '10px', border: 'none', fontSize: '0.85rem', fontWeight: 600,
                          background: vaultSubTab === 'video' ? 'white' : 'transparent',
                          color: vaultSubTab === 'video' ? '#0f172a' : '#64748b',
                          boxShadow: vaultSubTab === 'video' ? '0 4px 6px rgba(0,0,0,0.05)' : 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Videos
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleAddPersonalAsset} className="add-asset-form">
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: '#64748b' }}>ASSET TITLE</label>
                      <input name="title" placeholder="Untitled Moment" className="input-field" style={{ marginBottom: 0 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: '#64748b' }}>SELECT {vaultSubTab.toUpperCase()}</label>
                      <input 
                        type="file" 
                        name="file" 
                        ref={vaultFileInputRef}
                        accept={vaultSubTab === 'photo' ? 'image/*' : 'video/*'} 
                        style={{ fontSize: '0.8rem' }} 
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const objectUrl = URL.createObjectURL(f);
                            setVaultFilePreview({ url: objectUrl, type: vaultSubTab, name: f.name });
                          }
                        }}
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={uploadingVault} style={{ padding: '0.75rem 2rem' }}>
                      {uploadingVault ? 'Saving...' : 'Add to Private'}
                    </button>
                  </form>

                  {vaultFilePreview && (
                    <div style={{ 
                      position: 'relative', 
                      width: '100%', 
                      maxWidth: '320px', 
                      borderRadius: '16px', 
                      overflow: 'hidden', 
                      border: '1.5px solid #22c55e', 
                      background: '#f8fafc',
                      padding: '0.75rem',
                      boxShadow: '0 4px 14px rgba(34, 197, 94, 0.12)',
                      marginTop: '-0.5rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          ✓ Selected {vaultSubTab.toUpperCase()} Preview
                        </span>
                        <button 
                          type="button" 
                          onClick={() => {
                            setVaultFilePreview(null);
                            if (vaultFileInputRef.current) vaultFileInputRef.current.value = '';
                          }}
                          style={{ 
                            background: '#ef4444', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '50%', 
                            width: '22px', 
                            height: '22px', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontSize: '0.75rem', 
                            fontWeight: 700 
                          }}
                          title="Remove selected preview"
                        >
                          ✕
                        </button>
                      </div>
                      {vaultSubTab === 'photo' ? (
                        <img src={vaultFilePreview.url} alt="Preview" style={{ width: '100%', height: '180px', objectFit: 'contain', borderRadius: '12px', background: '#ffffff' }} />
                      ) : (
                        <video src={vaultFilePreview.url} controls style={{ width: '100%', height: '180px', objectFit: 'contain', borderRadius: '12px', background: '#000000' }} />
                      )}
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.4rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📁 {vaultFilePreview.name}
                      </div>
                    </div>
                  )}

                  <div className="grid">
                    {personalAssets.filter(a => a.type === vaultSubTab).map(asset => (
                      <motion.div 
                        key={asset.id} 
                        layout 
                        className="glass-card" 
                        style={{ padding: '0', borderRadius: '24px', overflow: 'hidden', background: 'white', display: 'flex', flexDirection: 'column' }}
                      >
                        <div style={{ position: 'relative' }}>
                          <div 
                            onClick={(e) => { e.stopPropagation(); setLightBox({ isOpen: true, url: asset.url, type: asset.type, item: { ...asset, type: 'personal' } }); setShowPhotoOptions(true); }}
                            style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 10, cursor: 'pointer' }}
                          >
                            <MoreHorizontal size={18} />
                          </div>
                          {asset.type === 'photo' ? (
                            <img 
                              src={resolveImageUrl(asset.url)} 
                              referrerPolicy="no-referrer"
                              onError={(e) => handleImageError(e, asset.url)}
                              onClick={() => setLightBox({ isOpen: true, url: asset.url, type: 'image', item: { ...asset, type: 'personal' } })}
                              style={{ width: '100%', aspectRatio: '1/1', objectFit: 'contain', background: '#f1f5f9', cursor: 'zoom-in' }} 
                              alt={asset.title} 
                            />
                          ) : (
                            <div 
                              onClick={() => setLightBox({ isOpen: true, url: asset.url, type: 'video', item: { ...asset, type: 'personal' } })}
                              style={{ width: '100%', aspectRatio: '1/1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', cursor: 'zoom-in' }}
                            >
                              <video 
                                src={`${asset.url}#t=30`} 
                                preload="metadata"
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                              />
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.1)' }}>
                                <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: '50%', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                                  <Play size={24} fill="var(--primary)" color="var(--primary)" style={{ marginLeft: '4px' }} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ padding: '1rem', textAlign: 'center', flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>{asset.title}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>{new Date(asset.created_at).toLocaleDateString()}</div>
                        </div>

                        {/* Interaction Bar */}
                        <div style={{ 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          gap: '1.5rem', padding: '0.75rem', borderTop: '1px solid #f1f5f9',
                          background: '#f8fafc'
                        }}>
                          <button 
                            onClick={() => handlePersonalReaction(asset.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                          >
                            <ThumbsUp 
                              size={18} 
                              color={asset.reactions?.some(r => Number(r.user_id) === Number(user.id)) ? '#22c55e' : '#64748b'} 
                              fill={asset.reactions?.some(r => Number(r.user_id) === Number(user.id)) ? '#22c55e' : 'none'} 
                            />
                            {asset.reactions?.length > 0 && <span>{asset.reactions.length}</span>}
                          </button>
                          <button 
                            onClick={() => toggleComments(asset.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                          >
                            <MessageCircle size={18} />
                            {asset.comments?.length > 0 && <span>{asset.comments.length}</span>}
                          </button>
                          <button 
                            onClick={() => handlePersonalShare(asset.id, asset.title)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                          >
                            <Forward size={18} />
                          </button>
                          <button 
                            onClick={() => handleDownload(asset.url, asset.title)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                          >
                            <Download size={18} />
                          </button>
                        </div>

                        {/* Comments Section */}
                        {expandedComments[asset.id] && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '0 1rem 1rem', background: '#f8fafc' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
                              {asset.comments?.map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                                  <img src={c.profile_picture || `https://ui-avatars.com/api/?name=${c.nickname}`} style={{ width: '24px', height: '24px', borderRadius: '50%' }} alt="Avatar" />
                                  <div style={{ background: '#f1f5f9', padding: '0.4rem 0.6rem', borderRadius: '8px', flex: 1 }}>
                                    <div style={{ fontWeight: 700 }}>{c.nickname}</div>
                                    <div style={{ color: '#1e293b' }}>{c.content}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                const input = e.target.comment;
                                handlePersonalComment(asset.id, input.value);
                                input.value = '';
                              }}
                              style={{ position: 'relative', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                            >
                              <input 
                                name="comment"
                                placeholder="Add a comment..."
                                style={{ flex: 1, background: '#f1f5f9', border: 'none', borderRadius: '100px', padding: '0.5rem 1rem', outline: 'none', fontSize: '0.8rem' }}
                              />
                              <button type="submit" style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer' }}>
                                <Send size={16} />
                              </button>
                            </form>
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                    {personalAssets.filter(a => a.type === vaultSubTab).length === 0 && (
                      <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: '#64748b' }}>
                        <div style={{ marginBottom: '1rem' }}><Lock size={40} strokeWidth={1} /></div>
                        Your private {vaultSubTab} collection is empty.
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'admin' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: '650px' }}>
                <div className="glass-card" style={{ padding: '2.5rem', background: 'white', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}>
                  <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚙️ Core System Settings
                  </h3>
                  
                  <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.5 }}>
                    Adjust group chat systems, new registration access, main dashboard lockout gates, and savings clerk delegations.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Render standard toggles with friendly words and outcomes */}
                    {systemSettings.filter(s => s.key !== 'clerk_id').map(setting => {
                      const isTrue = setting.value === 'true';
                      
                      let title = setting.key.replace(/_/g, ' ');
                      let desc = "Global system parameter control.";
                      
                      if (setting.key === 'messaging_enabled') {
                        title = "💬 Real-Time Group Chatting";
                        desc = isTrue 
                          ? "🟢 Group chat is currently ACTIVE. All members can post and exchange files in real-time."
                          : "🔴 Group chat is currently LOCKED. regular users cannot type or post messages (Admins only).";
                      } else if (setting.key === 'signup_enabled') {
                        title = "👥 New User Registration Gate";
                        desc = isTrue 
                          ? "🟢 Open Enrollment: Anyone visiting the site can create a brand new account."
                          : "🔴 Invitation Only: Registration is locked. Only Admins can manually register new accounts.";
                      } else if (setting.key === 'private_dashboard_enabled') {
                        title = "🔒 Main Portal / Private Dashboard";
                        desc = isTrue 
                          ? "🟢 Authorized Access: Users can login and enter the main chat, memory boards, and profile screens."
                          : "🔴 Maintenance Lockout: Login is blocked for standard members. Only Admins can enter the private dashboard.";
                      }

                      return (
                        <div key={setting.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9', transition: 'all 0.2s' }}>
                          <div style={{ flex: 1, paddingRight: '1rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', textTransform: 'capitalize', marginBottom: '0.25rem' }}>{title}</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>{desc}</div>
                          </div>
                          
                          <div 
                            onClick={() => handleToggleSetting(setting.key, setting.value)}
                            style={{ 
                              width: '56px',
                              height: '30px',
                              background: isTrue ? '#22c55e' : '#cbd5e1',
                              borderRadius: '100px',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              padding: '2px',
                              flexShrink: 0
                            }}
                          >
                            <div style={{ 
                              width: '26px',
                              height: '26px',
                              background: 'white',
                              borderRadius: '50%',
                              position: 'absolute',
                              left: isTrue ? '28px' : '2px',
                              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                            }} />
                          </div>
                        </div>
                      );
                    })}

                    {/* Render Clerk Dropdown (Instead of a Switch - Visible only to superadmin ermiasgesgis@gmail.com!) */}
                    {(user.role === 'super_admin' && user.email?.toLowerCase() === 'ermiasgesgis@gmail.com') && systemSettings.find(s => s.key === 'clerk_id') && (() => {
                      const setting = systemSettings.find(s => s.key === 'clerk_id');
                      const selectedUserId = setting.value;
                      
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem', background: '#f8fafc', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                              🔑 Designated Payment Clerk
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                              Choose which member has clerk permissions to record, confirm, and verify weekly savings contributions.
                            </div>
                          </div>
                          
                          <select 
                            value={selectedUserId || ''} 
                            onChange={(e) => {
                              const val = e.target.value;
                              handleUpdateSetting('clerk_id', val);
                            }}
                            style={{
                              padding: '0.75rem 1rem',
                              borderRadius: '12px',
                              border: '1px solid #cbd5e1',
                              background: 'white',
                              color: '#0f172a',
                              fontSize: '0.9rem',
                              fontWeight: 600,
                              outline: 'none',
                              cursor: 'pointer',
                              width: '100%',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                          >
                            <option value="">-- No Clerk Assigned --</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id.toString()}>
                                {u.nickname || u.email} ({u.role.replace(/_/g, ' ')})
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'logs' && (
              <motion.div 
                key="logs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{ flex: 1, minHeight: 0 }}
              >
                <SavingsTracker 
                  user={user} 
                  onViewProfile={(targetId) => {
                    if (targetId) {
                      setViewingProfileUserId(targetId);
                      setActiveTab('profile');
                    }
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
              >
                <ProfilePage 
                  currentUser={user} 
                  userId={viewingProfileUserId || user.id} 
                  previewUser={viewingProfileUserId ? users.find(u => Number(u.id) === Number(viewingProfileUserId)) : user}
                  onProfileUpdate={(updated) => {
                    if (Number(user.id) === Number(updated.id)) {
                      setUser(prev => ({ ...prev, ...updated }));
                    }
                  }} 
                  onBackToSelf={() => setViewingProfileUserId(null)}
                  onOpenDirectory={() => {
                    setViewingProfileUserId(null);
                    setActiveTab('members');
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      )}

      {/* Mobile Bottom Nav */}


      <div className="mobile-bottom-nav">
        {/* 1. Dashboard */}
        <button 
          onClick={() => setActiveTab('logs')} 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '3px', 
            background: 'none', 
            border: 'none', 
            color: activeTab === 'logs' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            position: 'relative',
            padding: '6px 12px'
          }}
        >
          {activeTab === 'logs' && (
            <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '3px', background: '#16a34a', borderRadius: '0 0 3px 3px' }} />
          )}
          <Home size={22} color={activeTab === 'logs' ? '#16a34a' : '#64748b'} />
          <span style={{ fontSize: '0.7rem', fontWeight: activeTab === 'logs' ? 700 : 500 }}>Dashboard</span>
        </button>

        {/* 2. Friends Chat */}
        <button 
          onClick={() => setActiveTab('messages')} 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '3px', 
            background: 'none', 
            border: 'none', 
            color: activeTab === 'messages' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            position: 'relative',
            padding: '6px 12px'
          }}
        >
          {activeTab === 'messages' && (
            <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '3px', background: '#16a34a', borderRadius: '0 0 3px 3px' }} />
          )}
          <MessageCircle size={22} color={activeTab === 'messages' ? '#16a34a' : '#64748b'} />
          <span style={{ fontSize: '0.7rem', fontWeight: activeTab === 'messages' ? 700 : 500 }}>Friends Chat</span>
        </button>

        {/* 3. Members Directory */}
        <button 
          onClick={() => setActiveTab('members')} 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '3px', 
            background: 'none', 
            border: 'none', 
            color: activeTab === 'members' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            position: 'relative',
            padding: '6px 8px'
          }}
        >
          {activeTab === 'members' && (
            <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '3px', background: '#16a34a', borderRadius: '0 0 3px 3px' }} />
          )}
          <Users size={22} color={activeTab === 'members' ? '#16a34a' : '#64748b'} />
          <span style={{ fontSize: '0.7rem', fontWeight: activeTab === 'members' ? 700 : 500 }}>Members</span>
        </button>

        {/* 4. Matrix (Super Admin only) / Gallery (Admins & Members) */}
        {user.role === 'super_admin' ? (
          <button 
            onClick={() => setActiveTab('users')} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '3px', 
              background: 'none', 
              border: 'none', 
              color: activeTab === 'users' ? '#16a34a' : '#64748b',
              cursor: 'pointer',
              position: 'relative',
              padding: '6px 8px'
            }}
          >
            {activeTab === 'users' && (
              <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '3px', background: '#16a34a', borderRadius: '0 0 3px 3px' }} />
            )}
            <LayoutGrid size={22} color={activeTab === 'users' ? '#16a34a' : '#64748b'} />
            <span style={{ fontSize: '0.7rem', fontWeight: activeTab === 'users' ? 700 : 500 }}>Matrix</span>
          </button>
        ) : (
          <button 
            onClick={() => setActiveTab('gallery')} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '3px', 
              background: 'none', 
              border: 'none', 
              color: activeTab === 'gallery' ? '#16a34a' : '#64748b',
              cursor: 'pointer',
              position: 'relative',
              padding: '6px 8px'
            }}
          >
            {activeTab === 'gallery' && (
              <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '3px', background: '#16a34a', borderRadius: '0 0 3px 3px' }} />
            )}
            <ImageIcon size={22} color={activeTab === 'gallery' ? '#16a34a' : '#64748b'} />
            <span style={{ fontSize: '0.7rem', fontWeight: activeTab === 'gallery' ? 700 : 500 }}>Gallery</span>
          </button>
        )}

        {/* 5. Me */}
        <button 
          onClick={() => {
            setViewingProfileUserId(null);
            setActiveTab('profile');
          }} 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '3px', 
            background: 'none', 
            border: 'none', 
            color: activeTab === 'profile' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            position: 'relative',
            padding: '6px 12px'
          }}
        >
          {activeTab === 'profile' && (
            <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '3px', background: '#16a34a', borderRadius: '0 0 3px 3px' }} />
          )}
          <User size={22} color={activeTab === 'profile' ? '#16a34a' : '#64748b'} />
          <span style={{ fontSize: '0.7rem', fontWeight: activeTab === 'profile' ? 700 : 500 }}>Me</span>
        </button>
      </div>
    </div>
  );
};

export default PrivateDashboard;
