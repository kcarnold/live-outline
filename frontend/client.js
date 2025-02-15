// client.js
class AudioClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.workletNode = null;
        this.isRecording = false;
        
        // Audio configuration
        this.sampleRate = 44100;
        this.bitDepth = 16;
        this.channels = 1;

        // Chunk tracking
        this.pendingChunks = new Map(); // chunkId -> timestamp
        this.processedChunks = new Set(); // Set of processed chunkIds
        this.chunkTimeout = 10000; // 10 seconds timeout for API response
        
        // Bind methods
        this.handleChunk = this.handleChunk.bind(this);
        this.checkTimeouts = this.checkTimeouts.bind(this);
    }

    async init() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: this.channels,
                    sampleRate: this.sampleRate
                }
            });

            // Initialize AudioContext
            this.audioContext = new AudioContext({
                sampleRate: this.sampleRate,
                latencyHint: 'interactive'
            });

            // Load and register the audio worklet
            await this.audioContext.audioWorklet.addModule('/static/audio-worklet.js');

            // Create audio worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-chunk-processor');
            this.workletNode.port.onmessage = this.handleChunk;

            // Create audio source from microphone
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Connect the audio nodes
            source.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination);

            // Setup WebSocket connection
            await this.setupWebSocket();

            // Start timeout checker
            this.timeoutInterval = setInterval(this.checkTimeouts, 1000);

        } catch (error) {
            console.error('Error initializing audio client:', error);
            throw error;
        }
    }

    async setupWebSocket() {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.serverUrl);
            
            this.socket.onopen = () => {
                console.log('WebSocket connection established');
                resolve();
            };
            
            this.socket.onmessage = (event) => {
                const response = JSON.parse(event.data);
                this.handleApiResponse(response);
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.socket.onclose = () => {
                console.log('WebSocket connection closed');
                // Attempt to reconnect after a delay
                setTimeout(() => this.setupWebSocket(), 5000);
            };
        });
    }

    handleChunk(event) {
        if (!this.isRecording) return;
        
        const { audioData, chunkId } = event.data;
        const wavData = this.createWavBuffer(audioData);
        
        if (this.socket?.readyState === WebSocket.OPEN) {
            // Track the chunk
            this.pendingChunks.set(chunkId, Date.now());
            
            // Send chunk with its ID
            this.socket.send(JSON.stringify({
                chunkId: ""+chunkId,
                audioData: btoa(String.fromCharCode(...new Uint8Array(wavData)))
            }));
        }
    }

    checkTimeouts() {
        const now = Date.now();
        for (const [chunkId, timestamp] of this.pendingChunks.entries()) {
            if (now - timestamp > this.chunkTimeout) {
                console.warn(`Chunk ${chunkId} timed out`);
                this.pendingChunks.delete(chunkId);
                // Emit timeout event
                const event = new CustomEvent('chunkTimeout', { 
                    detail: { chunkId }
                });
                window.dispatchEvent(event);
            }
        }
    }

    createWavBuffer(audioData) {
        const bytesPerSample = this.bitDepth / 8;
        const blockAlign = this.channels * bytesPerSample;
        
        const dataSize = audioData.length * bytesPerSample;
        const fileSize = 44 + dataSize;
        
        const buffer = new ArrayBuffer(fileSize);
        const view = new DataView(buffer);
        
        // WAV Header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, fileSize - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, this.channels, true);
        view.setUint32(24, this.sampleRate, true);
        view.setUint32(28, this.sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, this.bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);
        
        // Audio Data
        const offset = 44;
        for (let i = 0; i < audioData.length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset + (i * bytesPerSample), value, true);
        }
        
        return buffer;
    }

    handleApiResponse(response) {
        const { chunkId, result } = response;
        console.log(`Received response for chunk ${chunkId}`);
        
        // Remove from pending and add to processed
        this.pendingChunks.delete(chunkId);
        this.processedChunks.add(chunkId);
        
        // Emit response event
        const event = new CustomEvent('apiResponse', { 
            detail: { chunkId, result }
        });
        window.dispatchEvent(event);
    }

    startRecording() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.isRecording = true;
    }

    stopRecording() {
        this.isRecording = false;
    }

    close() {
        this.stopRecording();
        clearInterval(this.timeoutInterval);
        
        if (this.workletNode) {
            this.workletNode.disconnect();
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        if (this.socket) {
            this.socket.close();
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
    }

    getStats() {
        return {
            pendingChunks: this.pendingChunks.size,
            processedChunks: this.processedChunks.size,
            totalChunks: this.pendingChunks.size + this.processedChunks.size
        };
    }
}

document.getElementById('startButton').addEventListener('click', async () => {
    const client = new AudioClient(`ws://${window.location.host}/ws`);
    await client.init();
    client.startRecording();
});

document.getElementById('stopButton').addEventListener('click', () => {
    client.stopRecording();
});
