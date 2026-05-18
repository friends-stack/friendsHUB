import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, History as HistoryIcon, LayoutDashboard, 
  Plus, AlertCircle, RefreshCw, ArrowUp, Briefcase, CheckCircle
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5000' 
  : window.location.origin;

const formatCurrency = (val) => new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(val || 0);

const getActualProfit = (inv) => inv.projected_profit || 0;

const SavingsTracker = ({ user }) => {
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    document.body.style.fontFamily = "'Inter', sans-serif";
  }, []);

  const [activeView, setActiveView] = useState('dashboard'); 
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState({ weekly_amount: 0 });
  const [configHistory, setConfigHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [systemUsers, setSystemUsers] = useState([]);
  const [investments, setInvestments] = useState([]);
  
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

  // Filtering
  const [dateFilter, setDateFilter] = useState('all'); 
  const [typeFilter, setTypeFilter] = useState('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

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
    current.setHours(0,0,0,0);
    while (current <= now) {
      if (current.getDay() === 6) count++; // 6 is Saturday
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const promises = [
        axios.get(`${API_BASE}/api/savings/members`, { headers }),
        axios.get(`${API_BASE}/api/savings/history`, { headers }),
        axios.get(`${API_BASE}/api/savings/config`, { headers }),
        axios.get(`${API_BASE}/api/savings/config/all`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/savings/investments`, { headers }).catch(() => ({ data: [] }))
      ];
      if (user?.role === 'super_admin') {
        promises.push(axios.get(`${API_BASE}/api/users`, { headers }).catch(() => ({ data: [] })));
      }
      const res = await Promise.all(promises);
      setMembers(res[0].data);

      let historyData = res[1].data || [];
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
        expsByMember[mId].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
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
      setConfig(res[2].data);
      setConfigHistory(res[3].data || []);
      setInvestments(res[4].data || []);
      if (res[5]) setSystemUsers(res[5].data);
    } catch (err) {
      console.error(err);
    } finally {
      if (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'clerk') {
        const usersRes = await axios.get(`${API_BASE}/api/users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        setSystemUsers(usersRes.data);
      }
      setLoading(false);
    }
  };

  useEffect(() => { fetchAllData(); }, []);

  const confirmAction = (title, message, onConfirm, confirmText = 'Yes', cancelText = 'No') => {
    setConfirmation({ isOpen: true, title, message, onConfirm, confirmText, cancelText });
  };

  const handleAddPayment = async (memberId, amount) => {
    confirmAction("Confirm Payment", `Are you sure you want to record a ${formatCurrency(amount)} payment?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/transactions`, { member_id: memberId, amount, type: 'payment' }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess("Payment recorded successfully!");
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
          await fetchAllData();
          setConfirmation({ ...confirmation, isOpen: false });
          showSuccess(`${type === 'payment' ? 'Payment' : 'Missed contribution'} recorded successfully!`);

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
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess("Missed contribution recorded.");
      } catch (err) { showToast("Error marking missed"); }
    });
  };

  const handleAddMember = async (name) => {
    if (!name) return;
    confirmAction("Add Member", `Do you want to add "${name}" to the group?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/members`, { name }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess(`${name} is added successfully to the system`);
      } catch (e) { showToast("Error adding member"); }
    });
  };

  const handleDeleteMember = async (memberId, memberName) => {
    confirmAction("Remove Member", `Are you sure you want to PERMANENTLY remove ${memberName} and all their transaction history?`, async () => {
      try {
        await axios.delete(`${API_BASE}/api/savings/members/${memberId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess("Member removed permanently.");
      } catch (err) { showToast(err.response?.data?.error || "Error deleting member"); }
    });
  };

  const handleAddWeek = async (amount) => {
    confirmAction("New Week", `Are you sure you want to set the weekly contribution to ${formatCurrency(amount)}?`, async () => {
      try {
        await axios.post(`${API_BASE}/api/savings/config`, { amount }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        await fetchAllData();
        setConfirmation({ ...confirmation, isOpen: false });
        showSuccess(`Weekly amount updated to ${formatCurrency(amount)}`);
      } catch (e) { showToast("Error updating configuration"); }
    });
  };

  const handleSetClerk = async (clerkId) => {
    try {
      await axios.post(`${API_BASE}/api/savings/clerk`, { clerk_id: clerkId }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      await fetchAllData();
      showSuccess("Clerk updated successfully");
    } catch (e) { showToast("Error setting clerk"); }
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
    const income = parseFloat(completionForm.finalProfit);
    const expense = selectedInvestment.allocated_amount;
    const netProfit = income - expense;

    confirmAction("Confirm Completion", `Confirming Income of ${formatCurrency(income)}. Net Profit will be ${formatCurrency(netProfit)}.`, async () => {
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
        showSuccess("Business completed and capital returned!");
      } catch (e) { showToast("Error completing investment: " + (e.response?.data?.error || e.message)); }
    });
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(amt || 0);
  const isSuperAdmin = user?.role === 'super_admin';
  const isClerk = user?.id === config.clerk_id;
  const isPaymentManager = isClerk;
  const isMemberManager = isSuperAdmin;

  const totalMemberSavings = members.reduce((sum, m) => sum + (m.total_paid || 0), 0);
  const totalProfitsEarned = investments.filter(i => i.status === 'completed').reduce((sum, i) => sum + getActualProfit(i), 0);
  
  // Total Group Wealth = All money collected from members + All realized profits from completed missions
  const totalPool = totalMemberSavings + totalProfitsEarned;
  
  // Active Capital = Principal money currently out in projects
  const totalActiveCapital = investments.filter(i => i.status === 'active').reduce((sum, i) => sum + i.allocated_amount, 0);
  
  // Available Cash = Total Pool - Capital currently at work
  const finalTotalAvailable = totalPool - totalActiveCapital;

  // GENUINE LOGIC PROCESSING
  const weeklyRate = config.weekly_amount || 300;
  const processedMembers = members.map(m => {
    // Reverting to DB-driven logic to respect manual 'Missed' marks
    const genuineBalance = m.balance;
    const currentDebt = Math.max(0, -m.balance);
    const totalExpectedRequirement = m.total_expected;
    return { ...m, genuineBalance, currentDebt, totalExpectedRequirement };
  });

  const debtMembers = processedMembers.filter(m => m.currentDebt > 0);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Tracker...</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem', background:'#F9FAFB', borderRadius:'24px', minHeight:'80vh', color:'#111827', fontFamily:"'Inter', sans-serif", padding:'1.5rem' }}>
      <nav style={{ position:'sticky', top:0, background:'rgba(255, 255, 255, 0.9)', backdropFilter:'blur(10px)', display:'flex', justifyContent:'space-around', padding:'0.75rem 0', borderBottom:'1px solid #E5E7EB', zIndex:100, margin: '-1.5rem -1.5rem 1.5rem -1.5rem', borderRadius: '24px 24px 0 0' }}>
        <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" active={activeView} onClick={setActiveView} />
        <NavItem id="investments" icon={Briefcase} label="Working" active={activeView} onClick={setActiveView} />
        <NavItem id="members" icon={Users} label="Members" active={activeView} onClick={setActiveView} />
        <NavItem id="history" icon={HistoryIcon} label="History" active={activeView} onClick={setActiveView} />
        {isMemberManager && <NavItem id="settings" icon={RefreshCw} label="Settings" active={activeView} onClick={setActiveView} />}
      </nav>
      <main style={{ flex:1 }}>
        <AnimatePresence mode="wait">
          {activeView === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              <header><h1 style={{ fontSize:'2rem', fontWeight: 700, fontFamily:'inherit', margin:'0 0 0.25rem' }}>Dashboard</h1><p style={{ color:'#6B7280', margin:0 }}>{members.length} members • {new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}</p></header>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'1.25rem' }}>
                <StatCard label="TOTAL PROFIT" value={formatCurrency(totalProfitsEarned)} color="#16A34A" subValue="Realized Gains" onClick={() => setShowProfitModal(true)} />
                <StatCard label="TOTAL WEALTH" value={formatCurrency(totalPool)} color="#16A34A" subValue="Savings + Profits" onClick={() => setShowWealthModal(true)} />
                <StatCard label="MONEY AT WORK" value={formatCurrency(totalActiveCapital)} color="#8B5CF6" subValue="In active missions" onClick={() => setShowActiveInvestmentsModal(true)} />
                <StatCard label="AVAILABLE CASH" value={formatCurrency(finalTotalAvailable)} color="#3B82F6" subValue="Ready to invest" />
              </div>
              <div onClick={() => setShowDebtModal(true)} style={{ background: debtMembers.length > 0 ? '#FFF1F2' : '#F0FDF4', border: `1px solid ${debtMembers.length > 0 ? '#FECDD3' : '#BBF7D0'}`, borderRadius:'16px', padding:'1.25rem 1.5rem', display:'flex', gap:'1rem', cursor: 'pointer' }}>
                <AlertCircle color={debtMembers.length > 0 ? "#DC2626" : "#16A34A"} size={24} />
                <div>
                  <div style={{ color: debtMembers.length > 0 ? '#991B1B' : '#166534', fontWeight:700 }}>Members Behind</div>
                  <div style={{ color: debtMembers.length > 0 ? '#E11D48' : '#16A34A', fontSize:'0.9rem' }}>
                    {debtMembers.length > 0 ? "Click to see details →" : "All friends are up to date! Click to view"}
                  </div>
                </div>
              </div>
              
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(400px, 1fr))', gap:'1.5rem' }}>
                <Section title="Member Balances" onAction={() => setActiveView('members')} actionLabel="View all →">
                  {processedMembers.map((m, i) => <MemberListItem key={m.id} member={m} index={i} onClick={() => { setSelectedMember(m); setActiveView('member-detail'); }} formatCurrency={formatCurrency} />)}
                </Section>
                <Section title="Recent Payments" onAction={() => setActiveView('history')} actionLabel="Full history →">
                  {history.slice(0, 6).map((h, i) => <TransactionItem key={h.id} transaction={h} showBorder={i !== 0} formatCurrency={formatCurrency} />)}
                </Section>
              </div>
            </motion.div>
          )}

          {activeView === 'members' && (
            <motion.div key="members" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <h1 style={{ fontSize:'2rem', fontWeight: 700, fontFamily:'inherit' }}>Members</h1>
              {processedMembers.map(m => <MemberCard key={m.id} member={m} onClick={() => { setSelectedMember(m); setActiveView('member-detail'); }} formatCurrency={formatCurrency} />)}
              {isMemberManager && <FloatingAddButton onClick={() => {
                setVisualPrompt({
                  isOpen: true,
                  title: 'New Member',
                  placeholder: 'Enter friend name...',
                  defaultValue: '',
                  onConfirm: (name) => {
                    if (name) handleAddMember(name);
                    setVisualPrompt(prev => ({ ...prev, isOpen: false }));
                  }
                });
              }} />}
            </motion.div>
          )}

          {activeView === 'member-detail' && selectedMember && (() => {
            const m = processedMembers.find(pm => pm.id === selectedMember.id);
            const isOnTrack = m.currentDebt === 0;

            return (
              <motion.div key="detail" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
                <button onClick={() => setActiveView('members')} style={{ alignSelf:'flex-start', padding:'0.6rem 1.25rem', borderRadius:'12px', background:'white', border:'1px solid #E5E7EB', fontWeight:600, cursor:'pointer' }}>← Back to members</button>
                <div style={{ display:'flex', gap:'1.25rem', alignItems:'center' }}><Avatar name={m.name} size="72px" /><div><div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}><h2 style={{ margin:0, fontSize:'1.75rem', fontWeight: 700, fontFamily:'inherit' }}>{m.name}</h2><Badge label={isOnTrack ? 'On track' : 'In debt'} type={isOnTrack ? 'warning' : 'danger'} /></div><div style={{ color:'#6B7280', marginTop:'0.25rem' }}>Joined Since {new Date(m.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div></div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'1rem' }}>
                  <StatCard 
                    label="TOTAL PAID" 
                    value={formatCurrency(m.total_paid)} 
                    color="#16A34A" 
                    subValue="Personal Contribution"
                  />
                  <StatCard 
                    label="TOTAL EXPECTED" 
                    value={isOnTrack ? "Fully Paid" : formatCurrency(m.currentDebt)}
                    color={isOnTrack ? "#16A34A" : "#DC2626"}
                    subValue={isOnTrack ? "Up to date ✓" : `Current Debt (ETB ${weeklyRate}/wk)`}
                  />
                  <StatCard 
                    label="REMAINING BALANCE" 
                    value={formatCurrency(Math.max(0, m.genuineBalance))} 
                    color="#3B82F6" 
                    subValue="Advanced Payment" 
                  />
                </div>
                {isPaymentManager && <div style={{ display:'flex', gap:'1rem' }}><ActionButton label="+ Add payment" color="#16A34A" onClick={() => { setPaymentForm({ amount: 300, notes: '', date: getTodayDateString(), time: getNowTimeString(), type: 'payment' }); setShowPaymentModal(true); }} /><ActionButton label="Mark missed" color="#DC2626" onClick={() => { setPaymentForm({ amount: 300, notes: '', date: getTodayDateString(), time: getNowTimeString(), type: 'missed' }); setShowMissedModal(true); }} /></div>}
                <Section title="Contribution History">{history.filter(h => h.member_id === m.id).map((h, i) => <TransactionItem key={h.id} transaction={h} full showBorder={i !== 0} formatCurrency={formatCurrency} systemUsers={systemUsers} members={members} />)}</Section>
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
                const s = new Date(customRange.start); s.setHours(0,0,0,0);
                const e = new Date(customRange.end); e.setHours(23,59,59,999);
                return date >= s && date <= e;
              }
              return true;
            });

            const tPaid = filtered.reduce((s, h) => s + (h.type === 'payment' ? h.amount : 0), 0);
            const tMissed = filtered.reduce((s, h) => s + (h.type === 'missed' ? h.amount : 0), 0);

            return (
              <motion.div key="history" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
                <h1 style={{ fontSize:'2rem', fontWeight: 700, fontFamily:'inherit' }}>History</h1>
                <div style={{ background:'white', padding:'1.5rem', borderRadius:'24px', border:'1px solid #E5E7EB', display:'flex', flexDirection:'column', gap:'1.5rem' }}>
                  <div>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', marginBottom:'0.75rem', display:'block', color:'#6B7280' }}>Quick Filter</label>
                    <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
                      <FilterPill label="All time" active={dateFilter === 'all'} onClick={() => setDateFilter('all')} />
                      <FilterPill label="This week" active={dateFilter === 'week'} onClick={() => setDateFilter('week')} />
                      <FilterPill label="This month" active={dateFilter === 'month'} onClick={() => setDateFilter('month')} />
                      <FilterPill label="Custom range" active={dateFilter === 'custom'} onClick={() => setDateFilter('custom')} />
                    </div>
                    {dateFilter === 'custom' && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginTop:'1.25rem' }}>
                        <div><label style={{ fontSize:'0.8rem', color:'#6B7280', display:'block', marginBottom:'0.5rem' }}>Start date</label><input type="date" value={customRange.start} onChange={e => setCustomRange({...customRange, start: e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB' }} /></div>
                        <div><label style={{ fontSize:'0.8rem', color:'#6B7280', display:'block', marginBottom:'0.5rem' }}>End date</label><input type="date" value={customRange.end} onChange={e => setCustomRange({...customRange, end: e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB' }} /></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', marginBottom:'0.75rem', display:'block', color:'#6B7280' }}>Transaction Type</label>
                    <div style={{ display:'flex', gap:'0.75rem' }}>
                      <FilterPill label="All" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
                      <FilterPill label="Payments" active={typeFilter === 'payment'} onClick={() => setTypeFilter('payment')} />
                      <FilterPill label="Missed" active={typeFilter === 'missed'} onClick={() => setTypeFilter('missed')} />
                    </div>
                  </div>
                </div>



                <Section title={`Transactions (${filtered.length})`}>{filtered.map((h, i) => <TransactionItem key={h.id} transaction={h} full showBorder={i !== 0} formatCurrency={formatCurrency} systemUsers={systemUsers} members={members} />)}</Section>
              </motion.div>
            );
          })()}

          {activeView === 'investments' && (
            <motion.div key="investments" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              <h1 style={{ fontSize:'2rem', fontWeight: 700, fontFamily:'inherit' }}>Working Capital</h1>
              <p style={{ color:'#6B7280', marginTop:'-1rem' }}>Track the businesses and projects our savings are invested in.</p>
              
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'1rem' }}>
                <StatCard 
                  label="REMAINING MONEY" 
                  value={formatCurrency(finalTotalAvailable)} 
                  color="#3B82F6" 
                  subValue="Ready for new missions" 
                  onClick={() => setShowWealthModal(true)}
                />
                <StatCard 
                  label="MONEY AT WORK" 
                  value={formatCurrency(totalActiveCapital)} 
                  color="#8B5CF6" 
                  subValue="Out in businesses" 
                  onClick={() => setShowActiveInvestmentsModal(true)}
                />
                <StatCard 
                  label="TOTAL WEALTH" 
                  value={formatCurrency(totalPool)} 
                  color="#16A34A" 
                  subValue="Our total wealth pool" 
                  onClick={() => setShowWealthModal(true)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {investments.length === 0 ? (
                  <div style={{ background:'white', padding:'3rem 1.5rem', borderRadius:'24px', textAlign:'center', border:'1px solid #E5E7EB' }}>
                    <Briefcase size={48} color="#9CA3AF" style={{ margin:'0 auto 1rem' }} />
                    <h3 style={{ fontSize:'1.25rem', margin:'0 0 0.5rem', fontWeight:700, fontFamily:'inherit' }}>No active investments</h3>
                    <p style={{ color:'#6B7280', margin:0 }}>Our money is resting. Allocate it to a project to start earning profit!</p>
                  </div>
                ) : (
                  investments.map(inv => (
                    <div 
                      key={inv.id} 
                      onClick={() => { setSelectedInvestment(inv); setShowInvestmentDetailModal(true); }}
                      style={{ 
                        background:'white', 
                        padding:'1.5rem', 
                        borderRadius:'24px', 
                        border:'1px solid #E5E7EB', 
                        display:'flex', 
                        justifyContent:'space-between', 
                        alignItems:'center',
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                        opacity: inv.status === 'completed' ? 0.7 : 1
                      }}
                      onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                      onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
                        <div style={{ 
                          width:'48px', 
                          height:'48px', 
                          background: inv.status === 'active' ? '#F3E8FF' : '#F0FDF4', 
                          color: inv.status === 'active' ? '#8B5CF6' : '#16A34A', 
                          borderRadius:'12px', 
                          display:'flex', 
                          alignItems:'center', 
                          justifyContent:'center' 
                        }}>
                          <Briefcase size={24} />
                        </div>
                        <div>
                          <div style={{ fontSize:'1.1rem', fontWeight: 700, color:'#111827', textDecoration: inv.status === 'completed' ? 'line-through' : 'none' }}>{inv.project_name}</div>
                          <div style={{ fontSize:'0.85rem', color:'#6B7280' }}>
                            {inv.status === 'active' ? 'Started' : 'Finished'} {new Date(inv.created_at).toLocaleDateString()}
                          </div>
                          <Badge 
                            label={inv.status === 'active' ? 'Active & Working' : 'Mission Completed'} 
                            type={inv.status === 'active' ? 'info' : 'success'} 
                            size="small" 
                          />
                        </div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:'0.75rem', color:'#6B7280', textTransform:'uppercase', fontWeight:700 }}>{inv.status === 'active' ? 'Expense' : 'Invested'}</div>
                        <div style={{ fontSize:'1.25rem', fontWeight: 700, color: inv.status === 'active' ? '#8B5CF6' : '#16A34A' }}>{formatCurrency(inv.allocated_amount)}</div>
                        {inv.projected_profit > 0 && (
                          <div style={{ fontSize:'0.85rem', color:'#16A34A', marginTop:'0.25rem' }}>
                            {inv.status === 'active' ? '+' : 'Earned +'} {formatCurrency(inv.projected_profit)} {inv.status === 'active' ? 'expected' : 'profit'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {isMemberManager && <FloatingAddButton onClick={() => setShowInvestmentModal(true)} />}
            </motion.div>
          )}

          {activeView === 'settings' && (
            <motion.div key="settings" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              <h1 style={{ fontSize:'2rem', fontWeight: 700, fontFamily:'inherit' }}>Settings</h1>
              
              {!isSuperAdmin && (
                <div style={{ background: '#FEF2F2', padding: '1.5rem', borderRadius: '24px', border: '1px solid #FECACA', color: '#991B1B', fontWeight: 600 }}>
                  ⚠️ Some settings are restricted to Super Admin only.
                </div>
              )}

              {isSuperAdmin && (
                <>
                  <div style={{ background:'white', padding:'2rem', borderRadius:'24px', border:'1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', color:'#6B7280', display:'block', marginBottom:'1.5rem' }}>Add Member</label>
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Full name</label>
                      <input id="new-member-name" type="text" placeholder="e.g. Ermias Gesgis" style={{ width:'100%', padding:'1rem', borderRadius:'12px', border:'1px solid #E5E7EB', background: '#F9FAFB' }} />
                    </div>
                    <button onClick={() => { const n = document.getElementById('new-member-name').value; if(n) handleAddMember(n); }} style={{ width:'100%', padding:'1.1rem', borderRadius:'12px', background:'#16A34A', color:'white', border:'none', fontWeight:700, fontSize: '1rem', cursor:'pointer', marginBottom: '2rem' }}>Add member</button>
                    
                    <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem' }}>
                      <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', color:'#6B7280', display:'block', marginBottom:'1rem' }}>Current Members ({members.length})</label>
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
                          {isSuperAdmin && (
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

                  <div style={{ background:'white', padding:'2rem', borderRadius:'24px', border:'1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', color:'#6B7280', display:'block', marginBottom:'1rem' }}>Add New Week</label>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Sets a new weekly contribution amount. Previous weeks remain unchanged.</p>
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Weekly amount (ETB)</label>
                      <input id="new-weekly-amount" type="number" placeholder="100" defaultValue={config.weekly_amount} style={{ width:'100%', padding:'1rem', borderRadius:'12px', border:'1px solid #E5E7EB', background: '#F9FAFB' }} />
                    </div>
                    <button onClick={() => { const a = document.getElementById('new-weekly-amount').value; if(a) handleAddWeek(a); }} style={{ width:'100%', padding:'1.1rem', borderRadius:'12px', background:'#16A34A', color:'white', border:'none', fontWeight:700, fontSize: '1rem', cursor:'pointer', marginBottom: '2rem' }}>Add week</button>

                    <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '1.5rem' }}>
                      <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', color:'#6B7280', display:'block', marginBottom:'1rem' }}>Week History</label>
                      {configHistory.map((c, i) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid #F3F4F6' }}>
                          <span style={{ color: '#6B7280', fontWeight: 500 }}>Week {configHistory.length - i}</span>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{formatCurrency(c.weekly_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </>
              )}


              {user?.role === 'super_admin' && (
                <div style={{ background:'white', padding:'2rem', borderRadius:'24px', border:'1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <label style={{ fontSize:'0.75rem', fontWeight:700, textTransform:'uppercase', color:'#6B7280', display:'block', marginBottom:'1rem' }}>Assign Clerk</label>
                  <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Only the assigned Clerk and Super Admin can manage members and payments.</p>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <select 
                      id="clerk-select" 
                      defaultValue={config.clerk_id || ''} 
                      style={{ width:'100%', padding:'1rem', borderRadius:'12px', border:'1px solid #E5E7EB', background: '#F9FAFB' }}
                    >
                      <option value="">-- No Clerk Assigned --</option>
                      {systemUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.nickname || u.email} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <button onClick={() => handleSetClerk(document.getElementById('clerk-select').value)} style={{ width:'100%', padding:'1.1rem', borderRadius:'12px', background:'#3B82F6', color:'white', border:'none', fontWeight:700, fontSize: '1rem', cursor:'pointer' }}>Set Clerk</button>
                </div>
              )}
            </motion.div>
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
            <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem', fontFamily: "'Inter', sans-serif" }}>
              
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
            <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem', fontFamily: "'Inter', sans-serif" }}>
              
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
            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Project Name/Business</label>
                <input type="text" placeholder="e.g., Electronics Store" value={investmentForm.projectName} onChange={e => setInvestmentForm({...investmentForm, projectName:e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Expense (Birr)</label>
                <input type="number" min="0" placeholder="15000" value={investmentForm.allocatedAmount} onChange={e => setInvestmentForm({...investmentForm, allocatedAmount:e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Expected Profit (Birr)</label>
                <input type="number" placeholder="1000" value={investmentForm.projectedProfit} onChange={e => setInvestmentForm({...investmentForm, projectedProfit:e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Expected Duration (Months)</label>
                <input type="number" min="1" placeholder="e.g., 3" value={investmentForm.expectedDays} onChange={e => setInvestmentForm({...investmentForm, expectedDays:e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Business Challenges / Details (Optional)</label>
                <textarea placeholder="Mention risks, elements or properties of this business..." value={investmentForm.challenges} onChange={e => setInvestmentForm({...investmentForm, challenges:e.target.value})} style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB', minHeight: '100px', fontFamily: 'inherit' }} />
              </div>
              <button onClick={handleAddInvestment} style={{ width:'100%', padding:'1rem', borderRadius:'12px', background:'#8B5CF6', color:'white', border:'none', fontWeight:700, cursor: 'pointer' }}>Add Investment</button>
            </div>
          </Modal>
        )}
        {showInvestmentDetailModal && selectedInvestment && (
          <Modal title={selectedInvestment.project_name} onClose={() => setShowInvestmentDetailModal(false)}>
            <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
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
                    width:'100%', 
                    padding:'1.1rem', 
                    borderRadius:'16px', 
                    background: selectedInvestment.status === 'active' ? '#16A34A' : '#4B5563', 
                    color:'white', 
                    border:'none', 
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
          <Modal title="Confirm Income" onClose={() => setShowInvestmentCompleteModal(false)}>
            <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>Enter the total amount of money that came back to the pool (Original Capital + Net Profit).</p>
              
              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Total Cash Returned (ETB)</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" 
                    placeholder="e.g. 21000"
                    value={completionForm.finalProfit} 
                    onChange={e => setCompletionForm({...completionForm, finalProfit: e.target.value})} 
                    style={{ width:'100%', padding:'1rem', borderRadius:'12px', border:'2px solid #3B82F6', fontSize: '1.1rem', fontWeight: 700 }} 
                  />
                  <div style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#3B82F6', fontWeight: 700, fontSize: '0.8rem' }}>ETB</div>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '0.5rem' }}>
                  Expense was {formatCurrency(selectedInvestment.allocated_amount)}.
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Final Challenges & Lessons</label>
                <textarea 
                  placeholder="What went well? What were the challenges?" 
                  value={completionForm.challenges} 
                  onChange={e => setCompletionForm({...completionForm, challenges: e.target.value})} 
                  style={{ width:'100%', padding:'0.8rem', borderRadius:'12px', border:'1px solid #E5E7EB', minHeight: '100px', fontFamily: 'inherit' }} 
                />
              </div>

              {completionForm.finalProfit && selectedInvestment && (
                <div style={{ background: (parseFloat(completionForm.finalProfit) || 0) - (selectedInvestment.allocated_amount || 0) >= 0 ? '#F0FDF4' : '#FEF2F2', padding: '1rem', borderRadius: '12px', border: `1px solid ${(parseFloat(completionForm.finalProfit) || 0) - (selectedInvestment.allocated_amount || 0) >= 0 ? '#BBF7D0' : '#FECACA'}` }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Calculated Net Profit</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: (parseFloat(completionForm.finalProfit) || 0) - (selectedInvestment.allocated_amount || 0) >= 0 ? '#16A34A' : '#DC2626' }}>
                    {formatCurrency((parseFloat(completionForm.finalProfit) || 0) - (selectedInvestment.allocated_amount || 0))}
                  </div>
                </div>
              )}

              <button 
                onClick={handleCompleteInvestment} 
                style={{ width:'100%', padding:'1.1rem', borderRadius:'16px', background: '#3B82F6', color:'white', border:'none', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.4)' }}
              >
                Record Income
              </button>
            </div>
          </Modal>
        )}
        {showProfitModal && (
          <Modal title="Profit History" onClose={() => setShowProfitModal(false)}>
            <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
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
          <Modal title="Financial Breakdown" onClose={() => setShowWealthModal(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ background: '#F0FDF4', padding: '1.5rem', borderRadius: '24px', border: '1px solid #BBF7D0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Money</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#16A34A' }}>
                  {formatCurrency(totalPool)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#F9FAFB', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>Money in Hand</div>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Ready to deploy / Savings</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#3B82F6', fontSize: '1.1rem' }}>{formatCurrency(finalTotalAvailable)}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontWeight: 700, fontSize: '1.2rem' }}>+</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: '#F9FAFB', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>Working Capital</div>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Currently out in businesses</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#8B5CF6', fontSize: '1.1rem' }}>{formatCurrency(totalActiveCapital)}</div>
                </div>
              </div>

              <div style={{ padding: '1.25rem', background: '#F8FAFC', borderRadius: '16px', border: '1px dotted #CBD5E1', fontSize: '0.85rem', color: '#64748B', lineHeight: 1.5 }}>
                <strong>How it works:</strong> Your wealth is the sum of all money the group possesses. It is either sitting in your hands (Ready to deploy) or working to generate profit (Working Capital).
              </div>

              <button onClick={() => setShowWealthModal(false)} style={{ width: '100%', padding: '1.1rem', borderRadius: '16px', background: '#111827', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Got it</button>
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
      </div>
  );
};

// Sub-components
const StatCard = ({ label, value, subValue, color, onClick }) => {
  const isLong = value?.toString().length > 13;
  return (
    <div 
      onClick={onClick} 
      style={{ 
        background:'white', 
        padding:'1.5rem', 
        borderRadius:'24px', 
        border:'1px solid #E5E7EB', 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '130px'
      }}
      onMouseOver={e => onClick && (e.currentTarget.style.transform = 'translateY(-4px)')}
      onMouseOut={e => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ fontSize:'0.75rem', color:'#6B7280', fontWeight:700, textTransform:'uppercase', marginBottom:'0.6rem', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: isLong ? '1.4rem' : '1.8rem', fontWeight: 700, color, lineHeight: 1.1, wordBreak: 'break-all' }}>{value}</div>
      {subValue && <div style={{ fontSize:'0.8rem', color:'#6B7280', marginTop: '0.4rem', fontWeight: 500 }}>{subValue}</div>}
    </div>
  );
};
const Section = ({ title, onAction, actionLabel, children }) => (<div style={{ background:'white', padding:'1.5rem', borderRadius:'24px', border:'1px solid #E5E7EB' }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:'1.5rem' }}><h3 style={{ margin:0, fontSize:'0.85rem', color:'#6B7280', fontWeight:700, fontFamily:'inherit', textTransform:'uppercase' }}>{title}</h3>{onAction && <button onClick={onAction} style={{ background:'none', border:'none', color:'#16A34A', fontWeight:700, cursor:'pointer' }}>{actionLabel}</button>}</div>{children}</div>);
const MemberListItem = ({ member, index, onClick, formatCurrency }) => (<div onClick={onClick} style={{ display:'flex', justifyContent:'space-between', padding:'1rem 0', borderTop: index === 0 ? 'none' : '1px solid #F3F4F6', cursor:'pointer' }}><div style={{ display:'flex', gap:'1rem', alignItems:'center' }}><Avatar name={member.name} index={index} /><div><div style={{ fontWeight:700 }}>{member.name}</div><div style={{ fontSize:'0.85rem', color:'#6B7280' }}>paid {formatCurrency(member.total_paid)}</div></div></div><div style={{ fontWeight: 700, color: member.currentDebt === 0 ? '#F59E0B' : '#DC2626' }}>{member.currentDebt === 0 ? '+' : ''}{formatCurrency(member.genuineBalance)}</div></div>);
const MemberCard = ({ member, onClick, formatCurrency }) => (
  <div onClick={onClick} style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between', background:'white', borderRadius:'24px', padding:'1.5rem', border:'1px solid #E5E7EB', cursor:'pointer' }}>
    <div style={{ display:'flex', gap:'1rem', alignItems:'center', flex: '1 1 250px' }}>
      <Avatar name={member.name} size="56px" />
      <div>
        <div style={{ fontSize:'1.25rem', fontWeight: 700 }}>{member.name}</div>
        <div style={{ fontSize:'0.9rem', color:'#6B7280' }}>Joined Since {new Date(member.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
          {member.role === 'super_admin' && <Badge label="Super Admin" type="info" />}
          {member.role === 'admin' && <Badge label="Admin" type="info" />}
        </div>
      </div>
    </div>
    
    <div style={{ display:'flex', gap: '1.5rem', flex: '2 1 300px', justifyContent: 'space-around', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize:'0.65rem', textTransform:'uppercase', color:'#6B7280', fontWeight:700 }}>Paid</div>
        <div style={{ fontWeight: 700, color:'#16A34A', marginTop:'0.25rem' }}>{formatCurrency(member.total_paid)}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize:'0.65rem', textTransform:'uppercase', color:'#6B7280', fontWeight:700 }}>Expected</div>
        <div style={{ fontWeight: 700, color: member.currentDebt === 0 ? '#16A34A' : '#DC2626', marginTop:'0.25rem' }}>
          {member.currentDebt === 0 ? formatCurrency(0) : formatCurrency(member.currentDebt)}
        </div>
        {member.currentDebt === 0 && <div style={{ fontSize:'0.65rem', color:'#16A34A', fontWeight:600, marginTop:'0.15rem' }}>Up to date ✓</div>}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize:'0.65rem', textTransform:'uppercase', color:'#6B7280', fontWeight:700 }}>Remaining</div>
        <div style={{ fontWeight: 700, color: member.currentDebt === 0 ? '#3B82F6' : '#DC2626', marginTop:'0.25rem' }}>
          {formatCurrency(Math.max(0, member.genuineBalance))}
        </div>
      </div>
    </div>

    <div style={{ flex: '0 0 auto' }}>
      <Badge label={member.currentDebt === 0 ? 'On Track' : 'In Debt'} type={member.currentDebt === 0 ? 'warning' : 'danger'} />
    </div>
  </div>
);
const TransactionItem = ({ transaction, full, showBorder, formatCurrency, systemUsers = [], members = [] }) => {
  const isPayment = transaction.type === 'payment';
  const member = members.find(m => m.id === transaction.member_id);
  const memberName = member ? member.name : 'Unknown Member';
  
  const clerkUser = systemUsers.find(u => u.email === transaction.confirmed_by);
  const clerkName = clerkUser ? clerkUser.nickname : transaction.confirmed_by;

  let bgColor = isPayment ? '#F0FDF4' : '#FEF2F2';
  let textColor = isPayment ? '#16A34A' : '#DC2626';
  let icon = isPayment ? '↑' : '✕';
  let title = isPayment ? 'Payment' : 'Missed Week';
  let badgeLabel = isPayment ? 'Paid' : 'Unpaid';
  let badgeType = isPayment ? 'success' : 'danger';

  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: '1.25rem 0', borderTop: showBorder ? '1px solid #F3F4F6' : 'none' }}>
      <div style={{ display:'flex', gap:'1rem', alignItems:'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: bgColor, color: textColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 700 }}>
          {icon}
        </div>
        <div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.3rem' }}>
            <Badge label={badgeLabel} type={badgeType} size="small" />
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 500 }}>
              {new Date(transaction.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} • signed by {clerkName || (transaction.type === 'payment' ? 'Admin' : 'System')}
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: '1.2rem', color: textColor, letterSpacing: '-0.02em' }}>
        {isPayment ? '+' : '-'}{formatCurrency(transaction.amount)}
      </div>
    </div>
  );
};
const Avatar = ({ name, size="44px", fontSize="1rem", index=0 }) => (<div style={{ width:size, height:size, borderRadius:'50%', background:['#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#06B6D4'][index % 5], color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize }}>{name?.[0]}</div>);
const Badge = ({ label, type, size }) => (<div style={{ padding: size==='small'?'0.1rem 0.5rem':'0.4rem 1rem', borderRadius:'100px', fontSize:'0.75rem', fontWeight:700, background:type==='success'?'#F0FDF4':type==='danger'?'#FEF2F2':type==='info'?'#EFF6FF':'#FFFBEB', color:type==='success'?'#16A34A':type==='danger'?'#DC2626':type==='info'?'#3B82F6':'#F59E0B' }}>{label}</div>);
const FilterPill = ({ label, active, onClick }) => (<button onClick={onClick} style={{ padding:'0.6rem 1.25rem', borderRadius:'12px', background: active ? 'white' : '#F9FAFB', color: active ? '#16A34A' : '#6B7280', border:`1px solid ${active ? '#16A34A' : '#E5E7EB'}`, cursor:'pointer' }}>{label}</button>);
const NavItem = ({ id, icon: Icon, label, active, onClick }) => (<button onClick={() => onClick(id)} style={{ display:'flex', flexDirection:'column', alignItems:'center', background:'none', border:'none', color: active === id ? '#16A34A' : '#6B7280', cursor: 'pointer', transition: 'color 0.2s' }}><Icon size={24} /><span style={{ fontSize:'0.7rem', marginTop: '0.2rem', fontWeight: active === id ? 700 : 500 }}>{label}</span></button>);
const ActionButton = ({ label, color, onClick }) => (<button onClick={onClick} style={{ flex:1, padding:'1rem', borderRadius:'12px', background:`${color}10`, color, border:`1px solid ${color}20`, fontWeight:700 }}>{label}</button>);
const Modal = ({ title, children, onClose }) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(17, 24, 39, 0.7)', backdropFilter: 'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding: '1rem' }}>
    <motion.div 
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      style={{ background:'white', width:'100%', maxWidth:'480px', borderRadius:'32px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: '1.5rem 2rem', borderBottom: '1px solid #F3F4F6' }}>
        <h2 style={{ margin:0, fontSize: '1.25rem', fontWeight: 700, color: '#111827', fontFamily:"'Inter', sans-serif", maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
        <button onClick={onClose} style={{ background:'#F3F4F6', border:'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', fontWeight: 700 }}>×</button>
      </div>
      <div style={{ padding: '2rem', maxHeight: '80vh', overflowY: 'auto' }}>
        {children}
      </div>
    </motion.div>
  </div>
);
const FloatingAddButton = ({ onClick }) => (<button onClick={onClick} style={{ position:'fixed', bottom:'100px', right:'30px', width:'64px', height:'64px', borderRadius:'50%', background:'#16A34A', color:'white', border:'none', boxShadow:'0 10px 15px -3px rgba(22,163,74,0.3)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent: 'center', zIndex: 90 }}><Plus size={32} /></button>);

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
