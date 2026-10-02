import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import './dashboardPage.css';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import { IKImage } from 'imagekitio-react';
import Upload from '../../components/upload/Upload';
import DictateButton from '../../components/dictateButton/DictateButton';

const DashboardPage = () => {
  const { getToken } = useAuth();

  const queryClient = useQueryClient()

  const navigate = useNavigate();

  const [img, setImg] = useState({
    isLoading: false,
    error: '',
    dbData: {},
    previewUrl: '',
    aiData: {},
  });
  const [draft, setDraft] = useState('');
  const [isCreatingVoiceChat, setIsCreatingVoiceChat] = useState(false);
  const [voiceError, setVoiceError] = useState('');

 const mutation = useMutation({
    mutationFn: async ({ text, filePath }) => {

        const token = await getToken();

        const response = await fetch(
            `${import.meta.env.VITE_API_URL}/api/chats`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },

                body: JSON.stringify({
                  text,
                  img: filePath || undefined,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }

        return response.json();
    },

    onSuccess: (id, variables) => {
      setDraft('');
        queryClient.invalidateQueries({
            queryKey: ['userChats']
        });

        navigate(`/dashboard/chats/${id}`, {
          state: { initialImage: variables.image },
        });
    },
});
  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text || img.isLoading || mutation.isPending) return;
    
    mutation.mutate({
      text,
      image: Object.keys(img.aiData).length ? img.aiData : null,
      filePath: img.dbData?.filePath,
    });
  };

  const handleStartVoice = async () => {
    setIsCreatingVoiceChat(true);
    setVoiceError('');

    try {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error('Please sign in again before starting voice mode.');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chats/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create a voice conversation.');

      await queryClient.invalidateQueries({ queryKey: ['userChats'] });
      navigate(`/dashboard/chats/${result.id}`, { state: { startVoice: true } });
    } catch (error) {
      setVoiceError(error.message || 'Unable to start a voice conversation.');
    } finally {
      setIsCreatingVoiceChat(false);
    }
  };

  return (
    <div className="dashboardPage">
      <div className='texts'>
        <div className='logo'>
          <img src="/assets/logo.png" alt="" />
          <h1>Nexa AI</h1>
        </div>
      </div>
      <div className='formContainer'>
        {img.error && <span className="uploadError">{img.error}</span>}
        {voiceError && <span className="uploadError" role="alert">{voiceError}</span>}
        {img.dbData?.filePath ? (
          <IKImage
            className="uploadedImagePreview"
            urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
            path={img.dbData.filePath}
            width="380"
            transformation={[{ width: "380" }]}
          />
        ) : img.previewUrl ? (
          <img
            className="uploadedImagePreview"
            src={img.previewUrl}
            alt="Selected attachment"
          />
        ) : null}
        <form onSubmit={handleSubmit}>
          <Upload setImg={setImg} />
          <input
            type="text"
            name="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder='Ask me anything...'
          />
          <button
            className="voiceHomeButton"
            type="button"
            onClick={handleStartVoice}
            disabled={isCreatingVoiceChat || mutation.isPending || img.isLoading || !!draft.trim()}
            aria-label="Start voice conversation"
            title={draft.trim() ? 'Send or clear your draft before starting voice' : 'Start voice conversation'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8" /></svg>
          </button>
          <DictateButton
            value={draft}
            onValueChange={setDraft}
            disabled={img.isLoading || mutation.isPending}
          />
          <button
            type="submit"
            disabled={img.isLoading || mutation.isPending || !draft.trim()}
          >
            <img src="/assets/send.png" alt="" />
          </button>
        </form>
      </div>
    </div>
  )
}

export default DashboardPage;
