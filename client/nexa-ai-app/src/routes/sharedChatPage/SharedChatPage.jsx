import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { IKImage } from 'imagekitio-react';
import './sharedChatPage.css';

const SharedChatPage = () => {
  const { shareId } = useParams();
  const { isPending, error, data } = useQuery({
    queryKey: ['sharedChat', shareId],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/shared-chats/${shareId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load this shared conversation.');
      return result;
    },
  });

  return (
    <div className="sharedChatPage">
      <div className="sharedChatHeader">
        <Link to="/" className="sharedChatBrand">
          <img src="/assets/logo.png" alt="" />
          <span>Nexa AI</span>
        </Link>
        <span>Shared conversation · Read only</span>
      </div>
      <div className="sharedChatScroll">
        <main className="sharedChatContent">
          {isPending ? (
            <p className="sharedChatStatus">Loading shared conversation…</p>
          ) : error ? (
            <p className="sharedChatStatus" role="alert">{error.message}</p>
          ) : (
            <>
              <h1>{data.title}</h1>
              {data.history.map((message, index) => (
                <article className={`sharedMessage${message.role === 'user' ? ' user' : ''}`} key={`${index}-${message.role}`}>
                  {message.img && (
                    <IKImage
                      className="sharedMessageImage"
                      urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
                      path={message.img}
                      width="600"
                      transformation={[{ width: '600' }]}
                      loading="lazy"
                    />
                  )}
                  {message.parts.map((part, partIndex) => (
                    <Markdown key={partIndex}>{part.text}</Markdown>
                  ))}
                </article>
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default SharedChatPage;
