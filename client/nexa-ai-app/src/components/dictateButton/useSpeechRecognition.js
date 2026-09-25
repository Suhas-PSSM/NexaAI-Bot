import { useCallback, useEffect, useRef, useState } from 'react';

const getRecognitionConstructor = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const getErrorMessage = (error) => {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied.';
    case 'audio-capture':
      return 'No microphone is available.';
    case 'no-speech':
      return 'Could not detect speech. Please try again.';
    case 'network':
      return 'Speech recognition is unavailable. Please check your connection.';
    default:
      return 'Speech recognition could not start. Please try again.';
  }
};

export const useSpeechRecognition = ({ onTranscript }) => {
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  const isStartingRef = useRef(false);
  const [isSupported] = useState(() => Boolean(getRecognitionConstructor()));
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;

    if (!recognition) {
      return;
    }

    recognition.stop();
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = getRecognitionConstructor();

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    if (recognitionRef.current || isStartingRef.current) {
      return;
    }

    setError('');
    isStartingRef.current = true;
    setIsStarting(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => {
      isStartingRef.current = false;
      setIsStarting(false);
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;

        if (event.results[index].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      onTranscriptRef.current({ finalTranscript, interimTranscript });
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(getErrorMessage(event.error));
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        isStartingRef.current = false;
        setIsStarting(false);
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      isStartingRef.current = false;
      setIsStarting(false);
      setError('Speech recognition could not start. Please try again.');
    }
  }, []);

  useEffect(() => () => {
    const recognition = recognitionRef.current;

    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
    }
  }, []);

  return {
    error,
    isListening,
    isStarting,
    isSupported,
    start,
    stop,
  };
};
