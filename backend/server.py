# server.py
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import numpy as np
from pydantic import BaseModel
import asyncio
#import aiofiles
#import aiohttp
import base64
import os
from datetime import datetime
#from pydub import AudioSegment
import io
import logging

from . import whisper_online as whisper

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Modify for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXTERNAL_API_URL = "YOUR_EXTERNAL_API_ENDPOINT"

class AudioChunk(BaseModel):
    chunkId: str
    audioData: str

async def process_audio_chunk(audio_data: bytes) -> dict:
    # Convert WAV to MP3
    audio = AudioSegment.from_wav(io.BytesIO(audio_data))

    # Create temporary MP3 file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"{TEMP_DIR}/chunk_{timestamp}.mp3"
    audio.export(filename, format="mp3")

    try:
        async with aiohttp.ClientSession() as session:
            # Read the MP3 file
            async with aiofiles.open(filename, 'rb') as f:
                mp3_data = await f.read()

            # Send to external API
            async with session.post(
                EXTERNAL_API_URL,
                data={'audio': base64.b64encode(mp3_data)}
            ) as response:
                result = await response.json()

            return result
    finally:
        # Clean up temporary file
        os.remove(filename)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger = logging.getLogger("websocket")

    src_lan = "en"
    tgt_lan = "en"
    asr = whisper.MLXWhisper(lan=tgt_lan, modelsize='tiny.en')
    online = whisper.OnlineASRProcessor(asr)

    try:
        while True:
            data = await websocket.receive_json()
            chunk = AudioChunk(**data)
            logger.info(f"Received chunk {chunk.chunkId}")

            audio_data = base64.b64decode(chunk.audioData)

            # Detailed WAV header validation
            if len(audio_data) < 44:
                logger.error(f"Audio data too short: {len(audio_data)} bytes")
                raise ValueError("Audio data too short for WAV header")

            header = {
                'riff': audio_data[0:4],
                'fileSize': int.from_bytes(audio_data[4:8], 'little'),
                'wave': audio_data[8:12],
                'fmt': audio_data[12:16],
                'fmtLength': int.from_bytes(audio_data[16:20], 'little'),
                'audioFormat': int.from_bytes(audio_data[20:22], 'little'),
                'channels': int.from_bytes(audio_data[22:24], 'little'),
                'sampleRate': int.from_bytes(audio_data[24:28], 'little'),
                'byteRate': int.from_bytes(audio_data[28:32], 'little'),
                'blockAlign': int.from_bytes(audio_data[32:34], 'little'),
                'bitDepth': int.from_bytes(audio_data[34:36], 'little'),
                'data': audio_data[36:40],
                'dataSize': int.from_bytes(audio_data[40:44], 'little'),
            }

            logger.debug(f"WAV header: {header}")

            if header['riff'] != b'RIFF':
                raise ValueError(f"Expected RIFF header, got {header['riff']}")
            if header['wave'] != b'WAVE':
                raise ValueError(f"Expected WAVE format, got {header['wave']}")
            if header['fmt'] != b'fmt ':
                raise ValueError(f"Expected fmt tag, got {header['fmt']}")
            if header['audioFormat'] != 1:
                raise ValueError(f"Expected PCM format (1), got {header['audioFormat']}")
            if header['channels'] != 1:
                raise ValueError(f"Expected mono audio (1), got {header['channels']}")
            if header['data'] != b'data':
                raise ValueError(f"Expected data tag, got {header['data']}")

            logger.info(f"Valid WAV: {header['sampleRate']}Hz, {header['bitDepth']}bit, {header['channels']} channels")

            audio_data = np.frombuffer(audio_data[44:], dtype=np.int16)
            audio_data = audio_data.astype(np.float32) / 32768.0

            print("Audio energy: ", 20 * np.log10(np.sqrt(np.mean(audio_data**2))))

            online.insert_audio_chunk(audio_data)
            o = online.process_iter()
            print(o) # do something with current partial output

            # Process chunk and send to external API
            #result = await process_audio_chunk(audio_data)
            result = {"response": "success", "chunkId": chunk.chunkId}

            # Send result back to client
            await websocket.send_json(result)

    except Exception as e:
        print(f"Error: {e}")
        raise
    finally:
        await websocket.close()

# Mount static files at /static
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Serve index.html at root
@app.get("/")
async def read_root():
    return FileResponse("frontend/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)