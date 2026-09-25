import { useCallback, useEffect, useRef } from 'react';
import './dictateButton.css';
import { useSpeechRecognition } from './useSpeechRecognition';

const joinTranscript = (prefix, transcript, suffix) => {
  if (!transcript) {
    return `${prefix}${suffix}`;
  }

  if (suffix) {
    return `${prefix}${transcript}${suffix}`;
  }

  if (!prefix || /\s$/.test(prefix)) {
    return `${prefix}${transcript}`;
  }

  return `${prefix} ${transcript}`;
};

const DictateButton = ({ disabled = false, onValueChange, value }) => {
  const valueRef = useRef(value);
  const sessionRef = useRef({
    lastDictatedValue: '',
    prefix: '',
    suffix: '',
    transcript: '',
  });
  const isUpdatingFromDictationRef = useRef(false);

  const handleTranscript = useCallback(({ finalTranscript, interimTranscript }) => {
    const session = sessionRef.current;
    const transcript = `${finalTranscript}${interimTranscript}`.trim();
    const nextValue = joinTranscript(session.prefix, transcript, session.suffix);

    session.transcript = transcript;
    session.lastDictatedValue = nextValue;
    isUpdatingFromDictationRef.current = true;
    onValueChange(nextValue);
  }, [onValueChange]);

  const {
    error,
    isListening,
    isStarting,
    isSupported,
    start,
    stop,
  } = useSpeechRecognition({ onTranscript: handleTranscript });

  const isActive = isListening || isStarting;

  useEffect(() => {
    const session = sessionRef.current;

    if (isUpdatingFromDictationRef.current && value === session.lastDictatedValue) {
      isUpdatingFromDictationRef.current = false;
    } else if (isActive && value !== session.lastDictatedValue) {
      const transcriptIndex = session.transcript
        ? value.lastIndexOf(session.transcript)
        : -1;

      if (transcriptIndex >= 0) {
        session.prefix = value.slice(0, transcriptIndex);
        session.suffix = value.slice(transcriptIndex + session.transcript.length);
      } else if (value !== session.prefix) {
        // A direct edit to dictated text should always win over a pending result.
        stop();
      }
    }

    valueRef.current = value;
  }, [isActive, stop, value]);

  useEffect(() => {
    if (disabled && isActive) {
      stop();
    }
  }, [disabled, isActive, stop]);

  const handleClick = () => {
    if (isActive) {
      stop();
      return;
    }

    sessionRef.current = {
      lastDictatedValue: valueRef.current,
      prefix: valueRef.current,
      suffix: '',
      transcript: '',
    };
    start();
  };

  const statusMessage = error || (!isSupported
    ? 'Speech recognition is not supported in this browser.'
    : isActive
      ? 'Listening...'
      : '');

  return (
    <div className="dictateControl">
      <button
        type="button"
        className={`dictateButton${isActive ? ' isListening' : ''}`}
        onClick={handleClick}
        disabled={disabled || !isSupported}
        aria-label={isActive ? 'Stop dictation' : 'Dictate'}
        aria-pressed={isActive}
        title={isActive ? 'Stop dictation' : 'Dictate'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8" />
        </svg>
      </button>
      {statusMessage && (
        <span
          className={`dictationStatus${error || !isSupported ? ' isError' : ''}`}
          role={error || !isSupported ? 'alert' : 'status'}
        >
          {statusMessage}
        </span>
      )}
    </div>
  );
};

export default DictateButton;
