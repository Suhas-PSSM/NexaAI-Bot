import { Link } from 'react-router-dom';
import './chatList.css';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';

const ChatList = () => {

    const { getToken, isLoaded, userId } = useAuth();

    const {
        isPending,
        error,
        data
    } = useQuery({

        queryKey: ['userChats'],

        enabled: isLoaded && !!userId,

        queryFn: async () => {

            const token = await getToken();

            console.log("Clerk token exists:", !!token);

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

            console.log(
                "User chats response:",
                response.status
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

    return (
        <div className="chatList">

            <span className="title">
                DASHBOARD
            </span>

            <Link to="/dashboard">
                Create a new Chat
            </Link>

            <Link to="/">
                Explore Nexa AI
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

                    : data?.map((chat) => (
                        <Link
                            to={`/dashboard/chats/${chat._id}`}
                            key={chat._id}
                        >
                            {chat.title}
                        </Link>
                    ))
                }

            </div>

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