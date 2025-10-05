import React from 'react';

export interface ClickableBlockOptions {
  onBlockClick: (text: string, element: HTMLElement) => void;
  playingBlockKey: string | null;
  blockTexts?: string[]; // Collects all block texts during processing
}

/**
 * Rehype plugin that wraps block elements with click handlers and playing state
 */
export function rehypeAddClickableBlocks(options: ClickableBlockOptions) {
  return (tree: any) => {
    function wrapBlockElement(node: any) {
      if (!node.children || !Array.isArray(node.children)) {
        return;
      }

      // Process children recursively
      for (const child of node.children) {
        wrapBlockElement(child);
      }

      // Block-level elements to make clickable
      const blockElements = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'];

      if (node.type === 'element' && blockElements.includes(node.tagName)) {
        // Add data properties and event handlers
        node.properties = node.properties || {};
        node.properties['data-clickable-block'] = true;

        // Extract text content for the block key
        const textContent = extractTextContent(node);
        node.properties['data-block-text'] = textContent;

        // Collect block texts if array provided
        if (options.blockTexts && textContent.trim()) {
          options.blockTexts.push(textContent);
        }

        // Add playing state
        if (options.playingBlockKey === textContent) {
          node.properties['data-playing'] = true;
        }

        // Add click handler
        const originalOnClick = node.properties.onClick;
        node.properties.onClick = (e: React.MouseEvent<HTMLElement>) => {
          if (originalOnClick) originalOnClick(e);
          options.onBlockClick(textContent, e.currentTarget);
        };

        // Add cursor pointer style
        node.properties.style = {
          ...node.properties.style,
          cursor: 'pointer',
        };
      }
    }

    wrapBlockElement(tree);
  };
}

/**
 * Extract plain text content from a node tree
 */
function extractTextContent(node: any): string {
  if (node.type === 'text') {
    return node.value || '';
  }

  if (node.children && Array.isArray(node.children)) {
    return node.children.map(extractTextContent).join('');
  }

  return '';
}
