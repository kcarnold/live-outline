export const initialState = {
  transcript: '',
  outline: '',
  lastProcessedPosition: 0,
  editorLocked: false,
  roles: {
    editor: null,
    audioCapturer: null
  },
  connections: new Set()
};

export const state = { ...initialState };

export function resetState() {
  Object.assign(state, {
    ...initialState,
    connections: new Set(),
    roles: { ...initialState.roles }
  });
}

export function handleMessage(message, ws) {
  switch (message.type) {
    case 'connect':
      state.connections.add(ws);
      break;
      
    case 'disconnect':
      state.connections.delete(ws);
      if (state.roles.editor === ws) state.roles.editor = null;
      if (state.roles.audioCapturer === ws) state.roles.audioCapturer = null;
      break;

    case 'claim-role':
      if (!state.roles[message.role] && ['editor', 'audioCapturer'].includes(message.role)) {
        state.roles[message.role] = ws;
      }
      break;

    case 'update-transcript':
      state.transcript = message.text;
      state.lastProcessedPosition = message.position || state.lastProcessedPosition;
      break;

    case 'update-outline':
      state.outline = message.text;
      break;

    case 'toggle-lock':
      state.editorLocked = !state.editorLocked;
      break;

    default:
      throw new Error('Unknown message type');
  }

  broadcastState();
}

export function broadcastState() {
  const stateUpdate = {
    transcript: state.transcript,
    outline: state.outline,
    lastProcessedPosition: state.lastProcessedPosition,
    editorLocked: state.editorLocked,
    roles: {
      editor: !!state.roles.editor,
      audioCapturer: !!state.roles.audioCapturer
    }
  };

  for (const client of state.connections) {
    stateUpdate.roles.editor = state.roles.editor === client;
    stateUpdate.roles.audioCapturer = state.roles.audioCapturer === client;
    client.send(JSON.stringify({ type: 'state-update', state: stateUpdate }));
  }
}
