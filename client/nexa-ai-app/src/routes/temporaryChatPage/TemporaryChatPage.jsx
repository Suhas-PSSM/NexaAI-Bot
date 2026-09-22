import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { IKImage } from 'imagekitio-react';
import Markdown from 'react-markdown';
import Upload from '../../components/upload/Upload';
import '../chatPage/chatPage.css';
import '../../components/newPrompt/newPrompt.css';
import './temporaryChatPage.css';

const emptyImage = {
  isLoading: false,
  error: '',
  dbData: {},
  previewUrl: '',
  aiData: {},
};

const TemporaryChatPage = () => {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState(emptyImage);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const reset = () => {
    setMessages([]);
    setDraft('');
    setImage(emptyImage);
    setError('');
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();

    if (!text || image.isLoading || isSending) return;

    setIsSending(true);
    setError('');
    setDraft('');
    setMessages((current) => [...current, { role: 'user', text }]);

    try {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          image: Object.keys(image.aiData).length ? image.aiData : null,
          history: messages.map((message) => ({
            role: message.role,
            text: message.text,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Temporary chat could not generate a response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';

      setMessages((current) => [...current, { role: 'model', text: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        answer += decoder.decode(value, { stream: true });
        setMessages((current) => {
          const next = [...current];
          next[next.length - 1] = { role: 'model', text: answer };
          return next;
        });
      }

      const remaining = decoder.decode();
      if (remaining) {
        answer += remaining;
        setMessages((current) => {
          const next = [...current];
          next[next.length - 1] = { role: 'model', text: answer };
          return next;
        });
      }

      setImage(emptyImage);
    } catch (sendError) {
      setError(sendError.message || 'Something went wrong. Please try again.');
      setMessages((current) => current.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="ChatPage temporaryChatPage">
      <div className="temporaryToolbar">
        <span className="temporaryBadge">PRIVATE MODE</span>
        {messages.length > 0 && (
          <button type="button" onClick={reset}>New temporary chat</button>
        )}
      </div>

      <div className="wrapper">
        <div className="chat">
          {!messages.length && (
            <div className="temporaryWelcome">
              <h1>What would you like to explore privately?</h1>
              <p>This conversation will not be saved to your chat history.</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              className={`message ${message.role === 'user' ? 'user' : ''}`}
              key={`${message.role}-${index}`}
            >
              <Markdown>{message.text || 'Thinking...'}</Markdown>
            </div>
          ))}
          <div className="endChat" ref={endRef} />
        </div>
      </div>

      <div className="temporaryComposer">
        {image.error && <span className="temporaryError">{image.error}</span>}
        {image.previewUrl && (
          <img className="uploadedImagePreview" src={image.previewUrl} alt="Selected attachment" />
        )}
        <form className="newForm" onSubmit={sendMessage}>
          <Upload setImg={setImage} />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask me anything..."
            aria-label="Temporary chat message"
          />
          <button type="submit" disabled={image.isLoading || isSending || !draft.trim()}>
            <img src="/assets/send.png" alt="Send" />
          </button>
        </form>
        {error && <span className="temporaryError">{error}</span>}
      </div>
    </div>
  );
};

export default TemporaryChatPage;
