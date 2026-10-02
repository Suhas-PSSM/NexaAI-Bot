import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './chatList.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { useApi } from '../../lib/api';

const getChatTimestamp = (chat, field) => {
  const timestamp = new Date(chat[field] || chat.createdAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareChatsByRecency = (first, second) => {
  const pinnedOrder = Number(Boolean(second.pinned)) - Number(Boolean(first.pinned));
  if (pinnedOrder) return pinnedOrder;

  const activityOrder = getChatTimestamp(second, 'lastMessageAt') - getChatTimestamp(first, 'lastMessageAt');
  if (activityOrder) return activityOrder;

  const createdOrder = getChatTimestamp(second, 'createdAt') - getChatTimestamp(first, 'createdAt');
  if (createdOrder) return createdOrder;

  return String(first._id).localeCompare(String(second._id));
};

const ChatList = ({ onClose, onOpen, mode, onModeChange }) => {
  const { getToken, isLoaded, userId } = useAuth();
  const { apiFetch } = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [notice, setNotice] = useState('');

  const { isPending, error, data = [] } = useQuery({
    queryKey: ['userChats'],
    enabled: isLoaded && !!userId,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again to load chats.');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/userchats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unable to load conversations.');
      }
      return response.json();
    },
  });

  const chatMutation = useMutation({
    onMutate: async ({ id, payload, action }) => {
      await queryClient.cancelQueries({ queryKey: ['userChats'] });
      const previousChats = queryClient.getQueryData(['userChats']);
      queryClient.setQueryData(['userChats'], chats => {
        if (!chats) return chats;
        const updatedChats = action === 'delete'
          ? chats.filter(chat => chat._id !== id)
          : chats.map(chat => chat._id === id ? { ...chat, ...payload } : chat);
        return updatedChats.sort(compareChatsByRecency);
      });
      return { previousChats };
    },
    mutationFn: async ({ id, action, payload }) => {
      const response = await apiFetch(
        `${import.meta.env.VITE_API_URL}${action === 'delete' ? `/api/chats/${id}` : `/api/userchats/${id}`}`,
        {
          method: action === 'delete' ? 'DELETE' : 'PATCH',
          ...(payload && { body: JSON.stringify(payload) }),
        },
      );
      if (!response.ok) {
        throw new Error(action === 'delete' ? 'Unable to delete this chat.' : 'Unable to save chat changes.');
      }
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['userChats'] });
      setOpenMenuId(null);
      setEditingChatId(null);
      if (variables.action === 'delete' && location.pathname.endsWith(variables.id)) navigate('/dashboard');
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previousChats) queryClient.setQueryData(['userChats'], context.previousChats);
      setNotice(mutationError.message);
    },
  });

  const sortedChats = useMemo(() => [...data].sort(compareChatsByRecency), [data]);
  const visibleChats = useMemo(
    () => sortedChats.filter(chat => chat.title.toLowerCase().includes(searchTerm.trim().toLowerCase())),
    [sortedChats, searchTerm],
  );
  const pinnedChats = visibleChats.filter(chat => chat.pinned);
  const recentChats = visibleChats.filter(chat => !chat.pinned);

  useEffect(() => {
    const openSearch = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpen('search');
        requestAnimationFrame(() => document.querySelector('.searchInputWrap input')?.focus());
      }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, [onOpen]);

  useEffect(() => {
    if (mode === 'search') {
      requestAnimationFrame(() => document.querySelector('.searchInputWrap input')?.focus());
    }
  }, [mode]);

  const go = path => {
    navigate(path);
    if (window.matchMedia('(max-width: 760px)').matches) onClose();
  };
  const newChat = () => go('/dashboard');
  const saveRename = id => {
    if (!editingTitle.trim()) {
      setNotice('A chat title is required.');
      return;
    }
    chatMutation.mutate({ id, action: 'update', payload: { title: editingTitle } });
  };

  const renderChat = chat => {
    const active = location.pathname.endsWith(chat._id);
    return (
      <div className={`chatRow${active ? ' active' : ''}`} key={chat._id}>
        {editingChatId === chat._id ? (
          <form className="renameForm" onSubmit={event => { event.preventDefault(); saveRename(chat._id); }}>
            <input value={editingTitle} onChange={event => setEditingTitle(event.target.value)} maxLength={80} autoFocus aria-label="Chat title" />
            <button type="submit" disabled={chatMutation.isPending}>Save</button>
            <button type="button" onClick={() => setEditingChatId(null)}>Cancel</button>
          </form>
        ) : (
          <button className="chatLink" type="button" onClick={() => go(`/dashboard/chats/${chat._id}`)} aria-current={active ? 'page' : undefined}>
            <span className="chatTitle">{chat.title}</span>
          </button>
        )}
        {editingChatId !== chat._id && (
          <div className="chatActions">
            <button
              className="moreButton"
              type="button"
              aria-label={`More options for ${chat.title}`}
              aria-expanded={openMenuId === chat._id}
              onClick={() => { setOpenMenuId(openMenuId === chat._id ? null : chat._id); setNotice(''); }}
            >
              •••
            </button>
            {openMenuId === chat._id && (
              <div className="chatMenu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setEditingChatId(chat._id); setEditingTitle(chat.title); setOpenMenuId(null); }}>Rename</button>
                <button type="button" role="menuitem" onClick={() => chatMutation.mutate({ id: chat._id, action: 'update', payload: { pinned: !chat.pinned } })}>
                  {chat.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button className="danger" type="button" role="menuitem" onClick={() => {
                  if (window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) {
                    chatMutation.mutate({ id: chat._id, action: 'delete' });
                  }
                }}>Delete</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="chatList">
      <div className="sidebarTop">
        <button className="brandButton" type="button" onClick={newChat} aria-label="Start a new chat">
          <img src="/assets/logo.png" alt="" /><span>Nexa AI</span>
        </button>
        <button className="closeButton" type="button" onClick={onClose} aria-label="Collapse sidebar" title="Collapse sidebar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" /></svg>
        </button>
      </div>
      <button className="newChatButton" type="button" onClick={newChat}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" /></svg><span>New chat</span>
      </button>
      <button className="searchButton" type="button" onClick={() => { onModeChange('search'); setNotice(''); }} aria-label="Search chats">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 4.3 4.3" /></svg>
        <span>Search chats</span><kbd>Ctrl K</kbd>
      </button>
      {mode === 'search' ? (
        <div className="searchPanel">
          <div className="searchInputWrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2" /><path d="m16.2 16.2 4.3 4.3" /></svg>
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
            <button type="button" onClick={() => { onModeChange('chats'); setSearchTerm(''); }} aria-label="Close search">×</button>
          </div>
          <div className="searchResults">
            {isPending ? <p>Searching conversations…</p>
              : error ? <p role="alert">{error.message}</p>
                : !searchTerm.trim() ? <p>Type to search your conversations.</p>
                  : visibleChats.length ? visibleChats.map(renderChat) : <p>No conversations found.</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="list recentList">
            {isPending ? <p className="listStatus">Loading conversations…</p>
              : error ? (
                <div className="listStatus" role="alert">
                  <p>{error.message}</p>
                  <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['userChats'] })}>Try again</button>
                </div>
              ) : (
                <>
                  {pinnedChats.length > 0 && (
                    <section className="chatSection" aria-label="Pinned chats">
                      <div className="sectionHeader">Pinned chats</div>
                      {pinnedChats.map(renderChat)}
                    </section>
                  )}
                  <section className="chatSection" aria-label="Recent chats">
                    <div className="sectionHeader">Recent chats</div>
                    {recentChats.length
                      ? recentChats.map(renderChat)
                      : pinnedChats.length === 0 && <p className="listStatus">No conversations yet.</p>}
                  </section>
                </>
              )}
          </div>
        </>
      )}
      {notice && <div className="chatNotice" role="status">{notice}</div>}
    </div>
  );
};

export default ChatList;
