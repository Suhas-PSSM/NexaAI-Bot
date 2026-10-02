import { useNavigate, Outlet } from 'react-router-dom';
import './dashboardLayout.css';
import { UserButton, useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import ChatList from '../../components/chatList/ChatList';

const DashboardLayout = () => {
  const { isLoaded, userId } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.localStorage.getItem('nexa-sidebar-open') !== 'false');
  const [sidebarMode, setSidebarMode] = useState('chats');
  const [hasPinnedChats, setHasPinnedChats] = useState(false);
  useEffect(() => { if (isLoaded && !userId) navigate('/sign-in'); }, [isLoaded, userId, navigate]);
  useEffect(() => { window.localStorage.setItem('nexa-sidebar-open', String(isSidebarOpen)); }, [isSidebarOpen]);
  if (!isLoaded) return <div className="dashboardLoading">Loading workspace…</div>;
  if (!userId) return null;

  const openSidebar = (mode = 'chats') => {
    setSidebarMode(mode);
    setIsSidebarOpen(true);
  };
  const startNewChat = () => navigate('/dashboard');

  return <div className={`dashboardLayout${isSidebarOpen ? ' sidebarOpen' : ' sidebarClosed'}`}>
    {!isSidebarOpen && <nav className="sidebarRail" aria-label="Main navigation">
      <button className="railBrand" type="button" onClick={() => openSidebar()} aria-label="Open sidebar" title="Open sidebar">
        <img src="/assets/logo.png" alt="" />
      </button>
      <div className="railActions">
        <button className="railButton railNewChat" type="button" onClick={startNewChat} aria-label="New chat" title="New chat">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" /></svg>
        </button>
        <button className="railButton" type="button" onClick={() => openSidebar('search')} aria-label="Search chats" title="Search chats">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 4.3 4.3" /></svg>
        </button>
        {hasPinnedChats && (
          <button className="railButton" type="button" onClick={() => openSidebar('chats')} aria-label="Pinned chats" title="Pinned chats">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-4 1-4 4-1 5-2-2-5 5-1-1 5-5-2-2 5-1 4-4Z" /></svg>
          </button>
        )}
        <button className="railButton" type="button" onClick={() => openSidebar('chats')} aria-label="Recent chats" title="Recent chats">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 11.4a8.2 8.2 0 0 1-8.3 8.2 8.6 8.6 0 0 1-3.8-.9L3 20l1.4-4.4a8 8 0 0 1-1-4.1 8.3 8.3 0 0 1 8.5-8.1 8.2 8.2 0 0 1 8.3 8Z" /></svg>
        </button>
      </div>
      <div className="railProfile"><UserButton /></div>
    </nav>}
    <button className="sidebarBackdrop" type="button" aria-label="Close sidebar" onClick={() => setIsSidebarOpen(false)} />
    <aside className="menu" aria-label="Chat navigation">
      <ChatList
        onClose={() => setIsSidebarOpen(false)}
        onOpen={openSidebar}
        onPinnedChatsChange={setHasPinnedChats}
        mode={sidebarMode}
        onModeChange={setSidebarMode}
      />
      <div className="sidebarProfile"><UserButton /></div>
    </aside>
    <div className="content"><Outlet /></div>
  </div>;
};
export default DashboardLayout;
