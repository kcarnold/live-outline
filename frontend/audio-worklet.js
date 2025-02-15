// audio-worklet.js
class AudioChunkProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 22050 * 2; // 500ms at 44.1kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.chunkCounter = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const channel = input[0];
        
        if (!channel) return true;

        // Copy incoming samples to our buffer
        for (let i = 0; i < channel.length; i++) {
            this.buffer[this.bufferIndex] = channel[i];
            this.bufferIndex++;

            // When buffer is full, send it to the main thread
            if (this.bufferIndex >= this.bufferSize) {
                this.port.postMessage({
                    type: 'chunk',
                    audioData: this.buffer.slice(),
                    chunkId: this.chunkCounter++
                });
                this.bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('audio-chunk-processor', AudioChunkProcessor);
