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
  MoreVertical, Edit3, MoreHorizontal, Reply, X, Menu
} from 'lucide-react';
import ShareModal from '../components/ShareModal';
import ProfilePage from './ProfilePage';
import SavingsTracker from '../components/SavingsTracker';





const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : window.location.origin;
const socket = io(socketUrl, { autoConnect: false });

const getOriginalFileName = (url) => {
  if (!url) return '';
  const filenameWithTimestamp = url.split('/').pop();
  const hyphenIndex = filenameWithTimestamp.indexOf('-');
  if (hyphenIndex !== -1) {
    return filenameWithTimestamp.substring(hyphenIndex + 1);
  }
  return filenameWithTimestamp;
};

const PrivateDashboard = ({ user }) => {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };
  const [activeTab, setActiveTab] = useState('messages');
  const [showLogoModal, setShowLogoModal] = useState(false);
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
    if (activeTab === 'users') fetchUsers();
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
    if (user.role === 'super_admin' || user.role === 'admin') {
      fetchUsers();
      fetchLogs();
      fetchSettings();
      fetchGallery();
      fetchPersonalAssets();
    }
    
    socket.emit('join_room', 'private');
    socket.on('receive_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('message_edited', ({ messageId, content }) => {
      setMessages(prev => prev.map(m => Number(m.id) === Number(messageId) ? { ...m, content } : m));
    });

    socket.on('message_deleted', (messageId) => {
      setMessages(prev => prev.filter(m => Number(m.id) !== Number(messageId)));
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
      socket.off('new_comment');
      socket.off('reactions_update');
      socket.disconnect();
    };
  }, [user]);

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
      const { data } = await axios.get('http://localhost:5000/api/messages', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMessages(data);
    } catch (err) { console.error(err); }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/admin/users', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setUsers(data);
    } catch (err) { console.error(err); }
  };

  const fetchLogs = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/admin/logs', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setLogs(data);
    } catch (err) { console.error(err); }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/admin/settings', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSystemSettings(data);
    } catch (err) { console.error(err); }
  };

  const fetchGallery = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/gallery');
      setGallery(data);
    } catch (err) { console.error(err); }
  };
 
  const fetchPersonalAssets = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/personal-assets', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setPersonalAssets(data);
    } catch (err) { console.error(err); }
  };

  const handleAddGallery = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get('title');
    const caption = formData.get('caption');
    let url = formData.get('url');
    const file = formData.get('file');

    try {
      // If a file is selected, upload it first
      // NOTE: Do NOT manually set Content-Type here — axios must auto-set
      // multipart/form-data WITH the correct boundary for multer to parse it.
      if (file && file.name) {
        const uploadData = new FormData();
        uploadData.append('image', file);
        const { data: uploadRes } = await axios.post('http://localhost:5000/api/admin/gallery/upload', uploadData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        });
        url = uploadRes.url;
      }

      if (!url) return showToast('Please provide a URL or select a file');

      await axios.post('http://localhost:5000/api/admin/gallery', { url, title, caption }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      e.target.reset();
      fetchGallery();
      showToast('New memory added to gallery!');
    } catch (err) { showToast('Upload failed: ' + (err.response?.data?.error || err.message)); }
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
        const { data: uploadRes } = await axios.post('http://localhost:5000/api/admin/gallery/upload', uploadData, {
          headers: { 
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        });
        url = uploadRes.url;
      }

      await axios.put(`http://localhost:5000/api/admin/gallery/${editingItem.id}`, { title, caption, url }, {
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
        await axios.put(`http://localhost:5000/api/personal-assets/${id}`, { title: updatedItem.title }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        fetchPersonalAssets();
        showToast('Caption updated successfully!');
        if (lightBox.isOpen && lightBox.item && lightBox.item.id === id) {
          setLightBox(prev => ({ ...prev, item: { ...prev.item, title: updatedItem.title } }));
        }
      } else {
        await axios.put(`http://localhost:5000/api/admin/gallery/${id}`, updatedItem, {
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
          await axios.delete(`http://localhost:5000/api/admin/gallery/${id}`, {
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

      await axios.post('http://localhost:5000/api/personal-assets', uploadData, {
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      e.target.reset();
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
          await axios.delete(`http://localhost:5000/api/personal-assets/${id}`, {
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
      const { data } = await axios.post('http://localhost:5000/api/reactions', {
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
      const { data } = await axios.post('http://localhost:5000/api/comments', {
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
      const { data } = await axios.post('http://localhost:5000/api/reactions', {
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
      const { data } = await axios.post('http://localhost:5000/api/comments', {
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
      await axios.put(`http://localhost:5000/api/messages/${messageId}`, {
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
          await axios.delete(`http://localhost:5000/api/messages/${messageId}`, {
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
      
      const { data } = await axios.post('http://localhost:5000/api/upload', formData, {
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
      await axios.post('http://localhost:5000/api/admin/users/role', { userId, role: newRole }, {
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
      await axios.post('http://localhost:5000/api/admin/settings/toggle', { key, value: newValue }, {
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
      await axios.post('http://localhost:5000/api/admin/users/cover-photo', { url }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      showToast('Cover photo updated!');
    } catch (err) { showToast('Update failed'); }
  };

  const TabButton = ({ id, icon: Icon, label, disabled = false, onClick }) => (
    <button 
      onClick={() => {
        if (!disabled) {
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
        @media (max-width: 768px) {
          .dashboard-container { flex-direction: column !important; }
          .sidebar-nav { display: none !important; }
          .main-content { padding: 0.5rem !important; height: calc(100vh - 70px) !important; width: 100% !important; }
          .mobile-bottom-nav { display: flex !important; }
          .grid { grid-template-columns: 1fr !important; }
          .dashboard-header { padding: 0.75rem 1rem !important; gap: 0.5rem !important; flex-wrap: nowrap !important; justify-content: flex-start !important; }
          .header-logout-btn { display: none !important; }
          .mobile-menu-toggle { display: flex !important; }
          .tab-buttons-container { overflow-x: auto; white-space: nowrap; padding-bottom: 0.5rem; }
          .glass-card { padding: 1rem !important; }
          .dashboard-section { padding: 1rem !important; }
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
          height: 70px; background: white; border-top: 1px solid var(--border);
          z-index: 1000; justify-content: space-around; align-items: center; padding: 0 1rem;
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
                <img src={lightBox.url} alt="Full View" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} />
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
                <TabButton id="messages" icon={MessageSquare} label="Internal Pulse" onClick={() => setMobileMenuOpen(false)} />
                <TabButton id="profile" icon={User} label="My Profile" onClick={() => setMobileMenuOpen(false)} />

                {(user.role === 'super_admin' || user.role === 'admin') && (
                  <>
                    <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }} />
                    <TabButton id="users" icon={Users} label="Authority Matrix" onClick={() => setMobileMenuOpen(false)} />
                    <TabButton id="gallery" icon={ImageIcon} label="Gallery Curator" onClick={() => setMobileMenuOpen(false)} />
                    <TabButton id="vault" icon={Lock} label="Private Photos & Videos" onClick={() => setMobileMenuOpen(false)} />
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
          <TabButton id="messages" icon={MessageSquare} label="Internal Pulse" />
          <TabButton id="profile" icon={User} label="My Profile" />

          
          {(user.role === 'super_admin' || user.role === 'admin') && (
            <>
              <div style={{ height: '1px', background: 'var(--border)', margin: '1rem 0' }} />
              <TabButton id="users" icon={Users} label="Authority Matrix" />
              <TabButton id="gallery" icon={ImageIcon} label="Gallery Curator" />
              <TabButton id="vault" icon={Lock} label="Private Photos & Videos" />
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
          <ProfilePage currentUser={user} userId={user.id} />
        </div>
      ) : (
      <main ref={contentRef} className="main-content" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
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
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#1e293b', whiteSpace: 'nowrap' }}>Friends Group</h2>
                  </div>
                </div>
            ) : (
              <div>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                  {activeTab === 'messages' && 'Secure Internal Communication'}
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  {activeTab === 'messages' && 'Real-time encrypted message stream'}
                </p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>

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

        <section className="dashboard-section" style={{ flex: 1, padding: '2rem 3rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.85, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>Real-time Internal Pulse Stream</p>
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
                              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.1rem' }}>
                                {msg.sender_email ? (msg.sender_email.split('@')[0].charAt(0).toUpperCase() + msg.sender_email.split('@')[0].slice(1)) : 'User'}
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
                              <a 
                                href={msg.media_url} 
                                onClick={(e) => handleDownloadFile(e, msg.media_url, getOriginalFileName(msg.media_url) || 'attached_document')}
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
                                  marginTop: '0.5rem',
                                  marginBottom: '0.5rem',
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
                          color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.9)' : '#94a3b8', 
                          textAlign: 'left',
                          marginTop: '0.2rem',
                          textTransform: 'uppercase',
                          fontWeight: 500
                        }}>
                          {new Date(msg.created_at).toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true })}
                        </div>
                      </div>
                    </div>
                  ))}
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

            {/* (Admin tabs logs/users/settings logic similar to before) */}
            {activeTab === 'users' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="glass-card" style={{ padding: '2rem' }}>
                  <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <UserPlus size={20} color="var(--accent)" /> Enroll New Identity
                  </h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const newUser = Object.fromEntries(formData);
                    try {
                      await axios.post('http://localhost:5000/api/admin/users', newUser, {
                        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                      });
                      e.target.reset();
                      fetchUsers();
                      showToast('New user enrolled successfully');
                    } catch (err) { showToast(err.response?.data?.error || 'System rejection'); }
                  }} className="enroll-form">
                    <input name="email" placeholder="Email Address" className="input-field" style={{ flex: 1, marginBottom: 0 }} required />
                    <input name="nickname" placeholder="Full Name" className="input-field" style={{ flex: 1, marginBottom: 0 }} required />
                    <input name="password" type="password" placeholder="Secure Password" className="input-field" style={{ flex: 1, marginBottom: 0 }} required />
                    <select name="role" className="input-field" style={{ width: '150px', marginBottom: 0 }}>
                      {user.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                      <option value="admin">Admin</option>
                      <option value="authorized">Authorized</option>
                      <option value="user">Guest</option>
                    </select>
                    <button type="submit" className="btn-primary">Enroll User</button>
                  </form>
                  {/* Subtle note about Super Admin role security rules */}
                  <div style={{ padding: '0.75rem 2rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.01)' }}>
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
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>STATUS</th>
                          <th style={{ padding: '1.25rem 2rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '1.25rem 2rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ fontWeight: 600 }}>{u.nickname || u.email.split('@')[0]}</div>
                                {u.role === 'super_admin' && (
                                  <span style={{ background: 'linear-gradient(135deg, #0575e6, #00f2fe)', color: 'white', fontSize: '0.65rem', fontWeight: 800, padding: '0.1rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>Owner</span>
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
                            <td style={{ padding: '1.25rem 2rem', textAlign: 'right' }}>
                              {u.email !== user.email && u.role !== 'super_admin' && (
                                <button 
                                  onClick={() => {
                                    setVisualConfirm({
                                      isOpen: true,
                                      title: 'Remove Identity',
                                      message: `Are you sure you want to permanently remove ${u.nickname || u.email}? This cannot be undone.`,
                                      onConfirm: async () => {
                                        try {
                                          await axios.delete(`http://localhost:5000/api/admin/users/${u.id}`, {
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
                  <form onSubmit={handleAddGallery} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="memory-row-inputs">
                      <input name="title" placeholder="Catchy Title" className="input-field" style={{ flex: 1, marginBottom: 0 }} required />
                      <input name="caption" placeholder="Short description..." className="input-field" style={{ flex: 1, marginBottom: 0 }} />
                    </div>
                    
                    <div className="memory-upload-container" style={{ background: 'rgba(15, 23, 42, 0.02)', padding: '1rem', borderRadius: '12px', border: '1px dashed var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Option 1: Paste URL</label>
                        <input name="url" placeholder="https://..." className="input-field" style={{ marginBottom: 0 }} />
                      </div>
                      <div className="memory-upload-divider" style={{ width: '1px', height: '40px', background: 'var(--border)' }} />
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Option 2: Upload File</label>
                        <input type="file" name="file" accept="image/*" style={{ fontSize: '0.8rem' }} />
                      </div>
                    </div>

                    <button type="submit" className="btn-primary memory-publish-btn" style={{ alignSelf: 'flex-start', padding: '0.75rem 2rem' }}>Publish to Carousel</button>
                  </form>
                </div>

                <div className="grid">
                  {gallery.map(item => (
                    <motion.div 
                      key={item.id} 
                      layout 
                      className="glass-card" 
                      style={{ 
                        padding: '0', 
                        position: 'relative', 
                        borderRadius: '24px', 
                        display: 'flex', 
                        flexDirection: 'column',
                        overflow: 'hidden',
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
                        <img 
                          src={item.url} 
                          alt={item.title} 
                          style={{ 
                            width: '100%', 
                            height: '350px',
                            objectFit: 'contain', 
                            background: '#f1f5f9',
                            display: 'block',
                            cursor: 'zoom-in'
                          }} 
                        />
                        {/* Gradient Overlay like screenshot */}
                        <div style={{ 
                          position: 'absolute', inset: 0, 
                          background: 'linear-gradient(to bottom, transparent 60%, rgba(34, 197, 94, 0.1) 100%)' 
                        }} />
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

                      {/* Interaction Bar (Hidden by default, shown on hover? No, let's keep it clean but accessible) */}
                      <div style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        gap: '1.5rem', padding: '1rem', borderTop: '1px solid #f1f5f9',
                        background: '#f8fafc'
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
                      <input type="file" name="file" accept={vaultSubTab === 'photo' ? 'image/*' : 'video/*'} style={{ fontSize: '0.8rem' }} />
                    </div>
                    <button type="submit" className="btn-primary" disabled={uploadingVault} style={{ padding: '0.75rem 2rem' }}>
                      {uploadingVault ? 'Saving...' : 'Add to Private'}
                    </button>
                  </form>

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
                              src={asset.url} 
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
                          {(user.role === 'admin' || user.role === 'super_admin') && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeletePersonalAsset(asset.id); }}
                              style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                            >
                              <Trash2 size={16} />
                            </button>
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

                    {/* Render Clerk Dropdown (Instead of a Switch - Visible only to superadmin!) */}
                    {user.role === 'super_admin' && systemSettings.find(s => s.key === 'clerk_id') && (() => {
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
                <SavingsTracker user={user} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      )}

      {/* Mobile Bottom Nav */}


      <div className="mobile-bottom-nav">
        <button onClick={() => setActiveTab('messages')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'messages' ? 'var(--primary)' : 'var(--text-muted)' }}>
          <MessageSquare size={20} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Pulse</span>
        </button>
        <button onClick={() => setActiveTab('gallery')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'gallery' ? 'var(--primary)' : 'var(--text-muted)' }}>
          <ImageIcon size={20} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Curator</span>
        </button>
        <button onClick={() => setActiveTab('users')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'users' ? 'var(--primary)' : 'var(--text-muted)' }}>
          <Users size={20} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Matrix</span>
        </button>
        <button onClick={() => setActiveTab('vault')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'vault' ? 'var(--primary)' : 'var(--text-muted)' }}>
          <Lock size={20} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Vault</span>
        </button>
        <button onClick={() => setActiveTab('profile')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: activeTab === 'profile' ? 'var(--primary)' : 'var(--text-muted)' }}>
          <User size={20} />
          <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>Me</span>
        </button>
      </div>
    </div>
  );
};

export default PrivateDashboard;
