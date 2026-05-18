import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Search, Phone, Video, MoreVertical, 
  Send, Paperclip, Smile, X, Reply as ReplyIcon,
  Circle, Mic, MicOff, VideoOff, PhoneOff,
  Maximize2, Minimize2, Image as ImageIcon
} from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

// Sound utility
const playNotificationSound = () => {
  const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
  audio.play().catch(e => console.log('Sound blocked by browser'));
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

const MessagingPage = ({ user }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [realUsers, setRealUsers] = useState([]);
  const [activeContact, setActiveContact] = useState({ id: 0, nickname: 'Friends Group', initials: 'G', role: 'Group Channel', lastMsg: 'Welcome to the secure channel' });
  const [newMessage, setNewMessage] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [contactTyping, setContactTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Call States
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, ringing, connected
  const [callType, setCallType] = useState(null); // audio, video
  const [incomingCall, setIncomingCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isLocalMaximized, setIsLocalMaximized] = useState(false);
  const [lightBox, setLightBox] = useState({ isOpen: false, url: '' });
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };


  useEffect(() => {
    const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : window.location.origin;
    const s = io(socketUrl, {
      auth: { token: localStorage.getItem('token') }
    });
    setSocket(s);

    s.on('connect', () => {
      s.emit('join_room', 'private');
    });

    s.on('receive_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      if (Number(msg.sender_id || msg.senderId) !== Number(user.id)) {
        playNotificationSound();
      }
    });

    s.on('user_typing', ({ userId, isTyping, isGroup }) => {
      if (activeContact?.id === userId || (activeContact?.id === 0 && isGroup)) {
        setContactTyping(isTyping);
      }
    });

    s.on('user_status', ({ userId, status }) => {
      setOnlineUsers(prev => {
        if (status === 'online') return [...new Set([...prev, userId])];
        return prev.filter(id => id !== userId);
      });
    });

      s.on('incoming_call', ({ signal, from, fromNickname, type, isGlobal }) => {
        setIncomingCall({ signal, from, fromNickname, type, isGlobal });
        setCallType(type);
        setCallStatus('ringing');
        playNotificationSound();
      });

      s.on('call_taken_by_other', () => {
        if (callStatus === 'ringing') {
          setCallStatus('idle');
          setIncomingCall(null);
        }
      });

      s.on('call_accepted', async (signal) => {
        if (pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
            setCallStatus('connected');
          } catch (err) {
            console.error('Error setting remote description:', err);
          }
        }
      });

      s.on('ice_candidate', async (candidate) => {
        if (pcRef.current && candidate) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        }
      });

      s.on('call_ended', () => {
        endCall(false);
      });

    fetchUsers();
    fetchMessages();
    fetchOnlineStatus();

    return () => s.disconnect();
  }, [activeContact]);

  // WebRTC Initialization
  const createPeerConnection = (targetUserId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice_candidate', { to: targetUserId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pcRef.current = pc;
    return pc;
  };

  const startCall = async (type) => {
    if (!activeContact) return;
    setCallType(type);
    setCallStatus('calling');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: type === 'video', 
        audio: true 
      });
      setLocalStream(stream);

      const pc = createPeerConnection(activeContact.id);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call_user', {
        userToCall: activeContact.id,
        signalData: offer,
        from: user.id,
        fromNickname: user.nickname || user.email,
        type: type
      });
    } catch (err) {
      console.error('Error starting call:', err);
      setCallStatus('idle');
      showToast('Could not access camera/microphone');
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    setCallStatus('connected');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: incomingCall.type === 'video', 
        audio: true 
      });
      setLocalStream(stream);

      const pc = createPeerConnection(incomingCall.from);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.signal));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answer_call', {
        to: incomingCall.from,
        signal: answer,
        isGlobal: incomingCall.isGlobal
      });
    } catch (err) {
      console.error('Error answering call:', err);
      endCall();
    }
  };

  const endCall = (emit = true) => {
    if (emit && socket) {
      const targetId = incomingCall ? incomingCall.from : activeContact?.id;
      if (targetId) socket.emit('end_call', { to: targetId });
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    setRemoteStream(null);
    setCallStatus('idle');
    setIncomingCall(null);
    setCallType(null);
    setIsMicMuted(false);
    setIsCameraOff(false);
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
      setIsMicMuted(!isMicMuted);
    }
  };

  const toggleCamera = () => {
    if (localStream && callType === 'video') {
      localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
      setIsCameraOff(!isCameraOff);
    }
  };

  // Video stream assignment
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (socket && newMessage.trim()) {
      socket.emit('typing', { receiverId: activeContact?.id === 0 ? null : activeContact?.id, isTyping: true });
      const timer = setTimeout(() => {
        socket.emit('typing', { receiverId: activeContact?.id === 0 ? null : activeContact?.id, isTyping: false });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newMessage]);

  const fetchOnlineStatus = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/users/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setOnlineUsers(data.onlineIds);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  const fetchUsers = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/users', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Add a virtual "Global Pulse" contact for broadcast messages
      const globalPulse = {
        id: 0,
        nickname: 'Friends Group',
        role: 'Group Channel',
        initials: 'G',
        status: 'online',
        lastMsg: 'System-wide broadcast stream'
      };

      const others = data.filter(u => u.id !== user.id).map(u => ({
        ...u,
        initials: u.nickname.split(' ').map(n => n[0]).join('').toUpperCase(),
        lastMsg: 'Click to view message stream'
      }));

      const finalContacts = [globalPulse, ...others];
      setRealUsers(finalContacts);
      if (finalContacts.length > 0 && !activeContact) setActiveContact(finalContacts[0]);
    } catch (err) { console.error(err); }
  };

  const fetchMessages = async () => {
    try {
      const { data } = await axios.get('http://localhost:5000/api/messages', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMessages(data);
    } catch (err) { console.error(err); }
  };

  const scrollToMessage = (msgId) => {
    const element = document.getElementById(`msg-${msgId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 2000);
    }
  };

  const filteredContacts = realUsers.filter(c => 
    c.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter messages to show conversation with active contact
  const filteredMessages = messages.filter(msg => {
    const sId = Number(msg.sender_id || msg.senderId);
    const rIdBase = msg.receiver_id || msg.receiverId;
    const rId = (rIdBase === undefined || rIdBase === null) ? null : Number(rIdBase);
    
    const myId = Number(user.id);
    const contactId = Number(activeContact?.id);

    // If "Global Pulse" (ID 0) is selected, show only broadcast messages
    if (contactId === 0) return rId === null;

    // Otherwise, show private messages AND public messages from this contact
    const isMeSender = sId === myId;
    const isMeReceiver = rId === myId;
    const isContactSender = sId === contactId;
    const isContactReceiver = rId === contactId;

    return (isMeSender && isContactReceiver) || (isContactSender && isMeReceiver) || (isContactSender && rId === null);
  });

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !mediaFile) return;
    if (!activeContact || !socket) return;

    setUploading(true);
    let finalMediaUrl = '';
    let mediaType = 'text';

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
        
        const fileExt = mediaFile.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fileExt)) {
          mediaType = 'image';
        } else {
          mediaType = 'file';
        }
      }

      const msgData = { 
        receiverId: activeContact.id === 0 ? null : Number(activeContact.id),
        replyToId: replyTarget ? Number(replyTarget.id) : null,
        content: newMessage, 
        media_url: finalMediaUrl,
        media_type: mediaType
      };
      socket.emit('send_message', msgData);
      if (mediaFile) showToast('Media sent successfully! ✓');
      setNewMessage('');
      setMediaFile(null);
      setReplyTarget(null);
      socket.emit('typing', { receiverId: activeContact.id === 0 ? null : Number(activeContact.id), isTyping: false });
    } catch (err) {
      console.error(err);
      showToast('Failed to send: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };



  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: '#f8fafc',
      fontFamily: "'Inter', sans-serif",
      color: '#1e293b'
    }}>
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }} 
            animate={{ opacity: 1, y: 0, x: '-50%' }} 
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            style={{ 
              position: 'fixed', bottom: '2rem', left: '50%', zIndex: 99999, 
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

      <style>{`
        @media (max-width: 768px) {
          .chat-sidebar { 
            display: ${activeContact && activeContact.id !== -1 ? 'none' : 'flex'} !important; 
            width: 100% !important; 
          }
          .chat-area { 
            display: ${activeContact && activeContact.id !== -1 ? 'flex' : 'none'} !important; 
          }
          .chat-header-mobile-back { display: block !important; }
          .call-overlay-content { width: 100% !important; height: 100% !important; border-radius: 0 !important; }
        }
      `}</style>
      {/* Top Header */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0.75rem 1.5rem',
        background: 'white',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', marginRight: '1rem', display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeft size={20} color="#1e293b" />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Messages</h1>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside className="chat-sidebar" style={{ 
          width: '320px', 
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          background: 'white'
        }}>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ 
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '1rem' }} />
              <input 
                type="text" 
                placeholder="Search contacts..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 3rem',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  outline: 'none',
                  color: '#1e293b'
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredContacts.map(contact => (
              <div 
                key={contact.id}
                onClick={() => setActiveContact(contact)}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  cursor: 'pointer',
                  background: activeContact?.id === contact.id ? '#f8fafc' : 'transparent',
                  transition: 'all 0.2s',
                  borderLeft: activeContact?.id === contact.id ? '4px solid #00cfde' : '4px solid transparent'
                }}
              >
                <div style={{ position: 'relative', marginRight: '1rem', flexShrink: 0 }}>
                  <div style={{ 
                    width: '44px', 
                    height: '44px', 
                    borderRadius: '50%', 
                    background: contact.id === 0 ? 'var(--primary)' : '#00cfde',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.9rem'
                  }}>
                    {contact.initials}
                  </div>
                  <div style={{ 
                    position: 'absolute',
                    bottom: '0',
                    right: '0',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: onlineUsers.includes(contact.id) ? '#22c55e' : '#94a3b8',
                    border: '2px solid white'
                  }} />

                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}>{contact.nickname}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {contact.unread && (
                        <span style={{ 
                          background: '#00cfde', 
                          color: 'white', 
                          fontSize: '0.7rem', 
                          fontWeight: 700,
                          padding: '0.1rem 0.4rem',
                          borderRadius: '10px',
                          minWidth: '20px',
                          textAlign: 'center'
                        }}>
                          {contact.unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {contact.lastMsg}
                  </div>
                </div>


              </div>
            ))}
          </div>
          <style>{`
            .contact-item:hover .contact-actions { opacity: 1 !important; }
          `}</style>
        </aside>

        {/* Chat Area */}
        {activeContact ? (
          <main className="chat-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'white' }}>
            {/* Chat Header */}
            <header style={{ 
              height: '72px',
              padding: '0 1.5rem',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button 
                  className="chat-header-mobile-back"
                  onClick={() => setActiveContact(null)}
                  style={{ display: 'none', background: 'none', border: 'none', padding: '0.5rem', marginRight: '0.5rem' }}
                >
                  <ArrowLeft size={20} />
                </button>
                <div style={{ position: 'relative', marginRight: '1rem' }}>
                  <div style={{ 
                    width: '44px', 
                    height: '44px', 
                    borderRadius: '50%', 
                    background: activeContact.id === 0 ? '#8b5cf6' : '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600
                  }}>
                    {activeContact.initials}
                  </div>
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#1e293b' }}>{activeContact.nickname}</h2>
                  <span style={{ fontSize: '0.8rem', color: contactTyping ? '#00cfde' : '#94a3b8', fontWeight: contactTyping ? 700 : 400 }}>
                    {contactTyping ? 'typing...' : activeContact.role}
                  </span>
                </div>

              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: '#64748b' }}>
                  <MoreVertical size={20} />
                </button>
              </div>
            </header>

            {/* Messages List */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              background: '#f8fafc'
            }}>
              {filteredMessages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '1rem' }}>
                  <div style={{ background: '#f8fafc', padding: '2rem', borderRadius: '50%', marginBottom: '1rem' }}>
                    <ReplyIcon size={40} style={{ opacity: 0.3 }} />
                  </div>
                  <div style={{ fontWeight: 600 }}>No messages yet with {activeContact.nickname}</div>
                  <div style={{ fontSize: '0.85rem' }}>Send a message to start the conversation</div>
                </div>
              ) : (
                <>
                  {/* Real messages */}
                  {filteredMessages.map((msg, i) => (
                    <div 
                      key={i} 
                      id={`msg-${msg.id}`}
                      className={`msg-container ${highlightedMsgId === msg.id ? 'highlight-pulse' : ''}`}
                      style={{ 
                        alignSelf: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'flex-end' : 'flex-start',
                        maxWidth: '450px',
                        position: 'relative',
                        transition: 'all 0.3s'
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
                        gap: '0.25rem',
                        position: 'relative',
                        minWidth: '150px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
                          {Number(msg.sender_id || msg.senderId) !== Number(user.id) ? (
                            <div style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
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
                              <ReplyIcon size={12} />
                            </button>

                            {/* Download Button for EVERY chat with a media_url */}
                            {msg.media_url && (
                              <a 
                                href={msg.media_url} 
                                download={getOriginalFileName(msg.media_url) || 'download'}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '2px', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                                title="Download file"
                              >
                                <Download size={12} />
                              </a>
                            )}
                          </div>
                        </div>
                        {msg.reply_content && (
                          <div 
                            onClick={() => scrollToMessage(msg.reply_to_id)}
                            style={{ 
                              background: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.05)',
                              borderLeft: `3px solid ${ Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'white' : '#3b82f6' }`,
                              padding: '0.5rem 0.75rem',
                              borderRadius: '4px',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              marginBottom: '0.5rem'
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
                        {msg.media_url && msg.media_type === 'image' && (
                          <img 
                            src={msg.media_url} 
                            alt="Shared" 
                            onClick={() => setLightBox({ isOpen: true, url: msg.media_url })}
                            style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '0.25rem', display: 'block', cursor: 'zoom-in' }} 
                          />
                        )}
                        {msg.media_url && msg.media_type === 'file' && (
                          <a 
                            href={msg.media_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            download={getOriginalFileName(msg.media_url) || 'shared_document'}
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
                        )}
                        <div style={{ fontSize: '1rem', lineHeight: '1.4', fontWeight: 300 }}>{msg.content}</div>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          color: Number(msg.sender_id || msg.senderId) === Number(user.id) ? 'rgba(255,255,255,0.9)' : '#64748b', 
                          textAlign: 'left',
                          marginTop: '0.25rem'
                        }}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <style>{`
                        .msg-container:hover .reply-btn { opacity: 1 !important; }
                        @keyframes pulse-highlight {
                          0% { background: transparent; }
                          50% { background: rgba(0, 207, 222, 0.1); }
                          100% { background: transparent; }
                        }
                        .highlight-pulse > div:nth-child(2) {
                           animation: pulse-highlight 2s ease;
                        }
                      `}</style>
                    </div>
                  ))}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <footer style={{ 
              padding: '1.25rem 2rem', 
              background: 'white',
              borderTop: '1px solid #e2e8f0',
              position: 'relative'
            }}>
              {replyTarget && (
                <div style={{ 
                  padding: '0.75rem 1rem',
                  background: '#f8fafc',
                  borderLeft: '4px solid #00cfde',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: '8px 8px 0 0',
                  marginBottom: '-4px'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#00cfde' }}>Replying to {replyTarget.sender_email}</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyTarget.content}</div>
                  </div>
                  <button onClick={() => setReplyTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    <X size={18} />
                  </button>
                </div>
              )}
              <form 
                onSubmit={handleSendMessage}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  background: 'none',
                  padding: '0.25rem 0',
                }}
              >
                 <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: mediaFile ? '#3b82f6' : '#64748b' }}
                >
                  <Paperclip size={22} />
                </button>
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <ImageIcon size={22} />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => setMediaFile(e.target.files[0])}
                  style={{ display: 'none' }}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                />
                {mediaFile && (
                  <div style={{ 
                    position: 'absolute', top: '-40px', left: '20px', 
                    background: '#3b82f6', color: 'white', padding: '0.25rem 0.75rem', 
                    borderRadius: '20px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' 
                  }}>
                    📎 {mediaFile.name}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => setMediaFile(null)} />
                  </div>
                )}

                <input 
                  type="text" 
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ 
                    flex: 1,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '24px',
                    outline: 'none',
                    padding: '0.85rem 1.25rem',
                    fontSize: '0.95rem',
                    color: '#1e293b'
                  }}
                />
                 <button 
                  type="submit" 
                  disabled={uploading}
                  style={{ 
                    background: '#93c5fd', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '16px',
                    width: '48px',
                    height: '48px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: uploading ? 0.6 : 1
                  }}
                >
                  <Send size={20} />
                </button>

              </form>
            </footer>
          </main>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            Select a contact to start messaging
          </div>
        )}

        {/* Universal Lightbox */}
        {lightBox.isOpen && (
          <div 
            onClick={() => setLightBox({ isOpen: false, url: '' })}
            style={{ 
              position: 'fixed', inset: 0, zIndex: 99999, 
              background: 'rgba(0,0,0,0.95)', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' 
            }}
          >
            <img src={lightBox.url} alt="Full View" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
        )}

        {/* Call Overlay */}
        <AnimatePresence>
          {callStatus !== 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: '#0f172a',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}
            >
              {callStatus === 'ringing' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--primary)', margin: '0 auto 2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                    {incomingCall?.fromNickname?.[0] || 'U'}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Incoming {callType} call from {incomingCall?.fromNickname || 'User'}...</h2>
                  <p style={{ color: '#94a3b8', marginBottom: '3rem' }}>User is inviting you to a session</p>
                  <div style={{ display: 'flex', gap: '2rem' }}>
                    <button 
                      onClick={answerCall}
                      style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#22c55e', border: 'none', cursor: 'pointer', color: 'white' }}
                    >
                      <Phone size={30} />
                    </button>
                    <button 
                      onClick={() => endCall()}
                      style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', color: 'white' }}
                    >
                      <PhoneOff size={30} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Active Call UI */}
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {callType === 'video' ? (
                      <>
                        <video 
                          ref={remoteVideoRef} 
                          autoPlay 
                          playsInline 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {callStatus === 'calling' && (
                          <div style={{ position: 'absolute', zIndex: 150, textAlign: 'center', background: 'rgba(0,0,0,0.3)', padding: '1rem 2rem', borderRadius: '12px', backdropFilter: 'blur(4px)' }}>
                            <h2 style={{ margin: 0 }}>Calling with {activeContact?.nickname}...</h2>
                          </div>
                        )}
                        <motion.div
                          drag
                          dragConstraints={{ left: -window.innerWidth, right: 0, top: 0, bottom: window.innerHeight }}
                          style={{ 
                            position: 'absolute', 
                            top: isLocalMaximized ? 0 : '2rem', 
                            right: isLocalMaximized ? 0 : '2rem', 
                            width: isLocalMaximized ? '100%' : '240px', 
                            height: isLocalMaximized ? '100%' : 'auto',
                            maxHeight: isLocalMaximized ? '100%' : '400px',
                            borderRadius: isLocalMaximized ? 0 : '12px', 
                            border: isLocalMaximized ? 'none' : '2px solid rgba(255,255,255,0.2)',
                            boxShadow: isLocalMaximized ? 'none' : '0 10px 25px rgba(0,0,0,0.3)',
                            overflow: 'hidden',
                            zIndex: isLocalMaximized ? 100 : 200,
                            cursor: 'move',
                            resize: isLocalMaximized ? 'none' : 'both',
                          }}
                        >
                          <video 
                            ref={localVideoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              objectFit: 'cover',
                              transform: 'scaleX(-1)', // Mirror local video
                              display: 'block'
                            }}
                          />
                          <button 
                            onClick={(e) => { e.stopPropagation(); setIsLocalMaximized(!isLocalMaximized); }}
                            style={{ 
                              position: 'absolute', 
                              top: '1rem', 
                              right: '1rem', 
                              background: 'rgba(0,0,0,0.5)', 
                              border: 'none', 
                              color: 'white', 
                              width: '32px', 
                              height: '32px', 
                              borderRadius: '8px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              cursor: 'pointer',
                              backdropFilter: 'blur(4px)'
                            }}
                          >
                            {isLocalMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                          </button>
                        </motion.div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <motion.div 
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          style={{ width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', margin: '0 auto 2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Phone size={60} color="var(--primary)" />
                        </motion.div>
                        <h2>{callStatus === 'calling' ? `Calling with ${activeContact?.nickname}...` : 'Connected'}</h2>
                      </div>
                    )}

                    {/* Controls */}
                    <div style={{ 
                      position: 'absolute', 
                      bottom: '3rem', 
                      display: 'flex', 
                      gap: '1.5rem', 
                      background: 'rgba(0,0,0,0.5)', 
                      padding: '1rem 2rem', 
                      borderRadius: '100px',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <button 
                        onClick={toggleMic}
                        style={{ background: isMicMuted ? '#ef4444' : 'rgba(255,255,255,0.1)', border: 'none', width: '50px', height: '50px', borderRadius: '50%', cursor: 'pointer', color: 'white' }}
                      >
                        {isMicMuted ? <MicOff size={24} /> : <Mic size={24} />}
                      </button>
                      {callType === 'video' && (
                        <button 
                          onClick={toggleCamera}
                          style={{ background: isCameraOff ? '#ef4444' : 'rgba(255,255,255,0.1)', border: 'none', width: '50px', height: '50px', borderRadius: '50%', cursor: 'pointer', color: 'white' }}
                        >
                          {isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
                        </button>
                      )}
                      <button 
                        onClick={() => endCall()}
                        style={{ background: '#ef4444', border: 'none', width: '50px', height: '50px', borderRadius: '50%', cursor: 'pointer', color: 'white' }}
                      >
                        <PhoneOff size={24} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MessagingPage;
