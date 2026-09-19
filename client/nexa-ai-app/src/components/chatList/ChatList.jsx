import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './chatList.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import { useApi } from '../../lib/api';

const ChatList = () => {
    const { getToken, isLoaded, userId } = useAuth();
    const { apiFetch } = useApi();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    const [openMenuId, setOpenMenuId] = useState(null);
    const [editingChatId, setEditingChatId] = useState(null);
    const [editingTitle, setEditingTitle] = useState('');
    const [notice, setNotice] = useState('');

    const {
        isPending,
        error,
        data
    } = useQuery({
        queryKey: ['userChats'],
        enabled: isLoaded && !!userId,
        queryFn: async () => {
            const token = await getToken();
            if (!token) {
                throw new Error("Clerk token not available");
            }
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/userchats`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    errorText ||
                    `Request failed with status ${response.status}`
                );
            }
            return response.json();
        },
    });

    const chatMutation = useMutation({
        mutationFn: async ({ id, action, payload }) => {
            const response = await apiFetch(
                `${import.meta.env.VITE_API_URL}${action === 'delete' ? `/api/chats/${id}` : `/api/userchats/${id}`}`,
                {
                    method: action === 'delete' ? 'DELETE' : 'PATCH',
                    ...(payload && { body: JSON.stringify(payload) }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Unable to update chat');
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['userChats'] });
            setOpenMenuId(null);
            setEditingChatId(null);

            if (
                variables.action === 'delete' &&
                location.pathname.endsWith(variables.id)
            ) {
                navigate('/dashboard');
            }
        },
        onError: (mutationError) => {
            setNotice(mutationError.message || 'Unable to update chat');
        },
    });

    const startRename = (chat) => {
        setEditingChatId(chat._id);
        setEditingTitle(chat.title);
        setOpenMenuId(null);
        setNotice('');
    };

    const saveRename = (chatId) => {
        if (!editingTitle.trim()) {
            setNotice('A chat title is required');
            return;
        }

        chatMutation.mutate({
            id: chatId,
            action: 'update',
            payload: { title: editingTitle },
        });
    };

    const shareChat = async (chat) => {
        const shareUrl = `${window.location.origin}/dashboard/chats/${chat._id}`;

        try {
            if (navigator.share) {
                await navigator.share({ title: chat.title, url: shareUrl });
            } else {
                await navigator.clipboard.writeText(shareUrl);
                setNotice('Chat link copied');
            }
            setOpenMenuId(null);
        } catch (shareError) {
            if (shareError.name !== 'AbortError') {
                setNotice('Unable to share this chat');
            }
        }
    };

    const deleteChat = (chat) => {
        if (!window.confirm(`Delete "${chat.title}"? This cannot be undone.`)) {
            return;
        }

        chatMutation.mutate({ id: chat._id, action: 'delete' });
    };

    const renderChat = (chat) => (
        <div className="chatRow" key={chat._id}>
            {editingChatId === chat._id ? (
                <form
                    className="renameForm"
                    onSubmit={(event) => {
                        event.preventDefault();
                        saveRename(chat._id);
                    }}
                >
                    <input
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        maxLength={80}
                        autoFocus
                    />
                    <button type="submit" aria-label="Save chat name">Save</button>
                    <button type="button" onClick={() => setEditingChatId(null)}>Cancel</button>
                </form>
            ) : (
                <Link className="chatLink" to={`/dashboard/chats/${chat._id}`}>
                    <span className="chatTitle">{chat.title}</span>
                    {chat.pinned && <span className="pinMark" aria-label="Pinned">*</span>}
                </Link>
            )}

            {editingChatId !== chat._id && (
                <div className="chatActions">
                    <button
                        className="moreButton"
                        type="button"
                        aria-label={`More options for ${chat.title}`}
                        aria-expanded={openMenuId === chat._id}
                        onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(openMenuId === chat._id ? null : chat._id);
                            setNotice('');
                        }}
                    >
                        ...
                    </button>
                    {openMenuId === chat._id && (
                        <div className="chatMenu" role="menu">
                            <button type="button" onClick={() => shareChat(chat)}>Share</button>
                            <button type="button" onClick={() => startRename(chat)}>Rename</button>
                            <button
                                type="button"
                                onClick={() => chatMutation.mutate({
                                    id: chat._id,
                                    action: 'update',
                                    payload: { pinned: !chat.pinned },
                                })}
                            >
                                {chat.pinned ? 'Unpin chat' : 'Pin chat'}
                            </button>
                            <button
                                type="button"
                                onClick={() => chatMutation.mutate({
                                    id: chat._id,
                                    action: 'update',
                                    payload: { archived: !chat.archived },
                                })}
                            >
                                {chat.archived ? 'Unarchive chat' : 'Archive chat'}
                            </button>
                            <button className="danger" type="button" onClick={() => deleteChat(chat)}>Delete</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const activeChats = data?.filter((chat) => !chat.archived) || [];
    const archivedChats = data?.filter((chat) => chat.archived) || [];

    return (
        <div className="chatList">
            <Link to="/dashboard">
                Create a new Chat
            </Link>

            <Link to="/dashboard/temporary">
                Temporary chat
            </Link>

            <Link to="/">
                Contact
            </Link>

            <hr />

            <span className="title">
                RECENT CHATS
            </span>

            <div className="list">
                {!isLoaded
                    ? "Loading..."
                    : isPending
                    ? "Loading..."
                    : error
                    ? "Something went wrong"
                    : activeChats.length
                    ? activeChats.map(renderChat)
                    : "No recent chats"
                }
            </div>

            {archivedChats.length > 0 && (
                <>
                    <span className="title archivedTitle">ARCHIVED</span>
                    <div className="list archivedList">{archivedChats.map(renderChat)}</div>
                </>
            )}

            {notice && <div className="chatNotice" role="status">{notice}</div>}

            <hr />

            <div className="upgrade">

                <img
                    src="/assets/logo.png"
                    alt=""
                />

                <div className="texts">

                    <span>
                        Upgrade to Nexa AI Pro
                    </span>

                    <span>
                        Get unlimited access to all features
                    </span>

                </div>

            </div>

        </div>
    );
};

export default ChatList;