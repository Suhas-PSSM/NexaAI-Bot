import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import './voiceConversation.css';
import { pcm16Base64FromFloat32 } from './voiceAudio';
import { parseLiveServerMessage } from './liveMessage';

const LIVE_SOCKET_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const MAX_CONTEXT_MESSAGES = 20;

const makeAudioContext = () => {
  try {
    return new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
  } catch {
    return new AudioContext();
  }
};

const appendTranscript = (current, addition) => {
  return current + addition;
};

const getMicrophoneError = error => {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone access was denied. Allow microphone access in your browser settings and try again.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No microphone was found. Connect a microphone and try again.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'The microphone is unavailable or already in use.';
  }
  if (error?.name === 'NotSupportedError') {
    return 'Live voice requires a secure connection (HTTPS) and browser audio support.';
  }
  return error?.message || 'Unable to start the microphone. Please try again.';
};

const VoiceConversation = ({ chatId, history = [], autoOpen = false, disabled = false, showLauncher = true }) => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [failedTurns, setFailedTurns] = useState([]);
  const [isRetryingSave, setIsRetryingSave] = useState(false);
  const sessionRef = useRef(null);
  const startAttemptRef = useRef(null);
  const startInProgressRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (autoOpen) setIsOpen(true);
  }, [autoOpen]);

  const stopPlayback = useCallback(session => {
    for (const source of session.playingSources) {
      try {
        source.stop();
      } catch {
        // A source may already have ended.
      }
    }
    session.playingSources.clear();
    session.nextPlaybackTime = session.audioContext?.currentTime || 0;
  }, []);

  const releaseSession = useCallback((session, closeSocket = true) => {
    if (!session) return;
    session.closing = true;
    window.clearTimeout(session.reconnectTimer);
    window.clearTimeout(session.goAwayTimer);
    session.processor?.disconnect();
    session.microphoneSource?.disconnect();
    session.muteGain?.disconnect();
    session.stream.getTracks().forEach(track => track.stop());
    stopPlayback(session);
    if (closeSocket && session.socket && session.socket.readyState < WebSocket.CLOSING) {
      session.socket.close(1000, 'Voice session ended');
    }
    if (session.audioContext?.state !== 'closed') {
      session.audioContext?.close().catch(() => {});
    }
    if (sessionRef.current === session) sessionRef.current = null;
  }, [stopPlayback]);

  const persistTurn = async (turnId, question, answer) => {
    const token = await getToken({ skipCache: true });
    if (!token) throw new Error('Your sign-in expired. Sign in again to save this voice conversation.');

    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chats/${chatId}/voice-turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ turnId, question, answer }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save this voice conversation turn.');

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat', chatId] }),
      queryClient.invalidateQueries({ queryKey: ['userChats'] }),
    ]);
  };

  const saveTurn = (session, question, answer) => {
    const failedTurn = { question, answer, id: crypto.randomUUID() };
    session.saveQueue = session.saveQueue
      .then(() => persistTurn(failedTurn.id, question, answer))
      .catch(saveError => {
        setFailedTurns(turns => [...turns, failedTurn]);
        setError(saveError.message);
      });
  };

  const retryFailedSaves = async () => {
    if (isRetryingSave) return;
    setIsRetryingSave(true);
    setError('');
    const turnsToRetry = [...failedTurns];

    for (const turn of turnsToRetry) {
      try {
        await persistTurn(turn.id, turn.question, turn.answer);
        setFailedTurns(turns => turns.filter(item => item.id !== turn.id));
      } catch (saveError) {
        setError(saveError.message);
        break;
      }
    }
    setIsRetryingSave(false);
  };

  const appendAudio = (session, base64Audio, mimeType) => {
    if (!session.audioContext || !base64Audio) return;
    const binary = atob(base64Audio);
    const samples = new Int16Array(Math.floor(binary.length / 2));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = view.getInt16(index * 2, true);
    }

    const sampleRate = Number(mimeType?.match(/rate=(\d+)/)?.[1]) || OUTPUT_SAMPLE_RATE;
    const audioBuffer = session.audioContext.createBuffer(1, samples.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      channel[index] = samples[index] / 0x8000;
    }

    const source = session.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(session.audioContext.destination);
    const startAt = Math.max(session.nextPlaybackTime, session.audioContext.currentTime);
    session.nextPlaybackTime = startAt + audioBuffer.duration;
    session.playingSources.add(source);
    source.onended = () => {
      session.playingSources.delete(source);
      if (!session.closing && session.playingSources.size === 0) setPhase('listening');
    };
    source.start(startAt);
    setPhase('speaking');
  };

  const connectLiveSession = (session, resumeHandle = '') => {
    const socketUrl = `${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(session.token)}`;
    const socket = new WebSocket(socketUrl);
    socket.binaryType = 'arraybuffer';
    session.socket = socket;
    setPhase(resumeHandle ? 'reconnecting' : 'connecting');

    socket.onopen = () => {
      const config = {
        ...session.config,
        ...(resumeHandle ? { sessionResumption: { handle: resumeHandle } } : {}),
      };
      socket.send(JSON.stringify({
        setup: {
          model: `models/${session.model}`,
          ...config,
        },
      }));
    };

    socket.onmessage = async event => {
      if (session.closing) return;
      let message;
      try {
        message = await parseLiveServerMessage(event.data);
      } catch (parseError) {
        console.error('Failed to parse a Gemini Live message:', parseError);
        session.fatalError = 'Received an invalid response from the live voice service.';
        socket.close(1007, 'Invalid Live API message');
        return;
      }
      if (session.closing || session.socket !== socket) return;

      if (message.error) {
        session.fatalError = message.error.message || 'The live voice service reported an error.';
        socket.close(1011, 'Live voice setup failed');
        return;
      }

      if (message.setupComplete) {
        session.reconnectAttempts = 0;
        if (!resumeHandle && session.history.length) {
          socket.send(JSON.stringify({
            clientContent: {
              turns: session.history,
              turnComplete: false,
            },
          }));
        }
        if (!session.processor) attachMicrophone(session);
        session.readyForAudio = true;
        setPhase('listening');
        return;
      }

      if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
        session.resumptionHandle = message.sessionResumptionUpdate.newHandle;
      }

      if (message.goAway) {
        const seconds = Number.parseFloat(message.goAway.timeLeft) || 0;
        window.clearTimeout(session.goAwayTimer);
        session.goAwayTimer = window.setTimeout(() => {
          if (session.socket === socket && socket.readyState === WebSocket.OPEN) {
            socket.close(1000, 'Refreshing live voice connection');
          }
        }, Math.max(0, seconds * 1000 - 1500));
      }

      const serverContent = message.serverContent;
      if (!serverContent) return;

      if (serverContent.interrupted) {
        stopPlayback(session);
        if (session.playingSources.size === 0) setPhase('listening');
      }

      const userTranscript = serverContent.inputTranscription?.text || '';
      const modelTranscript = serverContent.outputTranscription?.text || '';
      if (userTranscript) session.inputText = appendTranscript(session.inputText, userTranscript);
      if (modelTranscript) {
        session.outputText = appendTranscript(session.outputText, modelTranscript);
        setPhase('speaking');
      }

      for (const part of serverContent.modelTurn?.parts || []) {
        if (part.inlineData?.data) appendAudio(session, part.inlineData.data, part.inlineData.mimeType);
      }

      if (serverContent.turnComplete) {
        const question = session.inputText.trim();
        const answer = session.outputText.trim();
        session.inputText = '';
        session.outputText = '';

        if (question && answer) {
          setTranscript(items => [...items.slice(-5), { question, answer, id: `${Date.now()}-${items.length}` }]);
          saveTurn(session, question, answer);
        } else if (question || answer) {
          setError('The voice transcription was incomplete, so this turn could not be saved.');
        }
        setPhase('listening');
      }
    };

    socket.onerror = () => {
      if (!session.closing) setError('Voice connection error. Check your internet connection and try again.');
    };

    socket.onclose = () => {
      if (session.socket !== socket || session.closing) return;
      session.socket = null;
      session.readyForAudio = false;

      if (session.resumptionHandle && session.reconnectAttempts < 2) {
        session.reconnectAttempts += 1;
        setPhase('reconnecting');
        session.reconnectTimer = window.setTimeout(
          () => connectLiveSession(session, session.resumptionHandle),
          500 * session.reconnectAttempts,
        );
        return;
      }

      setError(session.fatalError || 'The voice connection ended. Your saved conversation is safe; start voice again to continue.');
      releaseSession(session, false);
      setPhase('error');
    };
  };

  const attachMicrophone = session => {
    const processor = session.audioContext.createScriptProcessor(4096, 1, 1);
    const microphoneSource = session.audioContext.createMediaStreamSource(session.stream);
    const muteGain = session.audioContext.createGain();
    muteGain.gain.value = 0;
    processor.onaudioprocess = event => {
      const socket = session.socket;
      if (!session.readyForAudio || socket?.readyState !== WebSocket.OPEN) return;
      const audio = pcm16Base64FromFloat32(event.inputBuffer.getChannelData(0), session.audioContext.sampleRate);
      if (!audio) return;
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: audio,
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      }));
    };
    microphoneSource.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(session.audioContext.destination);
    session.processor = processor;
    session.microphoneSource = microphoneSource;
    session.muteGain = muteGain;
  };

  const cancelStart = useCallback(() => {
    if (sessionRef.current) return;
    const attempt = startAttemptRef.current;
    if (!attempt) return;
    attempt.cancelled = true;
    attempt.controller.abort();
    attempt.stream?.getTracks().forEach(track => track.stop());
    attempt.stream = null;
    if (attempt.audioContext && attempt.audioContext.state !== 'closed') {
      attempt.audioContext.close().catch(() => {});
    }
    attempt.audioContext = null;
  }, []);

  const start = async () => {
    if (disabled || startInProgressRef.current || sessionRef.current) return;
    startInProgressRef.current = true;
    setIsStarting(true);
    const attempt = {
      cancelled: false,
      controller: new AbortController(),
      stream: null,
      audioContext: null,
    };
    startAttemptRef.current = attempt;
    setIsOpen(true);
    setError('');
    setTranscript([]);
    setIsMuted(false);
    setPhase('requesting');

    let stream;
    let audioContext;
    let session;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.WebSocket || !window.AudioContext) {
        throw new Error('Live voice is not supported in this browser. Use a current browser over HTTPS.');
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      attempt.stream = stream;
      if (attempt.cancelled) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      audioContext = makeAudioContext();
      attempt.audioContext = audioContext;
      await audioContext.resume();
      if (attempt.cancelled) return;
      setPhase('connecting');

      const token = await getToken({ skipCache: true });
      if (!token) throw new Error('Please sign in again before starting voice mode.');

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/voice/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: attempt.controller.signal,
      });
      const sessionInfo = await response.json();
      if (attempt.cancelled) return;
      if (!response.ok) throw new Error(sessionInfo.error || 'Unable to start live voice.');

      session = {
        stream,
        audioContext,
        token: sessionInfo.token,
        model: sessionInfo.model,
        config: sessionInfo.config,
        history: history.slice(-MAX_CONTEXT_MESSAGES).flatMap(message => {
          const parts = (message.parts || []).filter(part => part.text?.trim()).map(part => ({ text: part.text }));
          return parts.length ? [{ role: message.role, parts }] : [];
        }),
        socket: null,
        processor: null,
        microphoneSource: null,
        muteGain: null,
        playingSources: new Set(),
        nextPlaybackTime: audioContext.currentTime,
        inputText: '',
        outputText: '',
        saveQueue: Promise.resolve(),
        resumptionHandle: '',
        reconnectAttempts: 0,
        reconnectTimer: null,
        goAwayTimer: null,
        muted: false,
        readyForAudio: false,
        closing: false,
      };
      sessionRef.current = session;
      connectLiveSession(session);
    } catch (startError) {
      if (attempt.cancelled) return;
      if (session) {
        releaseSession(session);
      } else {
        stream?.getTracks().forEach(track => track.stop());
        if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
      }
      setError(getMicrophoneError(startError));
      setPhase('error');
    } finally {
      if (startAttemptRef.current === attempt) startAttemptRef.current = null;
      startInProgressRef.current = false;
      setIsStarting(false);
    }
  };

  const endSession = useCallback(() => {
    releaseSession(sessionRef.current);
    setPhase('idle');
    setIsMuted(false);
  }, [releaseSession]);

  const toggleMute = () => {
    const session = sessionRef.current;
    if (!session) return;
    const nextMuted = !session.muted;
    session.muted = nextMuted;
    session.stream.getAudioTracks().forEach(track => { track.enabled = !nextMuted; });
    setIsMuted(nextMuted);
  };

  useEffect(() => () => {
    cancelStart();
    releaseSession(sessionRef.current);
  }, [cancelStart, releaseSession]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        cancelStart();
        endSession();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [cancelStart, endSession, isOpen]);

  const phaseLabel = {
    requesting: 'Requesting microphone access…',
    connecting: 'Connecting to Nexa AI…',
    reconnecting: 'Restoring your voice connection…',
    listening: isMuted ? 'Microphone muted' : 'Listening — speak naturally',
    speaking: 'Nexa AI is speaking',
    error: 'Voice session stopped',
  }[phase] || 'Start a hands-free conversation';

  return (
    <>
      {showLauncher && (
        <button
          className="voiceLaunchButton"
          type="button"
          onClick={() => { setIsOpen(true); setError(''); }}
          disabled={disabled}
          aria-label="Start voice conversation"
          title="Start voice conversation"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 10v4M9 6v12M13 3v18M17 7v10M21 10v4" />
          </svg>
        </button>
      )}
      {isOpen && createPortal(
        <div className="voiceOverlay" onMouseDown={event => {
          if (event.target === event.currentTarget && !sessionRef.current) {
            cancelStart();
            endSession();
            setIsOpen(false);
          }
        }}>
          <section className="voicePanel" role="dialog" aria-modal="true" aria-labelledby="voiceTitle">
            <button className="voiceCloseButton" type="button" onClick={() => {
              cancelStart();
              endSession();
              setIsOpen(false);
            }} aria-label="Close voice mode">×</button>
            <div className={`voiceOrb ${phase}`} aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8" /></svg>
            </div>
            <h2 id="voiceTitle">Voice conversation</h2>
            <p className="voiceStatus" role={error || failedTurns.length ? 'alert' : 'status'}>
              {error || (failedTurns.length ? 'Some voice turns could not be saved.' : phaseLabel)}
            </p>
            <div className="voiceTranscript" aria-live="polite">
              {transcript.map(item => (
                <div className="voiceTurn" key={item.id}>
                  <p><span>You</span>{item.question}</p>
                  <p><span>Nexa AI</span>{item.answer}</p>
                </div>
              ))}
            </div>
            <div className="voiceControls">
              {!sessionRef.current || phase === 'error' ? (
                <button className="voiceStartButton" type="button" onClick={start} disabled={isStarting || phase === 'requesting' || phase === 'connecting' || phase === 'reconnecting'}>
                  {isStarting ? 'Starting…' : 'Start voice'}
                </button>
              ) : (
                <>
                  <button className="voiceSecondaryButton" type="button" onClick={toggleMute} aria-pressed={isMuted}>
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button className="voiceEndButton" type="button" onClick={endSession}>End voice</button>
                </>
              )}
            </div>
            {failedTurns.length > 0 && (
              <button className="voiceRetrySaveButton" type="button" onClick={retryFailedSaves} disabled={isRetryingSave}>
                {isRetryingSave ? 'Retrying save…' : `Retry saving ${failedTurns.length} ${failedTurns.length === 1 ? 'turn' : 'turns'}`}
              </button>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};

export default VoiceConversation;
