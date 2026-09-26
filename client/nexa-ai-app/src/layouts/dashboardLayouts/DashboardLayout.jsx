import { useNavigate, Outlet } from 'react-router-dom';
import './dashboardLayout.css';
import { useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import ChatList from '../../components/chatList/ChatList';

const DashboardLayout = () => {
  const { isLoaded, userId } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.localStorage.getItem('nexa-sidebar-open') !== 'false');
  useEffect(() => { if (isLoaded && !userId) navigate('/sign-in'); }, [isLoaded, userId, navigate]);
  useEffect(() => { window.localStorage.setItem('nexa-sidebar-open', String(isSidebarOpen)); }, [isSidebarOpen]);
  if (!isLoaded) return <div className="dashboardLoading">Loading workspace…</div>;
  if (!userId) return null;
  return <div className={`dashboardLayout${isSidebarOpen ? ' sidebarOpen' : ' sidebarClosed'}`}>
    {!isSidebarOpen && <button className="sidebarLauncher" type="button" onClick={() => setIsSidebarOpen(true)} aria-label="Open sidebar" title="Open sidebar"><img src="/assets/logo.png" alt="" /><span>Nexa</span></button>}
    <button className="sidebarBackdrop" type="button" aria-label="Close sidebar" onClick={() => setIsSidebarOpen(false)} />
    <aside className="menu" aria-label="Chat navigation"><ChatList onClose={() => setIsSidebarOpen(false)} /></aside>
    <div className="content"><Outlet /></div>
  </div>;
};
export default DashboardLayout;
