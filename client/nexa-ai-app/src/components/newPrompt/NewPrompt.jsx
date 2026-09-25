import { useState, useEffect, useRef } from 'react';
import { IKImage } from "imagekitio-react";
import './newPrompt.css';
import Upload from '../upload/Upload';
import Markdown from 'react-markdown';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import DictateButton from '../dictateButton/DictateButton';

const NewPrompt = ({ data, initialImage }) => {

  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [draft, setDraft] = useState('');

  const [img, setImg] = useState({
    isLoading: false,
    error: "",
    dbData: {},
    previewUrl: '',
    aiData: initialImage || {}
  });

  const endRef = useRef(null);
  const formRef = useRef(null);

  const queryClient = useQueryClient();

  // ==========================================
  // AUTO SCROLL
  // ==========================================

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  }, [data, question, answer, img.dbData]);


  // ==========================================
  // UPDATE CHAT IN DATABASE
  // ==========================================

  const mutation = useMutation({

    mutationFn: async () => {

      const token = await getToken({ skipCache: true });

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/chats/${data._id}`,
        {
          method: "PUT",
          credentials: "include",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            question: question.length ? question : undefined,
            answer,
            img: img.dbData?.filePath || undefined,
          }),
        }
      );

      if (!response.ok) {

        const errorText = await response.text();

        throw new Error(
          errorText || `Request failed with status ${response.status}`
        );
      }

      return response.json();
    },

    onSuccess: () => {

      queryClient
        .invalidateQueries({
          queryKey: ['chat', data._id]
        })
        .then(() => {

          if (formRef.current) {
            formRef.current.reset();
          }

          setQuestion('');
          setAnswer('');
          setDraft('');

          setImg({
            isLoading: false,
            error: "",
            dbData: {},
            previewUrl: '',
            aiData: {}
          });

        });
    },

    onError: (err) => {
      console.error("Error updating chat:", err);
    },
  });


  // ==========================================
  // SEND MESSAGE TO GEMINI
  // ==========================================

  const add = async (text, isInitial) => {

    if (!isInitial) {
      setQuestion(text);
    }

    try {

      // Get Clerk authentication token
      if (!isLoaded || !isSignedIn) {
        throw new Error('Please sign in before sending a message.');
      }

      const token = await getToken({ skipCache: true });

      if (!token) {
        throw new Error("User authentication token not available");
      }

      // ========================================
      // CALL BACKEND GEMINI API
      // ========================================

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gemini`,
        {
          method: "POST",
          credentials: "include",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            text,

            image:
              Object.entries(img.aiData).length
                ? img.aiData
                : null,
          }),
        }
      );


      // ========================================
      // CHECK RESPONSE
      // ========================================

      if (!response.ok) {

        const errorText = await response.text();

        throw new Error(
          errorText || `Gemini request failed with status ${response.status}`
        );
      }


      // ========================================
      // READ STREAM
      // ========================================

      if (!response.body) {
        throw new Error("No response body received from Gemini");
      }

      const reader = response.body.getReader();

      const decoder = new TextDecoder();

      let accumulatedText = "";


      while (true) {

        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        const chunkText = decoder.decode(
          value,
          {
            stream: true
          }
        );

        accumulatedText += chunkText;

        setAnswer(accumulatedText);
      }


      // Flush remaining decoder content
      const remainingText = decoder.decode();

      if (remainingText) {
        accumulatedText += remainingText;
        setAnswer(accumulatedText);
      }


      // ========================================
      // SAVE CONVERSATION TO DATABASE
      // ========================================

      mutation.mutate();

    } catch (err) {

      console.error("Gemini error:", err);

      setAnswer(
        "Sorry, something went wrong while generating the response."
      );
    }
  };


  // ==========================================
  // FORM SUBMIT
  // ==========================================

  const handleSubmit = async (e) => {

    e.preventDefault();

    const text = draft.trim();

    if (!text || img.isLoading || mutation.isPending) {
      return;
    }

    await add(text, false);
  };


  // ==========================================
  // INITIAL MESSAGE
  // ==========================================

  const hasRun = useRef(false);

  useEffect(() => {

    if (!hasRun.current) {

      if (data?.history?.length === 1) {

        add(
          data.history[0].parts[0].text,
          true
        );

      }
    }

    hasRun.current = true;

  }, []);


  // ==========================================
  // UI
  // ==========================================

  return (
    <>
      {/* IMAGE UPLOAD LOADING */}

      {img.isLoading && (
        <div className='loading'>
          Loading...
        </div>
      )}

      {img.error && (
        <div className="uploadError">
          {img.error}
        </div>
      )}


      {/* UPLOADED IMAGE */}

      {img.dbData?.filePath ? (
        <IKImage
          urlEndpoint={
            import.meta.env.VITE_IMAGE_KIT_ENDPOINT
          }

          path={img.dbData.filePath}

          width="380"

          transformation={[
            {
              width: "380"
            }
          ]}
        />
      ) : img.previewUrl ? (
        <img
          className="uploadedImagePreview"
          src={img.previewUrl}
          alt="Selected attachment"
        />
      ) : null}


      {/* USER QUESTION */}

      {question && (
        <div className='message user'>
          {question}
        </div>
      )}


      {/* AI ANSWER */}

      {answer && (
        <div className='message'>
          <Markdown>
            {answer}
          </Markdown>
        </div>
      )}


      {/* SCROLL TARGET */}

      <div
        className="endChat"
        ref={endRef}
      ></div>


      {/* NEW PROMPT FORM */}

      <form
        className='newForm'
        onSubmit={handleSubmit}
        ref={formRef}
      >

        <Upload setImg={setImg} />

        <input
          id='file'
          type='file'
          multiple={false}
          hidden
        />

        <input
          type='text'
          name='text'
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
          <img
            src="/assets/send.png"
            alt="Send"
          />
        </button>

      </form>
    </>
  );
};

export default NewPrompt;
