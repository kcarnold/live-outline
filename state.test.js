import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest'
import { handleMessage, resetState, state } from './state.js';

describe('State Management', () => {
  let mockWs;

  beforeEach(() => {
    resetState();
    mockWs = {
      send: vi.fn(),
    };
    // Connect the mockWs before each test
    handleMessage({ type: 'connect' }, mockWs);
    // Clear the mock calls from the connect message
    mockWs.send.mockClear();
  });

  afterEach(() => {
    resetState();
  });

  test('handles role claiming', () => {
    handleMessage({ type: 'claim-role', role: 'editor' }, mockWs);
    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"editor":true')
    );
    
    const mockWs2 = { send: vi.fn() };
    handleMessage({ type: 'connect' }, mockWs2);
    mockWs2.send.mockClear();
    
    handleMessage({ type: 'claim-role', role: 'editor' }, mockWs2);
    expect(mockWs2.send).toHaveBeenCalledWith(
      expect.stringContaining('"editor":false')
    );
  });

  test('handles transcript updates', () => {
    const testText = 'Test transcript';
    handleMessage({ 
      type: 'update-transcript', 
      text: testText, 
      position: 100 
    }, mockWs);
    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining(testText)
    );
  });

  test('handles disconnect', () => {
    handleMessage({ type: 'claim-role', role: 'editor' }, mockWs);
    mockWs.send.mockClear();
    
    handleMessage({ type: 'disconnect' }, mockWs);
    expect(state.roles.editor).toBeNull();
    expect(state.connections.size).toBe(0);
  });
});
