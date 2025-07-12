import './App.css';
import { useRef, useState } from 'react';
import RecordRTC from 'recordrtc';
import * as Y from 'yjs';
import { useYDoc } from '@y-sweet/react';

function SpeechTranscriber() {
  const yDoc = useYDoc();
  const transcriptXml = yDoc.getXmlFragment("transcriptDoc");
  const ws = useRef<WebSocket | null>(null);
  const recorder = useRef<RecordRTC | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  type TokenResponse = { token: string; error?: string };
  const getToken = async (): Promise<string> => {
    const response = await fetch('/api/aai_token', { cache: 'no-store' });
    const data = (await response.json()) as TokenResponse;
    if (typeof data !== 'object' || !('token' in data) || !data.token) {
      alert((data && 'error' in data && data.error) ? data.error : 'Failed to get temp token');
      throw new Error((data && 'error' in data && data.error) ? data.error : 'Failed to get temp token');
    }
    return data.token;
  };

  const startTranscription = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const token: string = await getToken();
      const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=false&token=${token}`;
      ws.current = new WebSocket(endpoint);

      ws.current.onopen = () => {
        console.log('WebSocket connected!');
        recorder.current = new RecordRTC(stream, {
          type: 'audio',
          mimeType: 'audio/webm;codecs=pcm',
          recorderType: RecordRTC.StereoAudioRecorder,
          timeSlice: 250,
          desiredSampRate: 16000,
          numberOfAudioChannels: 1,
          bufferSize: 4096,
          audioBitsPerSecond: 128000,
          ondataavailable: (blob) => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
            // Convert blob to ArrayBuffer and send
            void blob.arrayBuffer().then((buffer) => {
              if (ws.current) ws.current.send(buffer);
            });
          },
        });
        recorder.current.startRecording();
        setIsRecording(true);
      };

      ws.current.onmessage = (event: MessageEvent) => {
        let msg: unknown;
        try {
          msg = JSON.parse(event.data as string);
        } catch (e) {
          console.error('Failed to parse message', e);
          return;
        }
        if (
          typeof msg === 'object' && msg !== null &&
          'type' in msg && (msg as { type?: string }).type === 'Turn' &&
          'turn_order' in msg && 'transcript' in msg
        ) {
          const { turn_order, transcript } = msg as { turn_order: number; transcript: string };
          // Turns are always final, so we can create a new paragraph node with this turn's transcript
          if (!transcriptXml) return;
          const textNode = new Y.XmlText();
          textNode.insert(0, transcript);
          const paragraphNode = new Y.XmlElement('paragraph');
          paragraphNode.insert(0, [textNode]);
          transcriptXml.insert(turn_order, [paragraphNode]);
        }
      };

      ws.current.onerror = (err) => {
        console.error('WebSocket error:', err);
        alert('WebSocket error, check the console.');
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket closed', event);
        ws.current = null;
      };
    } catch (error) {
      console.error(error);
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    }
  };

  const endTranscription = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setIsRecording(false);
    if (ws.current) {
      try {
        ws.current.send(JSON.stringify({ type: 'Terminate' }));
      } catch {
        // ignore
      }
      ws.current.close();
      ws.current = null;
    }
    if (recorder.current) {
      recorder.current.pauseRecording();
      recorder.current = null;
    }
  };

  if (isRecording) {
    return <button
      className="bg-red-500 text-white font-medium py-1 px-2 rounded-md hover:bg-red-600"
      onClick={endTranscription}>Stop transcription
    </button>;
  } else {
    return <button
      className="bg-green-500 text-white font-medium py-1 px-2 rounded-md hover:bg-green-600"
      onClick={() => { void startTranscription(); }}>
      Start transcription
    </button>;
  }
}

export default SpeechTranscriber;