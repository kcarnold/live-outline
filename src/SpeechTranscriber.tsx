import './App.css';
import { useRef, useState, useEffect } from 'react';
import { RealtimeTranscriber } from 'assemblyai/streaming';
import RecordRTC from 'recordrtc';

function SpeechTranscriber({onTranscript}: {onTranscript: (transcript: string) => void}) {
  const realtimeTranscriber = useRef<RealtimeTranscriber | null>(null);
  const recorder = useRef<RecordRTC | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')

  const getToken = async () => {
    const response = await fetch('/api/aai_token');
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

    const texts = {};
    realtimeTranscriber.current.on('transcript', transcript => {
      let msg = '';
      texts[transcript.audio_start] = transcript.text;
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += `\n${texts[key]}`
          console.log(msg)
        }
      }
      setTranscript(msg)
      onTranscript(msg);
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

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
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
      })
      .catch((err) => console.error(err));

    setIsRecording(true)
  }

  const endTranscription = async (event) => {
    event.preventDefault();
    setIsRecording(false)

    if (realtimeTranscriber.current)
      await realtimeTranscriber.current.close();
    realtimeTranscriber.current = null;

    if (recorder.current)
      recorder.current.pauseRecording();
    recorder.current = null;
  }


  return (
    <div>
      <div className="">
        {isRecording ? (
            <button className="bg-red-500 text-white font-medium py-1 px-2 rounded-md hover:bg-red-600" onClick={endTranscription}>Stop recording</button>
        ) : (
          <button className="bg-green-500 text-white font-medium py-1 px-2 rounded-md hover:bg-green-600" onClick={startTranscription}>Start recording</button>
        )}
      </div>
      <div className="h-10 overflow-y-auto">
        {transcript}
      </div>
    </div>
  );
}

export default SpeechTranscriber;