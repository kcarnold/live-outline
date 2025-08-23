import './App.css';
import { useRef, useState } from 'react';
import RecordRTC from 'recordrtc';
import * as Y from 'yjs';
import { useYDoc } from '@y-sweet/react';
import { setYTextFromString } from './yjsUtils';

function insertOrUpdateTurn(
  transcriptXml: Y.XmlFragment,
  transcriptSessionId: string,
  turnOrder: number,
  transcript: string
) {
  for (let i = 0; i < transcriptXml.length; i++) {
    const element = transcriptXml.get(i);
    if (
      element instanceof Y.XmlElement &&
      element.nodeName === 'paragraph' &&
      element.getAttribute('session_id') === transcriptSessionId &&
      element.getAttribute('turn_order') === turnOrder.toString()
    ) {
      // Update existing turn
      const textNode = element.get(0);
      if (textNode instanceof Y.XmlText) {
        setYTextFromString(textNode, transcript);
      } else {
        console.warn(`Expected XmlText but found ${textNode.constructor.name}`);
      }
      return;
    }
  }
  // If no existing turn found, create a new one
  const textNode = new Y.XmlText();
  textNode.insert(0, transcript);
  const paragraphNode = new Y.XmlElement('paragraph');
  paragraphNode.setAttribute('session_id', transcriptSessionId);
  paragraphNode.setAttribute('turn_order', turnOrder.toString());
  paragraphNode.insert(0, [textNode]);
  // insert it at the end
  transcriptXml.insert(transcriptXml.length, [paragraphNode]);
}

function SpeechTranscriber() {
  const yDoc = useYDoc();
  const transcriptXml = yDoc.getXmlFragment("transcriptDoc");
  const ws = useRef<WebSocket | null>(null);
  const recorder = useRef<RecordRTC | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
      const endpoint = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=false&min_end_of_turn_silence_when_confident=500&token=${token}`;
      ws.current = new WebSocket(endpoint);

      ws.current.onopen = () => {
        console.log('WebSocket connected!');
        recorder.current = new RecordRTC(stream, {
          type: 'audio',
          mimeType: 'audio/webm;codecs=pcm',
          recorderType: RecordRTC.StereoAudioRecorder,
          timeSlice: 100,
          desiredSampRate: 16000,
          numberOfAudioChannels: 1,
          bufferSize: 1024,
          audioBitsPerSecond: 128000,
          ondataavailable: (blob) => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
            const sampleRate = recorder.current?.sampleRate || 16000; // Hz
            // Compute chunk sizes using actual sample rate and bit depth
            const channels = 1;
            const bytesPerSample = 2; // 16-bit PCM
            const frameSize = channels * bytesPerSample; // bytes per sample frame
            const bytesPerMs = (sampleRate * frameSize) / 1000;
            const maxChunkBytes = bytesPerMs * 100;//500; // 500ms

            // Convert blob to ArrayBuffer and send
            void blob.arrayBuffer().then((buffer) => {
              if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

              // If the buffer is longer than 500ms, split it into chunks.
              // Do this by splitting any buffer longer than 500ms in half.
              let buffers = [buffer];
              let didAnySplits = false;
              let newBuffers = [];
              while (true) {
                for (const curBuffer of buffers) {
                  if (curBuffer.byteLength > maxChunkBytes) {
                    // Split the buffer in half
                    const mid = Math.floor(curBuffer.byteLength / 2);
                    console.log(`Splitting buffer of size ${curBuffer.byteLength} into chunks of ${mid} and ${curBuffer.byteLength - mid}`);
                    newBuffers.push(curBuffer.slice(0, mid));
                    newBuffers.push(curBuffer.slice(mid));
                    didAnySplits = true;
                  }
                }
                if (!didAnySplits) break;
                buffers = newBuffers;
                newBuffers = [];
              }
              // Send all chunks
              console.log(`Sending ${buffers.length} chunks`);
              for (const chunk of buffers) {
                ws.current.send(chunk);
              }
            });
          },
        });
        recorder.current.startRecording();
        setIsRecording(true);
        sessionIdRef.current = "" + Date.now();
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch((err) => {
            console.error('Failed to release wake lock:', err);
          });
          wakeLockRef.current = null;
        }
        navigator.wakeLock.request('screen').then((wakeLock) => {
          wakeLockRef.current = wakeLock;
        }).catch((err) => {
          console.error('Failed to acquire wake lock:', err);
        });
      };

      ws.current.onmessage = (event: MessageEvent) => {
        let msg: unknown;
        try {
          msg = JSON.parse(event.data as string);
        } catch (e) {
          console.error('Failed to parse message', e);
          return;
        }
        console.log(msg);
        if (
          typeof msg === 'object' && msg !== null &&
          'type' in msg && (msg as { type?: string }).type === 'Turn' &&
          'turn_order' in msg && 'transcript' in msg
        ) {
          const { turn_order, transcript } = msg as { turn_order: number; transcript: string };
          insertOrUpdateTurn(transcriptXml, sessionIdRef.current!, turn_order, transcript);
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
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch((err) => {
        console.error('Failed to release wake lock:', err);
      });
      wakeLockRef.current = null;
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