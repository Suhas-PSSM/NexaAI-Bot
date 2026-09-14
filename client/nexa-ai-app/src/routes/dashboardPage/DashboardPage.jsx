import { useMutation, useQueryClient } from '@tanstack/react-query';
import './dashboardPage.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';

const DashboardPage = () => {
  const { getToken } = useAuth();

  const queryClient = useQueryClient()

  const navigate = useNavigate();

 const mutation = useMutation({
    mutationFn: async (text) => {

        const token = await getToken();

        const response = await fetch(
            `${import.meta.env.VITE_API_URL}/api/chats`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },

                body: JSON.stringify({ text }),
            }
        );

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }

        return response.text();
    },

    onSuccess: (id) => {
        queryClient.invalidateQueries({
            queryKey: ['userChats']
        });

        navigate(`/dashboard/chats/${id}`);
    },
});
  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = e.target.text.value;
    if (!text) return;
    
    mutation.mutate(text);
  };

  return (
    <div className="dashboardPage">
      <div className='texts'>
        <div className='logo'>
          <img src="/assets/logo.png" alt="" />
          <h1>Nexa AI</h1>
        </div>
        <div className='options'>
          <div className='option'>
            <img src="/assets/Chat.png" alt="" />
            <span>Create a New Chat</span>
          </div>
          <div className='option'>
            <img src="/assets/image_analysis.png" alt="" />
            <span>Analyze Images</span>
          </div>
          <div className='option'>
            <img src="/assets/code.png" alt="" />
            <span>Help me with my code</span>
          </div>
        </div>
      </div>
      <div className='formContainer'>
        <form onSubmit={handleSubmit}>
          <input type="text" name="text" placeholder='Ask me anything...' />
          <button>
            <img src="/assets/send.png" alt="" />
          </button>
        </form>
      </div>
    </div>
  )
}

export default DashboardPage;