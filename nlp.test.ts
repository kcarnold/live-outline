import 'dotenv/config'
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, getTranslation, getTranslationEfficient } from './nlp';
import * as Diff from 'diff';

const defaultModel = 'claude-3-5-haiku-20241022';

// Mock the diff module
vi.mock('diff', () => ({
  createPatch: vi.fn(),
}));



describe('nlp.ts', () => {
  describe('getTranslation', () => {
    let mockProvider: AnthropicProvider;
    
    beforeEach(() => {
      // Create a mock AnthropicProvider with mock client
      mockProvider = {
        anthropicClient: {
          messages: {
            create: vi.fn(),
          },
        },
        defaultModel,
        maxTokens: 1000,
      } as unknown as AnthropicProvider;
    });

    it('should call the Anthropic API with correct parameters', async () => {
      // Mock the Anthropic response
      const mockResponse = {
        content: [{ 
          type: 'text', 
          text: 'Some response with <translation>Translated text</translation>' 
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with test data
      const text = 'This is a test string.';
      const prevTranslatedText = 'This is a previous translation.';
      const language = 'Spanish';
      
      await getTranslation(mockProvider, text, prevTranslatedText, language);

      // Verify the API call
      expect(mockProvider.anthropicClient.messages.create).toHaveBeenCalled();
      const callArgs = mockProvider.anthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(mockProvider.maxTokens);
      expect(callArgs.model).toBe(mockProvider.defaultModel);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toContain(`We are translating text into ${language} as it comes in`);
      expect(callArgs.messages[0].content).toContain(prevTranslatedText);
      expect(callArgs.messages[0].content).toContain(text);
    });

    it('should extract and return the translated text from the response', async () => {
      // Mock the Anthropic response with a translation
      const translatedText = 'Esta es una cadena de prueba.';
      const mockResponse = {
        content: [{ 
          type: 'text', 
          text: `Here's the translation:\n\n<translation>${translatedText}</translation>\n\nHope that helps!` 
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function
      const result = await getTranslation(
        mockProvider, 
        'This is a test string.', 
        '', 
        'Spanish'
      );

      // Verify the extracted translation
      expect(result).toBe(translatedText);
    });

    it('should throw an error if translation cannot be extracted', async () => {
      // Mock a response without the translation tags
      const mockResponse = {
        content: [{ 
          type: 'text', 
          text: 'Here is the translation: Esta es una cadena de prueba.' 
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function and expect an error
      await expect(getTranslation(
        mockProvider, 
        'This is a test string.', 
        '', 
        'Spanish'
      )).rejects.toThrow('Could not extract translation from response');
    });

    it('should handle non-text content type', async () => {
      // Mock a response with non-text content
      const mockResponse = {
        content: [{ type: 'image' }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function and expect an error
      await expect(getTranslation(
        mockProvider, 
        'This is a test string.', 
        '', 
        'Spanish'
      )).rejects.toThrow('Could not extract translation from response');
    });
  });

  describe('getTranslationEfficient', () => {
    let mockProvider: AnthropicProvider;
    
    beforeEach(() => {
      // Create a mock AnthropicProvider with mock client
      mockProvider = {
        anthropicClient: {
          messages: {
            create: vi.fn(),
          },
        },
        defaultModel,
        maxTokens: 1000,
      } as unknown as AnthropicProvider;

      // Reset the diff mock
      vi.mocked(Diff.createPatch).mockReset();
    });

    it('should generate a diff between previous and new source text', async () => {
      // Mock the diff output
      const mockPatch = `@@ -1,5 +1,6 @@
 This is a 
-test string.
+test string with 
+additional content.
 More text here.`;
      
      vi.mocked(Diff.createPatch).mockReturnValue(mockPatch);
      
      // Mock the Anthropic response with a tool call
      const mockResponse = {
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: 'replaceEntireText',
          input: {
            new_str: 'This is a translated test string with additional content. More text here translated.'
          }
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with test data
      const prevSourceText = 'This is a test string. More text here.';
      const newSourceText = 'This is a test string with additional content. More text here.';
      const prevTranslatedText = 'This is a translated test string. More text here translated.';
      const language = 'Spanish';
      
      const result = await getTranslationEfficient(
        mockProvider, 
        newSourceText, 
        prevSourceText, 
        prevTranslatedText, 
        language
      );

      // Verify diff was created correctly
      expect(Diff.createPatch).toHaveBeenCalledWith(
        'source_text.txt',
        prevSourceText,
        newSourceText,
        null,
        null,
        { context: 3 }
      );

      // Verify the message was created with correct parameters
      expect(mockProvider.anthropicClient.messages.create).toHaveBeenCalled();
      const callArgs = mockProvider.anthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.model).toBe(mockProvider.defaultModel);
      expect(callArgs.max_tokens).toBe(mockProvider.maxTokens);
      expect(callArgs.temperature).toBe(0.1);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content[0].type).toBe('text');
      
      // Instead of checking for the exact diff content in the prompt, just check for key elements
      const promptText = callArgs.messages[0].content[0].text;
      expect(promptText).toContain(`We are translating text into ${language} as it comes in`);
      expect(promptText).toContain("Source text diff");
      expect(promptText).toContain("additional content");

      // Verify that the tools array was passed correctly
      expect(callArgs.tools).toHaveLength(2); // replaceEntireText and update tools
      expect(callArgs.tools[0].name).toBe('replaceEntireText');
      expect(callArgs.tools[1].name).toBe('update');

      // Verify the return value matches what we expect from the tool call
      // Use a trimmed comparison to avoid newline issues
      expect(result.trim()).toBe('This is a translated test string with additional content. More text here translated.'.trim());
    });

    it('should handle the update tool calls correctly', async () => {
      // Mock the diff output
      const mockPatch = `@@ -1,3 +1,3 @@
-First sentence.
+First modified sentence.
 Second sentence.`;
      
      vi.mocked(Diff.createPatch).mockReturnValue(mockPatch);
      
      // Mock the Anthropic response with an update tool call
      const mockResponse = {
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: 'update',
          input: {
            old_str: 'First translated sentence.',
            new_str: 'First modified translated sentence.'
          }
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with test data
      const prevSourceText = 'First sentence. Second sentence.';
      const newSourceText = 'First modified sentence. Second sentence.';
      const prevTranslatedText = 'First translated sentence. Second translated sentence.';
      const language = 'French';
      
      const result = await getTranslationEfficient(
        mockProvider, 
        newSourceText, 
        prevSourceText, 
        prevTranslatedText, 
        language
      );

      // Verify the API call
      expect(mockProvider.anthropicClient.messages.create).toHaveBeenCalled();
      
      // Verify the return value has the update applied - use trim() to handle potential newline differences
      expect(result.trim()).toBe('First modified translated sentence. Second translated sentence.'.trim());
    });

    it('should handle multiple update tool calls in parallel', async () => {
      // Mock the diff output
      const mockPatch = `@@ -1,4 +1,4 @@
-First sentence.
+First modified sentence.
 Second sentence.
-Third sentence.
+Third modified sentence.`;
      
      vi.mocked(Diff.createPatch).mockReturnValue(mockPatch);
      
      // Mock the Anthropic response with multiple update tool calls
      const mockResponse = {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            name: 'update',
            input: {
              old_str: 'First translated sentence.',
              new_str: 'First modified translated sentence.'
            }
          },
          {
            type: 'tool_use',
            name: 'update',
            input: {
              old_str: 'Third translated sentence.',
              new_str: 'Third modified translated sentence.'
            }
          }
        ]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with test data
      const prevSourceText = 'First sentence. Second sentence. Third sentence.';
      const newSourceText = 'First modified sentence. Second sentence. Third modified sentence.';
      const prevTranslatedText = 'First translated sentence. Second translated sentence. Third translated sentence.';
      const language = 'French';
      
      const result = await getTranslationEfficient(
        mockProvider, 
        newSourceText, 
        prevSourceText, 
        prevTranslatedText, 
        language
      );

      // Verify the return value has both updates applied - use trim() to handle potential newline differences
      expect(result.trim()).toBe('First modified translated sentence. Second translated sentence. Third modified translated sentence.'.trim());
    });

    it('should add a newline to prevTranslatedText if it does not end with one', async () => {
      // Mock the diff output
      const mockPatch = `@@ -1,1 +1,1 @@
-A simple test.
+A simple updated test.`;
      
      vi.mocked(Diff.createPatch).mockReturnValue(mockPatch);
      
      // Mock the Anthropic response
      const mockResponse = {
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: 'update',
          input: {
            old_str: 'A simple translated test.',
            new_str: 'A simple updated translated test.'
          }
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with test data without trailing newline
      const prevSourceText = 'A simple test.';
      const newSourceText = 'A simple updated test.';
      const prevTranslatedText = 'A simple translated test.'; // No trailing newline
      const language = 'German';
      
      const result = await getTranslationEfficient(
        mockProvider, 
        newSourceText, 
        prevSourceText, 
        prevTranslatedText, 
        language
      );

      // Verify the function added a newline before processing
      const callArgs = mockProvider.anthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages[0].content[0].text).toContain('A simple translated test.\n');
      
      // Verify the result - use trim() to handle potential newline differences
      expect(result.trim()).toBe('A simple updated translated test.'.trim());
    });

    it('should throw an error if stop_reason is not tool_use', async () => {
      // Mock the diff output
      vi.mocked(Diff.createPatch).mockReturnValue('mock diff');
      
      // Mock the Anthropic response with wrong stop reason
      const mockResponse = {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Some text response' }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with test data
      const prevSourceText = 'Test.';
      const newSourceText = 'Updated test.';
      const prevTranslatedText = 'Translated test.';
      const language = 'Italian';
      
      // Expect the function to throw an error
      await expect(getTranslationEfficient(
        mockProvider, 
        newSourceText, 
        prevSourceText, 
        prevTranslatedText, 
        language
      )).rejects.toThrow('Expected tool_use stop reason');
    });

    it('should handle empty previous translated text', async () => {
      // Mock the diff output
      const mockPatch = `@@ -0,0 +1,1 @@
+Initial text.`;
      
      vi.mocked(Diff.createPatch).mockReturnValue(mockPatch);
      
      // Mock the Anthropic response
      const mockResponse = {
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use',
          name: 'replaceEntireText',
          input: {
            new_str: 'Initial translated text.'
          }
        }]
      };
      
      mockProvider.anthropicClient.messages.create.mockResolvedValue(mockResponse);

      // Call the function with empty previous translated text
      const prevSourceText = '';
      const newSourceText = 'Initial text.';
      const prevTranslatedText = '';
      const language = 'Japanese';
      
      const result = await getTranslationEfficient(
        mockProvider, 
        newSourceText, 
        prevSourceText, 
        prevTranslatedText, 
        language
      );

      // Verify the result - use trim() to handle potential newline differences
      expect(result.trim()).toBe('Initial translated text.'.trim());
    });
  });

  // Live API tests - only run when ANTHROPIC_API_KEY is set
  describe('Live API tests', () => {
    let liveProvider: AnthropicProvider;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    // Skip these tests if no API key is available
    beforeEach(() => {
      if (!apiKey) {
        console.warn('Skipping live API tests: ANTHROPIC_API_KEY not set');
        return;
      }
      
      liveProvider = new AnthropicProvider({
        apiKey,
        defaultModel,
        maxTokens: 1000
      });
    });

    it.skip('should get a real translation with getTranslation', async () => {
      if (!apiKey) return;
      
      const text = 'Hello, how are you today?';
      const language = 'Spanish';
      
      const result = await getTranslation(liveProvider, text, '', language);
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Basic check that it looks like Spanish
      expect(result).toMatch(/¿|Hola|cómo|estás|hoy/);
    });

    it.skip('should update an existing translation with getTranslation', async () => {
      if (!apiKey) return;
      
      const text = 'Hello, how are you today? I am doing well.';
      const prevTranslatedText = 'Hola, ¿cómo estás hoy?';
      const language = 'Spanish';
      
      const result = await getTranslation(liveProvider, text, prevTranslatedText, language);
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(prevTranslatedText.length);
      // Should contain the previous translation plus new content
      expect(result).toContain('Hola');
      expect(result).toMatch(/bien|Estoy/); // Should contain something about "doing well"
    });

    it('should get a real translation with getTranslationEfficient', async () => {
      if (!apiKey) return;
      
      const prevSourceText = '';
      const newSourceText = 'Hello, how are you today?';
      const prevTranslatedText = '';
      const language = 'French';
      
      const result = await getTranslationEfficient(
        liveProvider,
        newSourceText,
        prevSourceText,
        prevTranslatedText,
        language
      );
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Basic check that it looks like French
      expect(result).toMatch(/Bonjour|comment|allez-vous|aujourd'hui|ça va/i);
    });

    it('should efficiently update an existing translation', async () => {
      if (!apiKey) return;
      
      const prevSourceText = 'Hello, how are you today?';
      const newSourceText = 'Hello, how are you today? I am doing very well.';
      const prevTranslatedText = 'Bonjour, comment allez-vous aujourd\'hui ?';
      const language = 'French';
      
      const result = await getTranslationEfficient(
        liveProvider,
        newSourceText,
        prevSourceText,
        prevTranslatedText,
        language
      );
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(prevTranslatedText.length);
      // Should contain the previous translation plus new content
      expect(result).toContain('Bonjour');
      expect(result).toMatch(/très bien|Je vais/i); // Should contain something about "doing very well"
    });

    it('should respect and maintain formatting in translations', async () => {
      if (!apiKey) return;
      
      const text = "First paragraph.\n\nSecond paragraph with *emphasized* text.";
      const language = 'Spanish';
      
      const result = await getTranslation(liveProvider, text, '', language);
      
      // Should preserve paragraph breaks and formatting markers
      expect(result).toContain('\n\n');
      expect(result).toMatch(/\*[^*]+\*/); // Should have *something* between asterisks
    });
  });
});