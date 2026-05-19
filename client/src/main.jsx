import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import axios from 'axios'

// Request interceptor: dynamically swap localhost backend endpoint with the current host origin in production
axios.interceptors.request.use(
  (config) => {
    const isProd = import.meta.env.PROD;
    const isLocalIp = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    if (config.url && config.url.startsWith('http://localhost:5000')) {
      if (isProd) {
        config.url = config.url.replace('http://localhost:5000', window.location.origin);
      } else if (isLocalIp) {
        config.url = config.url.replace('http://localhost:5000', `${window.location.protocol}//${window.location.hostname}:5000`);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global axios interceptor: auto-logout if token is expired (401)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      // Only force logout if we're on a protected page, not the login page itself
      if (currentPath !== '/' && currentPath !== '/login') {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
