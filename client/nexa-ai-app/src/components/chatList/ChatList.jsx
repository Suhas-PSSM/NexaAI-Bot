import { Link } from 'react-router-dom';
import './chatList.css';
import { useAuth } from '@clerk/react';
import { useQuery } from '@tanstack/react-query';

const ChatList = () => {

    const { getToken } = useAuth();

    const { isPending, error, data } = useQuery({
        queryKey: ['userChats'],

        queryFn: async () => {
            const token = await getToken();

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/userchats`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Request failed: ${response.status}`);
            }

            return response.json();
        },
    });

    return (
        <div className="chatList">
            <span className="title">DASHBOARD</span>
            <Link to="/dashboard">Create a new Chat</Link>
            <Link to="/">Explore Nexa AI</Link>
            <Link to="/">Contact</Link>
            <hr/>
            <span className="title">RECENT CHATS</span>
            <div className='list'>
                {isPending ? "Loading..." : error ? "Something went wrong" : data?.map((chat) => (
                    <Link to={`/dashboard/chats/${chat._id}`} key={chat._id}>
                        {chat.title} 
                    </Link>
                ))}
            </div>
            <hr/>
            <div className='upgrade'>
                <img src="/assets/logo.png" alt="" />
                <div className='texts'>
                    <span>Upgrade to Nexa AI Pro</span>
                    <span>Get unlimited access to all features</span>
                </div>
            </div>
        </div>
    );
}

export default ChatList;