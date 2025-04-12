import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';

const SERVER_URL = 'http://localhost:8789';
const EXAMPLES_DIR = path.join(process.cwd(), 'examples');

// Default test language
const TARGET_LANGUAGE = 'Spanish';

/**
 * Creates realistic edit sequences from a complete document
 * This simulates how a user might build up a document over time:
 * - Starting with a few lines
 * - Gradually adding more content at the end
 * - Occasionally inserting lines in the middle
 * - Sometimes correcting/completing previously truncated lines
 */
function createRealisticEditSequences(fullContent: string): string[] {
  const lines = fullContent.split('\n');
  const sequences = [];
  
  // Start with just first few lines (e.g., title and first paragraph)
  let currentLineCount = Math.min(5, Math.floor(lines.length * 0.1));
  sequences.push(lines.slice(0, currentLineCount).join('\n'));
  
  // Track which lines we've intentionally truncated for later correction
  const truncatedLines: {lineIndex: number, originalContent: string}[] = [];
  
  // Simulate building the document in chunks
  while (currentLineCount < lines.length) {
    // Decide what kind of edit to make
    const editType = Math.random();
    
    if (editType < 0.7) {
      // Most common case: Add more lines at the end
      const newLinesCount = Math.min(
        3 + Math.floor(Math.random() * 5), // Add 3-7 lines
        lines.length - currentLineCount
      );
      
      currentLineCount += newLinesCount;
      
      // Maybe truncate a line for later correction (20% chance)
      if (Math.random() < 0.2 && currentLineCount > 0) {
        const lineToTruncate = currentLineCount - Math.floor(Math.random() * Math.min(newLinesCount, 3)) - 1;
        if (lineToTruncate >= 0 && lines[lineToTruncate].length > 30) {
          // Store original for later restoration
          truncatedLines.push({
            lineIndex: lineToTruncate, 
            originalContent: lines[lineToTruncate]
          });
          
          // Truncate the line
          const truncLength = Math.floor(lines[lineToTruncate].length * 0.6);
          const editedLines = [...lines];
          editedLines[lineToTruncate] = lines[lineToTruncate].substring(0, truncLength) + '...';
          
          sequences.push(editedLines.slice(0, currentLineCount).join('\n'));
          continue;
        }
      }
    } 
    else if (editType < 0.85 && truncatedLines.length > 0) {
      // Fix a previously truncated line
      const fixIndex = Math.floor(Math.random() * truncatedLines.length);
      const lineToFix = truncatedLines[fixIndex];
      
      const editedLines = [...lines];
      editedLines[lineToFix.lineIndex] = lineToFix.originalContent;
      
      // Remove from list of truncated lines
      truncatedLines.splice(fixIndex, 1);
      
      sequences.push(editedLines.slice(0, currentLineCount).join('\n'));
      continue;
    }
    else {
      // Insert a line somewhere in the middle, if possible
      if (currentLineCount > 10) {
        const insertPosition = 3 + Math.floor(Math.random() * (currentLineCount - 6));
        // Take a line from further in the document if possible
        if (currentLineCount < lines.length - 5) {
          const newLine = lines[currentLineCount + 1];
          const editedLines = [...lines];
          
          // Shift lines to make room for insertion
          for (let i = currentLineCount; i > insertPosition; i--) {
            editedLines[i] = editedLines[i-1];
          }
          
          editedLines[insertPosition] = newLine;
          currentLineCount++;
          
          sequences.push(editedLines.slice(0, currentLineCount).join('\n'));
          continue;
        }
      }
    }
    
    // Default case: just add lines sequentially
    sequences.push(lines.slice(0, currentLineCount).join('\n'));
  }
  
  // Final sequence is the complete document with all corrections
  if (truncatedLines.length > 0) {
    const finalLines = [...lines];
    for (const {lineIndex, originalContent} of truncatedLines) {
      finalLines[lineIndex] = originalContent;
    }
    sequences.push(finalLines.join('\n'));
  } else {
    sequences.push(lines.join('\n'));
  }
  
  return sequences;
}

// Helper to wait for server to be ready
function waitForServer(url: string, maxRetries = 10, retryDelay = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    let retries = 0;
    
    const checkServer = async () => {
      try {
        await axios.get(url);
        resolve();
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          reject(new Error(`Server not available after ${maxRetries} retries`));
          return;
        }
        setTimeout(checkServer, retryDelay);
      }
    };
    
    checkServer();
  });
}

describe('End-to-end translation tests', async () => {
  let serverProcess: ChildProcess;
  
  // Before all tests, start the server
  before(async () => {
    // Set different port to avoid conflicts
    process.env.PORT = '8789';
    
    // Start the server
    serverProcess = spawn('node', ['--loader=ts-node/esm', './server.ts'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    
    // Log server output for debugging
    serverProcess.stdout?.on('data', (data) => {
      console.log(`Server: ${data.toString().trim()}`);
    });
    
    serverProcess.stderr?.on('data', (data) => {
      console.error(`Server error: ${data.toString().trim()}`);
    });
    
    // Wait for server to be available
    await waitForServer(`${SERVER_URL}/api`);
    console.log('Server is ready for tests');
  });
  
  // After all tests, stop the server
  after(() => {
    if (serverProcess) {
      serverProcess.kill();
      console.log('Server stopped');
    }
  });
  
  // Get all example files 
  const exampleFiles = (await fs.readdir(EXAMPLES_DIR))
    .filter(file => file.endsWith('.md'));
  
  for (const exampleFile of exampleFiles) {
    it(`Translates "${exampleFile}" realistically with efficient mode`, async () => {
      const content = await fs.readFile(path.join(EXAMPLES_DIR, exampleFile), 'utf8');
      const editSequences = createRealisticEditSequences(content);
      
      console.log(`Testing with ${editSequences.length} realistic edit sequences`);
      
      let prevText = '';
      let prevTranslatedText = '';
      
      // Process each edit sequence
      for (let i = 0; i < editSequences.length; i++) {
        const currentText = editSequences[i];
        console.log(`\nSequence ${i+1}/${editSequences.length} (${currentText.length} chars)`);
        
        try {
          const response = await axios.post(`${SERVER_URL}/api/requestTranslation`, {
            text: currentText,
            prevText: prevText,
            prevTranslatedText: prevTranslatedText,
            language: TARGET_LANGUAGE,
            efficientMode: true
          });
          
          assert.strictEqual(response.status, 200, 'Expected 200 status code');
          assert.strictEqual(response.data.ok, true, 'Expected successful translation');
          assert.ok(response.data.translatedText, 'Missing translated text');
          
          // Additional verification
          if (i > 0) {
            // Check that translation is not just repeating the source
            assert.notStrictEqual(
              response.data.translatedText, 
              currentText, 
              'Translation should not match source text'
            );
            
            // Basic length check (translation should be reasonably sized)
            const sourceLength = currentText.length;
            const translationLength = response.data.translatedText.length;
            assert.ok(
              translationLength > sourceLength * 0.5 && translationLength < sourceLength * 2,
              `Translation length (${translationLength}) should be reasonable compared to source (${sourceLength})`
            );
          }
          
          // Save for next iteration
          prevText = currentText;
          prevTranslatedText = response.data.translatedText;
          
          // If this is the last sequence, log some statistics
          if (i === editSequences.length - 1) {
            console.log(`✓ Complete translation successful (${prevTranslatedText.length} chars)`);
          }
        } catch (error) {
          console.error('Error during translation sequence:', error.message);
          if (error.response) {
            console.error('Response data:', error.response.data);
          }
          throw error; // Re-throw to fail the test
        }
      }
    });
  }
});