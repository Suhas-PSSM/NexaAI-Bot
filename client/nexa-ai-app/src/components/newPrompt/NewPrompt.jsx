import { useState, useEffect, useRef } from 'react';
import { IKImage } from "imagekitio-react";
import './newPrompt.css';
import Upload from '../upload/Upload';
import Markdown from 'react-markdown';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';

const NewPrompt = ({ data }) => {

  const { getToken } = useAuth();

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const [img, setImg] = useState({
    isLoading: false,
    error: "",
    dbData: {},
    aiData: {}
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

      const token = await getToken();

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/chats/${data._id}`,
        {
          method: "PUT",

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

          setImg({
            isLoading: false,
            error: "",
            dbData: {},
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
      const token = await getToken();

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

    const text = e.target.text.value.trim();

    if (!text) {
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


      {/* UPLOADED IMAGE */}

      {img.dbData?.filePath && (
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
      )}


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
          placeholder='Ask me anything...'
        />

        <button type="submit">
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