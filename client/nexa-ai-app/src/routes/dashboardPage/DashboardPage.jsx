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
