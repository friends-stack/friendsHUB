import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import PrivateDashboard from './pages/PrivateDashboard';
import TwoFactorPage from './pages/TwoFactorPage';
import RestrictedDashboard from './pages/RestrictedDashboard';
import MessagingPage from './pages/MessagingPage';
import SupportPage from './pages/SupportPage';
import PublicDashboard from './pages/PublicDashboard';
import ProfilePage from './pages/ProfilePage';
import MemoriesPage from './pages/MemoriesPage';
import './index.css';

axios.defaults.baseURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : window.location.origin;


const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  if (loading) return <div className="loading">Initializing System...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<PublicDashboard user={user} setUser={setUser} />} />
        <Route path="/landing" element={<LandingPage user={user} />} />

        <Route path="/login" element={!user ? <LoginPage setUser={setUser} /> : <Navigate to={user.restricted ? "/" : "/private"} />} />
        <Route path="/mfa" element={<TwoFactorPage setUser={setUser} />} />
        <Route 
          path="/restricted" 
          element={<Navigate to="/" />} 
        />
        <Route 
          path="/private" 
          element={
            user && !user.restricted 
            ? <PrivateDashboard user={user} setUser={setUser} /> 
            : <Navigate to="/" />
          } 
        />
        <Route 
          path="/messaging" 
          element={
            user && (user.role === 'authorized' || user.role === 'super_admin' || user.role === 'admin') 
            ? <MessagingPage user={user} /> 
            : <Navigate to="/login" />
          } 
        />
        <Route path="/public-dashboard" element={<PublicDashboard user={user} setUser={setUser} />} />
        <Route 
          path="/profile/:id" 
          element={user ? <ProfilePage currentUser={user} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/memories" 
          element={user ? <MemoriesPage user={user} /> : <Navigate to="/login" />} 
        />
        <Route path="/support/:type" element={<SupportPage user={user} />} />

      </Routes>
    </Router>
  );
};

export default App;
