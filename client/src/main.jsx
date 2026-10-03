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

// Helper to recursively rewrite backend URLs in response payloads to the active hosting context
const rewriteUrls = (data) => {
  if (!data) return data;
  if (typeof data === 'string') {
    let rewritten = data;
    
    // 1. Automatically elevate http to https under secure contexts to avoid mixed-content media blockages
    if (window.location.protocol === 'https:' && rewritten.startsWith('http://')) {
      rewritten = rewritten.replace('http://', 'https://');
    }
    
    // 2. Dynamically replace localhost target host with the correct active runtime target
    if (rewritten.startsWith('http://localhost:5000') || rewritten.startsWith('https://localhost:5000')) {
      const isProd = import.meta.env.PROD;
      const isLocalIp = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const targetPrefix = rewritten.startsWith('https://') ? 'https://localhost:5000' : 'http://localhost:5000';
      
      if (isProd) {
        return rewritten.replace(targetPrefix, window.location.origin);
      } else if (isLocalIp) {
        return rewritten.replace(targetPrefix, `${window.location.protocol}//${window.location.hostname}:5000`);
      }
    }
    
    // 3. Dynamically prefix relative /uploads/ paths to point to the backend in development
    if (rewritten.startsWith('/uploads/')) {
      const isProd = import.meta.env.PROD;
      const isLocalIp = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (!isProd) {
        const backendOrigin = isLocalIp 
          ? `${window.location.protocol}//${window.location.hostname}:5000` 
          : 'http://localhost:5000';
        return `${backendOrigin}${rewritten}`;
      }
    }
    return rewritten;
  }
  if (Array.isArray(data)) {
    return data.map(rewriteUrls);
  }
  if (typeof data === 'object') {
    const copy = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        copy[key] = rewriteUrls(data[key]);
      }
    }
    return copy;
  }
  return data;
};

// Response interceptor to rewrite backend media links to active origins
axios.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = rewriteUrls(response.data);
    }
    return response;
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
