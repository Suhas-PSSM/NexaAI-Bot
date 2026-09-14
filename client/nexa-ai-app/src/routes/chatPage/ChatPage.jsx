import './chatPage.css';
import NewPrompt from '../../components/newPrompt/NewPrompt';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import Markdown from 'react-markdown';
import { IKImage } from 'imagekitio-react';
import { useAuth } from '@clerk/react';

const ChatPage = () => {

  const { getToken } = useAuth();

  const path = useLocation().pathname
  const chatId = path.split('/').pop();

  const { isPending, error, data} = useQuery({
            queryKey: ['chat', chatId],
            queryFn: async () => {
                const token = await getToken();

                const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chats/${chatId}`, {
                    credentials: 'include',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`Request failed: ${response.status}`);
                }

                return response.json();
            },
        });

  return (
    <div className="ChatPage">
      <div className="wrapper">
        <div className="chat">
          {isPending ? "Loading..." : error ? "Something went wrong" : data?.history?.map((message, i) => (
            <>
            {message.img && (
              <IKImage
              urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
              path={message.img}
              height="300"
              width="400"
              transformation={[{
                "height": "300",
                "width": "400"
              }]}
              loading="lazy"
              lqip={{ active: true, quality: 20 }}
              />
            )}
            <div className={
              message.role === "user" ? "message user" : "message"
             } key={i}>
              <Markdown>{message.parts[0].text}</Markdown>
            </div>
            </>
          ))}

          {data && <NewPrompt data={data} />}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;