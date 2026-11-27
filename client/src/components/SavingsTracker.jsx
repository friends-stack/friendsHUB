import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, History as HistoryIcon, LayoutDashboard,
  Plus, AlertCircle, RefreshCw, ArrowUp, Briefcase, CheckCircle,
  Calendar, Clock, Calculator, ArrowLeft, FileText,
  Wallet, BarChart3, Coins, ChevronRight, Settings as SettingsIcon, LayoutGrid, Trash2,
  PiggyBank, Wrench, Archive, Play, AlertTriangle, Info, Home, User, Landmark, Award, TrendingUp,
  Search, Filter, ChevronDown, ChevronUp, Eye, UserPlus, Shield, Star, Check
} from 'lucide-react';
import VerifiedBadge from './VerifiedBadge';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : window.location.origin;

const formatCurrency = (val) => new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(val || 0);

const parseTransactionNotes = (notes) => {
  if (!notes || typeof notes !== 'string') return null;
  const cleaned = notes.replace(/🗓️\s*/g, '').trim();
  if (!cleaned) return null;

  const satMatch = cleaned.match(/Consecutive Saturdays\s*\((\d+)\s*wks?\):\s*(.+)$/i);
  if (satMatch) {
    const weeks = parseInt(satMatch[1], 10);
    const datesRaw = satMatch[2].trim();
    const beforeSat = cleaned.slice(0, satMatch.index).replace(/[•|·\-–\s]+$/, '').trim();
    const entries = datesRaw.split(/,\s*(?=[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/);
    const cleanDate = (s) => s.replace(/\s*\([^)]*\)/g, '').trim();
    const firstDate = entries.length > 0 ? cleanDate(entries[0]) : '';
    const lastDate = entries.length > 1 ? cleanDate(entries[entries.length - 1]) : '';
    const dateRange = firstDate && lastDate && firstDate !== lastDate
      ? `${firstDate} – ${lastDate}`
      : (firstDate || datesRaw);

    return {
      weeks,
      dateRange,
      datesList: datesRaw,
      noteText: beforeSat
    };
  }

  return {
    weeks: null,
    dateRange: null,
    datesList: null,
    noteText: cleaned
  };
};

const getActualProfit = (inv) => inv.projected_profit || 0;

const getCachedSavings = () => {
  try {
    const raw = localStorage.getItem('cached_savings_data');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const SavingsTracker = ({ user }) => {
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    document.body.style.fontFamily = "'Inter', sans-serif";
  }, []);

  const cachedData = getCachedSavings();
  const [activeView, setActiveViewState] = useState(() => {
    return localStorage.getItem('savings_active_view') || 'dashboard';
  });
  const setActiveView = (view) => {
    setActiveViewState(view);
    localStorage.setItem('savings_active_view', view);
  };
  const [members, setMembers] = useState(cachedData?.members || []);
  const [history, setHistory] = useState(cachedData?.history || []);
  const [config, setConfig] = useState(cachedData?.config || { weekly_amount: 0 });
  const [configHistory, setConfigHistory] = useState(cachedData?.configHistory || []);
  const [loading, setLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [systemUsers, setSystemUsers] = useState(cachedData?.systemUsers || []);
  const [investments, setInvestments] = useState(cachedData?.investments || []);

  // Set the logged-in user's default member record without forcing view switch away from dashboard
  useEffect(() => {
    if (members.length > 0 && user && !selectedMember) {
      const myMember = members.find(m =>
        (user.email && m.email && m.email.toLowerCase() === user.email.toLowerCase()) ||
        (user.nickname && m.name && m.name.toLowerCase() === user.nickname.toLowerCase()) ||
        (m.name && m.name.toLowerCase().includes('ermias'))
      );
      if (myMember) {
        setSelectedMember(myMember);
      }
    }
  }, [members, user, selectedMember]);

  // Superadmin authorization strictly bound to ermiasgesgis@gmail.com
  const SUPER_ADMIN_EMAIL = 'ermiasgesgis@gmail.com';
  const isSuperAdmin = user?.role === 'super_admin' && (user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  const isClerk = Boolean((config.clerk_id && user?.id && Number(user.id) === Number(config.clerk_id)) || user?.role === 'clerk');
  const isPaymentManager = isClerk || isSuperAdmin;
  const isMemberManager = isSuperAdmin;
  const canTrackInvestments = isSuperAdmin || isClerk;

  // 3-Step Delete Confirmation State for Clerk / Admin
  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    step: 1, // 1, 2, or 3
    transaction: null
  });

  // Settings dashboard is only accessible to superadmin ermiasgesgis@gmail.com
  useEffect(() => {
    if (activeView === 'settings' && !isSuperAdmin) {
      setActiveView('dashboard');
    }
  }, [activeView, isSuperAdmin]);

  // Modals & Confirmation
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showMissedModal, setShowMissedModal] = useState(false);
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [showInvestmentDetailModal, setShowInvestmentDetailModal] = useState(false);
  const [showInvestmentCompleteModal, setShowInvestmentCompleteModal] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showWealthModal, setShowWealthModal] = useState(false);
  const [showActiveInvestmentsModal, setShowActiveInvestmentsModal] = useState(false);
  const [showProfitModal, setShowProfitModal] = useState(false);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', onConfirm: null, confirmText: 'Yes', cancelText: 'No' });
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' });
  const [visualPrompt, setVisualPrompt] = useState({ isOpen: false, title: '', placeholder: '', defaultValue: '', onConfirm: null });
  const [paymentForm, setPaymentForm] = useState({ amount: 300, notes: '', date: '', time: '', type: 'payment' });
  const [investmentForm, setInvestmentForm] = useState({ projectName: '', amount: '', projectedProfit: '', challenges: '', expectedDays: '' });
  const [completionForm, setCompletionForm] = useState({ finalProfit: '', challenges: '' });

  // Cash In / Cash Out Modal State (Inspired by cash entry design)
  const [showCashEntryModal, setShowCashEntryModal] = useState(false);
  const [cashMode, setCashMode] = useState('Cash Out');
  const [cashMemberId, setCashMemberId] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState('');
  const [cashTime, setCashTime] = useState('');
  const [cashNotes, setCashNotes] = useState('');

  // Cycle History & Super Admin Reset State
  const [cycles, setCycles] = useState([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetCycleName, setResetCycleName] = useState('');
  const [showCycleHistoryModal, setShowCycleHistoryModal] = useState(false);
  const [selectedCycleSnapshot, setSelectedCycleSnapshot] = useState(null);

  const handleOpenCashEntry = (initialMode = 'Cash In', memberId = null) => {
    setCashMode(initialMode);
    setCashAmount('');
    setCashNotes('');
    setCashDate(getTodayDateString());
    setCashTime(getNowTimeString());
    if (memberId) {
      setCashMemberId(memberId);
    } else if (members && members.length > 0) {
      setCashMemberId(members[0].id);
    }
    setShowCashEntryModal(true);
  };

  const getConsecutiveSaturdayDates = (startDateStr, numWeeks) => {
    const dates = [];
    if (!startDateStr || numWeeks <= 0) return dates;
    const parts = startDateStr.split('-');
    if (parts.length < 3) return dates;
    let curr = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const currentDay = curr.getDay();
    let daysUntilSat = (6 - currentDay + 7) % 7;
    curr.setDate(curr.getDate() + daysUntilSat);

    for (let i = 0; i < numWeeks; i++) {
      const formatted = curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (i === 0) {
        dates.push(`${formatted} (Today)`);
      } else {
        dates.push(`${formatted} (Next Sat #${i})`);
      }
      curr.setDate(curr.getDate() + 7);
    }
    return dates;
  };

  const handleSaveCashEntry = async (shouldExit) => {
    if (!cashMemberId) {
      showToast("Please select a friend / member");
      return;
    }
    if (!cashAmount || parseFloat(cashAmount) <= 0) {
      showToast("Please enter a valid amount");
      return;
    }

    const selectedM = members.find(m => String(m.id) === String(cashMemberId));
    const memberName = selectedM ? selectedM.name : 'Member';
    const typeParam = cashMode === 'Cash In' ? 'payment' : 'missed';
    const createdAtParam = `${cashDate} ${cashTime}:00`;

    const weeklyRate = config.weekly_amount || 300;
    const numSats = cashMode === 'Cash In' ? Math.floor(parseFloat(cashAmount) / weeklyRate) : 0;
    let finalNotes = cashNotes ? cashNotes.trim() : '';
    if (numSats >= 1) {
      const satDates = getConsecutiveSaturdayDates(cashDate, numSats);
      const satText = `🗓️ Consecutive Saturdays (${numSats} wks): ${satDates.join(', ')}`;
      finalNotes = finalNotes ? `${finalNotes} • ${satText}` : satText;
    }

    confirmAction(
      `Confirm ${cashMode}`,
      `Are you sure you want to record a ${formatCurrency(cashAmount)} ${cashMode} for ${memberName}?`,
      async () => {
        try {
          await axios.post(`${API_BASE}/api/savings/transactions`, {
            member_id: cashMemberId,
            amount: parseFloat(cashAmount),
            type: typeParam,
            created_at: createdAtParam,
            notes: finalNotes || undefined
          }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

          setConfirmation(prev => ({ ...prev, isOpen: false }));
          const addedAmt = cashMode === 'Cash In' ? parseFloat(cashAmount) : 0;
          const updatedTotalWealth = (finalTotalAvailable + totalActiveCapital) + addedAmt;
          const formattedTotalWealth = formatCurrency(updatedTotalWealth);
          const signerName = user?.nickname || 'Admin';

          const currentDebt = selectedM ? Math.max(0, (selectedM.total_expected || 0) - (selectedM.total_paid || 0)) : 0;
          const addedMissed = cashMode === 'Cash Out' ? parseFloat(cashAmount) : 0;
          const addedPaid = cashMode === 'Cash In' ? parseFloat(cashAmount) : 0;
          const updatedMemberMissed = Math.max(0, currentDebt + addedMissed - addedPaid);
          const formattedMemberMissed = formatCurrency(updatedMemberMissed);

          const labelText = cashMode === 'Cash In' ? 'New payment' : 'Missed record';
          showSuccess(`🔔 ${labelText} of ${formatCurrency(cashAmount)} signed by ${signerName} for ${memberName} (total missed: ${formattedMemberMissed}), now you all have ${formattedTotalWealth}`);
          fetchAllData();

          if (shouldExit) {
            setShowCashEntryModal(false);
          } else {
            setCashAmount('');
            setCashNotes('');
          }
        } catch (err) {
          showToast("Error recording transaction");
        }
      }
    );
  };

  const handleResetCycle = async () => {
    confirmAction(
      "Archive & Reset Savings Pool?",
      `Are you sure you want to archive current wealth (${formatCurrency(finalTotalAvailable + totalActiveCapital)}) and start from scratch for a new cycle? All current member records and history will be saved in Cycle History.`,
      async () => {
        try {
          const token = localStorage.getItem('token');
          await axios.post(
            `${API_BASE}/api/savings/reset-cycle`,
            {
              cycle_name: resetCycleName || undefined,
              cash_in_hand: finalTotalAvailable,
              money_at_work: totalActiveCapital,
              total_wealth: finalTotalAvailable + totalActiveCapital
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          setShowResetModal(false);
          setResetCycleName('');
          showSuccess("Savings pool successfully archived and reset! Active transactions reset to ETB 0.00.");
          fetchAllData();
        } catch (err) {
          showToast(err.response?.data?.error || "Error archiving and resetting pool.");
        }
      }
    );
  };

  const handleDeleteCycle = (cycleId, cycleName) => {
    confirmAction(
      "Delete Archived Cycle?",
      `Are you sure you want to permanently delete the archived cycle "${cycleName || 'this cycle'}"? This action cannot be undone.`,
      async () => {
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${API_BASE}/api/savings/cycles/${cycleId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          if (selectedCycleSnapshot?.id === cycleId) {
            setSelectedCycleSnapshot(null);
          }
          showSuccess(`Archived cycle "${cycleName || 'cycle'}" deleted successfully!`);
          fetchAllData();
        } catch (err) {
          showToast(err.response?.data?.error || "Error deleting archived cycle.");
        }
      },
      "Yes, Delete",
      "Cancel"
    );
  };

  const handleClearAllCycles = () => {
    confirmAction(
      "Clear All Cycle Archives?",
      "Are you sure you want to permanently delete ALL archived savings cycles? This action cannot be undone.",
      async () => {
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${API_BASE}/api/savings/cycles`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          setSelectedCycleSnapshot(null);
          showSuccess("All archived savings cycles have been permanently cleared!");
          fetchAllData();
        } catch (err) {
          showToast(err.response?.data?.error || "Error clearing cycle archives.");
        }
      },
      "Yes, Clear All",
      "Cancel"
    );
  };

  // Filtering
  const [dateFilter, setDateFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [showMemberFilterMenu, setShowMemberFilterMenu] = useState(false);
  const [historySort, setHistorySort] = useState('latest');
  const [expandedTxIds, setExpandedTxIds] = useState({});
  const [mobileNewMemberName, setMobileNewMemberName] = useState('');
  const [showMobileWeekSection, setShowMobileWeekSection] = useState(false);
  const [mobileWeeklyAmount, setMobileWeeklyAmount] = useState('');
  const [mobileClerkId, setMobileClerkId] = useState('');

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getNowTimeString = () => {
    const d = new Date();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(parts[1]) - 1] || '';
    return `${parts[2]}-${monthName}-${parts[0]}`;
  };

  const formatTimeString = (timeStr) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hour = parseInt(parts[0]);
    const min = parts[1];
    const ampm = hour >= 12 ? 'pm' : 'am';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${String(hour).padStart(2, '0')}:${min} ${ampm}`;
  };

  const handleAdjustDate = (days) => {
    if (!paymentForm.date) return;
    const d = new Date(paymentForm.date);
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setPaymentForm(prev => ({ ...prev, date: `${year}-${month}-${day}` }));
  };

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const showSuccess = (msg) => {
    setSuccessModal({ isOpen: true, message: msg });
  };

  const countSaturdaysSince = (startDate) => {
    if (!startDate) return 0;
    let count = 0;
    let current = new Date(startDate);
    const now = new Date();
    current.setHours(0, 0, 0, 0);
    while (current <= now) {
      if (current.getDay() === 6) count++; // 6 is Saturday
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const fetchAllData = async (isSilent = false) => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const promises = [
        axios.get(`${API_BASE}/api/savings/members`, { headers }),
        axios.get(`${API_BASE}/api/savings/history`, { headers }),
        axios.get(`${API_BASE}/api/savings/config`, { headers }),
        axios.get(`${API_BASE}/api/savings/config/all`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/savings/investments`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/savings/cycles`, { headers }).catch(() => ({ data: [] }))
      ];
      if (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'clerk') {
        promises.push(axios.get(`${API_BASE}/api/users`, { headers }).catch(() => ({ data: [] })));
      }
      const res = await Promise.all(promises);
      const newMembers = res[0].data || [];
      const newCycles = res[5].data || [];
      let historyData = res[1].data || [];
      const newConfig = res[2].data || { weekly_amount: 0 };
      const newConfigHistory = res[3].data || [];
      const newInvestments = res[4].data || [];
      const newSystemUsers = res[6]?.data || systemUsers;

      setMembers(newMembers);
      setCycles(newCycles);

      const memberPayments = {};
      historyData.forEach(h => {
        if (h.type === 'payment') memberPayments[h.member_id] = (memberPayments[h.member_id] || 0) + h.amount;
      });

      const expsByMember = {};
      historyData.forEach(h => {
        if (h.type !== 'payment') {
          if (!expsByMember[h.member_id]) expsByMember[h.member_id] = [];
          expsByMember[h.member_id].push(h);
        }
      });

      Object.keys(expsByMember).forEach(mId => {
        expsByMember[mId].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let available = memberPayments[mId] || 0;
        expsByMember[mId].forEach(exp => {
          if (available >= exp.amount) {
            exp.paymentStatus = 'paid';
            available -= exp.amount;
          } else if (available > 0) {
            exp.paymentStatus = 'partial';
            exp.coveredAmount = available;
            available = 0;
          } else {
            exp.paymentStatus = 'unpaid';
          }
        });
      });

      setHistory(historyData);
      setConfig(newConfig);
      setConfigHistory(newConfigHistory);
      setInvestments(newInvestments);
      if (res[6]?.data) setSystemUsers(res[6].data);

      try {
        localStorage.setItem('cached_savings_data', JSON.stringify({
          members: newMembers,
          history: historyData,
          config: newConfig,
          configHistory: newConfigHistory,
          investments: newInvestments,
          cycles: newCycles,
          systemUsers: newSystemUsers
        }));
      } catch (cacheErr) { }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Auto-refresh in background every 2.5s quickly without blocking UI
    const intervalId = setInterval(() => {
      fetchAllData(true);
    }, 2500);
    return () => clearInterval(intervalId);
  }, []);

  const confirmAction = (title, message, onConfirm, confirmText = 'Yes', cancelText = 'No') => {
    setConfirmation({ isOpen: true, title, message, onConfirm, confirmText, cancelText });
  };

  const handleAddPayment = async (memberId, amount) => {
    confirmAction("Confirm Payment", `Are you sure you want to record a ${formatCurrency(amount)} payment?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/transactions`, { member_id: memberId, amount, type: 'payment' }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess("Payment recorded successfully!");
        fetchAllData(); // refresh in background
      } catch (err) { showToast("Error recording payment"); }
    });
  };

  const handleSaveTransaction = async (shouldExit) => {
    const { amount, notes, date, time, type } = paymentForm;
    if (!amount || parseFloat(amount) <= 0) {
      showToast("Please enter a valid amount");
      return;
    }

    const createdAtParam = `${date} ${time}:00`;
    confirmAction(
      type === 'payment' ? "Confirm Payment" : "Confirm Missed",
      `Are you sure you want to record a ${formatCurrency(amount)} ${type === 'payment' ? 'payment' : 'missed contribution'} for ${selectedMember.name}?`,
      async () => {
        try {
          await axios.post(`${API_BASE}/api/savings/transactions`, {
            member_id: selectedMember.id,
            amount: parseFloat(amount),
            type,
            created_at: createdAtParam,
            notes: notes || undefined
          }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
          setConfirmation({ ...confirmation, isOpen: false });
          showSuccess(`${type === 'payment' ? 'Payment' : 'Missed contribution'} recorded successfully!`);
          fetchAllData(); // refresh in background

          if (shouldExit) {
            setShowPaymentModal(false);
            setShowMissedModal(false);
          } else {
            setPaymentForm(prev => ({
              ...prev,
              amount: 300,
              notes: '',
              date: getTodayDateString(),
              time: getNowTimeString()
            }));
          }
        } catch (err) {
          showToast("Error recording transaction");
        }
      }
    );
  };

  const handleMarkMissed = async (memberId, amount) => {
    confirmAction("Confirm Missed", `Are you sure you want to mark a ${formatCurrency(amount)} missed contribution?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/transactions`, { member_id: memberId, amount, type: 'missed' }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess("Missed contribution recorded.");
        fetchAllData(); // refresh in background
      } catch (err) { showToast("Error marking missed"); }
    });
  };

  const handleAddMember = async (name) => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin (ermiasgesgis@gmail.com) can add members");
      return;
    }
    if (!name) return;
    confirmAction("Add Member", `Do you want to add "${name}" to the group?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/members`, { name }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess(`${name} is added successfully to the system`);
      } catch (e) { showToast("Error adding member: " + (e.response?.data?.error || e.message)); }
    });
  };

  const handleDeleteMember = async (memberId, memberName) => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin (ermiasgesgis@gmail.com) can remove members");
      return;
    }
    confirmAction(
      "Permanently Remove Member",
      `Are you sure you want to PERMANENTLY remove ${memberName}?\n\nThis user/admin will be completely purged from the system, database, and bot access, and will no longer be visible anywhere.`,
      async () => {
        try {
          await axios.delete(`${API_BASE}/api/savings/members/${memberId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          // Optimistically update state immediately
          setMembers(prev => prev.filter(m => m.id !== memberId));
          setSystemUsers(prev => prev.filter(u => u.id !== memberId && u.name !== memberName && u.nickname !== memberName));
          const cached = getCachedSavings();
          if (cached) {
            cached.members = (cached.members || []).filter(m => m.id !== memberId);
            cached.systemUsers = (cached.systemUsers || []).filter(u => u.id !== memberId && u.name !== memberName && u.nickname !== memberName);
            localStorage.setItem('cached_savings_data', JSON.stringify(cached));
          }
          await fetchAllData();
          setConfirmation({ ...confirmation, isOpen: false });
          showSuccess(`${memberName} was permanently purged from the system.`);
        } catch (err) {
          showToast(err.response?.data?.error || "Error deleting member");
        }
      }
    );
  };

  const [selectedWeekIds, setSelectedWeekIds] = useState([]);

  const handleAddWeek = async (amount) => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin (ermiasgesgis@gmail.com) can change weekly contribution amount");
      return;
    }
    confirmAction("New Week", `Are you sure you want to set the weekly contribution to ${formatCurrency(amount)}?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/config`, { amount }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess(`Weekly amount updated to ${formatCurrency(amount)}`);
      } catch (e) { showToast("Error updating configuration: " + (e.response?.data?.error || e.message)); }
    });
  };

  const handleDeleteWeekConfig = (id, weekNum, amount) => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin (ermiasgesgis@gmail.com) can delete week configurations");
      return;
    }
    const latestConfigId = configHistory[0]?.id;
    if (String(id) === String(latestConfigId)) {
      showToast("The current active week configuration cannot be deleted as the system requires at least 1 active weekly setting.");
      return;
    }
    confirmAction(
      "Confirm Week Deletion",
      `Are you sure you want to delete Week ${weekNum} (${formatCurrency(amount)}) configuration?`,
      async () => {
        try {
          await axios.delete(`${API_BASE}/api/savings/config/${id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          setSelectedWeekIds(prev => prev.filter(wId => wId !== id));
          await fetchAllData();
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          showSuccess(`Week ${weekNum} configuration deleted successfully!`);
        } catch (e) {
          showToast("Error deleting week configuration: " + (e.response?.data?.error || e.message));
        }
      }
    );
  };

  const handleDeleteSelectedWeeks = () => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin (ermiasgesgis@gmail.com) can delete week configurations");
      return;
    }
    const latestConfigId = configHistory[0]?.id;
    const idsToDelete = selectedWeekIds.filter(wId => String(wId) !== String(latestConfigId));
    if (idsToDelete.length === 0) return;
    confirmAction(
      "Confirm Bulk Week Deletion",
      `Are you sure you want to delete the ${idsToDelete.length} selected week configuration(s)?`,
      async () => {
        try {
          await axios.post(`${API_BASE}/api/savings/config/bulk-delete`, { ids: idsToDelete }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          const count = idsToDelete.length;
          setSelectedWeekIds([]);
          await fetchAllData();
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          showSuccess(`${count} week configuration(s) deleted successfully!`);
        } catch (e) {
          showToast("Error deleting selected week configurations: " + (e.response?.data?.error || e.message));
        }
      }
    );
  };

  const handleClearAllWeeks = () => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin (ermiasgesgis@gmail.com) can delete week configurations");
      return;
    }
    if (configHistory.length <= 1) {
      showToast("No previous week configurations to clear (active week is protected).");
      return;
    }
    confirmAction(
      "Clear All Previous Week History?",
      "⚠️ Are you sure you want to PERMANENTLY delete all previous week configurations? (The current active week will be preserved).",
      async () => {
        try {
          await axios.post(`${API_BASE}/api/savings/config/bulk-delete`, { ids: 'all' }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          setSelectedWeekIds([]);
          await fetchAllData();
          setConfirmation(prev => ({ ...prev, isOpen: false }));
          showSuccess("All previous week configurations cleared successfully!");
        } catch (e) {
          showToast("Error clearing week history: " + (e.response?.data?.error || e.message));
        }
      }
    );
  };

  const handleSetClerk = async (clerkId) => {
    if (!isSuperAdmin) {
      showToast("Setting clerk is the role of the Super Admin (ermiasgesgis@gmail.com)");
      return;
    }
    try {
      await axios.post(`${API_BASE}/api/savings/clerk`, { clerk_id: clerkId }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      await fetchAllData();
      showSuccess("Clerk updated successfully");
    } catch (e) { showToast("Error setting clerk: " + (e.response?.data?.error || e.message)); }
  };

  const handleAddInvestment = async () => {
    if (!investmentForm.projectName || !investmentForm.allocatedAmount) return;
    confirmAction("New Investment", `Are you sure you want to record an expense of ${formatCurrency(investmentForm.allocatedAmount)} for ${investmentForm.projectName}?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/investments`, {
          project_name: investmentForm.projectName,
          allocated_amount: investmentForm.allocatedAmount,
          projected_profit: investmentForm.projectedProfit || 0,
          challenges: investmentForm.challenges || '',
          expected_days: investmentForm.expectedDays || null
        }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setInvestmentForm({ projectName: '', allocatedAmount: '', projectedProfit: '', challenges: '', expectedDays: '' });
        setShowInvestmentModal(false);
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess("New business started!");
      } catch (e) { showToast("Error adding investment: " + (e.response?.data?.error || e.message)); }
    });
  };

  const handleToggleInvestmentStatus = async (id, currentStatus) => {
    const inv = investments.find(i => i.id === id);
    if (!inv) return;
    setSelectedInvestment(inv);

    if (currentStatus === 'active') {
      setCompletionForm({
        finalProfit: (inv.allocated_amount + (inv.projected_profit || 0)).toString(),
        challenges: inv.challenges || ''
      });
      setShowInvestmentCompleteModal(true);
      return;
    }

    confirmAction(
      "Reactivate Investment",
      `Are you sure you want to mark this investment as active again?`,
      async () => {
        try {
          await axios.put(`${API_BASE}/api/savings/investments/${id}/status`, { status: 'active' }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
          await fetchAllData();
          setShowInvestmentDetailModal(false);
          setConfirmation({ ...confirmation, isOpen: false });
        } catch (e) { showToast("Error updating status: " + (e.response?.data?.error || e.message)); }
      }
    );
  };

  const handleCompleteInvestment = async () => {
    const totalReturned = parseFloat(completionForm.finalProfit);
    const expense = selectedInvestment.allocated_amount;
    const netProfit = totalReturned - expense;
    const newRemaining = remainingMoney + totalReturned;

    confirmAction(
      "Confirm Return & Completion",
      `Confirming return of ${formatCurrency(totalReturned)} (${formatCurrency(expense)} capital + ${formatCurrency(netProfit)} profit). Remaining Money will become ${formatCurrency(newRemaining)}.`,
      async () => {
        try {
          await axios.put(
            `${API_BASE}/api/savings/investments/${selectedInvestment.id}/status`,
            { status: 'completed', profit: netProfit, challenges: completionForm.challenges },
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
          );
          await fetchAllData();
          setShowInvestmentCompleteModal(false);
          setShowInvestmentDetailModal(false);
          setConfirmation({ ...confirmation, isOpen: false });
          showSuccess(`Business completed! ${formatCurrency(totalReturned)} returned to Remaining Money.`);
        } catch (e) { showToast("Error completing investment: " + (e.response?.data?.error || e.message)); }
      }
    );
  };


  const handleEditAdvanceBalance = (memberToEdit) => {
    if (!isSuperAdmin) {
      showToast("Only Super Admin can edit stored advance savings");
      return;
    }
    setVisualPrompt({
      isOpen: true,
      title: `✏️ Edit Stored Advance Savings (${memberToEdit.name})`,
      placeholder: `Auto calculated: ETB ${memberToEdit.autoAdvanceBalance}. Leave empty to reset to auto`,
      defaultValue: memberToEdit.isOverridden ? String(memberToEdit.advanceBalance) : '',
      onConfirm: async (inputVal) => {
        const payloadVal = (inputVal === null || inputVal.trim() === '') ? null : parseFloat(inputVal);
        setVisualPrompt(prev => ({ ...prev, isOpen: false }));

        const confirmMsg = payloadVal === null
          ? `Are you sure you want to RESET stored advance savings to automatic calculation for ${memberToEdit.name}?`
          : `Are you sure you want to UPDATE stored advance savings for ${memberToEdit.name} to ${formatCurrency(payloadVal)}?`;

        confirmAction(
          "Confirm Advance Savings Change",
          confirmMsg,
          async () => {
            try {
              await axios.put(`${API_BASE}/api/savings/members/${memberToEdit.id}/advance`, {
                custom_advance_balance: payloadVal
              }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

              setConfirmation(prev => ({ ...prev, isOpen: false }));
              const successText = payloadVal === null
                ? `Stored advance savings for ${memberToEdit.name} has been reset to automatic calculation!`
                : `Stored advance savings for ${memberToEdit.name} updated successfully to ${formatCurrency(payloadVal)}!`;
              showSuccess(successText);
              fetchAllData();
            } catch (e) {
              showToast("Error updating advance savings: " + (e.response?.data?.error || e.message));
            }
          }
        );
      }
    });
  };

  // 🟢 1. Total Saving: "How much have we contributed?"
  // Cumulative contributions made by all members since the group started.
  // Never decreases when money is invested, spent, or moved. It is the historical cumulative record.
  const totalSaving = members.reduce((sum, m) => sum + (Number(m.total_paid) || 0), 0);
  const totalMemberSavings = totalSaving;

  // 🔵 2. Money at Work: "How much of our money is currently being used?"
  // Money taken from available group funds and put into active investments/projects/activities.
  const moneyAtWork = investments
    .filter(i => i.status === 'active')
    .reduce((sum, i) => sum + (Number(i.allocated_amount) || 0), 0);
  const activeCapital = moneyAtWork;
  const totalActiveCapital = moneyAtWork;

  // Completed profits returned from finished businesses in the active cycle:
  const completedProfits = investments
    .filter(i => i.status === 'completed')
    .reduce((sum, i) => {
      const net = (i.profit !== undefined && i.profit !== null && Number(i.profit) !== 0)
        ? Number(i.profit)
        : (Number(i.projected_profit) || 0);
      return sum + net;
    }, 0);
  const totalProfitsEarned = completedProfits;

  // 🟡 3. Remaining Money: "How much can we use right now?"
  // Actual funds currently available to the group (physically in cash or sitting in bank account).
  // When an investment is launched, funds are taken from remaining money into money at work.
  // When an investment completes, capital returns and profits are added back into remaining money.
  const rawRemaining = (totalSaving + completedProfits) - moneyAtWork;
  const remainingMoney = Math.max(0, rawRemaining);
  const finalTotalAvailable = remainingMoney;
  const totalPool = totalSaving;

  // GENUINE LOGIC PROCESSING
  const weeklyRate = config.weekly_amount || 300;
  const processedMembers = members.map(m => {
    // Expected requirement for today's Saturday is at least 1 weeklyRate if payments or expected records exist
    const expectedBase = (m.total_expected > 0) ? m.total_expected : (m.total_paid > 0 ? weeklyRate : 0);
    const effectiveExpected = Math.max(expectedBase, m.total_expected || 0);

    const currentDebt = Math.max(0, (m.total_expected || 0) - (m.total_paid || 0));

    // Auto advance calculation
    const autoAdvanceBalance = Math.max(0, (m.total_paid || 0) - effectiveExpected);

    // Check if superadmin manual override exists
    const isOverridden = m.custom_advance_balance !== null && m.custom_advance_balance !== undefined && !isNaN(m.custom_advance_balance);
    const advanceBalance = isOverridden ? parseFloat(m.custom_advance_balance) : autoAdvanceBalance;
    const advanceWeeks = Math.floor(advanceBalance / weeklyRate);
    const genuineBalance = (m.total_paid || 0) - (m.total_expected > 0 ? m.total_expected : weeklyRate);

    return {
      ...m,
      genuineBalance,
      currentDebt,
      autoAdvanceBalance,
      advanceBalance,
      advanceWeeks,
      isOverridden,
      effectiveExpected,
      totalExpectedRequirement: m.total_expected
    };
  });

  const debtMembers = processedMembers.filter(m => m.currentDebt > 0);

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const firstName = (user?.nickname || user?.full_name || user?.email?.split('@')[0] || 'Friend').split(' ')[0];

  return (
    <div className="savings-outer-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#F9FAFB', borderRadius: '24px', minHeight: '80vh', color: '#111827', fontFamily: "'Inter', sans-serif", padding: '1.5rem' }}>
      <style>{`
        .mobile-dashboard-only { display: none; }
        .desktop-dashboard-only { display: flex; flex-direction: column; gap: 1.5rem; }
        .mobile-welcome-banner { display: none; }
        @media (max-width: 767px) {
          .mobile-dashboard-only { display: flex !important; flex-direction: column; gap: 0.75rem; }
          .desktop-dashboard-only { display: none !important; }
          .mobile-welcome-banner { display: flex !important; }
          .savings-outer-container {
            padding: 0 0 1.5rem 0 !important;
            background: transparent !important;
            gap: 0.65rem !important;
            border-radius: 0 !important;
          }
          .savings-nav {
            justify-content: space-between !important;
            gap: 0.15rem !important;
            padding: 0.35rem 0.35rem !important;
            margin: 0 !important;
            border-radius: 18px !important;
            background: white !important;
            border: 1px solid #E2E8F0 !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.04) !important;
            position: static !important;
          }
          .savings-nav-btn {
            flex: 1 !important;
            padding: 0.42rem 0.2rem !important;
            border-radius: 14px !important;
          }
          .savings-nav-btn.active {
            background: #0b7a36 !important;
            color: white !important;
          }
          .savings-nav-btn.active svg {
            color: white !important;
          }
          .savings-nav-btn.active span {
            color: white !important;
          }
          .savings-nav-indicator {
            display: none !important;
          }
        }
      `}</style>

      {/* Mobile Welcome Banner (320px-767px only, Dashboard view) */}
      {activeView === 'dashboard' && (
      <div className="mobile-welcome-banner" style={{
        background: 'linear-gradient(135deg, #065f2a 0%, #0b7a36 55%, #16a34a 100%)',
        borderRadius: '18px',
        padding: '0.85rem 1rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 6px 18px rgba(11, 122, 54, 0.22)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 2 }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.45rem',
            flexShrink: 0
          }}>
            👋
          </div>
          <div>
            <div style={{ fontSize: '1.02rem', fontWeight: 800, lineHeight: 1.2 }}>
              Welcome back, <span style={{ color: '#fde047' }}>{firstName}!</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.88)', marginTop: '0.15rem', fontWeight: 500 }}>
              Here's what's happening with your account
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', opacity: 0.28, zIndex: 1 }}>
          <Users size={42} color="#ffffff" />
        </div>
        <div style={{
          position: 'absolute',
          right: '-18px',
          bottom: '-18px',
          width: '120px',
          height: '50px',
          borderRadius: '50%',
          background: 'rgba(250, 204, 21, 0.25)',
          transform: 'rotate(-12deg)',
          pointerEvents: 'none'
        }} />
      </div>
      )}

      <nav className="savings-nav" style={{ position: 'sticky', top: 0, background: 'white', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0.6rem 0.5rem', border: '1px solid #E2E8F0', zIndex: 100, margin: '-1.5rem -1.5rem 1.5rem -1.5rem', borderRadius: '24px 24px 0 0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <NavItem id="dashboard" icon={Home} label="Dashboard" active={activeView === 'member-detail' ? 'dashboard' : activeView} onClick={setActiveView} />
        <NavItem id="investments" icon={Wrench} label="Working" active={activeView === 'member-detail' ? 'dashboard' : activeView} onClick={setActiveView} />
        <NavItem id="members" icon={Users} label="Members" active={activeView === 'member-detail' ? 'dashboard' : activeView} onClick={setActiveView} />
        <NavItem id="history" icon={Clock} label="History" active={activeView === 'member-detail' ? 'dashboard' : activeView} onClick={setActiveView} />
        {isMemberManager && <NavItem id="settings" icon={SettingsIcon} label="Settings" active={activeView === 'member-detail' ? 'dashboard' : activeView} onClick={setActiveView} />}
      </nav>
      <main style={{ flex: 1 }}>
        <AnimatePresence mode="wait">
          {activeView === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Mobile-Only Dashboard Layout (320px-767px) */}
              <div className="mobile-dashboard-only">
                {/* 3-Column Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.45rem' }}>
                  {/* 1. Total Saving */}
                  <div
                    onClick={() => setShowWealthModal(true)}
                    style={{
                      background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
                      border: '1px solid #bbf7d0',
                      borderRadius: '16px',
                      padding: '0.65rem 0.4rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
                    }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.35rem', boxShadow: '0 3px 8px rgba(22, 163, 74, 0.25)' }}>
                      <PiggyBank size={18} color="white" />
                    </div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                      Total Saving <Info size={10} color="#64748b" />
                    </div>
                    <div style={{ fontSize: 'clamp(0.76rem, 3.3vw, 0.95rem)', fontWeight: 900, color: '#0b7a36', margin: '0.25rem 0', lineHeight: 1.15, wordBreak: 'break-word' }}>
                      {formatCurrency(totalSaving)}
                    </div>
                    <div style={{ fontSize: '0.56rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', lineHeight: 1.2 }}>
                      <BarChart3 size={12} color="#16a34a" style={{ flexShrink: 0 }} />
                      <span>Cumulative member contributions</span>
                    </div>
                  </div>

                  {/* 2. Remaining Money */}
                  <div
                    onClick={() => setShowWealthModal(true)}
                    style={{
                      background: 'linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)',
                      border: '1px solid #fed7aa',
                      borderRadius: '16px',
                      padding: '0.65rem 0.4rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(234, 88, 12, 0.08)'
                    }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.35rem', boxShadow: '0 3px 8px rgba(234, 88, 12, 0.25)' }}>
                      <Wallet size={17} color="white" />
                    </div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b' }}>
                      Remaining Money
                    </div>
                    <div style={{ fontSize: 'clamp(0.76rem, 3.3vw, 0.95rem)', fontWeight: 900, color: '#d97706', margin: '0.25rem 0', lineHeight: 1.15, wordBreak: 'break-word' }}>
                      {formatCurrency(remainingMoney)}
                    </div>
                    <div style={{ fontSize: '0.56rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', lineHeight: 1.2 }}>
                      <BarChart3 size={12} color="#ea580c" style={{ flexShrink: 0 }} />
                      <span>Available in cash or bank</span>
                    </div>
                  </div>

                  {/* 3. Money at Work */}
                  <div
                    onClick={() => setShowActiveInvestmentsModal(true)}
                    style={{
                      background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
                      border: '1px solid #bfdbfe',
                      borderRadius: '16px',
                      padding: '0.65rem 0.4rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
                    }}
                  >
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.35rem', boxShadow: '0 3px 8px rgba(37, 99, 235, 0.25)' }}>
                      <Briefcase size={17} color="white" />
                    </div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b' }}>
                      Money at Work
                    </div>
                    <div style={{ fontSize: 'clamp(0.76rem, 3.3vw, 0.95rem)', fontWeight: 900, color: '#1d4ed8', margin: '0.25rem 0', lineHeight: 1.15, wordBreak: 'break-word' }}>
                      {formatCurrency(moneyAtWork)}
                    </div>
                    <div style={{ fontSize: '0.56rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', lineHeight: 1.2 }}>
                      <Briefcase size={12} color="#1d4ed8" style={{ flexShrink: 0 }} />
                      <span>Active investments & projects</span>
                    </div>
                  </div>
                </div>

                {/* Action Row: Cycle Archives & Start From Scratch */}
                <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'super_admin' ? '1.15fr 1fr' : '1fr', gap: '0.5rem', alignItems: 'stretch' }}>
                  <button
                    type="button"
                    onClick={() => setShowCycleHistoryModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.45rem',
                      padding: '0.55rem 0.65rem',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Archive size={16} color="white" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Cycle Archives ({cycles.length})
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          View past cycles and reports
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  </button>

                  {user?.role === 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => setShowResetModal(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.55rem 0.7rem',
                        borderRadius: '16px',
                        border: '2px solid #bbf7d0',
                        background: 'linear-gradient(135deg, #16a34a 0%, #0b7a36 100%)',
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                      }}
                    >
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Play size={13} fill="white" color="white" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 800, lineHeight: 1.15 }}>Start From Scratch</div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.15 }}>Begin a new cycle</div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Member Balances Card */}
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                  <div style={{ background: '#0b7a36', padding: '0.55rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'white', fontWeight: 800, fontSize: '0.84rem' }}>
                      <Users size={16} color="#fde047" />
                      <span>Member Balances</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('members')}
                      style={{ background: 'none', border: 'none', color: '#fde047', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer', padding: 0 }}
                    >
                      View All →
                    </button>
                  </div>
                  <div style={{ padding: '0.6rem', display: 'flex', gap: '0.45rem', overflowX: 'auto' }}>
                    {processedMembers.map((m, i) => (
                      <div
                        key={m.id}
                        onClick={() => { setSelectedMember(m); setActiveView('member-detail'); }}
                        style={{
                          flex: '1 0 112px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          background: '#f8fafc',
                          border: '1px solid #f1f5f9',
                          borderRadius: '12px',
                          padding: '0.45rem 0.5rem',
                          cursor: 'pointer'
                        }}
                      >
                        <Avatar name={m.name} size="30px" fontSize="0.78rem" index={i} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                            <VerifiedBadge size={12} />
                          </div>
                          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Paid {formatCurrency(m.total_paid)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Members Behind Card */}
                <div
                  onClick={() => setShowDebtModal(true)}
                  style={{
                    background: debtMembers.length > 0 ? 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)' : 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
                    border: `1px solid ${debtMembers.length > 0 ? '#fecdd3' : '#fde68a'}`,
                    borderRadius: '16px',
                    padding: '0.7rem 0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.6rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: debtMembers.length > 0 ? '#fecdd3' : '#fef08a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <AlertTriangle size={18} color={debtMembers.length > 0 ? '#dc2626' : '#eab308'} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: debtMembers.length > 0 ? '#991b1b' : '#1e293b' }}>
                        Members Behind
                      </div>
                      <div style={{ fontSize: '0.66rem', color: debtMembers.length > 0 ? '#e11d48' : '#475569', fontWeight: 500 }}>
                        {debtMembers.length > 0
                          ? `${debtMembers.length} member${debtMembers.length > 1 ? 's' : ''} behind — click to view details.`
                          : 'All friends are up to date! Click to view details.'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: debtMembers.length > 0 ? '#ef4444' : 'linear-gradient(135deg, #facc15, #eab308)',
                      color: debtMembers.length > 0 ? 'white' : '#1e293b',
                      border: 'none',
                      borderRadius: '999px',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                    }}
                  >
                    View Details →
                  </button>
                </div>

                {/* Recent Activities Card */}
                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                  <div style={{ background: '#0b7a36', padding: '0.55rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'white', fontWeight: 800, fontSize: '0.84rem' }}>
                      <Clock size={16} color="#ffffff" />
                      <span>Recent Activities</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('history')}
                      style={{ background: 'none', border: 'none', color: '#fde047', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer', padding: 0 }}
                    >
                      View All →
                    </button>
                  </div>
                  <div style={{ padding: '0.25rem 0.75rem' }}>
                    {history.length === 0 ? (
                      <div style={{ padding: '1rem 0', textAlign: 'center', fontSize: '0.78rem', color: '#64748b' }}>
                        No recent activities yet.
                      </div>
                    ) : (
                      history.slice(0, 3).map((h, i) => {
                        const isPayment = h.type === 'payment';
                        const member = members.find(m => String(m.id) === String(h.member_id));
                        const memberName = h.member_name || (member ? member.name : null) || 'Member';
                        return (
                          <div
                            key={h.id}
                            onClick={() => setActiveView('history')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.6rem 0',
                              borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: isPayment ? '#16a34a' : '#ef4444',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                {isPayment ? <CheckCircle size={17} color="white" /> : <AlertCircle size={17} color="white" />}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                                  {isPayment ? 'Payment Received' : 'Missed Payment'}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                                  From {memberName} • {formatCurrency(h.amount)}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#64748b', fontSize: '0.68rem', fontWeight: 600, flexShrink: 0 }}>
                              <span>{formatRelativeTime(h.created_at)}</span>
                              <ChevronRight size={14} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Recent Payments Card (Continuation) */}
                {(() => {
                  const recentList = history.slice(0, 6);
                  const recentTotal = recentList
                    .filter(tx => tx.type === 'payment')
                    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

                  return (
                    <div style={{ background: 'white', borderRadius: '18px', border: '1px solid #e2e8f0', padding: '0.75rem', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0b7a36', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <HistoryIcon size={15} color="white" />
                          </div>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Recent Payments</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveView('history')}
                          style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}
                        >
                          Full history →
                        </button>
                      </div>

                      {/* Payment Rows */}
                      {recentList.length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                          No recent payments recorded yet.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {recentList.map((h) => {
                            const isPayment = h.type === 'payment';
                            const member = members.find(m => String(m.id) === String(h.member_id));
                            const memberName = h.member_name || (member ? member.name : null) || 'Member';
                            const txDate = new Date(h.created_at);
                            const validDate = !isNaN(txDate.getTime());
                            const monthStr = validDate ? txDate.toLocaleDateString('en-US', { month: 'short' }) : '';
                            const dayStr = validDate ? txDate.getDate() : '';
                            const yearStr = validDate ? txDate.getFullYear() : '';
                            const timeLabel = validDate
                              ? txDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                              : '';

                            return (
                              <div
                                key={h.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.55rem',
                                  padding: '0.55rem',
                                  borderRadius: '14px',
                                  border: '1px solid #f1f5f9',
                                  background: '#ffffff',
                                  boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
                                }}
                              >
                                {/* Left Date Badge */}
                                <div style={{
                                  minWidth: '48px',
                                  padding: '0.35rem 0.25rem',
                                  borderRadius: '12px',
                                  background: isPayment ? '#dcfce7' : '#fee2e2',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  textAlign: 'center',
                                  flexShrink: 0
                                }}>
                                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: isPayment ? '#15803d' : '#b91c1c', lineHeight: 1.1 }}>{monthStr}</span>
                                  <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{dayStr}</span>
                                  <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#475569', lineHeight: 1.1 }}>{yearStr}</span>
                                </div>

                                {/* Middle Details */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                    {isPayment ? 'Cash In (Saving Paid)' : 'Cash Out (Saving Unpaid)'}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: '#475569', marginTop: '0.15rem' }}>
                                    <User size={11} color="#1e3a8a" style={{ flexShrink: 0 }} />
                                    <span style={{ color: '#64748b' }}>{isPayment ? 'payer' : 'member'}</span>
                                    <span style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{memberName}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.66rem', color: '#475569', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                                    <Calendar size={11} color="#64748b" style={{ flexShrink: 0 }} />
                                    {h.notes && (
                                      <span style={{ color: '#475569', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {h.notes.replace(/🗓️\s*/g, '')}
                                      </span>
                                    )}
                                    <span style={{ fontWeight: 800, color: isPayment ? '#0b7a36' : '#dc2626' }}>
                                      Net: {formatCurrency(h.amount)}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.62rem', color: '#64748b', marginTop: '0.15rem' }}>
                                    <Clock size={10} color="#64748b" style={{ flexShrink: 0 }} />
                                    <span>{timeLabel}</span>
                                  </div>
                                </div>

                                {/* Right Action Buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                  <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: isPayment ? '#dcfce7' : '#fee2e2',
                                    color: isPayment ? '#16a34a' : '#dc2626',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    {isPayment ? <ArrowUp size={15} /> : <AlertCircle size={15} />}
                                  </div>
                                  {isPaymentManager && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteModalState({ isOpen: true, step: 1, transaction: h });
                                      }}
                                      title="Delete transaction"
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        border: 'none',
                                        background: '#fee2e2',
                                        color: '#ef4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Total Recent Payments Summary Strip */}
                      <div style={{
                        background: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
                        border: '1px solid #bbf7d0',
                        borderRadius: '14px',
                        padding: '0.65rem 0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: '#0b7a36',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Wallet size={19} color="white" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155' }}>Total Recent Payments</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0b7a36', lineHeight: 1.15 }}>
                              {formatCurrency(recentTotal)}
                            </div>
                          </div>
                        </div>
                        <BarChart3 size={28} color="#16a34a" style={{ opacity: 0.75, flexShrink: 0 }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Your Financial Journey Card */}
                <div style={{
                  background: 'linear-gradient(135deg, #fef9c3 0%, #fef3c7 100%)',
                  border: '1px solid #fde68a',
                  borderRadius: '16px',
                  padding: '0.7rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: '#fef08a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Coins size={18} color="#ca8a04" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>Your Financial Journey</div>
                      <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 500 }}>
                        Keep contributing and achieve more together!
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWealthModal(true)}
                    style={{
                      background: '#0b7a36',
                      color: 'white',
                      border: 'none',
                      borderRadius: '999px',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(11, 122, 54, 0.2)'
                    }}
                  >
                    View Details →
                  </button>
                </div>

                {/* Subtle Green Wave Footer Accent */}
                <div style={{ height: '24px', width: '100%', overflow: 'hidden', borderRadius: '12px', marginTop: '-0.2rem', pointerEvents: 'none' }}>
                  <svg viewBox="0 0 400 32" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <path d="M0,18 C80,2 160,30 240,14 C310,0 360,22 400,10 L400,32 L0,32 Z" fill="rgba(22, 163, 74, 0.16)" />
                    <path d="M0,24 C100,8 200,32 300,18 C350,12 380,22 400,16 L400,32 L0,32 Z" fill="rgba(11, 122, 54, 0.25)" />
                  </svg>
                </div>
              </div>

              {/* Tablet & Desktop Dashboard Layout (768px+ UNCHANGED) */}
              <div className="desktop-dashboard-only">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <header>
                    <h1 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'inherit', margin: '0 0 0.25rem' }}>Dashboard</h1>
                    <p style={{ color: '#6B7280', margin: 0 }}>{members.length} members • {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  </header>

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowCycleHistoryModal(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.6rem 1.1rem',
                        borderRadius: '14px',
                        border: '1.5px solid #CBD5E1',
                        background: 'white',
                        color: '#334155',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                      }}
                    >
                      📜 Cycle Archives ({cycles.length})
                    </button>

                    {user?.role === 'super_admin' && (
                      <button
                        onClick={() => setShowResetModal(true)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.6rem 1.1rem',
                          borderRadius: '14px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #EF4444, #B91C1C)',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                        }}
                      >
                        🔄 Start From Scratch
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                  <StatCard
                    label="REMAINING MONEY"
                    value={formatCurrency(remainingMoney)}
                    color="#D97706"
                    badge="🟡 Cash & Bank"
                    bgGradient="linear-gradient(180deg, #FFFFFF 0%, #FFFDF5 100%)"
                    borderColor="#FDE68A"
                    subValue="Available in cash or bank"
                    onClick={() => setShowWealthModal(true)}
                  />
                  <StatCard
                    label="MONEY AT WORK"
                    value={formatCurrency(moneyAtWork)}
                    color="#2563EB"
                    badge="🔵 Working Capital"
                    bgGradient="linear-gradient(180deg, #FFFFFF 0%, #F8FAFF 100%)"
                    borderColor="#BFDBFE"
                    subValue="Active investments & projects"
                    onClick={() => setShowActiveInvestmentsModal(true)}
                  />
                  <StatCard
                    label="TOTAL SAVING"
                    value={formatCurrency(totalSaving)}
                    color="#16A34A"
                    badge="🟢 Cumulative"
                    bgGradient="linear-gradient(180deg, #FFFFFF 0%, #F5FDF7 100%)"
                    borderColor="#BBF7D0"
                    subValue="Cumulative member contributions"
                    onClick={() => setShowWealthModal(true)}
                  />
                </div>
                <div onClick={() => setShowDebtModal(true)} style={{ background: debtMembers.length > 0 ? '#FFF1F2' : '#F0FDF4', border: `1px solid ${debtMembers.length > 0 ? '#FECDD3' : '#BBF7D0'}`, borderRadius: '16px', padding: '1.25rem 1.5rem', display: 'flex', gap: '1rem', cursor: 'pointer' }}>
                  <AlertCircle color={debtMembers.length > 0 ? "#DC2626" : "#16A34A"} size={24} />
                  <div>
                    <div style={{ color: debtMembers.length > 0 ? '#991B1B' : '#166534', fontWeight: 700 }}>Members Behind</div>
                    <div style={{ color: debtMembers.length > 0 ? '#E11D48' : '#16A34A', fontSize: '0.9rem' }}>
                      {debtMembers.length > 0 ? "Click to see details →" : "All friends are up to date! Click to view"}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1.5rem' }}>
                  <Section title="Member Balances" onAction={() => setActiveView('members')} actionLabel="View all →">
                    {processedMembers.map((m, i) => <MemberListItem key={m.id} member={m} index={i} onClick={() => { setSelectedMember(m); setActiveView('member-detail'); }} formatCurrency={formatCurrency} />)}
                  </Section>
                  <Section title="Recent Payments" onAction={() => setActiveView('history')} actionLabel="Full history →">
                    {history.slice(0, 6).map((h, i) => (
                      <TransactionItem
                        key={h.id}
                        transaction={h}
                        showBorder={i !== 0}
                        formatCurrency={formatCurrency}
                        systemUsers={systemUsers}
                        members={members}
                        canDelete={isPaymentManager}
                        onDelete={(tx) => setDeleteModalState({ isOpen: true, step: 1, transaction: tx })}
                      />
                    ))}
                  </Section>
                </div>
              </div>
            </motion.div>
          )}

          {activeView === 'members' && (
            <motion.div key="members" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Mobile-Only Members Layout (320px-767px) */}
              <div className="mobile-dashboard-only">
                {/* Green Members Banner */}
                <div style={{
                  background: 'linear-gradient(135deg, #065f2a 0%, #0b7a36 55%, #16a34a 100%)',
                  borderRadius: '18px',
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  color: 'white',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 6px 18px rgba(11, 122, 54, 0.22)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 2 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '14px',
                      background: 'rgba(255, 255, 255, 0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Users size={26} color="#a3e635" />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.18rem', fontWeight: 900, lineHeight: 1.15 }}>Members</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.9)', marginTop: '0.2rem', lineHeight: 1.3 }}>
                        Manage your group members and their contributions.
                      </div>
                    </div>
                  </div>
                  <div style={{ opacity: 0.22, flexShrink: 0, zIndex: 1 }}>
                    <Users size={42} color="white" />
                  </div>
                </div>

                {/* Search & Filter Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '999px',
                    padding: '0.45rem 0.8rem',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
                  }}>
                    <Search size={16} color="#64748b" style={{ flexShrink: 0 }} />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members by name..."
                      style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        width: '100%',
                        fontSize: '0.78rem',
                        color: '#0f172a'
                      }}
                    />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setShowMemberFilterMenu(prev => !prev)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: memberFilter === 'all' ? '#dcfce7' : '#0b7a36',
                        color: memberFilter === 'all' ? '#065f2a' : 'white',
                        border: '1px solid #bbf7d0',
                        borderRadius: '14px',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Filter size={14} />
                      <span>{memberFilter === 'all' ? 'Filter' : memberFilter === 'on_track' ? 'Up to date' : memberFilter === 'debt' ? 'In Debt' : 'Prepaid'}</span>
                      <ChevronDown size={14} />
                    </button>
                    {showMemberFilterMenu && (
                      <div style={{
                        position: 'absolute',
                        top: '110%',
                        right: 0,
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                        padding: '0.35rem',
                        zIndex: 50,
                        minWidth: '130px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem'
                      }}>
                        {[
                          { id: 'all', label: 'All Members' },
                          { id: 'on_track', label: 'Up to date' },
                          { id: 'debt', label: 'In Debt' },
                          { id: 'prepaid', label: 'Prepaid' }
                        ].map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setMemberFilter(opt.id);
                              setShowMemberFilterMenu(false);
                            }}
                            style={{
                              textAlign: 'left',
                              padding: '0.45rem 0.65rem',
                              borderRadius: '10px',
                              border: 'none',
                              background: memberFilter === opt.id ? '#dcfce7' : 'transparent',
                              color: memberFilter === opt.id ? '#065f2a' : '#334155',
                              fontWeight: memberFilter === opt.id ? 700 : 500,
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Member List Cards */}
                {(() => {
                  const filteredMembers = processedMembers.filter(m => {
                    const matchesSearch = !memberSearch.trim() || (m.name || '').toLowerCase().includes(memberSearch.trim().toLowerCase());
                    if (!matchesSearch) return false;
                    if (memberFilter === 'debt') return (m.currentDebt || 0) > 0;
                    if (memberFilter === 'prepaid') return (m.advanceBalance || 0) > 0;
                    if (memberFilter === 'on_track') return (m.currentDebt || 0) === 0;
                    return true;
                  });

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                      {filteredMembers.length === 0 ? (
                        <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', fontSize: '0.82rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
                          No members match your search or filter.
                        </div>
                      ) : (
                        filteredMembers.map((m, i) => {
                          const isDebt = (m.currentDebt || 0) > 0;
                          const pct = totalSaving > 0 ? Math.round(((Number(m.total_paid) || 0) / totalSaving) * 100) : 0;
                          const joinedLabel = m.created_at
                            ? new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Active';

                          return (
                            <div
                              key={m.id}
                              onClick={() => { setSelectedMember(m); setActiveView('member-detail'); }}
                              style={{
                                background: 'white',
                                borderRadius: '18px',
                                border: '1px solid #e2e8f0',
                                padding: '0.7rem 0.6rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.45rem',
                                cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                              }}
                            >
                              {/* Left: Avatar + Name + Joined + Active Pill */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flex: '1.35 1 0' }}>
                                <Avatar name={m.name} size="40px" fontSize="0.95rem" index={i} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                                    <VerifiedBadge size={14} />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6rem', color: '#64748b', marginTop: '0.1rem' }}>
                                    <Calendar size={10} color="#64748b" style={{ flexShrink: 0 }} />
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Joined: {joinedLabel}</span>
                                  </div>
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    marginTop: '0.22rem',
                                    background: '#dbeafe',
                                    color: '#1d4ed8',
                                    borderRadius: '999px',
                                    padding: '0.12rem 0.45rem',
                                    fontSize: '0.6rem',
                                    fontWeight: 700
                                  }}>
                                    <Users size={10} />
                                    <span>{m.status === 'inactive' ? 'Inactive' : 'Active'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Middle: Total Paid */}
                              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                                <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 600 }}>Total Paid</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#15803d', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                                  {formatCurrency(m.total_paid)}
                                </div>
                                <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: '0.1rem' }}>
                                  ({pct}% of total)
                                </div>
                              </div>

                              {/* Right: Current Balance + Status Pill */}
                              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                                <div style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 600 }}>Current Balance</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 900, color: isDebt ? '#dc2626' : '#15803d', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                                  {isDebt ? formatCurrency(m.currentDebt) : formatCurrency(0)}
                                </div>
                                <div style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                  marginTop: '0.2rem',
                                  background: isDebt ? '#fee2e2' : '#dcfce7',
                                  color: isDebt ? '#dc2626' : '#15803d',
                                  borderRadius: '999px',
                                  padding: '0.12rem 0.45rem',
                                  fontSize: '0.58rem',
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {isDebt ? <AlertCircle size={10} /> : <CheckCircle size={10} />}
                                  <span>{isDebt ? 'In Debt' : 'Up to date'}</span>
                                </div>
                              </div>

                              {/* Far Right Chevron */}
                              <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#475569',
                                flexShrink: 0
                              }}>
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })()}

                {/* Total Members Summary Banner */}
                <div style={{
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                  border: '1px solid #bbf7d0',
                  borderRadius: '16px',
                  padding: '0.65rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <Users size={26} color="#16a34a" />
                    <div style={{ width: '1px', height: '28px', background: '#bbf7d0' }} />
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>Total Members</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#065f2a', lineHeight: 1.05 }}>{members.length}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMemberSearch(''); setMemberFilter('all'); setShowMemberFilterMenu(false); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: 'white',
                      border: '1px solid #86efac',
                      color: '#065f2a',
                      borderRadius: '999px',
                      padding: '0.45rem 0.8rem',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                    }}
                  >
                    <Eye size={14} /> View All Members →
                  </button>
                </div>

                {/* Floating + Add Button & Subtle Green Wave */}
                <div style={{ position: 'relative', minHeight: '42px', marginTop: '0.15rem' }}>
                  {(isPaymentManager || isMemberManager) && (
                    <button
                      type="button"
                      onClick={() => handleOpenCashEntry('Cash In')}
                      title="Record Payment / Cash Entry"
                      style={{
                        position: 'absolute',
                        right: '0.25rem',
                        bottom: '0.35rem',
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: '#0b7a36',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 6px 16px rgba(11, 122, 54, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 5
                      }}
                    >
                      <Plus size={24} />
                    </button>
                  )}
                  <div style={{ height: '30px', width: '100%', overflow: 'hidden', borderRadius: '12px', marginTop: '0.75rem', pointerEvents: 'none' }}>
                    <svg viewBox="0 0 400 32" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                      <path d="M0,18 C80,2 160,30 240,14 C310,0 360,22 400,10 L400,32 L0,32 Z" fill="rgba(22, 163, 74, 0.16)" />
                      <path d="M0,24 C100,8 200,32 300,18 C350,12 380,22 400,16 L400,32 L0,32 Z" fill="rgba(11, 122, 54, 0.25)" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Tablet & Desktop Members Layout (768px+ UNCHANGED) */}
              <div className="desktop-dashboard-only">
                <h1 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'inherit' }}>Members</h1>
                {processedMembers.map(m => <MemberCard key={m.id} member={m} onClick={() => { setSelectedMember(m); setActiveView('member-detail'); }} formatCurrency={formatCurrency} />)}
                {(isPaymentManager || isMemberManager) && <FloatingAddButton onClick={() => handleOpenCashEntry('Cash In')} />}
              </div>
            </motion.div>
          )}

          {activeView === 'member-detail' && selectedMember && (() => {
            const m = processedMembers.find(pm => String(pm.id) === String(selectedMember.id)) || selectedMember;
            const isOnTrack = (m.currentDebt || 0) === 0;
            const memberHistory = history.filter(h => String(h.member_id) === String(m.id));
            const isAuthorizedAdmin = ['admin', 'super_admin'].includes(user?.role);

            return (
              <motion.div key="detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Mobile-Only Member Contribution Details Layout (320px-767px) */}
                <div className="mobile-dashboard-only" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Member Profile Header Card */}
                  <div style={{
                    background: 'linear-gradient(135deg, #e0f2fe 0%, #ecfdf5 100%)',
                    borderRadius: '20px',
                    padding: '1rem',
                    border: '1px solid rgba(226, 232, 240, 0.85)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)'
                  }}>
                    <button
                      type="button"
                      onClick={() => setActiveView('members')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.4rem 0.85rem',
                        borderRadius: '999px',
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        fontWeight: 700,
                        fontSize: '0.76rem',
                        color: '#1e293b',
                        cursor: 'pointer',
                        marginBottom: '0.85rem'
                      }}
                    >
                      ← Back to members
                    </button>

                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                      <div style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: '#2563eb',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1.45rem',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.28)',
                        flexShrink: 0
                      }}>
                        {m.name?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#064e3b', lineHeight: 1.2 }}>
                            {m.name}
                          </h2>
                          <VerifiedBadge size={16} />
                        </div>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          background: isOnTrack ? '#fef9c3' : '#fee2e2',
                          color: isOnTrack ? '#854d0e' : '#b91c1c',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          marginTop: '0.28rem'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnTrack ? '#ca8a04' : '#dc2626' }} />
                          {isOnTrack ? 'On track' : 'In debt'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#64748b', fontSize: '0.72rem', fontWeight: 500, marginTop: '0.28rem' }}>
                          <Calendar size={12} color="#94a3b8" style={{ flexShrink: 0 }} />
                          <span>Joined Since {new Date(m.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Responsive Financial Summary Cards (No Awkward ETB Wrapping) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                    <div style={{
                      background: 'white',
                      borderRadius: '16px',
                      padding: '0.85rem',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                        <Wallet size={16} color="#16a34a" />
                      </div>
                      <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.03em' }}>TOTAL PAID</div>
                      <div style={{ fontSize: 'clamp(0.95rem, 4.2vw, 1.15rem)', fontWeight: 900, color: '#16a34a', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                        {formatCurrency(m.total_paid)}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '0.15rem' }}>Personal Contribution</div>
                    </div>

                    <div style={{
                      background: 'white',
                      borderRadius: '16px',
                      padding: '0.85rem',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
                        <BarChart3 size={16} color="#2563eb" />
                      </div>
                      <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.03em' }}>TOTAL EXPECTED</div>
                      <div style={{ fontSize: 'clamp(0.95rem, 4.2vw, 1.15rem)', fontWeight: 900, color: isOnTrack ? '#2563eb' : '#dc2626', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                        {isOnTrack ? 'Fully Paid' : formatCurrency(m.currentDebt)}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '0.15rem' }}>
                        {isOnTrack ? 'Up to date ✓' : `Debt (ETB ${weeklyRate}/wk)`}
                      </div>
                    </div>

                    <div
                      onClick={isSuperAdmin ? () => handleEditAdvanceBalance(m) : undefined}
                      style={{
                        gridColumn: '1 / -1',
                        background: 'white',
                        borderRadius: '16px',
                        padding: '0.85rem 0.95rem',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        cursor: isSuperAdmin ? 'pointer' : 'default'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Coins size={17} color="#7c3aed" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.03em' }}>
                            {m.isOverridden || isSuperAdmin ? 'STORED ADVANCE SAVINGS ✏️' : 'STORED ADVANCE SAVINGS'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.1rem' }}>
                            {(m.advanceBalance || 0) > 0
                              ? `Covers ${m.advanceWeeks || Math.floor((m.advanceBalance || 0) / weeklyRate)} next Sat(s)${isSuperAdmin ? ' (Tap to edit)' : ''}`
                              : (isSuperAdmin ? '0 advance Saturdays (Tap to edit)' : '0 advance Saturdays')}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#2563eb', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {formatCurrency(m.advanceBalance || 0)}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons: Add payment & Mark missed */}
                  {isPaymentManager && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenCashEntry('Cash In', m.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 0.85rem',
                          background: '#ecfdf5',
                          border: '1px solid #bbf7d0',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>+</div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#065f46', lineHeight: 1.15 }}>Add payment</div>
                            <div style={{ fontSize: '0.66rem', color: '#059669', fontWeight: 600 }}>(Cash In)</div>
                          </div>
                        </div>
                        <ChevronRight size={16} color="#059669" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenCashEntry('Cash Out', m.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 0.85rem',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>−</div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#991b1b', lineHeight: 1.15 }}>Mark missed</div>
                            <div style={{ fontSize: '0.66rem', color: '#dc2626', fontWeight: 600 }}>(Cash Out)</div>
                          </div>
                        </div>
                        <ChevronRight size={16} color="#dc2626" />
                      </button>
                    </div>
                  )}

                  {/* Mobile Contribution History */}
                  <div style={{ background: 'white', padding: '0.9rem', borderRadius: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={16} color="#1e293b" />
                        <h3 style={{ margin: 0, fontSize: '0.78rem', color: '#1e293b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          CONTRIBUTION HISTORY
                        </h3>
                      </div>
                      {memberHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setActiveView('history')}
                          style={{ background: 'none', border: 'none', color: '#16a34a', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.15rem' }}
                        >
                          View All <ChevronRight size={14} />
                        </button>
                      )}
                    </div>

                    {memberHistory.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1.75rem 0.75rem' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                          <FileText size={24} />
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                          No contribution records yet
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', maxWidth: '250px', margin: '0 auto', lineHeight: 1.45 }}>
                          Your payment and history will appear here once available.
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {memberHistory.map((h) => {
                          const isPayment = h.type === 'payment';
                          const payerName = h.member_name || m.name || 'Member';
                          const dateObj = h.created_at ? new Date(h.created_at) : null;
                          const dateTimeStr = dateObj
                            ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
                              ', ' +
                              dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                            : '';
                          const parsedNotes = parseTransactionNotes(h.notes);
                          const hasDetails = Boolean(parsedNotes && (parsedNotes.dateRange || parsedNotes.noteText));
                          const detailKey = `member-${h.id}`;
                          const isExpanded = Boolean(expandedTxIds[detailKey]);

                          return (
                            <div
                              key={h.id}
                              style={{
                                background: '#ffffff',
                                borderRadius: '14px',
                                border: '1px solid #e2e8f0',
                                padding: '0.7rem',
                                display: 'flex',
                                flexDirection: 'column'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                {/* Left Arrow */}
                                <div style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '50%',
                                  background: isPayment ? '#dcfce7' : '#fee2e2',
                                  color: isPayment ? '#16a34a' : '#dc2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {isPayment ? <ArrowUp size={17} /> : <AlertCircle size={17} />}
                                </div>

                                {/* Middle Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                    {isPayment ? 'Cash In (Saving Paid)' : 'Cash Out (Saving Unpaid)'}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: '#475569', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    <span>{isPayment ? 'payer:' : 'member:'}</span>
                                    <strong style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{payerName}</strong>
                                    <VerifiedBadge size={12} />
                                  </div>
                                  <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '0.15rem' }}>
                                    {dateTimeStr}
                                    {h.signed_by ? ` • signed by ${h.signed_by}` : ''}
                                  </div>
                                </div>

                                {/* Right Amount, Type/Details & Delete */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 900, color: isPayment ? '#0b7a36' : '#dc2626', whiteSpace: 'nowrap' }}>
                                      {isPayment ? '+' : '-'}{formatCurrency(h.amount)}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', marginTop: '0.22rem' }}>
                                      {isAuthorizedAdmin && hasDetails ? (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedTxIds(prev => ({ ...prev, [detailKey]: !prev[detailKey] }))}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.2rem',
                                            background: '#dcfce7',
                                            color: '#15803d',
                                            border: '1px solid #bbf7d0',
                                            borderRadius: '999px',
                                            padding: '0.16rem 0.5rem',
                                            fontSize: '0.63rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap'
                                          }}
                                        >
                                          <span>Payment Details</span>
                                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                        </button>
                                      ) : (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.18rem',
                                          background: isPayment ? '#dcfce7' : '#fee2e2',
                                          color: isPayment ? '#15803d' : '#dc2626',
                                          borderRadius: '999px',
                                          padding: '0.12rem 0.45rem',
                                          fontSize: '0.6rem',
                                          fontWeight: 700
                                        }}>
                                          {isPayment ? 'Cash In' : 'Cash Out'}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {isPaymentManager && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteModalState({ isOpen: true, step: 1, transaction: h });
                                      }}
                                      title="Delete transaction"
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        border: 'none',
                                        background: '#fee2e2',
                                        color: '#ef4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        flexShrink: 0
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Admin-Only Expandable Payment Details (Notes & Consecutive Saturdays) */}
                              {isAuthorizedAdmin && hasDetails && isExpanded && (
                                <div style={{
                                  marginTop: '0.6rem',
                                  background: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '12px',
                                  padding: '0.6rem 0.7rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.5rem'
                                }}>
                                  {parsedNotes.dateRange && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', minWidth: 0 }}>
                                        <Calendar size={14} color="#15803d" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <div style={{ minWidth: 0 }}>
                                          <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>
                                            Consecutive Saturdays
                                          </div>
                                          <div style={{ fontSize: '0.69rem', color: '#475569', marginTop: '0.1rem' }}>
                                            {parsedNotes.dateRange}
                                          </div>
                                          {parsedNotes.datesList && (
                                            <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: '0.2rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                                              {parsedNotes.datesList}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {parsedNotes.weeks && (
                                        <span style={{
                                          background: '#dcfce7',
                                          border: '1px solid #86efac',
                                          color: '#15803d',
                                          borderRadius: '999px',
                                          padding: '0.15rem 0.5rem',
                                          fontSize: '0.64rem',
                                          fontWeight: 700,
                                          whiteSpace: 'nowrap',
                                          flexShrink: 0
                                        }}>
                                          {parsedNotes.weeks} {parsedNotes.weeks === 1 ? 'week' : 'weeks'}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {parsedNotes.dateRange && parsedNotes.noteText && (
                                    <div style={{ height: '1px', background: '#bbf7d0', width: '100%' }} />
                                  )}

                                  {parsedNotes.noteText && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                                      <FileText size={14} color="#15803d" style={{ flexShrink: 0, marginTop: '2px' }} />
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>Notes</div>
                                        <div style={{ fontSize: '0.69rem', color: '#334155', marginTop: '0.1rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                                          {parsedNotes.noteText}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tablet & Desktop Member Contribution Details Layout (768px+ UNCHANGED) */}
                <div className="desktop-dashboard-only" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Member Header Card with Soft Pastel Wave Gradient */}
                <div style={{
                  background: 'linear-gradient(135deg, #e0f2fe 0%, #ecfdf5 100%)',
                  borderRadius: '24px',
                  padding: '1.25rem 1.25rem',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1px solid rgba(226, 232, 240, 0.8)',
                  boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.04)'
                }}>
                  <button
                    onClick={() => setActiveView('members')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 1rem',
                      borderRadius: '50px',
                      background: 'white',
                      border: '1px solid #E2E8F0',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      color: '#1E293B',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      marginBottom: '1rem'
                    }}
                  >
                    ← Back to members
                  </button>

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    {/* Big circular blue avatar with initial */}
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: '#2563EB',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1.75rem',
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                      flexShrink: 0
                    }}>
                      {m.name?.[0]?.toUpperCase()}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#064E3B', lineHeight: 1.2, fontFamily: "'Outfit', 'Inter', sans-serif" }}>
                        {m.name}
                      </h2>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#FEF9C3', color: '#854D0E', padding: '0.15rem 0.65rem', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 700, width: 'fit-content' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#CA8A04' }} />
                        {isOnTrack ? 'On track' : 'In debt'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#64748B', fontSize: '0.78rem', fontWeight: 500, marginTop: '0.1rem' }}>
                        <Calendar size={13} color="#94A3B8" />
                        Joined Since {new Date(m.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3 StatCards with Soft Circular Icons matching screenshot */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem' }}>
                  <StatCard
                    label="TOTAL PAID"
                    value={formatCurrency(m.total_paid)}
                    color="#16A34A"
                    icon={Wallet}
                    iconBg="#DCFCE7"
                    subValue="Personal Contribution"
                  />
                  <StatCard
                    label="TOTAL EXPECTED"
                    value={isOnTrack ? "Fully Paid" : formatCurrency(m.currentDebt)}
                    color={isOnTrack ? "#2563EB" : "#DC2626"}
                    icon={BarChart3}
                    iconBg="#DBEAFE"
                    subValue={isOnTrack ? "Up to date ✓" : `Current Debt (ETB ${weeklyRate}/wk)`}
                  />
                  <StatCard
                    label={m.isOverridden ? "STORED ADVANCE SAVINGS ✏️" : (isSuperAdmin ? "STORED ADVANCE SAVINGS ✏️" : "STORED ADVANCE SAVINGS")}
                    value={formatCurrency(m.advanceBalance || 0)}
                    color="#2563EB"
                    icon={Coins}
                    iconBg="#F3E8FF"
                    subValue={
                      (m.advanceBalance || 0) > 0
                        ? `Covers ${m.advanceWeeks || Math.floor((m.advanceBalance || 0) / weeklyRate)} next Sat(s)${isSuperAdmin ? ' (Click to edit)' : ''}`
                        : (isSuperAdmin ? "0 advance Saturdays\n(Click to edit)" : "0 advance Saturdays")
                    }
                    onClick={isSuperAdmin ? () => handleEditAdvanceBalance(m) : undefined}
                  />
                </div>

                {/* Action Buttons: Add payment (Cash In) & Mark missed (Cash Out) matching screenshot */}
                {isPaymentManager && (
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    <div
                      onClick={() => handleOpenCashEntry('Cash In', m.id)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.85rem 1rem',
                        background: '#ECFDF5',
                        border: '1px solid #D1FAE5',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', fontWeight: 800, fontSize: '1.1rem' }}>+</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#065F46' }}>Add payment</div>
                          <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>(Cash In)</div>
                        </div>
                      </div>
                      <ChevronRight size={18} color="#059669" />
                    </div>

                    <div
                      onClick={() => handleOpenCashEntry('Cash Out', m.id)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.85rem 1rem',
                        background: '#FEF2F2',
                        border: '1px solid #FEE2E2',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(239, 68, 68, 0.05)',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', fontWeight: 800, fontSize: '1.1rem' }}>−</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#991B1B' }}>Mark missed</div>
                          <div style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600 }}>(Cash Out)</div>
                        </div>
                      </div>
                      <ChevronRight size={18} color="#DC2626" />
                    </div>
                  </div>
                )}

                {/* Contribution History Section matching screenshot */}
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={18} color="#1E293B" />
                      <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        CONTRIBUTION HISTORY
                      </h3>
                    </div>
                    {memberHistory.length > 0 && (
                      <button
                        onClick={() => setActiveView('history')}
                        style={{ background: 'none', border: 'none', color: '#16A34A', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        View All <ChevronRight size={14} />
                      </button>
                    )}
                  </div>

                  {memberHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                        <FileText size={28} />
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1E293B', marginBottom: '0.35rem' }}>
                        No contribution records yet
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', maxWidth: '280px', margin: '0 auto', lineHeight: 1.5 }}>
                        Your payment and history will appear here once available.
                      </div>
                    </div>
                  ) : (
                    <div>
                      {memberHistory.map((h, i) => (
                        <TransactionItem
                          key={h.id}
                          transaction={h}
                          full
                          showBorder={i !== 0}
                          formatCurrency={formatCurrency}
                          systemUsers={systemUsers}
                          members={members}
                          canDelete={isPaymentManager}
                          onDelete={(tx) => setDeleteModalState({ isOpen: true, step: 1, transaction: tx })}
                        />
                      ))}
                    </div>
                  )}
                </div>

                </div>

              </motion.div>
            );
          })()}

          {activeView === 'history' && (() => {
            const filtered = history.filter(h => {
              const date = new Date(h.created_at);
              if (typeFilter !== 'all' && h.type !== typeFilter) return false;
              if (dateFilter === 'week') return date >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              if (dateFilter === 'month') return date.getMonth() === new Date().getMonth();
              if (dateFilter === 'custom' && customRange.start && customRange.end) {
                const s = new Date(customRange.start); s.setHours(0, 0, 0, 0);
                const e = new Date(customRange.end); e.setHours(23, 59, 59, 999);
                return date >= s && date <= e;
              }
              return true;
            });

            const tPaid = filtered.reduce((s, h) => s + (h.type === 'payment' ? h.amount : 0), 0);
            const tMissed = filtered.reduce((s, h) => s + (h.type === 'missed' ? h.amount : 0), 0);

            const sortedHistory = [...filtered].sort((a, b) => {
              if (historySort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
              if (historySort === 'highest') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
              return new Date(b.created_at) - new Date(a.created_at);
            });

            return (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Mobile-Only History Layout (320px-767px) */}
                <div className="mobile-dashboard-only">
                  {/* Green History Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, #065f2a 0%, #0b7a36 55%, #16a34a 100%)',
                    borderRadius: '18px',
                    padding: '0.9rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    color: 'white',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 6px 18px rgba(11, 122, 54, 0.22)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 2 }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.14)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <HistoryIcon size={24} color="#fde047" />
                      </div>
                      <div>
                        <div style={{ fontSize: '1.18rem', fontWeight: 900, lineHeight: 1.15 }}>History</div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.9)', marginTop: '0.2rem', lineHeight: 1.3 }}>
                          View your past transactions and filter easily.
                        </div>
                      </div>
                    </div>
                    <div style={{ opacity: 0.24, flexShrink: 0, zIndex: 1 }}>
                      <Calendar size={38} color="white" />
                    </div>
                  </div>

                  {/* Quick Filter & Transaction Type Card */}
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                        <Filter size={14} color="#0f172a" />
                        <span>Quick Filter</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {[
                          { id: 'all', label: 'All time' },
                          { id: 'week', label: 'This week' },
                          { id: 'month', label: 'This month' },
                          { id: 'custom', label: 'Custom range' }
                        ].map(opt => {
                          const active = dateFilter === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setDateFilter(opt.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.38rem 0.65rem',
                                borderRadius: '999px',
                                border: active ? 'none' : '1px solid #e2e8f0',
                                background: active ? '#0b7a36' : '#f8fafc',
                                color: active ? 'white' : '#334155',
                                fontSize: '0.7rem',
                                fontWeight: active ? 700 : 600,
                                cursor: 'pointer'
                              }}
                            >
                              <Calendar size={12} />
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      {dateFilter === 'custom' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.7rem' }}>
                          <div>
                            <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Start date</label>
                            <input type="date" value={customRange.start} onChange={e => setCustomRange({ ...customRange, start: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>End date</label>
                            <input type="date" value={customRange.end} onChange={e => setCustomRange({ ...customRange, end: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
                        <LayoutGrid size={14} color="#0b7a36" />
                        <span>Transaction Type</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setTypeFilter('all')}
                          style={{
                            padding: '0.38rem 0.9rem',
                            borderRadius: '999px',
                            border: typeFilter === 'all' ? 'none' : '1px solid #e2e8f0',
                            background: typeFilter === 'all' ? '#0b7a36' : '#f8fafc',
                            color: typeFilter === 'all' ? 'white' : '#334155',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setTypeFilter('payment')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.8rem',
                            borderRadius: '999px',
                            border: typeFilter === 'payment' ? 'none' : '1px solid #e2e8f0',
                            background: typeFilter === 'payment' ? '#0b7a36' : '#f8fafc',
                            color: typeFilter === 'payment' ? 'white' : '#334155',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <Wallet size={12} />
                          <span>Payments</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTypeFilter('missed')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.38rem 0.8rem',
                            borderRadius: '999px',
                            border: typeFilter === 'missed' ? 'none' : '1px solid #e2e8f0',
                            background: typeFilter === 'missed' ? '#dc2626' : '#f8fafc',
                            color: typeFilter === 'missed' ? 'white' : '#334155',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <AlertCircle size={12} color={typeFilter === 'missed' ? 'white' : '#dc2626'} />
                          <span>Missed</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Transactions Header & Sort */}
                  <div style={{
                    background: 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)',
                    border: '1px solid #bbf7d0',
                    borderRadius: '14px',
                    padding: '0.55rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                      <RefreshCw size={15} color="#0b7a36" />
                      <span>Transactions ({sortedHistory.length})</span>
                    </div>
                    <select
                      value={historySort}
                      onChange={(e) => setHistorySort(e.target.value)}
                      style={{
                        background: 'white',
                        border: '1px solid #bbf7d0',
                        borderRadius: '999px',
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#065f2a',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="latest">Latest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="highest">Highest Amount</option>
                    </select>
                  </div>

                  {/* Transaction Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', position: 'relative' }}>
                    {sortedHistory.length === 0 ? (
                      <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', fontSize: '0.82rem', color: '#64748b', border: '1px solid #e2e8f0' }}>
                        No transactions match the selected filters.
                      </div>
                    ) : (
                      sortedHistory.map((h) => {
                        const isPayment = h.type === 'payment';
                        const member = members.find(m => String(m.id) === String(h.member_id));
                        const memberName = h.member_name || (member ? member.name : null) || 'Member';
                        const dateObj = h.created_at ? new Date(h.created_at) : null;
                        const dateStr = dateObj
                          ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '';
                        const timeStr = dateObj
                          ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          : '';
                        const parsedNotes = parseTransactionNotes(h.notes);
                        const hasDetails = Boolean(parsedNotes && (parsedNotes.dateRange || parsedNotes.noteText));
                        const isExpanded = Boolean(expandedTxIds[h.id]);
                        const matchedSysUser = (typeof systemUsers !== 'undefined' && Array.isArray(systemUsers))
                          ? systemUsers.find(u =>
                              (h.member_id && u.member_id && String(u.member_id) === String(h.member_id)) ||
                              (memberName && (
                                u.full_name?.toLowerCase() === memberName.toLowerCase() ||
                                u.nickname?.toLowerCase() === memberName.toLowerCase() ||
                                u.username?.toLowerCase() === memberName.toLowerCase()
                              ))
                            )
                          : null;

                        return (
                          <div
                            key={h.id}
                            style={{
                              background: 'white',
                              borderRadius: '18px',
                              border: '1px solid #e2e8f0',
                              padding: '0.7rem 0.65rem',
                              display: 'flex',
                              flexDirection: 'column',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                            }}
                          >
                            {/* Top Compact Row */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.5rem'
                            }}>
                              {/* Left Icon + Optional Avatar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                <div style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '50%',
                                  background: isPayment ? '#dcfce7' : '#fee2e2',
                                  color: isPayment ? '#16a34a' : '#dc2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {isPayment ? <ArrowUp size={18} /> : <AlertCircle size={18} />}
                                </div>
                                {matchedSysUser?.profile_picture && (
                                  <div style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0 }}>
                                    <img
                                      src={matchedSysUser.profile_picture}
                                      alt={memberName}
                                      style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '1.5px solid #e2e8f0'
                                      }}
                                    />
                                    <span style={{
                                      position: 'absolute',
                                      right: '0px',
                                      bottom: '0px',
                                      width: '10px',
                                      height: '10px',
                                      borderRadius: '50%',
                                      background: '#16a34a',
                                      border: '2px solid white'
                                    }} />
                                  </div>
                                )}
                              </div>

                              {/* Middle Info */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                  {isPayment ? 'Cash In' : 'Cash Out'}
                                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b' }}>
                                    {isPayment ? '(Saving Paid)' : '(Saving Unpaid)'}
                                  </div>
                                </div>
                                <div style={{
                                  fontSize: '0.72rem',
                                  color: '#475569',
                                  marginTop: '0.15rem',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  {isPayment ? 'payer:' : 'member:'} <strong style={{ color: '#0f172a' }}>{memberName}</strong> <VerifiedBadge size={12} style={{ marginLeft: '2px' }} />
                                </div>
                              </div>

                              {/* Right Time, Amount, Details & Delete */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  {(timeStr || dateStr) && (
                                    <div style={{ fontSize: '0.66rem', color: '#64748b', fontWeight: 600, marginBottom: '0.08rem' }}>
                                      {timeStr || dateStr}
                                    </div>
                                  )}
                                  <div style={{ fontSize: '0.88rem', fontWeight: 900, color: isPayment ? '#0b7a36' : '#dc2626', whiteSpace: 'nowrap' }}>
                                    {isPayment ? '+' : '-'}{formatCurrency(h.amount)}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem', marginTop: '0.22rem' }}>
                                    {hasDetails ? (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedTxIds(prev => ({ ...prev, [h.id]: !prev[h.id] }))}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.2rem',
                                          background: '#dcfce7',
                                          color: '#15803d',
                                          border: '1px solid #bbf7d0',
                                          borderRadius: '999px',
                                          padding: '0.18rem 0.52rem',
                                          fontSize: '0.66rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <span>Details</span>
                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      </button>
                                    ) : (
                                      <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem',
                                        background: isPayment ? '#dcfce7' : '#fee2e2',
                                        color: isPayment ? '#15803d' : '#dc2626',
                                        borderRadius: '999px',
                                        padding: '0.12rem 0.45rem',
                                        fontSize: '0.6rem',
                                        fontWeight: 700
                                      }}>
                                        {isPayment ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                                        <span>{isPayment ? 'Cash In' : 'Cash Out'}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {isPaymentManager && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteModalState({ isOpen: true, step: 1, transaction: h });
                                    }}
                                    title="Delete transaction"
                                    style={{
                                      width: '28px',
                                      height: '28px',
                                      borderRadius: '50%',
                                      border: 'none',
                                      background: '#fee2e2',
                                      color: '#ef4444',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      flexShrink: 0
                                    }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Collapsible Details Panel (Consecutive Saturdays & Notes) */}
                            {hasDetails && isExpanded && (
                              <div style={{
                                marginTop: '0.6rem',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '14px',
                                padding: '0.6rem 0.7rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                              }}>
                                {parsedNotes.dateRange && (
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', minWidth: 0 }}>
                                      <Calendar size={15} color="#15803d" style={{ flexShrink: 0, marginTop: '2px' }} />
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                          Consecutive Saturdays
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.1rem' }}>
                                          {parsedNotes.dateRange}
                                        </div>
                                      </div>
                                    </div>
                                    {parsedNotes.weeks && (
                                      <span style={{
                                        background: '#dcfce7',
                                        border: '1px solid #86efac',
                                        color: '#15803d',
                                        borderRadius: '999px',
                                        padding: '0.18rem 0.55rem',
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                      }}>
                                        {parsedNotes.weeks} {parsedNotes.weeks === 1 ? 'week' : 'weeks'}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {parsedNotes.dateRange && parsedNotes.noteText && (
                                  <div style={{ height: '1px', background: '#bbf7d0', width: '100%' }} />
                                )}

                                {parsedNotes.noteText && (
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem' }}>
                                    <FileText size={15} color="#15803d" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                                        Notes
                                      </div>
                                      <div style={{ fontSize: '0.7rem', color: '#334155', marginTop: '0.12rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                                        {parsedNotes.noteText}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Floating Scroll-to-Top Up Arrow */}
                    <button
                      type="button"
                      onClick={() => {
                        const mainEl = document.querySelector('.main-content');
                        if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      title="Back to top"
                      style={{
                        position: 'fixed',
                        right: '1rem',
                        bottom: '78px',
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: '#0b7a36',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 4px 14px rgba(11, 122, 54, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 40
                      }}
                    >
                      <ArrowUp size={20} />
                    </button>
                  </div>
                </div>

                {/* Tablet & Desktop History Layout (768px+ UNCHANGED) */}
                <div className="desktop-dashboard-only">
                <h1 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'inherit' }}>History</h1>
                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem', display: 'block', color: '#6B7280' }}>Quick Filter</label>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <FilterPill label="All time" active={dateFilter === 'all'} onClick={() => setDateFilter('all')} />
                      <FilterPill label="This week" active={dateFilter === 'week'} onClick={() => setDateFilter('week')} />
                      <FilterPill label="This month" active={dateFilter === 'month'} onClick={() => setDateFilter('month')} />
                      <FilterPill label="Custom range" active={dateFilter === 'custom'} onClick={() => setDateFilter('custom')} />
                    </div>
                    {dateFilter === 'custom' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
                        <div><label style={{ fontSize: '0.8rem', color: '#6B7280', display: 'block', marginBottom: '0.5rem' }}>Start date</label><input type="date" value={customRange.start} onChange={e => setCustomRange({ ...customRange, start: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }} /></div>
                        <div><label style={{ fontSize: '0.8rem', color: '#6B7280', display: 'block', marginBottom: '0.5rem' }}>End date</label><input type="date" value={customRange.end} onChange={e => setCustomRange({ ...customRange, end: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }} /></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.75rem', display: 'block', color: '#6B7280' }}>Transaction Type</label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <FilterPill label="All" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
                      <FilterPill label="Payments" active={typeFilter === 'payment'} onClick={() => setTypeFilter('payment')} />
                      <FilterPill label="Missed" active={typeFilter === 'missed'} onClick={() => setTypeFilter('missed')} />
                    </div>
                  </div>
                </div>



                <Section title={`Transactions (${filtered.length})`}>
                  {filtered.map((h, i) => (
                    <TransactionItem
                      key={h.id}
                      transaction={h}
                      full
                      showBorder={i !== 0}
                      formatCurrency={formatCurrency}
                      systemUsers={systemUsers}
                      members={members}
                      canDelete={isPaymentManager}
                      onDelete={(tx) => setDeleteModalState({ isOpen: true, step: 1, transaction: tx })}
                    />
                  ))}
                </Section>
                </div>
              </motion.div>
            );
          })()}

          {activeView === 'investments' && (
            <motion.div key="investments" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Mobile-Only Working Capital Layout (320px-767px) */}
              <div className="mobile-dashboard-only">
                {/* Green Working Capital Banner */}
                <div style={{
                  background: 'linear-gradient(135deg, #065f2a 0%, #0b7a36 55%, #16a34a 100%)',
                  borderRadius: '18px',
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  color: 'white',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 6px 18px rgba(11, 122, 54, 0.22)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 2 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '14px',
                      background: 'rgba(255, 255, 255, 0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      position: 'relative'
                    }}>
                      <Coins size={24} color="#fde047" />
                      <TrendingUp size={15} color="#86efac" style={{ position: 'absolute', top: '5px', right: '5px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '1.18rem', fontWeight: 900, lineHeight: 1.15 }}>Working Capital</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.9)', marginTop: '0.2rem', lineHeight: 1.3 }}>
                        Track the businesses and projects our savings are invested in.
                      </div>
                    </div>
                  </div>
                  <div style={{ opacity: 0.22, flexShrink: 0, zIndex: 1 }}>
                    <Landmark size={42} color="white" />
                  </div>
                </div>

                {/* 1. REMAINING MONEY Card */}
                <div
                  onClick={() => setShowWealthModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                    border: '1px solid #fde68a',
                    borderRadius: '16px',
                    padding: '0.85rem 0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(217, 119, 6, 0.08)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#fde68a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Landmark size={22} color="#d97706" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        REMAINING MONEY
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ea580c', lineHeight: 1.15, margin: '0.15rem 0' }}>
                        {formatCurrency(remainingMoney)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 500 }}>
                        Available in cash/bank to invest
                      </div>
                    </div>
                  </div>
                  <span style={{
                    background: 'rgba(255,255,255,0.88)',
                    border: '1px solid #fde68a',
                    borderRadius: '999px',
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    color: '#92400e',
                    whiteSpace: 'nowrap',
                    alignSelf: 'flex-start'
                  }}>
                    🟡 Cash &amp; Bank
                  </span>
                </div>

                {/* 2. MONEY AT WORK Card */}
                <div
                  onClick={() => setShowActiveInvestmentsModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%)',
                    border: '1px solid #bfdbfe',
                    borderRadius: '16px',
                    padding: '0.85rem 0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, zIndex: 2 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#dbeafe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <TrendingUp size={22} color="#1d4ed8" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        MONEY AT WORK
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#1d4ed8', lineHeight: 1.15, margin: '0.15rem 0' }}>
                        {formatCurrency(moneyAtWork)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 500 }}>
                        Tied up in active investments
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', zIndex: 2 }}>
                    <span style={{
                      background: 'rgba(255,255,255,0.88)',
                      border: '1px solid #bfdbfe',
                      borderRadius: '999px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      color: '#1e40af',
                      whiteSpace: 'nowrap'
                    }}>
                      🔵 Active Projects
                    </span>
                    <BarChart3 size={26} color="#3b82f6" style={{ opacity: 0.35 }} />
                  </div>
                </div>

                {/* 3. TOTAL PROFIT Card */}
                <div
                  onClick={() => setShowProfitModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1px solid #bbf7d0',
                    borderRadius: '16px',
                    padding: '0.85rem 0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, zIndex: 2 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Award size={22} color="#16a34a" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        TOTAL PROFIT
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0b7a36', lineHeight: 1.15, margin: '0.15rem 0' }}>
                        {formatCurrency(completedProfits)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 500 }}>
                        Earned from completed investments
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', zIndex: 2 }}>
                    <span style={{
                      background: 'rgba(255,255,255,0.88)',
                      border: '1px solid #bbf7d0',
                      borderRadius: '999px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      color: '#166534',
                      whiteSpace: 'nowrap'
                    }}>
                      🟢 Earned Profit
                    </span>
                    <TrendingUp size={26} color="#16a34a" style={{ opacity: 0.35 }} />
                  </div>
                </div>

                {/* Investments List or Empty State Card */}
                {investments.length === 0 ? (
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    padding: '1.4rem 1rem 1.75rem',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
                  }}>
                    <Briefcase size={42} color="#94a3b8" style={{ margin: '0 auto 0.6rem' }} />
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.3rem' }}>
                      No active investments
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: canTrackInvestments ? '1.1rem' : '0.4rem' }}>
                      Start investing your savings in projects and businesses.
                    </div>
                    {canTrackInvestments && (
                      <button
                        type="button"
                        onClick={() => setShowInvestmentModal(true)}
                        style={{
                          position: 'relative',
                          zIndex: 2,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: '#0b7a36',
                          color: 'white',
                          border: 'none',
                          borderRadius: '999px',
                          padding: '0.65rem 1.4rem',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(11, 122, 54, 0.3)'
                        }}
                      >
                        <Plus size={18} /> Add Investment
                      </button>
                    )}
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '48px', pointerEvents: 'none', zIndex: 1 }}>
                      <svg viewBox="0 0 400 50" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                        <path d="M0,25 C100,5 200,45 300,20 C350,8 380,25 400,15 L400,50 L0,50 Z" fill="rgba(22, 163, 74, 0.18)" />
                        <path d="M0,36 C120,16 240,48 400,24 L400,50 L0,50 Z" fill="rgba(11, 122, 54, 0.28)" />
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {investments.map(inv => (
                      <div
                        key={inv.id}
                        onClick={() => { setSelectedInvestment(inv); setShowInvestmentDetailModal(true); }}
                        style={{
                          background: 'white',
                          padding: '0.85rem',
                          borderRadius: '16px',
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.6rem',
                          cursor: 'pointer',
                          opacity: inv.status === 'completed' ? 0.78 : 1,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', minWidth: 0 }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            background: inv.status === 'active' ? '#ede9fe' : '#dcfce7',
                            color: inv.status === 'active' ? '#7c3aed' : '#16a34a',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Briefcase size={20} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', textDecoration: inv.status === 'completed' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inv.project_name}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>
                              {inv.status === 'active' ? 'Started' : 'Finished'} {new Date(inv.created_at).toLocaleDateString()}
                            </div>
                            <Badge
                              label={inv.status === 'active' ? 'Active & Working' : 'Mission Completed'}
                              type={inv.status === 'active' ? 'info' : 'success'}
                              size="small"
                            />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                            {inv.status === 'active' ? 'Expense' : 'Invested'}
                          </div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: inv.status === 'active' ? '#7c3aed' : '#16a34a' }}>
                            {formatCurrency(inv.allocated_amount)}
                          </div>
                          {inv.projected_profit > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>
                              {inv.status === 'active' ? '+' : 'Earned +'}{formatCurrency(inv.projected_profit)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {canTrackInvestments && (
                      <button
                        type="button"
                        onClick={() => setShowInvestmentModal(true)}
                        style={{
                          alignSelf: 'center',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: '#0b7a36',
                          color: 'white',
                          border: 'none',
                          borderRadius: '999px',
                          padding: '0.65rem 1.4rem',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          marginTop: '0.35rem',
                          boxShadow: '0 4px 12px rgba(11, 122, 54, 0.3)'
                        }}
                      >
                        <Plus size={18} /> Add Investment
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tablet & Desktop Working Capital Layout (768px+ UNCHANGED) */}
              <div className="desktop-dashboard-only">
              <h1 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'inherit' }}>Working Capital</h1>
              <p style={{ color: '#6B7280', marginTop: '-1rem' }}>Track the businesses and projects our savings are invested in.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                <StatCard
                  label="REMAINING MONEY"
                  value={formatCurrency(remainingMoney)}
                  color="#D97706"
                  badge="🟡 Cash & Bank"
                  bgGradient="linear-gradient(180deg, #FFFFFF 0%, #FFFDF5 100%)"
                  borderColor="#FDE68A"
                  subValue="Available in cash/bank to invest"
                  onClick={() => setShowWealthModal(true)}
                />
                <StatCard
                  label="MONEY AT WORK"
                  value={formatCurrency(moneyAtWork)}
                  color="#2563EB"
                  badge="🔵 Active Projects"
                  bgGradient="linear-gradient(180deg, #FFFFFF 0%, #F8FAFF 100%)"
                  borderColor="#BFDBFE"
                  subValue="Tied up in active investments"
                  onClick={() => setShowActiveInvestmentsModal(true)}
                />
                <StatCard
                  label="TOTAL PROFIT"
                  value={formatCurrency(completedProfits)}
                  color="#16A34A"
                  badge="🟢 Earned Profit"
                  bgGradient="linear-gradient(180deg, #FFFFFF 0%, #F5FDF7 100%)"
                  borderColor="#BBF7D0"
                  subValue="Earned from completed investments"
                  onClick={() => setShowProfitModal(true)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {investments.length === 0 ? (
                  <div style={{ background: 'white', padding: '3rem 1.5rem', borderRadius: '24px', textAlign: 'center', border: '1px solid #E5E7EB' }}>
                    <Briefcase size={48} color="#9CA3AF" style={{ margin: '0 auto 1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem', fontWeight: 700, fontFamily: 'inherit' }}>No active investments</h3>
                    <p style={{ color: '#6B7280', margin: 0 }}>Our money is resting. Allocate it to a project to start earning profit!</p>
                  </div>
                ) : (
                  investments.map(inv => (
                    <div
                      key={inv.id}
                      onClick={() => { setSelectedInvestment(inv); setShowInvestmentDetailModal(true); }}
                      style={{
                        background: 'white',
                        padding: '1.5rem',
                        borderRadius: '24px',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                        opacity: inv.status === 'completed' ? 0.7 : 1
                      }}
                      onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                      onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          background: inv.status === 'active' ? '#F3E8FF' : '#F0FDF4',
                          color: inv.status === 'active' ? '#8B5CF6' : '#16A34A',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Briefcase size={24} />
                        </div>
                        <div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', textDecoration: inv.status === 'completed' ? 'line-through' : 'none' }}>{inv.project_name}</div>
                          <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                            {inv.status === 'active' ? 'Started' : 'Finished'} {new Date(inv.created_at).toLocaleDateString()}
                          </div>
                          <Badge
                            label={inv.status === 'active' ? 'Active & Working' : 'Mission Completed'}
                            type={inv.status === 'active' ? 'info' : 'success'}
                            size="small"
                          />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>{inv.status === 'active' ? 'Expense' : 'Invested'}</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: inv.status === 'active' ? '#8B5CF6' : '#16A34A' }}>{formatCurrency(inv.allocated_amount)}</div>
                        {inv.projected_profit > 0 && (
                          <div style={{ fontSize: '0.85rem', color: '#16A34A', marginTop: '0.25rem' }}>
                            {inv.status === 'active' ? '+' : 'Earned +'} {formatCurrency(inv.projected_profit)} {inv.status === 'active' ? 'expected' : 'profit'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {canTrackInvestments && <FloatingAddButton onClick={() => setShowInvestmentModal(true)} />}
              </div>
            </motion.div>
          )}

          {activeView === 'settings' && (
            isSuperAdmin ? (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Mobile-Only Settings Layout (320px-767px) */}
                <div className="mobile-dashboard-only">
                  {/* Settings Header Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    borderRadius: '18px',
                    padding: '0.8rem 0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid #bbf7d0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', zIndex: 2 }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: '#bbf7d0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <SettingsIcon size={24} color="#0b7a36" />
                      </div>
                      <div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#065f2a', lineHeight: 1.1 }}>Settings</div>
                        <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.15rem', fontWeight: 500 }}>
                          Manage your group preferences and members.
                        </div>
                      </div>
                    </div>
                    <SettingsIcon size={46} color="#16a34a" style={{ opacity: 0.16, flexShrink: 0 }} />
                  </div>

                  {/* Add Member Card */}
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                        <UserPlus size={18} color="#0b7a36" />
                        <span>Add Member</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => document.getElementById('mobile-new-member-input')?.focus()}
                        style={{
                          background: '#dcfce7',
                          color: '#065f2a',
                          border: '1px solid #bbf7d0',
                          borderRadius: '999px',
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + New Member
                      </button>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '0.35rem' }}>
                        Full name
                      </label>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '999px',
                        padding: '0.5rem 0.85rem'
                      }}>
                        <User size={16} color="#64748b" style={{ flexShrink: 0 }} />
                        <input
                          id="mobile-new-member-input"
                          type="text"
                          value={mobileNewMemberName}
                          onChange={(e) => setMobileNewMemberName(e.target.value)}
                          placeholder="e.g. Ermias Gesgis"
                          style={{
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            width: '100%',
                            fontSize: '0.84rem',
                            color: '#0f172a'
                          }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (mobileNewMemberName.trim()) {
                          handleAddMember(mobileNewMemberName.trim());
                          setMobileNewMemberName('');
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.72rem',
                        borderRadius: '999px',
                        background: '#0b7a36',
                        color: 'white',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        boxShadow: '0 4px 12px rgba(11, 122, 54, 0.22)'
                      }}
                    >
                      <UserPlus size={17} />
                      <span>Add member</span>
                    </button>
                  </div>

                  {/* Current Members Card */}
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                        <Users size={18} color="#0b7a36" />
                        <span>Current Members ({members.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveView('members')}
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #86efac',
                          color: '#065f2a',
                          borderRadius: '999px',
                          padding: '0.28rem 0.65rem',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        View All →
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {members.map((m, i) => {
                        const isSuper = m.role === 'super_admin';
                        const isAdm = m.role === 'admin';
                        const roleLabel = isSuper ? 'Super Admin' : isAdm ? 'Admin' : 'Member';

                        return (
                          <div
                            key={m.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.45rem',
                              padding: '0.55rem 0',
                              borderTop: i === 0 ? 'none' : '1px solid #f1f5f9'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flex: 1 }}>
                              <Avatar name={m.name} size="36px" fontSize="0.88rem" index={i} />
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 800, fontSize: '0.84rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                                <VerifiedBadge size={14} />
                              </span>
                            </div>

                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.22rem',
                              background: '#dbeafe',
                              color: '#2563eb',
                              borderRadius: '999px',
                              padding: '0.2rem 0.55rem',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}>
                              {isSuper ? <Star size={11} fill="#2563eb" color="#2563eb" /> : <Shield size={11} fill="#2563eb" color="#2563eb" />}
                              <span>{roleLabel}</span>
                            </span>

                            {isSuperAdmin && m.role !== 'super_admin' ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m.id, m.name)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.22rem',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fecdd3',
                                  borderRadius: '999px',
                                  padding: '0.22rem 0.6rem',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  flexShrink: 0
                                }}
                              >
                                <Trash2 size={11} />
                                <span>Remove</span>
                              </button>
                            ) : (
                              <div style={{ width: '68px', flexShrink: 0 }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 1. Add New Week Card */}
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: '#dcfce7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Calendar size={20} color="#0b7a36" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>Add New Week</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.3, marginTop: '0.1rem' }}>
                          Sets a new weekly contribution amount. Previous weeks remain unchanged.
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '0.35rem' }}>
                        Weekly amount (ETB)
                      </label>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '999px',
                        padding: '0.5rem 0.9rem'
                      }}>
                        <input
                          type="number"
                          placeholder={String(config.weekly_amount || 200)}
                          value={mobileWeeklyAmount}
                          onChange={(e) => setMobileWeeklyAmount(e.target.value)}
                          style={{
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            width: '100%',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: '#0f172a'
                          }}
                        />
                        <Coins size={18} color="#eab308" style={{ flexShrink: 0 }} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const val = mobileWeeklyAmount || String(config.weekly_amount || '');
                        if (val) {
                          handleAddWeek(val);
                          setMobileWeeklyAmount('');
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '0.72rem',
                        borderRadius: '999px',
                        background: '#0b7a36',
                        color: 'white',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 4px 12px rgba(11, 122, 54, 0.22)'
                      }}
                    >
                      <Plus size={18} />
                      <span>Add Week</span>
                    </button>
                  </div>

                  {/* 2. Week History Card */}
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '50%',
                          background: '#dcfce7',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Clock size={16} color="#0b7a36" />
                        </div>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                          Week History ({configHistory.length})
                        </span>
                      </div>
                      {configHistory.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setShowMobileWeekSection(prev => !prev)}
                          style={{
                            background: '#dcfce7',
                            border: '1px solid #bbf7d0',
                            color: '#065f2a',
                            borderRadius: '999px',
                            padding: '0.28rem 0.7rem',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          {showMobileWeekSection ? 'Show Less' : 'View All →'}
                        </button>
                      )}
                    </div>

                    {configHistory.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                        No week history configurations saved.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(showMobileWeekSection ? configHistory : configHistory.slice(0, 3)).map((c, i) => {
                          const isLatest = c.id === configHistory[0]?.id;
                          const weekNum = c.week_number || (configHistory.length - i);

                          return (
                            <div
                              key={c.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                padding: '0.45rem',
                                borderRadius: '14px',
                                border: '1px solid #f1f5f9',
                                background: '#ffffff'
                              }}
                            >
                              <div style={{
                                minWidth: '58px',
                                padding: '0.35rem 0.45rem',
                                borderRadius: '12px',
                                background: '#dcfce7',
                                textAlign: 'center',
                                flexShrink: 0
                              }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>Week</div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>{weekNum}</div>
                              </div>

                              <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a', flex: 1, textAlign: 'center' }}>
                                {formatCurrency(c.weekly_amount)}
                              </div>

                              {isLatest ? (
                                <div style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: '#dcfce7',
                                  color: '#065f2a',
                                  borderRadius: '999px',
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.66rem',
                                  fontWeight: 800,
                                  lineHeight: 1.15,
                                  textAlign: 'left',
                                  flexShrink: 0
                                }}>
                                  <Shield size={13} fill="#16a34a" color="#16a34a" />
                                  <span>Active Week<br />(Protected)</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWeekConfig(c.id, weekNum, c.weekly_amount)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    background: '#fee2e2',
                                    border: '1px solid #fecdd3',
                                    color: '#dc2626',
                                    borderRadius: '999px',
                                    padding: '0.32rem 0.65rem',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    flexShrink: 0
                                  }}
                                >
                                  <Trash2 size={12} />
                                  <span>Delete</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Assign Clerk Card */}
                  <div style={{
                    background: 'white',
                    borderRadius: '18px',
                    border: '1px solid #e2e8f0',
                    padding: '0.85rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: '#dcfce7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Shield size={20} color="#0b7a36" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>Assign Clerk</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.3, marginTop: '0.1rem' }}>
                          Only the assigned Clerk and Super Admin can manage members and payments.
                        </div>
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '999px',
                      padding: '0.45rem 0.85rem'
                    }}>
                      <User size={16} color="#475569" style={{ flexShrink: 0 }} />
                      <select
                        value={mobileClerkId || config.clerk_id || ''}
                        onChange={(e) => setMobileClerkId(e.target.value)}
                        style={{
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          width: '100%',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: '#0f172a',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- No Clerk Assigned --</option>
                        {systemUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.nickname || u.email} ({u.role})</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSetClerk(mobileClerkId || config.clerk_id || '')}
                      style={{
                        width: '100%',
                        padding: '0.72rem',
                        borderRadius: '999px',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                      }}
                    >
                      <Check size={17} />
                      <span>Set Clerk</span>
                    </button>
                  </div>

                  {/* Subtle Green Wave Footer Accent */}
                  <div style={{ height: '24px', width: '100%', overflow: 'hidden', borderRadius: '12px', pointerEvents: 'none' }}>
                    <svg viewBox="0 0 400 32" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                      <path d="M0,18 C80,2 160,30 240,14 C310,0 360,22 400,10 L400,32 L0,32 Z" fill="rgba(22, 163, 74, 0.16)" />
                      <path d="M0,24 C100,8 200,32 300,18 C350,12 380,22 400,16 L400,32 L0,32 Z" fill="rgba(11, 122, 54, 0.25)" />
                    </svg>
                  </div>
                </div>

                {/* Tablet & Desktop Settings Layout (768px+ UNCHANGED) */}
                <div className="desktop-dashboard-only">
                <h1 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'inherit' }}>Settings</h1>

                <div style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', display: 'block', marginBottom: '1.5rem' }}>Add Member</label>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Full name</label>
                    <input id="new-member-name" type="text" placeholder="e.g. Ermias Gesgis" style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: '#F9FAFB' }} />
                  </div>
                  <button onClick={() => { const n = document.getElementById('new-member-name').value; if (n) handleAddMember(n); }} style={{ width: '100%', padding: '1.1rem', borderRadius: '12px', background: '#16A34A', color: 'white', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginBottom: '2rem' }}>Add member</button>

                  <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', display: 'block', marginBottom: '1rem' }}>Current Members ({members.length})</label>
                    {members.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid #F3F4F6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <Avatar name={m.name} size="36px" fontSize="0.8rem" />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>{m.name}</span>
                            <Badge
                              label={m.role === 'super_admin' ? 'Super Admin' : m.role === 'admin' ? 'Admin' : 'Member'}
                              type="info"
                              size="small"
                            />
                          </div>
                        </div>
                        {isSuperAdmin && m.role !== 'super_admin' && (
                          <button
                            onClick={() => handleDeleteMember(m.id, m.name)}
                            style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', display: 'block', marginBottom: '1rem' }}>Add New Week</label>
                  <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Sets a new weekly contribution amount. Previous weeks remain unchanged.</p>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Weekly amount (ETB)</label>
                    <input id="new-weekly-amount" type="number" placeholder="100" defaultValue={config.weekly_amount} style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: '#F9FAFB' }} />
                  </div>
                  <button onClick={() => { const a = document.getElementById('new-weekly-amount').value; if (a) handleAddWeek(a); }} style={{ width: '100%', padding: '1.1rem', borderRadius: '12px', background: '#16A34A', color: 'white', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', marginBottom: '2rem' }}>Add week</button>

                  <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem' }}>
                    {(() => {
                      const latestConfigId = configHistory[0]?.id;
                      const selectableConfigs = configHistory.filter(c => c.id !== latestConfigId);
                      const isAllSelectableChecked = selectableConfigs.length > 0 && selectedWeekIds.length === selectableConfigs.length;

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {isSuperAdmin && selectableConfigs.length > 0 && (
                                <input
                                  type="checkbox"
                                  checked={isAllSelectableChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedWeekIds(selectableConfigs.map(c => c.id));
                                    } else {
                                      setSelectedWeekIds([]);
                                    }
                                  }}
                                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#16A34A' }}
                                />
                              )}
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', margin: 0 }}>
                                Week History ({configHistory.length})
                              </label>
                            </div>

                            {isSuperAdmin && selectableConfigs.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {selectedWeekIds.length > 0 && (
                                  <button
                                    onClick={handleDeleteSelectedWeeks}
                                    style={{
                                      padding: '0.4rem 0.8rem',
                                      borderRadius: '8px',
                                      border: 'none',
                                      background: '#EF4444',
                                      color: 'white',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.3rem'
                                    }}
                                  >
                                    🗑️ Delete Selected ({selectedWeekIds.length})
                                  </button>
                                )}
                                <button
                                  onClick={handleClearAllWeeks}
                                  style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '8px',
                                    border: '1px solid #FCA5A5',
                                    background: '#FEF2F2',
                                    color: '#DC2626',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  🗑️ Clear All Previous
                                </button>
                              </div>
                            )}
                          </div>

                          {configHistory.length === 0 ? (
                            <div style={{ color: '#94A3B8', fontSize: '0.9rem', fontStyle: 'italic', padding: '1rem 0' }}>
                              No week history configurations saved.
                            </div>
                          ) : (
                            configHistory.map((c, i) => {
                              const isLatest = (c.id === latestConfigId);
                              const weekNum = c.week_number || (configHistory.length - i);
                              const isSelected = selectedWeekIds.includes(c.id);

                              return (
                                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 0', borderBottom: '1px solid #F3F4F6' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {isSuperAdmin && !isLatest && (
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedWeekIds(prev => [...prev, c.id]);
                                          } else {
                                            setSelectedWeekIds(prev => prev.filter(wId => wId !== c.id));
                                          }
                                        }}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16A34A' }}
                                      />
                                    )}
                                    <span style={{ color: '#374151', fontWeight: 600 }}>Week {weekNum}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{formatCurrency(c.weekly_amount)}</span>
                                    {isSuperAdmin && (
                                      isLatest ? (
                                        <span style={{ background: '#DCFCE7', color: '#166534', padding: '0.25rem 0.65rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700 }}>
                                          Active Week (Protected)
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => handleDeleteWeekConfig(c.id, weekNum, c.weekly_amount)}
                                          title={`Delete Week ${weekNum}`}
                                          style={{
                                            background: '#FEF2F2',
                                            border: '1px solid #FCA5A5',
                                            color: '#DC2626',
                                            borderRadius: '8px',
                                            padding: '0.35rem 0.6rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          🗑️ Delete
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div style={{ background: 'white', padding: '2rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', display: 'block', marginBottom: '1rem' }}>Assign Clerk</label>
                  <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Only the assigned Clerk and Super Admin can manage members and payments.</p>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <select
                      id="clerk-select"
                      defaultValue={config.clerk_id || ''}
                      style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: '#F9FAFB' }}
                    >
                      <option value="">-- No Clerk Assigned --</option>
                      {systemUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.nickname || u.email} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => handleSetClerk(document.getElementById('clerk-select').value)} style={{ width: '100%', padding: '1.1rem', borderRadius: '12px', background: '#3B82F6', color: 'white', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>Set Clerk</button>
                </div>
                </div>
              </motion.div>
            ) : (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: '0.75rem' }}>Super Admin Settings Restricted</h2>
                <p style={{ color: '#6B7280', fontSize: '0.95rem', maxWidth: '520px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
                  This dashboard is only visible to the Super Admin (<strong>{SUPER_ADMIN_EMAIL}</strong>) by default. Adding or removing members, changing weekly contribution amounts, and assigning the clerk are exclusively managed by the Super Admin.
                </p>
                <button
                  onClick={() => setActiveView('dashboard')}
                  style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', background: '#16A34A', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                >
                  Return to Dashboard
                </button>
              </div>
            )
          )}
        </AnimatePresence>
      </main>

      {/* Modals & Confirmation */}
      {/* Modals & Confirmation */}
      <AnimatePresence>
        {confirmation.isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(22, 163, 74, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', margin: '0 auto 1.5rem' }}>
                <AlertCircle size={32} />
              </div>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', fontFamily: 'inherit' }}>{confirmation.title}</h3>
              <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '2rem', fontSize: '0.95rem' }}>{confirmation.message}</p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setConfirmation(prev => ({ ...prev, isOpen: false }))} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>{confirmation.cancelText || 'No'}</button>
                <button onClick={() => { confirmation.onConfirm(); setConfirmation(prev => ({ ...prev, isOpen: false })); }} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#16A34A', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}>{confirmation.confirmText || 'Yes'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {visualPrompt.isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)' }}>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{visualPrompt.title}</h3>
              <input
                className="input-field"
                autoFocus
                defaultValue={visualPrompt.defaultValue}
                placeholder={visualPrompt.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') visualPrompt.onConfirm(e.target.value);
                  if (e.key === 'Escape') setVisualPrompt(prev => ({ ...prev, isOpen: false }));
                }}
                id="visual-prompt-input"
                style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: '#F9FAFB', marginBottom: '1.5rem', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setVisualPrompt(prev => ({ ...prev, isOpen: false }))} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => visualPrompt.onConfirm(document.getElementById('visual-prompt-input').value)} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#3b82f6', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>Continue</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {successModal.isOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '28px', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)', textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', background: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#16A34A' }}>
                <CheckCircle size={32} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'inherit', marginBottom: '0.75rem', color: '#0f172a' }}>Success!</h2>
              <p style={{ color: '#64748b', marginBottom: '2rem', lineHeight: '1.6', fontSize: '0.95rem' }}>{successModal.message}</p>
              <button onClick={() => setSuccessModal({ isOpen: false, message: '' })} style={{ width: '100%', padding: '1rem', borderRadius: '16px', background: '#16A34A', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}>OK</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {showPaymentModal && (
        <Modal title="Add payment" onClose={() => setShowPaymentModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: "'Inter', sans-serif" }}>

            {/* Date & Time Pickers */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginBottom: '1.25rem' }}>
              {/* Date Wrapper */}
              <div style={{
                flex: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.8rem',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                background: 'white',
                position: 'relative'
              }}>
                <button
                  onClick={() => handleAdjustDate(-1)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', color: '#6B7280' }}
                >
                  &lt;
                </button>
                <span
                  onClick={() => document.getElementById('custom-date-picker').showPicker()}
                  style={{ fontWeight: 600, color: '#1F2937', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {formatDateString(paymentForm.date)}
                </span>
                <button
                  onClick={() => handleAdjustDate(1)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', color: '#6B7280' }}
                >
                  &gt;
                </button>
                <input
                  type="date"
                  id="custom-date-picker"
                  value={paymentForm.date}
                  onChange={e => setPaymentForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '100%', left: 0 }}
                />
                <div
                  onClick={() => document.getElementById('custom-date-picker').showPicker()}
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: '0.25rem', color: '#3B82F6' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
              </div>

              {/* Time Wrapper */}
              <div
                onClick={() => document.getElementById('custom-time-picker').showPicker()}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.8rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  background: 'white',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <span style={{ fontWeight: 600, color: '#1F2937', fontSize: '0.85rem' }}>
                  {formatTimeString(paymentForm.time)}
                </span>
                <input
                  type="time"
                  id="custom-time-picker"
                  value={paymentForm.time}
                  onChange={e => setPaymentForm(prev => ({ ...prev, time: e.target.value }))}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '100%', left: 0 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', color: '#3B82F6' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
              </div>
            </div>

            {/* Amount Box */}
            <div style={{ position: 'relative', width: '100%', marginBottom: '1.25rem' }}>
              <label style={{
                position: 'absolute',
                left: '12px',
                top: '-10px',
                background: 'white',
                padding: '0 4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#16A34A',
                zIndex: 1
              }}>
                Amount (ETB)
              </label>
              <input
                type="number"
                value={paymentForm.amount}
                onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  borderRadius: '12px',
                  border: '1.5px solid #16A34A',
                  outline: 'none',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: '#1F2937'
                }}
              />
              <div style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line><line x1="12" y1="6" x2="12" y2="20"></line></svg>
              </div>
            </div>

            {/* Notes Input */}
            <div style={{ position: 'relative', width: '100%', marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="Notes"
                value={paymentForm.notes}
                onChange={e => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.9rem 3rem 0.9rem 0.9rem',
                  borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                  outline: 'none',
                  fontSize: '0.95rem',
                  color: '#1F2937',
                  background: '#F9FAFB'
                }}
              />
              <div style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
              </div>
            </div>

            {/* Confirm Save Actions */}
            <button
              onClick={() => handleSaveTransaction(true)}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '12px',
                background: '#16A34A',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '1rem',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = '#15803D'}
              onMouseOut={e => e.currentTarget.style.background = '#16A34A'}
            >
              Confirm payment
            </button>

          </div>
        </Modal>
      )}
      {showMissedModal && (
        <Modal title="Mark missed" onClose={() => setShowMissedModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: "'Inter', sans-serif" }}>

            {/* Date & Time Pickers */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginBottom: '1.25rem' }}>
              {/* Date Wrapper */}
              <div style={{
                flex: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.8rem',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                background: 'white',
                position: 'relative'
              }}>
                <button
                  onClick={() => handleAdjustDate(-1)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', color: '#6B7280' }}
                >
                  &lt;
                </button>
                <span
                  onClick={() => document.getElementById('custom-date-picker-missed').showPicker()}
                  style={{ fontWeight: 600, color: '#1F2937', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {formatDateString(paymentForm.date)}
                </span>
                <button
                  onClick={() => handleAdjustDate(1)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', color: '#6B7280' }}
                >
                  &gt;
                </button>
                <input
                  type="date"
                  id="custom-date-picker-missed"
                  value={paymentForm.date}
                  onChange={e => setPaymentForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '100%', left: 0 }}
                />
                <div
                  onClick={() => document.getElementById('custom-date-picker-missed').showPicker()}
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: '0.25rem', color: '#3B82F6' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </div>
              </div>

              {/* Time Wrapper */}
              <div
                onClick={() => document.getElementById('custom-time-picker-missed').showPicker()}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.8rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  background: 'white',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <span style={{ fontWeight: 600, color: '#1F2937', fontSize: '0.85rem' }}>
                  {formatTimeString(paymentForm.time)}
                </span>
                <input
                  type="time"
                  id="custom-time-picker-missed"
                  value={paymentForm.time}
                  onChange={e => setPaymentForm(prev => ({ ...prev, time: e.target.value }))}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '100%', left: 0 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', color: '#3B82F6' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                </div>
              </div>
            </div>

            {/* Amount Box */}
            <div style={{ position: 'relative', width: '100%', marginBottom: '1.25rem' }}>
              <label style={{
                position: 'absolute',
                left: '12px',
                top: '-10px',
                background: 'white',
                padding: '0 4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#DC2626',
                zIndex: 1
              }}>
                Amount (ETB)
              </label>
              <input
                type="number"
                value={paymentForm.amount}
                onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  borderRadius: '12px',
                  border: '1.5px solid #DC2626',
                  outline: 'none',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: '#1F2937'
                }}
              />
              <div style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line><line x1="12" y1="6" x2="12" y2="20"></line></svg>
              </div>
            </div>

            {/* Notes Input */}
            <div style={{ position: 'relative', width: '100%', marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="Notes (Optional)"
                value={paymentForm.notes}
                onChange={e => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.9rem 3rem 0.9rem 0.9rem',
                  borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                  outline: 'none',
                  fontSize: '0.95rem',
                  color: '#1F2937',
                  background: '#F9FAFB'
                }}
              />
              <div style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
              </div>
            </div>

            {/* Confirm Actions */}
            <button
              onClick={() => handleSaveTransaction(true)}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '12px',
                background: '#DC2626',
                color: 'white',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '1rem',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = '#B91C1C'}
              onMouseOut={e => e.currentTarget.style.background = '#DC2626'}
            >
              Confirm missed contribution
            </button>

          </div>
        </Modal>
      )}
      {showInvestmentModal && (
        <Modal title="New Investment" onClose={() => setShowInvestmentModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Project Name/Business</label>
              <input type="text" placeholder="e.g., Electronics Store" value={investmentForm.projectName} onChange={e => setInvestmentForm({ ...investmentForm, projectName: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Capital to Deploy from Remaining Money (ETB)</label>
              <input type="number" min="0" placeholder="15000" value={investmentForm.allocatedAmount} onChange={e => setInvestmentForm({ ...investmentForm, allocatedAmount: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }} />
              <div style={{ fontSize: '0.8rem', color: '#D97706', marginTop: '0.35rem', fontWeight: 600 }}>Available in Remaining Money: {formatCurrency(remainingMoney)}</div>
            </div>
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Expected Profit (ETB)</label>
              <input type="number" placeholder="1000" value={investmentForm.projectedProfit} onChange={e => setInvestmentForm({ ...investmentForm, projectedProfit: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Expected Duration (Months)</label>
              <input type="number" min="1" placeholder="e.g., 3" value={investmentForm.expectedDays} onChange={e => setInvestmentForm({ ...investmentForm, expectedDays: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Business Challenges / Details (Optional)</label>
              <textarea placeholder="Mention risks, elements or properties of this business..." value={investmentForm.challenges} onChange={e => setInvestmentForm({ ...investmentForm, challenges: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', minHeight: '100px', fontFamily: 'inherit' }} />
            </div>
            <button onClick={handleAddInvestment} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: '#2563EB', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>Deploy into Money at Work</button>
          </div>
        </Modal>
      )}
      {showInvestmentDetailModal && selectedInvestment && (
        <Modal title={selectedInvestment.project_name} onClose={() => setShowInvestmentDetailModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: '0.75rem' }}>
              <div style={{ background: '#F9FAFB', padding: '1rem', borderRadius: '16px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Expense</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{formatCurrency(selectedInvestment.allocated_amount)}</div>
              </div>
              {selectedInvestment.status === 'completed' && (
                <div style={{ background: '#EFF6FF', padding: '1rem', borderRadius: '16px', border: '1px solid #DBEAFE', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Income</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB' }}>{formatCurrency(selectedInvestment.allocated_amount + getActualProfit(selectedInvestment))}</div>
                </div>
              )}
              <div style={{ background: getActualProfit(selectedInvestment) >= 0 ? '#F0FDF4' : '#FEF2F2', padding: '1rem', borderRadius: '16px', border: `1px solid ${getActualProfit(selectedInvestment) >= 0 ? '#BBF7D0' : '#FECACA'}`, textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: getActualProfit(selectedInvestment) >= 0 ? '#166534' : '#991B1B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  {selectedInvestment.status === 'active' ? "Est. Profit" : "Net Profit"}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: getActualProfit(selectedInvestment) >= 0 ? '#16A34A' : '#DC2626' }}>{formatCurrency(getActualProfit(selectedInvestment))}</div>
              </div>
            </div>

            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HistoryIcon size={18} />
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>Timeline & Duration</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: '#6B7280' }}>Started On</span>
                  <span style={{ fontWeight: 600 }}>{new Date(selectedInvestment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {selectedInvestment.completed_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#6B7280' }}>Completed On</span>
                    <span style={{ fontWeight: 600 }}>{new Date(selectedInvestment.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px dashed #E5E7EB', marginTop: '0.25rem', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6B7280' }}>
                    {selectedInvestment.status === 'active' ? 'ESTIMATED TIME' : 'TOTAL TIME'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {selectedInvestment.expected_days && selectedInvestment.status === 'active' && (
                      <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Target: {selectedInvestment.expected_days}m</span>
                    )}
                    <Badge
                      label={selectedInvestment.completed_at
                        ? `${Math.ceil((new Date(selectedInvestment.completed_at) - new Date(selectedInvestment.created_at)) / (1000 * 60 * 60 * 24))} Days`
                        : `Running ${Math.ceil((new Date() - new Date(selectedInvestment.created_at)) / (1000 * 60 * 60 * 24))} Days`
                      }
                      type="info"
                      size="small"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={18} />
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>Business Elements & Challenges</span>
              </div>
              <div style={{
                background: '#F9FAFB',
                padding: '1.25rem',
                borderRadius: '20px',
                fontSize: '0.9rem',
                color: '#4B5563',
                lineHeight: 1.6,
                border: '1px solid #F3F4F6',
                fontStyle: selectedInvestment.challenges ? 'normal' : 'italic',
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {selectedInvestment.challenges || "No specific challenges or properties were recorded for this venture."}
              </div>
            </div>

            {isMemberManager && (
              <button
                onClick={() => handleToggleInvestmentStatus(selectedInvestment.id, selectedInvestment.status)}
                style={{
                  width: '100%',
                  padding: '1.1rem',
                  borderRadius: '16px',
                  background: selectedInvestment.status === 'active' ? '#16A34A' : '#4B5563',
                  color: 'white',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  boxShadow: selectedInvestment.status === 'active' ? '0 4px 14px 0 rgba(22, 163, 74, 0.3)' : 'none',
                  marginTop: '0.5rem'
                }}
              >
                {selectedInvestment.status === 'active' ? 'Mark Mission as Completed' : 'Reactivate Business'}
              </button>
            )}
          </div>
        </Modal>
      )}
      {showInvestmentCompleteModal && selectedInvestment && (
        <Modal title="Confirm Return & Income" onClose={() => setShowInvestmentCompleteModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>
              Enter the total cash that came back from this investment (Original Capital + Net Profit).
            </p>

            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem', color: '#1E293B' }}>
                Total Cash Returned (ETB)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  placeholder="e.g. 2000"
                  value={completionForm.finalProfit}
                  onChange={e => setCompletionForm({ ...completionForm, finalProfit: e.target.value })}
                  style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '2px solid #2563EB', fontSize: '1.2rem', fontWeight: 800, outline: 'none' }}
                />
                <div style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#2563EB', fontWeight: 800, fontSize: '0.85rem' }}>ETB</div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.45rem', fontWeight: 500 }}>
                Original capital taken from Remaining Money was <strong>{formatCurrency(selectedInvestment.allocated_amount)}</strong>.
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem', color: '#334155' }}>
                Final Challenges & Lessons
              </label>
              <textarea
                placeholder="What went well? What were the challenges?"
                value={completionForm.challenges}
                onChange={e => setCompletionForm({ ...completionForm, challenges: e.target.value })}
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1.5px solid #CBD5E1', minHeight: '90px', fontFamily: 'inherit', fontSize: '0.9rem' }}
              />
            </div>

            {completionForm.finalProfit && selectedInvestment && (() => {
              const totalReturned = parseFloat(completionForm.finalProfit) || 0;
              const capital = selectedInvestment.allocated_amount || 0;
              const netProfit = totalReturned - capital;
              const newRemaining = remainingMoney + totalReturned;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ background: netProfit >= 0 ? '#F0FDF4' : '#FEF2F2', padding: '1rem', borderRadius: '14px', border: `1px solid ${netProfit >= 0 ? '#BBF7D0' : '#FECACA'}` }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Calculated Net Profit</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: netProfit >= 0 ? '#16A34A' : '#DC2626' }}>
                      {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)}
                    </div>
                  </div>

                  <div style={{ background: '#FFFDF5', padding: '1rem', borderRadius: '14px', border: '1px solid #FDE68A', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>
                      🟡 Effect on Remaining Money:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#475569' }}>Current Remaining Money:</span>
                      <strong style={{ color: '#D97706' }}>{formatCurrency(remainingMoney)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                      <span style={{ color: '#475569' }}>Total Returned (Capital + Profit):</span>
                      <strong style={{ color: '#16A34A' }}>+{formatCurrency(totalReturned)}</strong>
                    </div>
                    <div style={{ borderTop: '1px solid #FDE68A', paddingTop: '0.45rem', display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 800 }}>
                      <span style={{ color: '#92400E' }}>New Remaining Money:</span>
                      <strong style={{ color: '#D97706', fontSize: '1.25rem' }}>{formatCurrency(newRemaining)}</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: 600, marginTop: '0.2rem' }}>
                      ✓ {formatCurrency(remainingMoney)} + {formatCurrency(totalReturned)} = {formatCurrency(newRemaining)}
                    </div>
                  </div>
                </div>
              );
            })()}

            <button
              onClick={handleCompleteInvestment}
              style={{ width: '100%', padding: '1.1rem', borderRadius: '16px', background: '#2563EB', color: 'white', border: 'none', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.4)' }}
            >
              Record Return & Complete
            </button>
          </div>
        </Modal>
      )}
      {showProfitModal && (
        <Modal title="Profit History" onClose={() => setShowProfitModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>Detailed record of profits earned from completed projects.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {investments.filter(i => i.status === 'completed').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9CA3AF' }}>No completed projects yet.</div>
              ) : (
                investments.filter(i => i.status === 'completed').map(inv => (
                  <div key={inv.id} style={{ background: '#F0FDF4', padding: '1.25rem', borderRadius: '20px', border: '1px solid #BBF7D0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: '1.05rem' }}>{inv.project_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '0.2rem' }}>Completed on {new Date(inv.completed_at).toLocaleDateString()}</div>
                      </div>
                      <Badge label="Profit" type="success" size="small" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'white', padding: '1rem', borderRadius: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Expense</div>
                        <div style={{ fontWeight: 700, color: '#374151' }}>{formatCurrency(inv.allocated_amount)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Net Profit</div>
                        <div style={{ fontWeight: 700, color: '#16A34A', fontSize: '1.1rem' }}>+{formatCurrency(getActualProfit(inv))}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '1rem', padding: '1.25rem', background: '#16A34A10', borderRadius: '20px', border: '1px dashed #16A34A', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Total realized Profit</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16A34A' }}>{formatCurrency(totalProfitsEarned)}</div>
            </div>
          </div>
        </Modal>
      )}
      {showDebtModal && (
        <Modal title="Members Behind" onClose={() => setShowDebtModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {debtMembers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ width: '64px', height: '64px', background: '#F0FDF4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#16A34A' }}>
                  <CheckCircle size={32} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>No member behind!</h3>
                <p style={{ color: '#6B7280', margin: 0, fontSize: '0.95rem' }}>Everything is perfect. Every single friend has contributed their fair share and there is zero outstanding debt.</p>
              </div>
            ) : (
              <>
                <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>The following members have a negative balance:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {debtMembers.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#FFF1F2', borderRadius: '16px', border: '1px solid #FECDD3', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <Avatar name={m.name} size="40px" />
                        <div>
                          <div style={{ fontWeight: 700, color: '#991B1B' }}>{m.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Saved: <span style={{ color: '#16A34A', fontWeight: 700 }}>{formatCurrency(m.total_paid)}</span></div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Debt</div>
                        <div style={{ fontWeight: 700, color: '#DC2626', fontSize: '1.1rem' }}>{formatCurrency(m.currentDebt)}</div>
                        <button
                          onClick={() => { setSelectedMember(m); setActiveView('member-detail'); setShowDebtModal(false); }}
                          style={{ background: 'none', border: 'none', color: '#3B82F6', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', padding: 0, marginTop: '0.25rem' }}
                        >
                          Go to profile →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setShowDebtModal(false)} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: debtMembers.length === 0 ? '#16A34A' : '#DC2626', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Close List</button>
          </div>
        </Modal>
      )}
      {showWealthModal && (
        <Modal title="Financial Overview" onClose={() => setShowWealthModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* 1. Remaining Money */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#FFFBEB', borderRadius: '18px', border: '1px solid #FDE68A' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#B45309', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                    <span>🟡</span> Remaining Money
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#92400E', marginTop: '0.25rem' }}>
                    Available physically in cash or bank account ready to deploy
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: '#B45309', fontSize: '1.25rem', textAlign: 'right' }}>
                  {formatCurrency(remainingMoney)}
                </div>
              </div>

              {/* 2. Money at Work */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#EFF6FF', borderRadius: '18px', border: '1px solid #BFDBFE' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#1D4ED8', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                    <span>🔵</span> Money at Work
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#1E40AF', marginTop: '0.25rem' }}>
                    Currently deployed in active investments & projects
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: '#1D4ED8', fontSize: '1.25rem', textAlign: 'right' }}>
                  {formatCurrency(moneyAtWork)}
                </div>
              </div>

              {/* 3. Total Saving */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#F0FDF4', borderRadius: '18px', border: '1px solid #BBF7D0' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#15803D', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                    <span>🟢</span> Total Saving
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#166534', marginTop: '0.25rem' }}>
                    Cumulative historical contributions of all members (never decreases)
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: '#16A34A', fontSize: '1.25rem', textAlign: 'right' }}>
                  {formatCurrency(totalSaving)}
                </div>
              </div>

              {completedProfits > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.25rem', background: '#FAF5FF', borderRadius: '18px', border: '1px solid #E9D5FF' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#6B21A8' }}>✨ Completed Business Profits</div>
                    <div style={{ fontSize: '0.75rem', color: '#7E22CE' }}>Extra earnings tracked separately & added into Remaining Money</div>
                  </div>
                  <div style={{ fontWeight: 800, color: '#6B21A8', fontSize: '1.15rem' }}>+{formatCurrency(completedProfits)}</div>
                </div>
              )}
            </div>

            <div style={{ padding: '1.25rem', background: '#F8FAFC', borderRadius: '18px', border: '1px dashed #CBD5E1', fontSize: '0.85rem', color: '#475569', lineHeight: 1.6 }}>
              <strong style={{ color: '#0F172A' }}>The Three Views & Money Flow:</strong>
              <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0 }}>
                <li><strong>🟢 Total Saving:</strong> Historical cumulative record of all contributions made since day one. It never decreases when money is invested or spent.</li>
                <li><strong>🟡 Remaining Money:</strong> Money currently available in cash or bank ready to use for an investment or expense.</li>
                <li><strong>🔵 Money at Work:</strong> Money taken from Remaining Money and put into an active investment. When returned with profit, Remaining Money increases while Total Saving stays constant.</li>
              </ul>
            </div>

            <button onClick={() => setShowWealthModal(false)} style={{ width: '100%', padding: '1.1rem', borderRadius: '16px', background: '#0F172A', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>Got it</button>
          </div>
        </Modal>
      )}
      {showActiveInvestmentsModal && (
        <Modal title="Active Working Capital" onClose={() => setShowActiveInvestmentsModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>The following businesses are currently using group capital:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {investments.filter(i => i.status === 'active').map((inv, idx) => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#F5F3FF', borderRadius: '16px', border: '1px solid #DDD6FE', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'white', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #DDD6FE' }}>
                      <Briefcase size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#4C1D95' }}>{inv.project_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6D28D9' }}>Started {new Date(inv.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#7C3AED', fontSize: '1.1rem' }}>{formatCurrency(inv.allocated_amount)}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Total Currently Out: </span>
              <span style={{ fontSize: '1rem', color: '#8B5CF6', fontWeight: 700 }}>{formatCurrency(totalActiveCapital)}</span>
            </div>

            <button onClick={() => setShowActiveInvestmentsModal(false)} style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: '#8B5CF6', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Close List</button>
          </div>
        </Modal>
      )}

      {/* Cash In / Cash Out Modal Screen (Matching Uploaded Design) */}
      {showCashEntryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem', overflowY: 'auto' }}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 25 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: '#F8FAFC',
              width: '100%',
              maxWidth: '460px',
              maxHeight: 'min(90vh, 700px)',
              borderRadius: '28px',
              overflow: 'hidden',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #E2E8F0',
              margin: 'auto'
            }}
          >
            {/* Top Blue Header Bar - Always Visible */}
            <div style={{
              background: '#0284C7',
              color: 'white',
              padding: '1.15rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.2)',
              flexShrink: 0
            }}>
              <button
                onClick={() => setShowCashEntryModal(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem' }}
                title="Close / Back"
              >
                <ArrowLeft size={24} />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '0.5px' }}>
                {cashMode}
              </h2>
            </div>

            {/* Form Body - Smoothly Scrollable */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem', overflowY: 'auto', flex: 1 }}>

              {/* Cash In / Cash Out Mode Selector Pills */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setCashMode('Cash In')}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '50px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    background: cashMode === 'Cash In' ? '#16A34A' : '#E2E8F0',
                    color: cashMode === 'Cash In' ? 'white' : '#475569',
                    transition: 'all 0.2s ease',
                    boxShadow: cashMode === 'Cash In' ? '0 4px 12px rgba(22, 163, 74, 0.3)' : 'none'
                  }}
                >
                  Cash In
                </button>
                <button
                  type="button"
                  onClick={() => setCashMode('Cash Out')}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '50px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    background: cashMode === 'Cash Out' ? '#EF4444' : '#E2E8F0',
                    color: cashMode === 'Cash Out' ? 'white' : '#475569',
                    transition: 'all 0.2s ease',
                    boxShadow: cashMode === 'Cash Out' ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none'
                  }}
                >
                  Cash Out
                </button>
              </div>

              {/* Member/Friend Selection Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.5px' }}>
                  Select Friend / Member
                </label>
                <select
                  value={cashMemberId}
                  onChange={(e) => setCashMemberId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.9rem 1rem',
                    borderRadius: '16px',
                    border: '1.5px solid #CBD5E1',
                    background: 'white',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#0F172A',
                    outline: 'none'
                  }}
                >
                  <option value="">-- Choose Member --</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Date and Time Selector Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.75rem' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '16px',
                  padding: '0.75rem 1rem',
                  background: 'white'
                }}>
                  <Calendar size={18} color="#0284C7" />
                  <input
                    type="date"
                    value={cashDate}
                    onChange={(e) => setCashDate(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', width: '100%' }}
                  />
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '16px',
                  padding: '0.75rem 1rem',
                  background: 'white'
                }}>
                  <Clock size={18} color="#0284C7" />
                  <input
                    type="time"
                    value={cashTime}
                    onChange={(e) => setCashTime(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', width: '100%' }}
                  />
                </div>
              </div>

              {/* Amount Input Field with Inset Label */}
              <div style={{
                position: 'relative',
                border: `1.5px solid ${cashMode === 'Cash Out' ? '#FCA5A5' : '#86EFAC'}`,
                borderRadius: '16px',
                padding: '0.85rem 1rem',
                background: 'white'
              }}>
                <label style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '14px',
                  background: 'white',
                  padding: '0 6px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: cashMode === 'Cash Out' ? '#EF4444' : '#16A34A'
                }}>
                  {cashMode} Amount (ETB)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', width: '80%' }}
                  />
                  <Calculator size={22} color="#0284C7" />
                </div>
              </div>

              {/* Quick Consecutive Saturday Presets for Cash In */}
              {cashMode === 'Cash In' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    🗓️ Store Savings for Consecutive Saturdays:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                    {[
                      { label: '1 Sat', amount: weeklyRate },
                      { label: '2 Sats', amount: weeklyRate * 2 },
                      { label: '4 Sats (1 Mo)', amount: weeklyRate * 4 },
                      { label: '8 Sats (2 Mo)', amount: weeklyRate * 8 },
                    ].map(preset => (
                      <button
                        key={preset.amount}
                        type="button"
                        onClick={() => setCashAmount(preset.amount)}
                        style={{
                          padding: '0.55rem 0.2rem',
                          borderRadius: '12px',
                          border: String(cashAmount) === String(preset.amount) ? '1.5px solid #16A34A' : '1px solid #CBD5E1',
                          background: String(cashAmount) === String(preset.amount) ? '#F0FDF4' : 'white',
                          color: String(cashAmount) === String(preset.amount) ? '#16A34A' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Helper Banner for Consecutive Saturdays covered */}
              {cashMode === 'Cash In' && parseFloat(cashAmount) >= weeklyRate && (() => {
                const totalSats = Math.floor(parseFloat(cashAmount) / weeklyRate);
                const remainingNextSats = Math.max(0, totalSats - 1);
                const remainingAdvanceAmt = remainingNextSats * weeklyRate;
                return (
                  <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', padding: '0.75rem 1rem', borderRadius: '14px', color: '#0369A1', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>🗓️</span>
                    <div>
                      <strong>Saturday Breakdown:</strong> {formatCurrency(cashAmount)} total —{' '}
                      <strong style={{ color: '#0284C7' }}>{formatCurrency(weeklyRate)} for Today</strong>
                      {remainingNextSats > 0 ? (
                        <> + <strong style={{ color: '#16A34A' }}>remaining {formatCurrency(remainingAdvanceAmt)} saved in STORED ADVANCE SAVINGS</strong> ({remainingNextSats} future Sat{remainingNextSats > 1 ? 's' : ''})!</>
                      ) : (
                        <> (up to date for today)!</>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Notes Input Field */}
              <div style={{
                position: 'relative',
                border: '1.5px solid #CBD5E1',
                borderRadius: '16px',
                padding: '0.85rem 1rem',
                background: 'white'
              }}>
                <label style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '14px',
                  background: 'white',
                  padding: '0 6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#64748B'
                }}>
                  Notes
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <input
                    type="text"
                    placeholder="Add payment notes or description..."
                    value={cashNotes}
                    onChange={(e) => setCashNotes(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.95rem', fontWeight: 600, color: '#0F172A', width: '85%' }}
                  />
                  <FileText size={20} color="#94A3B8" />
                </div>
              </div>

            </div>

            {/* Bottom Action Footer */}
            <div style={{
              padding: '1.1rem 1.5rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.85rem',
              background: '#F1F5F9',
              borderTop: '1px solid #E2E8F0',
              flexShrink: 0
            }}>
              <button
                type="button"
                onClick={() => setShowCashEntryModal(false)}
                style={{
                  padding: '0.95rem',
                  borderRadius: '16px',
                  border: 'none',
                  background: '#BAE6FD',
                  color: '#0369A1',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(186, 230, 253, 0.5)'
                }}
              >
                Exit
              </button>
              <button
                type="button"
                onClick={() => handleSaveCashEntry(false)}
                style={{
                  padding: '0.95rem',
                  borderRadius: '16px',
                  border: 'none',
                  background: '#0284C7',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
                }}
              >
                Save and continue
              </button>
            </div>

          </motion.div>
        </div>
      )}

      {/* Super Admin Reset Cycle Modal */}
      {/* Super Admin Reset Cycle Modal */}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem', overflowY: 'auto' }}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: 'white',
              width: '100%',
              maxWidth: '520px',
              maxHeight: 'min(90vh, 680px)',
              borderRadius: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              margin: 'auto'
            }}
          >
            {/* Header Pinned at Top - Always 100% Visible */}
            <div style={{ background: '#DC2626', color: 'white', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Start New Savings Cycle</h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                title="Close Modal"
                style={{ background: 'rgba(255, 255, 255, 0.25)', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, transition: 'background 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
              >
                ×
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.85rem 1rem', borderRadius: '14px', color: '#991B1B', fontSize: '0.85rem', lineHeight: 1.5 }}>
                ⚠️ <strong>Archive & Reset Action:</strong> This action will archive all current member balances, total savings, and transaction history into <strong>Cycle History</strong>, then reset active savings to <strong>ETB 0.00</strong> to start a fresh cycle.
              </div>

              {/* Wealth Summary Cards */}
              <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Snapshot to be Archived:</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>Remaining Money:</span>
                  <strong style={{ color: '#D97706' }}>{formatCurrency(remainingMoney)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>Money at Work:</span>
                  <strong style={{ color: '#2563EB' }}>{formatCurrency(moneyAtWork)}</strong>
                </div>
                <div style={{ borderTop: '1px solid #CBD5E1', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 800 }}>
                  <span style={{ color: '#0F172A' }}>Total Saving (Cumulative):</span>
                  <strong style={{ color: '#16A34A' }}>{formatCurrency(totalSaving)}</strong>
                </div>
              </div>

              {/* Individual Member Savings Snapshot Preview */}
              <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0', maxHeight: '140px', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '0.4rem' }}>👤 Individual Member Savings To Archive:</div>
                {members && members.length > 0 ? (
                  members.map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #E2E8F0', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{m.name}</span>
                      <strong style={{ color: '#16A34A' }}>{formatCurrency(m.total_paid || 0)}</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>No member savings recorded</div>
                )}
              </div>

              {/* Cycle Title Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Cycle Name / Title (Optional)</label>
                <input
                  type="text"
                  placeholder={`e.g. Cycle 1 (${new Date().getFullYear()})`}
                  value={resetCycleName}
                  onChange={(e) => setResetCycleName(e.target.value)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Action Buttons Pinned at Bottom - Always 100% Visible */}
            <div style={{ padding: '1rem 1.5rem', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                style={{
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: '1.5px solid #CBD5E1',
                  background: 'white',
                  color: '#475569',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetCycle}
                style={{
                  padding: '0.85rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#DC2626',
                  color: 'white',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                }}
              >
                Archive & Start Scratch
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Cycle History Viewer Modal */}
      {showCycleHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: '#F8FAFC',
              width: '100%',
              maxWidth: '650px',
              maxHeight: '85vh',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #E2E8F0'
            }}
          >
            <div style={{ background: '#0284C7', color: 'white', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>📜 Archived Savings Cycles</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {isSuperAdmin && cycles.length > 0 && !selectedCycleSnapshot && (
                  <button
                    onClick={handleClearAllCycles}
                    style={{
                      background: '#EF4444',
                      color: 'white',
                      border: 'none',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    🗑️ Clear All
                  </button>
                )}
                <button onClick={() => { setShowCycleHistoryModal(false); setSelectedCycleSnapshot(null); }} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              {cycles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748B' }}>
                  <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem' }}>No archived cycles yet</p>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>When a Super Admin starts a new cycle from scratch, all previous wealth totals and member records will be safely stored here.</p>
                </div>
              ) : selectedCycleSnapshot ? (
                /* Snapshot Details View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      onClick={() => setSelectedCycleSnapshot(null)}
                      style={{ background: 'none', border: 'none', color: '#0284C7', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ← Back to Cycles List
                    </button>
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDeleteCycle(selectedCycleSnapshot.id, selectedCycleSnapshot.cycle_name)}
                        style={{
                          background: '#FEF2F2',
                          border: '1.5px solid #FCA5A5',
                          color: '#DC2626',
                          padding: '0.4rem 0.85rem',
                          borderRadius: '10px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete This Archive
                      </button>
                    )}
                  </div>

                  <div style={{ background: 'white', padding: '1.25rem', borderRadius: '18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>{selectedCycleSnapshot.cycle_name}</h4>
                    <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Archived on {new Date(selectedCycleSnapshot.created_at).toLocaleString()} by {selectedCycleSnapshot.archived_by}</span>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '0.75rem', background: '#F1F5F9', padding: '1rem', borderRadius: '14px' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>CASH IN HAND</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0284C7' }}>{formatCurrency(selectedCycleSnapshot.cash_in_hand)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>MONEY AT WORK</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#7C3AED' }}>{formatCurrency(selectedCycleSnapshot.money_at_work)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>TOTAL WEALTH</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#16A34A' }}>{formatCurrency(selectedCycleSnapshot.total_wealth)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Member Individual Savings Breakdown at archiving time */}
                  {selectedCycleSnapshot.snapshot && selectedCycleSnapshot.snapshot.members && (
                    <div style={{ background: 'white', padding: '1.25rem', borderRadius: '18px', border: '1px solid #E2E8F0' }}>
                      <h5 style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', color: '#0F172A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        👤 Individual Member Savings Breakdown
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {selectedCycleSnapshot.snapshot.members.map(m => {
                          const paid = m.total_paid !== undefined ? m.total_paid : (
                            (selectedCycleSnapshot.snapshot.history || [])
                              .filter(t => String(t.member_id) === String(m.id) && t.type === 'payment')
                              .reduce((acc, t) => acc + parseFloat(t.amount || 0), 0)
                          );
                          const totalCyclePaid = selectedCycleSnapshot.snapshot.members.reduce((sum, mem) => {
                            const p = mem.total_paid !== undefined ? mem.total_paid : (
                              (selectedCycleSnapshot.snapshot.history || [])
                                .filter(t => String(t.member_id) === String(mem.id) && t.type === 'payment')
                                .reduce((acc, t) => acc + parseFloat(t.amount || 0), 0)
                            );
                            return sum + p;
                          }, 0);
                          const pct = totalCyclePaid > 0 ? ((paid / totalCyclePaid) * 100).toFixed(1) : 0;

                          return (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: '14px', border: '1px solid #F1F5F9' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#E0F2FE', color: '#0284C7', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem' }}>
                                  {m.name ? m.name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.95rem' }}>{m.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Pool Share: {pct}%</div>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 800, color: '#16A34A', fontSize: '1.05rem' }}>
                                  {formatCurrency(paid)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Saved</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Working Capital & Investments Archived in this Cycle */}
                  {selectedCycleSnapshot.snapshot && selectedCycleSnapshot.snapshot.investments && selectedCycleSnapshot.snapshot.investments.length > 0 && (
                    <div style={{ background: 'white', padding: '1.25rem', borderRadius: '18px', border: '1px solid #E2E8F0' }}>
                      <h5 style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', color: '#0F172A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        💼 Archived Working Capital & Projects ({selectedCycleSnapshot.snapshot.investments.length})
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {selectedCycleSnapshot.snapshot.investments.map((inv, idx) => (
                          <div key={inv.id || idx} style={{ padding: '0.85rem 1rem', background: '#F8FAFC', borderRadius: '14px', border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem' }}>{inv.project_name}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '8px', background: inv.status === 'completed' ? '#DCFCE7' : '#FEF3C7', color: inv.status === 'completed' ? '#15803D' : '#D97706' }}>
                                {inv.status ? inv.status.toUpperCase() : 'ARCHIVED'}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                              <div>
                                <span style={{ color: '#64748B', fontSize: '0.75rem' }}>Capital Invested:</span>{' '}
                                <strong style={{ color: '#0284C7' }}>{formatCurrency(inv.allocated_amount)}</strong>
                              </div>
                              <div>
                                <span style={{ color: '#64748B', fontSize: '0.75rem' }}>Projected/Profit:</span>{' '}
                                <strong style={{ color: '#16A34A' }}>{formatCurrency(inv.projected_profit || 0)}</strong>
                              </div>
                            </div>
                            {inv.challenges && (
                              <div style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                                Notes: {inv.challenges}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transaction History Archived in this Cycle */}
                  {selectedCycleSnapshot.snapshot && selectedCycleSnapshot.snapshot.history && selectedCycleSnapshot.snapshot.history.length > 0 && (
                    <div style={{ background: 'white', padding: '1.25rem', borderRadius: '18px', border: '1px solid #E2E8F0' }}>
                      <h5 style={{ margin: '0 0 0.85rem', fontSize: '0.9rem', color: '#0F172A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        📜 Archived Transaction History ({selectedCycleSnapshot.snapshot.history.length} records)
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                        {selectedCycleSnapshot.snapshot.history.map((tx, idx) => (
                          <div key={tx.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '0.85rem' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{tx.member_name || 'Member'}</div>
                              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                {new Date(tx.created_at).toLocaleString()} • {tx.type === 'payment' ? 'Cash In' : 'Cash Out/Missed'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: tx.type === 'payment' ? '#16A34A' : '#DC2626' }}>
                                {tx.type === 'payment' ? '+' : '-'}{formatCurrency(tx.amount)}
                              </div>
                              {tx.notes && <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{tx.notes}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Cycle Cards List */
                cycles.map(c => (
                  <div key={c.id} style={{ background: 'white', padding: '1.25rem', borderRadius: '18px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>{c.cycle_name}</h4>
                      <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                        Archived by <strong>{c.archived_by}</strong> on {new Date(c.created_at).toLocaleDateString()}
                      </div>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#16A34A' }}>
                        Total Wealth Saved: {formatCurrency(c.total_wealth)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        onClick={() => setSelectedCycleSnapshot(c)}
                        style={{
                          padding: '0.6rem 1rem',
                          borderRadius: '12px',
                          border: '1.5px solid #0284C7',
                          background: '#F0F9FF',
                          color: '#0284C7',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        View Details →
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => handleDeleteCycle(c.id, c.cycle_name)}
                          title="Delete archived cycle"
                          style={{
                            padding: '0.6rem 0.75rem',
                            borderRadius: '12px',
                            border: '1.5px solid #FCA5A5',
                            background: '#FEF2F2',
                            color: '#DC2626',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', background: '#F1F5F9', borderTop: '1px solid #E2E8F0', textAlign: 'right' }}>
              <button onClick={() => { setShowCycleHistoryModal(false); setSelectedCycleSnapshot(null); }} style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', background: '#0284C7', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Close History</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmation.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              background: 'white',
              borderRadius: '24px',
              padding: '2rem',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div style={{ width: '56px', height: '56px', background: '#DCFCE7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#16A34A' }}>
              <AlertCircle size={28} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0F172A' }}>{confirmation.title}</h3>
            <p style={{ color: '#64748B', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.5rem' }}>{confirmation.message}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                onClick={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                style={{ padding: '0.85rem', borderRadius: '14px', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer' }}
              >
                {confirmation.cancelText || 'No'}
              </button>
              <button
                onClick={() => {
                  if (confirmation.onConfirm) confirmation.onConfirm();
                }}
                style={{ padding: '0.85rem', borderRadius: '14px', border: 'none', background: '#16A34A', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
              >
                {confirmation.confirmText || 'Yes'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Success Modal */}
      {successModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: '1rem' }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            style={{
              background: 'white',
              borderRadius: '24px',
              padding: '2rem 1.75rem',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div style={{ width: '64px', height: '64px', background: '#DCFCE7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', color: '#16A34A' }}>
              <CheckCircle size={36} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0F172A' }}>Success! 🎉</h3>
            <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.5, margin: '0 0 1.75rem' }}>{successModal.message}</p>
            <button
              onClick={() => setSuccessModal({ isOpen: false, message: '' })}
              style={{
                width: '100%',
                padding: '0.9rem',
                borderRadius: '16px',
                border: 'none',
                background: '#0284C7',
                color: 'white',
                fontWeight: 800,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
              }}
            >
              Awesome, Got it!
            </button>
          </motion.div>
        </div>
      )}

      {/* 3-Step Transaction Deletion Confirmation Modal */}
      {deleteModalState.isOpen && deleteModalState.transaction && (() => {
        const tx = deleteModalState.transaction;
        const isPayment = tx.type === 'payment';
        const member = members.find(m => String(m.id) === String(tx.member_id));
        const memberName = tx.member_name || (member ? member.name : null) || 'Member';
        const txTypeLabel = isPayment ? 'Cash In (Payment)' : 'Cash Out (Missed)';
        const formattedAmt = formatCurrency(tx.amount);

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            padding: '1rem',
            overflowY: 'auto'
          }}>
            <motion.div
              key={`delete-step-${deleteModalState.step}`}
              initial={{ scale: 0.94, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              style={{
                background: 'white',
                width: '100%',
                maxWidth: '490px',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(220, 38, 38, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                margin: 'auto',
                border: '1.5px solid #FCA5A5'
              }}
            >
              {/* Step Progress Header */}
              <div style={{
                background: '#DC2626',
                color: 'white',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>🗑️</span>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                      Delete {txTypeLabel}
                    </h3>
                  </div>
                  <button
                    onClick={() => setDeleteModalState({ isOpen: false, step: 1, transaction: null })}
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      border: 'none',
                      color: 'white',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* 3-Step Indicator Bar */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {[1, 2, 3].map(stepNum => (
                    <div
                      key={stepNum}
                      style={{
                        flex: 1,
                        height: '6px',
                        borderRadius: '3px',
                        background: stepNum <= deleteModalState.step ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)',
                        transition: 'background 0.3s ease'
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FEE2E2', display: 'flex', justifyContent: 'space-between' }}>
                  <span>STEP {deleteModalState.step} OF 3</span>
                  <span>
                    {deleteModalState.step === 1 && '1. Verify Transaction'}
                    {deleteModalState.step === 2 && '2. Financial Impact'}
                    {deleteModalState.step === 3 && '3. Final Purge Authorization'}
                  </span>
                </div>
              </div>

              {/* Modal Body Based on Step */}
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {deleteModalState.step === 1 && (
                  <>
                    <div style={{ background: '#FEF2F2', padding: '1rem', borderRadius: '16px', border: '1px solid #FECDD3' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#991B1B', lineHeight: 1.5 }}>
                        Did you mistakenly or suddenly add this payment? Please review the recorded transaction details before proceeding.
                      </p>
                    </div>

                    {/* Transaction Summary Card */}
                    <div style={{ background: '#F8FAFC', padding: '1.2rem', borderRadius: '18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Friend / Member:</span>
                        <strong style={{ fontSize: '1rem', color: '#0F172A' }}>{memberName}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Type:</span>
                        <span style={{
                          padding: '0.2rem 0.6rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          background: isPayment ? '#DCFCE7' : '#FEE2E2',
                          color: isPayment ? '#15803D' : '#B91C1C'
                        }}>
                          {txTypeLabel}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Amount:</span>
                        <strong style={{ fontSize: '1.2rem', color: isPayment ? '#16A34A' : '#DC2626' }}>
                          {isPayment ? '+' : '-'}{formattedAmt}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>Date Recorded:</span>
                        <span style={{ fontSize: '0.85rem', color: '#334155' }}>
                          {new Date(tx.created_at).toLocaleString()}
                        </span>
                      </div>
                      {tx.notes && (
                        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', fontSize: '0.85rem', color: '#475569' }}>
                          📝 <strong>Notes:</strong> {tx.notes}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setDeleteModalState({ isOpen: false, step: 1, transaction: null })}
                        style={{
                          padding: '0.9rem',
                          borderRadius: '14px',
                          border: '1.5px solid #CBD5E1',
                          background: 'white',
                          color: '#475569',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalState(prev => ({ ...prev, step: 2 }))}
                        style={{
                          padding: '0.9rem',
                          borderRadius: '14px',
                          border: 'none',
                          background: '#DC2626',
                          color: 'white',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                        }}
                      >
                        Step 2: Check Impact →
                      </button>
                    </div>
                  </>
                )}

                {deleteModalState.step === 2 && (
                  <>
                    <div style={{ background: '#FFFBEB', padding: '1.1rem', borderRadius: '16px', border: '1.5px solid #FDE68A' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: '#B45309', marginBottom: '0.4rem', fontSize: '0.95rem' }}>
                        <span>🚨</span> Financial Ledger Impact Notice
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400E', lineHeight: 1.5 }}>
                        Deleting this record will immediately reverse the ledger calculations across the entire system.
                      </p>
                    </div>

                    {/* Impact Breakdown */}
                    <div style={{ background: '#F8FAFC', padding: '1.2rem', borderRadius: '18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                        Automatic Ledger Adjustments:
                      </div>
                      {isPayment ? (
                        <>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.88rem', color: '#991B1B' }}>
                            <span>🔻</span>
                            <div>
                              <strong>Deduct {formattedAmt} from Group Remaining Money:</strong>
                              <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Total savings pool will decrease by {formattedAmt}.</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.88rem', color: '#991B1B' }}>
                            <span>🔻</span>
                            <div>
                              <strong>Deduct {formattedAmt} from {memberName}'s Saved Total:</strong>
                              <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{memberName}'s verified paid balance will decrease by {formattedAmt}.</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.88rem', color: '#D97706' }}>
                            <span>🔺</span>
                            <div>
                              <strong>Increase {memberName}'s Missed Debt:</strong>
                              <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{memberName} will now owe {formattedAmt} more in missed contributions.</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.88rem', color: '#15803D' }}>
                          <span>✅</span>
                          <div>
                            <strong>Clear Missed Debt of {formattedAmt}:</strong>
                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{memberName}'s outstanding missed debt will decrease by {formattedAmt}.</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setDeleteModalState(prev => ({ ...prev, step: 1 }))}
                        style={{
                          padding: '0.9rem',
                          borderRadius: '14px',
                          border: '1.5px solid #CBD5E1',
                          background: 'white',
                          color: '#475569',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        ← Back to Step 1
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalState(prev => ({ ...prev, step: 3 }))}
                        style={{
                          padding: '0.9rem',
                          borderRadius: '14px',
                          border: 'none',
                          background: '#B91C1C',
                          color: 'white',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(185, 28, 28, 0.35)'
                        }}
                      >
                        Step 3: Final Step →
                      </button>
                    </div>
                  </>
                )}

                {deleteModalState.step === 3 && (
                  <>
                    <div style={{ background: '#7F1D1D', color: 'white', padding: '1.25rem', borderRadius: '18px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ fontSize: '2rem' }}>⚠️</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.5px' }}>
                        FINAL IRREVERSIBLE CONFIRMATION
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#FECDD3', lineHeight: 1.5 }}>
                        This is the 3rd and final step. Once deleted, this {txTypeLabel} of <strong>{formattedAmt}</strong> for <strong>{memberName}</strong> will be permanently purged.
                      </p>
                    </div>

                    <div style={{ background: '#FEF2F2', padding: '1rem', borderRadius: '16px', border: '1px dashed #EF4444', textAlign: 'center', fontSize: '0.85rem', color: '#991B1B', fontWeight: 700 }}>
                      🔒 Are you 100% sure you want to permanently delete this transaction?
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setDeleteModalState(prev => ({ ...prev, step: 2 }))}
                        style={{
                          padding: '0.95rem',
                          borderRadius: '14px',
                          border: '1.5px solid #CBD5E1',
                          background: 'white',
                          color: '#475569',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        ← Back to Step 2
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('token');
                            await axios.delete(`${API_BASE}/api/savings/transactions/${tx.id}`, {
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            setDeleteModalState({ isOpen: false, step: 1, transaction: null });
                            await fetchAllData();
                            showSuccess(`Transaction Deleted Successfully! 🎉\n\nThe ${txTypeLabel} of ${formattedAmt} for ${memberName} was permanently removed, and all financial totals and member balances were updated.`);
                          } catch (err) {
                            showToast(err.response?.data?.error || 'Error deleting transaction');
                          }
                        }}
                        style={{
                          padding: '0.95rem',
                          borderRadius: '14px',
                          border: 'none',
                          background: '#991B1B',
                          color: 'white',
                          fontWeight: 900,
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          boxShadow: '0 6px 16px rgba(153, 27, 27, 0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <span>🗑️</span> Confirm & Delete Now
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: '#0F172A', color: 'white', padding: '0.9rem 1.5rem', borderRadius: '16px', zIndex: 10002, fontWeight: 700, boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🔔</span> {toastMessage}
        </div>
      )}
    </div>
  );
};

// Sub-components
const StatCard = ({ label, value, subValue, color, badge, bgGradient, borderColor, icon: Icon, iconBg, onClick }) => {
  const isLong = value?.toString().length > 13;
  return (
    <div
      onClick={onClick}
      style={{
        background: bgGradient || 'white',
        padding: '1.25rem 1rem',
        borderRadius: '20px',
        border: `1px solid ${borderColor || '#F1F5F9'}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '130px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
        position: 'relative',
        overflow: 'hidden'
      }}
      onMouseOver={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-3px)';
          e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.06)';
        }
      }}
      onMouseOut={e => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.03)';
        }
      }}
    >
      <div>
        {Icon && (
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: iconBg || `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, marginBottom: '0.6rem' }}>
            <Icon size={18} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {label}
          </div>
          {badge && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '100px', background: `${color}18`, color: color }}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <div>
        <div style={{ fontSize: isLong ? '1.25rem' : '1.45rem', fontWeight: 800, color, lineHeight: 1.15, wordBreak: 'break-word', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
          {value}
        </div>
        {subValue && (
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.35rem', fontWeight: 600, whiteSpace: 'pre-line' }}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
};
const Section = ({ title, onAction, actionLabel, icon: Icon, children }) => (
  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {Icon && <Icon size={18} color="#1E293B" />}
        <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#1E293B', fontWeight: 800, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
      </div>
      {onAction && <button onClick={onAction} style={{ background: 'none', border: 'none', color: '#16A34A', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>{actionLabel}</button>}
    </div>
    {children}
  </div>
);
const MemberListItem = ({ member, index, onClick, formatCurrency }) => {
  const hasAdvance = (member.advanceBalance || 0) > 0;
  const isDebt = (member.currentDebt || 0) > 0;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '1rem 0',
        borderTop: index === 0 ? 'none' : '1px solid #F3F4F6',
        cursor: 'pointer',
        alignItems: 'center'
      }}
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Avatar name={member.name} index={index} />
        <div>
          <div style={{ fontWeight: 700 }}>{member.name}</div>
          <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>paid {formatCurrency(member.total_paid)}</div>
        </div>
      </div>
      {hasAdvance ? (
        <div style={{ fontWeight: 700, color: '#F59E0B' }}>
          +{formatCurrency(member.advanceBalance)}
        </div>
      ) : isDebt ? (
        <div style={{ fontWeight: 700, color: '#DC2626' }}>
          -{formatCurrency(member.currentDebt)}
        </div>
      ) : null}
    </div>
  );
};

const MemberCard = ({ member, onClick, formatCurrency }) => {
  const isAdvance = (member.advanceBalance || 0) > 0;
  const advanceAmount = member.advanceBalance || 0;
  const advanceWeeks = member.advanceWeeks || Math.floor(advanceAmount / 300);
  const isDebt = member.currentDebt > 0;

  return (
    <div onClick={onClick} style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: '24px', padding: '1.5rem', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: '1 1 250px' }}>
        <Avatar name={member.name} size="56px" />
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{member.name}</div>
          <div style={{ fontSize: '0.9rem', color: '#6B7280' }}>Joined Since {new Date(member.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            {member.role === 'super_admin' && <Badge label="Super Admin" type="info" />}
            {member.role === 'admin' && <Badge label="Admin" type="info" />}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flex: '2 1 300px', justifyContent: 'space-around', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#6B7280', fontWeight: 700 }}>Total Paid</div>
          <div style={{ fontWeight: 700, color: '#16A34A', marginTop: '0.25rem' }}>{formatCurrency(member.total_paid)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#6B7280', fontWeight: 700 }}>Status / Debt</div>
          <div style={{ fontWeight: 700, color: isDebt ? '#DC2626' : '#16A34A', marginTop: '0.25rem' }}>
            {isDebt ? formatCurrency(member.currentDebt) : formatCurrency(0)}
          </div>
          {!isDebt && <div style={{ fontSize: '0.65rem', color: '#16A34A', fontWeight: 600, marginTop: '0.15rem' }}>Up to date ✓</div>}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#0284C7', fontWeight: 700 }}>Stored Advance Savings</div>
          <div style={{ fontWeight: 800, color: isAdvance ? '#0284C7' : '#64748B', marginTop: '0.25rem' }}>
            {formatCurrency(advanceAmount)}
          </div>
          {isAdvance ? (
            <div style={{ fontSize: '0.65rem', color: '#0284C7', fontWeight: 700, marginTop: '0.15rem' }}>
              Covers {advanceWeeks} next Sat{advanceWeeks !== 1 ? 's' : ''} 🗓️
            </div>
          ) : (
            <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 500, marginTop: '0.15rem' }}>
              0 advance Saturdays
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: '0 0 auto' }}>
        <Badge
          label={isDebt ? 'In Debt' : isAdvance ? `Prepaid (${advanceWeeks} Wks)` : 'On Track'}
          type={isDebt ? 'danger' : isAdvance ? 'success' : 'info'}
        />
      </div>
    </div>
  );
};
const TransactionItem = ({ transaction, full, showBorder, formatCurrency, systemUsers = [], members = [], canDelete = false, onDelete }) => {
  const isPayment = transaction.type === 'payment';
  const member = members.find(m => String(m.id) === String(transaction.member_id));
  const memberName = transaction.member_name || (member ? member.name : null) || 'Unknown Member';

  const clerkUser = systemUsers.find(u => u.email === transaction.confirmed_by || String(u.id) === String(transaction.confirmed_by));
  const clerkName = clerkUser ? (clerkUser.nickname || clerkUser.full_name || clerkUser.email?.split('@')[0]) : (transaction.confirmed_by || 'Admin');

  let bgColor = isPayment ? '#F0FDF4' : '#FEF2F2';
  let textColor = isPayment ? '#16A34A' : '#DC2626';
  let icon = isPayment ? '↑' : '✕';
  let title = isPayment ? 'Cash In (Saving Paid)' : 'Cash Out (Saving Unpaid)';
  let badgeLabel = isPayment ? 'Cash In' : 'Cash Out';
  let badgeType = isPayment ? 'success' : 'danger';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 0', borderTop: showBorder ? '1px solid #F3F4F6' : 'none' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: bgColor, color: textColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 700, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827' }}>{title}</div>
          <div style={{ fontSize: '0.85rem', color: '#6B7280', margin: '0.15rem 0' }}>
            {isPayment ? 'payer' : 'member'} <span style={{ fontWeight: 700, color: '#374151' }}>{memberName}</span>
          </div>
          {transaction.notes && (
            <div style={{
              fontSize: '0.85rem',
              color: '#4B5563',
              background: '#F3F4F6',
              padding: '0.4rem 0.8rem',
              borderRadius: '8px',
              margin: '0.3rem 0 0.5rem',
              display: 'inline-block',
              borderLeft: '3px solid #3B82F6'
            }}>
              📝 {transaction.notes}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            <Badge label={badgeLabel} type={badgeType} size="small" />
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 500 }}>
              {new Date(transaction.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} • signed by {clerkName || (transaction.type === 'payment' ? 'Admin' : 'System')}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0, marginLeft: '0.75rem' }}>
        <div style={{ fontWeight: 700, fontSize: '1.2rem', color: textColor, letterSpacing: '-0.02em', textAlign: 'right' }}>
          {isPayment ? '+' : '-'}{formatCurrency(transaction.amount)}
        </div>
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(transaction);
            }}
            title="Delete this transaction (3-step confirmation)"
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECDD3',
              color: '#DC2626',
              borderRadius: '10px',
              padding: '0.5rem 0.6rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              boxShadow: '0 1px 3px rgba(220, 38, 38, 0.1)'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#FEE2E2';
              e.currentTarget.style.borderColor = '#FCA5A5';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#FEF2F2';
              e.currentTarget.style.borderColor = '#FECDD3';
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
const Avatar = ({ name, size = "44px", fontSize = "1rem", index = 0 }) => (<div style={{ width: size, height: size, borderRadius: '50%', background: ['#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#06B6D4'][index % 5], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize }}>{name?.[0]}</div>);
const Badge = ({ label, type, size }) => (<div style={{ padding: size === 'small' ? '0.1rem 0.5rem' : '0.4rem 1rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, background: type === 'success' ? '#F0FDF4' : type === 'danger' ? '#FEF2F2' : type === 'info' ? '#EFF6FF' : '#FFFBEB', color: type === 'success' ? '#16A34A' : type === 'danger' ? '#DC2626' : type === 'info' ? '#3B82F6' : '#F59E0B' }}>{label}</div>);
const FilterPill = ({ label, active, onClick }) => (<button onClick={onClick} style={{ padding: '0.6rem 1.25rem', borderRadius: '12px', background: active ? 'white' : '#F9FAFB', color: active ? '#16A34A' : '#6B7280', border: `1px solid ${active ? '#16A34A' : '#E5E7EB'}`, cursor: 'pointer' }}>{label}</button>);
const NavItem = ({ id, icon: Icon, label, active, onClick }) => {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`savings-nav-btn ${isActive ? 'active' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'none',
        border: 'none',
        color: isActive ? '#16A34A' : '#64748B',
        cursor: 'pointer',
        transition: 'all 0.2s',
        padding: '0.4rem 0.6rem',
        position: 'relative'
      }}
    >
      <Icon size={20} color={isActive ? '#16A34A' : '#64748B'} />
      <span style={{ fontSize: '0.72rem', marginTop: '0.2rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#16A34A' : '#64748B' }}>
        {label}
      </span>
      {isActive && (
        <div className="savings-nav-indicator" style={{ position: 'absolute', bottom: '-7px', left: '10%', right: '10%', height: '3px', background: '#16A34A', borderRadius: '3px 3px 0 0' }} />
      )}
    </button>
  );
};
const ActionButton = ({ label, color, onClick }) => (<button onClick={onClick} style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: `${color}10`, color, border: `1px solid ${color}20`, fontWeight: 700 }}>{label}</button>);
const Modal = ({ title, children, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', overflowY: 'auto' }}>
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      style={{ background: 'white', width: '100%', maxWidth: '480px', maxHeight: 'min(90vh, 650px)', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', display: 'flex', flexDirection: 'column', margin: 'auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.75rem', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#111827', fontFamily: "'Inter', sans-serif", maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
        <button
          onClick={onClose}
          title="Close Modal"
          style={{ background: '#F1F5F9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', fontWeight: 800, fontSize: '1.2rem', transition: 'background 0.2s' }}
          onMouseOver={e => e.currentTarget.style.background = '#E2E8F0'}
          onMouseOut={e => e.currentTarget.style.background = '#F1F5F9'}
        >
          ×
        </button>
      </div>
      <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1 }}>
        {children}
      </div>
    </motion.div>
  </div>
);
const FloatingAddButton = ({ onClick }) => (<button onClick={onClick} style={{ position: 'fixed', bottom: '100px', right: '30px', width: '64px', height: '64px', borderRadius: '50%', background: '#16A34A', color: 'white', border: 'none', boxShadow: '0 10px 15px -3px rgba(22,163,74,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}><Plus size={32} /></button>);

const PhotoOptionsSheet = ({ isOpen, onClose, photoUrl, onAction }) => {
  if (!isOpen) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', width: '100%', borderRadius: '32px 32px 0 0', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      >
        <div style={{ width: '40px', height: '4px', background: '#e2e8f0', borderRadius: '2px', alignSelf: 'center', marginBottom: '1rem' }} />
        <button onClick={onClose} style={{ marginTop: '1rem', padding: '1rem', borderRadius: '16px', background: '#f1f5f9', border: 'none', fontWeight: 700, color: '#64748b' }}>Cancel</button>
      </motion.div>
    </div>
  );
};

export default SavingsTracker;
