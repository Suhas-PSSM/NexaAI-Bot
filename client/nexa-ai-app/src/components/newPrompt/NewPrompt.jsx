import { useState, useEffect, useRef } from 'react';
import { IKContext, IKImage, IKUpload } from "imagekitio-react";
import './newPrompt.css'
import Upload from '../upload/Upload';
import Markdown from 'react-markdown';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const NewPrompt = ({data}) => {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [img, setImg] = useState({
        isLoading:false,
        error:"",
        dbData:{},
        aiData:{}
    });

        const endRef = useRef(null);
      const formRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data, question, answer, img.dbData]);

 const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${data._id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: question.length ? question : undefined,
        answer,
        img: img.dbData?.filePath || undefined,
       }),
    }).then((res) => res.json());
  },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', data._id] }).then(() => {
        formRef.current.reset();
        setQuestion('');
        setAnswer('');
        setImg({isLoading:false,
        error:"",
        dbData:{},
        aiData:{}
    });
      });
    },
    onError: (err) => {
      console.log(err);
    },
  });

  const add = async (text, isInitial) => {
    if (!isInitial)
      setQuestion(text);

    try{
  const response = await fetch(
  `${import.meta.env.VITE_API_URL}/api/gemini`,
  {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      image: Object.entries(img.aiData).length
        ? img.aiData
        : null,
    }),
  }
);

if (!response.ok) {
  const errorText = await response.text();
  throw new Error(errorText || "Gemini request failed");
}

const reader = response.body.getReader();
const decoder = new TextDecoder();

let accumulatedText = "";

while (true) {
  const { value, done } = await reader.read();

  if (done) break;

  const chunkText = decoder.decode(value, {
    stream: true,
  });

  accumulatedText += chunkText;
  setAnswer(accumulatedText);
}

    mutation.mutate();
  }catch(err){
    console.log(err)
  }
};

    const handleSubmit = async (e) => {e.preventDefault()

        const text = e.target.text.value;
        if (!text) return;

        add(text, false);
    };

    // IN PRODUCTION WE DON'T NEED IT
    const hasRun = useRef(false);
    useEffect(() => {
      if (!hasRun.current) {
      if (data?.history?.length === 1) {
        add(data.history[0].parts[0].text, true);
      }
    }
    hasRun.current = true;
    },[]);

  return (
    <>
    {/* ADD NEW CHAT */}
    {img.isLoading && <div className='loading'>Loading...</div>}
    {img.dbData?.filePath && (<IKImage urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
    path={img.dbData?.filePath}
    width="380"
    transformation={[{
        "width": "380"}]}
     />
     )}
    {question && <div className='message user'>{question}</div>}
    {answer && <div className='message'><Markdown>{answer}</Markdown></div>}
    <div className="endChat" ref={endRef}></div>
        <form className='newForm' onSubmit={handleSubmit} ref={formRef}>
            <Upload setImg={setImg} />
            <input id='file' type='file' multiple={false} hidden />
            <input type='text' name='text' placeholder='Ask me anything...' />
            <button >
                <img src="/assets/send.png" alt='' />
            </button>
        </form>
    </>
  )
}

export default NewPrompt;   