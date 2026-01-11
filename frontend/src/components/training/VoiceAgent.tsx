import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  MessageSquare,
  Send,
  X,
  Loader2,
  Radio
} from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface VoiceAgentProps {
  documentId: string;
  pageNumber: number;
  documentName: string;
  onClose: () => void;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

// Audio worklet processor for real-time audio capture
const SAMPLE_RATE = 24000; // OpenAI Realtime uses 24kHz

export function VoiceAgent({ documentId, pageNumber, documentName, onClose }: VoiceAgentProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NODE_ENV === 'production'
      ? window.location.host
      : 'localhost:3001';
    const sessionId = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return `${protocol}//${host}/ws/voice?sessionId=${sessionId}&documentId=${documentId}&pageNumber=${pageNumber}`;
  }, [documentId, pageNumber]);

  // Connect to voice agent
  const connect = useCallback(async () => {
    try {
      setConnectionState('connecting');
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // Create audio context
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });

      // Connect WebSocket
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Voice WebSocket connected');
      };

      ws.onmessage = (event) => {
        handleServerMessage(JSON.parse(event.data));
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error. Please try again.');
        setConnectionState('error');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setConnectionState('disconnected');
        setAgentState('idle');
        stopRecording();
      };

    } catch (err: any) {
      console.error('Failed to connect:', err);
      setError(err.message || 'Failed to access microphone');
      setConnectionState('error');
    }
  }, [getWsUrl]);

  // Handle messages from server
  const handleServerMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'session.ready':
        setConnectionState('connected');
        setAgentState('idle');
        startRecording();
        // Add welcome message
        setMessages([{
          role: 'assistant',
          content: `Hi! I'm ready to discuss page ${pageNumber} of "${documentName}". What would you like to know?`,
          timestamp: new Date()
        }]);
        break;

      case 'speech.started':
        setAgentState('listening');
        setCurrentTranscript('');
        break;

      case 'speech.stopped':
        setAgentState('thinking');
        break;

      case 'transcript.delta':
        setCurrentTranscript(prev => prev + message.delta);
        break;

      case 'transcript.done':
        if (message.transcript && message.transcript.trim()) {
          setMessages(prev => [...prev, {
            role: message.role,
            content: message.transcript,
            timestamp: new Date()
          }]);
        }
        setCurrentTranscript('');
        if (message.role === 'user') {
          setAgentState('thinking');
        }
        break;

      case 'audio.delta':
        // Queue audio for playback
        if (message.delta) {
          const audioData = base64ToFloat32Array(message.delta);
          audioQueueRef.current.push(audioData);
          if (!isPlayingRef.current) {
            playAudioQueue();
          }
        }
        setAgentState('speaking');
        break;

      case 'audio.done':
      case 'response.done':
        // Response complete, go back to listening
        setTimeout(() => {
          if (connectionState === 'connected') {
            setAgentState('listening');
          }
        }, 500);
        break;

      case 'error':
        setError(message.message);
        break;

      case 'session.closed':
        setConnectionState('disconnected');
        break;
    }
  }, [documentName, pageNumber, connectionState]);

  // Convert base64 PCM16 to Float32Array
  const base64ToFloat32Array = (base64: string): Float32Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  };

  // Play audio from queue
  const playAudioQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const audioData = audioQueueRef.current.shift()!;

    const buffer = audioContextRef.current.createBuffer(1, audioData.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(audioData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => playAudioQueue();
    source.start();
  }, []);

  // Start recording audio
  const startRecording = useCallback(() => {
    if (!mediaStreamRef.current || !audioContextRef.current || !wsRef.current) return;

    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(inputData);
        const uint8Array = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);

        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audio: base64
        }));
      }
    };

    source.connect(processor);
    processor.connect(audioContextRef.current.destination);

    setAgentState('listening');
  }, [isMuted]);

  // Convert Float32 to PCM16
  const float32ToPcm16 = (float32Array: Float32Array): Int16Array => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
  };

  // Stop recording
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    stopRecording();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('disconnected');
    setAgentState('idle');
    audioQueueRef.current = [];
  }, [stopRecording]);

  // Send text message
  const sendTextMessage = useCallback(() => {
    if (!textInput.trim() || !wsRef.current || connectionState !== 'connected') return;

    wsRef.current.send(JSON.stringify({
      type: 'text',
      text: textInput.trim()
    }));

    setMessages(prev => [...prev, {
      role: 'user',
      content: textInput.trim(),
      timestamp: new Date()
    }]);

    setTextInput('');
    setAgentState('thinking');
  }, [textInput, connectionState]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Get status text
  const getStatusText = () => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return error || 'Connection error';
      case 'disconnected':
        return 'Click to start voice chat';
      case 'connected':
        switch (agentState) {
          case 'listening':
            return 'Listening...';
          case 'thinking':
            return 'Processing...';
          case 'speaking':
            return 'Speaking...';
          default:
            return 'Ready';
        }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-white dark:bg-secondary-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold">Voice Assistant</h3>
                <p className="text-sm text-white/80 truncate max-w-[200px]">
                  Page {pageNumber} - {documentName}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                disconnect();
                onClose();
              }}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4 space-y-4 bg-secondary-50 dark:bg-secondary-900">
          {messages.length === 0 && connectionState === 'disconnected' && (
            <div className="flex flex-col items-center justify-center h-full text-secondary-500">
              <Mic className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-center">
                Start a voice conversation about this page.
                <br />
                Ask questions, get explanations, and learn interactively!
              </p>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-white dark:bg-secondary-700 text-secondary-900 dark:text-secondary-100 rounded-bl-md shadow'
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Current transcript */}
          {currentTranscript && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="max-w-[80%] px-4 py-2 rounded-2xl bg-white dark:bg-secondary-700 text-secondary-500 dark:text-secondary-400 rounded-bl-md shadow italic">
                <p className="text-sm">{currentTranscript}...</p>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Status Bar */}
        <div className="px-4 py-2 bg-secondary-100 dark:bg-secondary-700 border-t border-secondary-200 dark:border-secondary-600">
          <div className="flex items-center justify-center gap-2">
            {connectionState === 'connected' && agentState === 'listening' && (
              <motion.div
                className="flex gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-4 bg-primary-500 rounded-full"
                    animate={{ scaleY: [1, 1.5, 1] }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.1
                    }}
                  />
                ))}
              </motion.div>
            )}
            {connectionState === 'connecting' && (
              <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
            )}
            {agentState === 'thinking' && (
              <motion.div
                className="flex gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-amber-500 rounded-full"
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.15
                    }}
                  />
                ))}
              </motion.div>
            )}
            {agentState === 'speaking' && (
              <Volume2 className="w-4 h-4 text-emerald-500 animate-pulse" />
            )}
            <span className="text-sm text-secondary-600 dark:text-secondary-400">
              {getStatusText()}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-secondary-200 dark:border-secondary-600">
          {/* Text input (toggle) */}
          <AnimatePresence>
            {showTextInput && connectionState === 'connected' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-4 overflow-hidden"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 rounded-lg border border-secondary-300 dark:border-secondary-600 bg-white dark:bg-secondary-700 text-secondary-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={sendTextMessage}
                    disabled={!textInput.trim()}
                    className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-4">
            {/* Text input toggle */}
            {connectionState === 'connected' && (
              <button
                onClick={() => setShowTextInput(!showTextInput)}
                className={`p-3 rounded-full transition-colors ${
                  showTextInput
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600'
                    : 'bg-secondary-100 dark:bg-secondary-700 text-secondary-600 dark:text-secondary-400 hover:bg-secondary-200 dark:hover:bg-secondary-600'
                }`}
                title="Type instead of speaking"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            )}

            {/* Mute toggle */}
            {connectionState === 'connected' && (
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full transition-colors ${
                  isMuted
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                    : 'bg-secondary-100 dark:bg-secondary-700 text-secondary-600 dark:text-secondary-400 hover:bg-secondary-200 dark:hover:bg-secondary-600'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}

            {/* Main call button */}
            {connectionState === 'disconnected' || connectionState === 'error' ? (
              <button
                onClick={connect}
                className="p-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg transition-all hover:scale-105"
                title="Start voice chat"
              >
                <Phone className="w-6 h-6" />
              </button>
            ) : connectionState === 'connecting' ? (
              <button
                disabled
                className="p-4 bg-amber-500 text-white rounded-full shadow-lg cursor-not-allowed"
              >
                <Loader2 className="w-6 h-6 animate-spin" />
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all hover:scale-105"
                title="End voice chat"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            )}

            {/* Volume control placeholder */}
            {connectionState === 'connected' && (
              <button
                className="p-3 rounded-full bg-secondary-100 dark:bg-secondary-700 text-secondary-600 dark:text-secondary-400 hover:bg-secondary-200 dark:hover:bg-secondary-600 transition-colors"
                title="Speaker on"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default VoiceAgent;
