import './App.css';
import { useRef, useState } from 'react';
import { RealtimeTranscriber } from 'assemblyai/streaming';
import RecordRTC from 'recordrtc';
import { usePlainTextSetter } from './yjsUtils';

function SpeechTranscriber() {
  const setTranscript = usePlainTextSetter("transcript");
  const realtimeTranscriber = useRef<RealtimeTranscriber | null>(null);
  const recorder = useRef<RecordRTC | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const getToken = async () => {
    const response = await fetch('/api/aai_token', { cache: 'no-store' });
    const data = await response.json();

    if (data.error) {
      alert(data.error)
    }

    return data.token;
  };

  const startTranscription = async () => {
    realtimeTranscriber.current = new RealtimeTranscriber({
      token: await getToken(),
      sampleRate: 16_000,
    });

    const texts = new Map<number, string>();
    realtimeTranscriber.current.on('transcript', transcript => {
      let msg = '';
      if (transcript.text === '') {
        return;
      }
      console.log(transcript)
      texts.set(transcript.audio_start, transcript.text);
      const keys = Array.from(texts.keys());
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        const text = texts.get(key);
        if (text) {
          msg += `\n${text}`
        }
      }
      setTranscript(msg);
    });

    realtimeTranscriber.current.on('error', event => {
      console.error(event);
      if (realtimeTranscriber.current)
        realtimeTranscriber.current.close();
      realtimeTranscriber.current = null;
    });

    realtimeTranscriber.current.on('close', (code, reason) => {
      console.log(`Connection closed: ${code} ${reason}`);
      realtimeTranscriber.current = null;
    });

    await realtimeTranscriber.current.connect();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/webm;codecs=pcm',
        recorderType: RecordRTC.StereoAudioRecorder,
        timeSlice: 250,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        audioBitsPerSecond: 128000,
        ondataavailable: async (blob) => {
          if(!realtimeTranscriber.current) return;
          const buffer = await blob.arrayBuffer();
          realtimeTranscriber.current.sendAudio(buffer);
        },
      });
      recorder.current.startRecording();
      setIsRecording(true);
    } catch (error) {
      console.error(error);
      if (realtimeTranscriber.current)
        realtimeTranscriber.current.close();
      realtimeTranscriber.current = null;
    }
  }

  const endTranscription = async (event: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.preventDefault();
    setIsRecording(false)

    if (realtimeTranscriber.current)
      await realtimeTranscriber.current.close();
    realtimeTranscriber.current = null;

    if (recorder.current)
      recorder.current.pauseRecording();
    recorder.current = null;
  }

  if (isRecording) {
    return <button
      className="bg-red-500 text-white font-medium py-1 px-2 rounded-md hover:bg-red-600"
      onClick={endTranscription}>Stop transcription
    </button>;
  } else {
    return <button
      className="bg-green-500 text-white font-medium py-1 px-2 rounded-md hover:bg-green-600"
      onClick={startTranscription}>Start transcription
    </button>;
  }
}

export default SpeechTranscriber;