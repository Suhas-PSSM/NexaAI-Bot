import { useMutation, useQueryClient } from '@tanstack/react-query';
import './dashboardPage.css';
import { useNavigate } from 'react-router-dom';

const DashboardPage = () => {

  const queryClient = useQueryClient()

  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (text) => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    }).then((res) => res.json());
  },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['userChats'] });
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