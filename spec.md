# Real-time Speech-to-Outline Application Specification

## Overview
A web application that creates and maintains an outline of spoken content in real-time. The system captures audio, transcribes it using AssemblyAI, and uses OpenAI's API to maintain an evolving outline of the content. Multiple users can view the outline, with one user able to edit it directly.

## System Architecture

### Components
1. Frontend (React)
   - Audio capture and streaming
   - Transcript display
   - Markdown editor with syntax highlighting
   - WebSocket client for state sync
   - Role management UI

2. Backend
   - WebSocket server for state sync and role management
   - API key management and proxy for AssemblyAI and OpenAI
   - State management and broadcast

### State Management
The backend maintains the following state:
- Complete transcript text
- Current outline text
- Last processed transcript position
- Editor focus lock status
- Editor identity (if any)
- Audio capturer identity (if any)
- Queue of in-flight LLM requests

## WebSocket Message Types

### Client -> Server
```typescript
interface ClientMessage {
  type: 
    | "CLAIM_EDITOR_ROLE"
    | "CLAIM_AUDIO_ROLE"
    | "RELEASE_ROLE"
    | "EDITOR_FOCUS"
    | "EDITOR_BLUR"
    | "OUTLINE_UPDATE"
    | "TRANSCRIPT_CHUNK";
  
  // Only for OUTLINE_UPDATE
  outline?: string;
  
  // Only for TRANSCRIPT_CHUNK
  chunk?: {
    text: string;
    timestamp: number;
  };
}
```

### Server -> Client
```typescript
interface ServerMessage {
  type: 
    | "STATE_UPDATE"
    | "ROLE_UPDATE"
    | "ERROR";
    
  // For STATE_UPDATE
  state?: {
    transcript: string;
    outline: string;
    editorId: string | null;
    audioCapturerId: string | null;
    editorFocusLocked: boolean;
  };
  
  // For ROLE_UPDATE
  roles?: {
    editorId: string | null;
    audioCapturerId: string | null;
  };
  
  // For ERROR
  error?: {
    code: string;
    message: string;
  };
}
```

## Update Logic

### Transcript Processing
- System tracks the last position in the transcript that was processed for outline updates
- Updates are triggered when either condition is met:
  - N complete sentences (configurable)
  - M words (configurable)

### LLM Integration
- When update conditions are met AND no editor focus lock:
  1. Backend sends request to OpenAI with:
     - Full transcript history
     - Current outline
     - Update prompt
  2. When response arrives:
     - If still no editor focus lock, apply update and broadcast
     - If editor focus lock occurred during processing, discard result

### Editor Integration
- When editor gains focus:
  1. Backend sets focus lock
  2. Any in-flight LLM updates will be discarded when they complete
- When editor loses focus:
  1. Backend removes focus lock
  2. Current outline becomes the new canonical version
  3. Future LLM updates will use this as their base

## Role Management
- Any client can claim either editor or audio capture role
- Last claimer wins (no authentication in v1)
- All clients are notified of role changes via ROLE_UPDATE messages

## Error Handling
- Failed LLM requests: maintain last processed position, retry on next update trigger
- Failed WebSocket connections: clients attempt reconnection with exponential backoff
- Transcription errors: ignore for v1

## Future Considerations (v2)
- Multiple editors
- Authentication and role permissions
- Persistent session storage
- Audio replay capability
- Pinned section headers in UI
- Rich text editing interface

## Development Phases

### Phase 1: Core Infrastructure
- Backend WebSocket server
- Basic state management
- Client connection handling
- Role management

### Phase 2: Audio Pipeline
- Audio capture integration
- AssemblyAI integration
- Transcript accumulation and display

### Phase 3: Outline Generation
- OpenAI integration
- Update triggering logic
- Outline editor implementation

### Phase 4: Testing & Polish
- End-to-end testing
- Error handling
- UI refinement

## Configuration Defaults

### Update Triggers
- Sentence threshold (N): 3 sentences
- Word threshold (M): 100 words
- Update conditions: whichever threshold is met first

### LLM Prompt
Base prompt for outline updates:
```
Use Markdown sections for main parts. Within each section, make a Markdown outline with 2 to 3 levels of nesting. Bold main points. Each level-1 point should have a one-sentence summary of everything underneath it so that someone skimming could decide whether to read the details.

Current transcript: 
[TRANSCRIPT]

Current outline:
[OUTLINE]

Generate an updated outline incorporating the new content while preserving the structure and content from the current outline where appropriate.
```

## Testing Plan

### Unit Tests
1. State Management
   - Role claiming/releasing
   - Editor focus lock handling
   - Transcript position tracking
   - Update trigger conditions

2. WebSocket Messages
   - Message serialization/deserialization
   - Client message handling
   - Server broadcast logic

3. Editor Component
   - Markdown syntax highlighting
   - Focus/blur events
   - Content updates

### Integration Tests
1. Audio Pipeline
   - Audio capture -> AssemblyAI -> Backend
   - Transcript accumulation
   - Update trigger timing

2. LLM Integration
   - Context preparation
   - Response processing
   - Conflict handling with editor focus

3. Multi-client Scenarios
   - Role transfer between clients
   - State synchronization
   - Viewer updates

### End-to-End Tests
Key user flows to verify:
1. Session Setup
   - Client connects
   - Claims audio capture role
   - Second client claims editor role
   - Additional clients connect as viewers

2. Basic Operation
   - Start audio capture
   - Verify transcript updates
   - Verify outline updates
   - Editor makes manual changes
   - Verify LLM updates pause/resume

3. Error Conditions
   - Network interruption recovery
   - API failure handling
   - Role conflict resolution

### Testing Tools
- Jest for unit tests
- Cypress for E2E testing
- Mock WebSocket server for integration tests
- Recorded audio samples for consistent testing