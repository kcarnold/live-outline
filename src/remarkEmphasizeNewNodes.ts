
export function remarkEmphasizeNewNodes(options: { prevTextHashes: Set<string>, currentTextHashes?: Set<string> }) {
  return (tree: any) => {
    const prevTextHashes = options.prevTextHashes || new Set();
    const currentTextHashes = options.currentTextHashes;

    // Hash function for text nodes: just the value
    function hashTextNode(node: any): string {
      return node.value ?? '';
    }

    function markNewSubtrees(node: any): boolean {
      if (node.type === 'text') {
        const hash = hashTextNode(node);
        if (currentTextHashes) {
          currentTextHashes.add(hash);
        }
        if (!prevTextHashes.has(hash)) {
          return true; // This is a new text node
        }
        return false;
      } else if (node.children && Array.isArray(node.children)) {
        let anyDirectChildIsNew = false;
        for (const child of node.children) {
          if (markNewSubtrees(child)) {
            anyDirectChildIsNew = true;
          }
        }
        if (anyDirectChildIsNew) {
          node.data = node.data || {};
          node.data.hProperties = node.data.hProperties || {};
          node.data.hProperties['data-isnew'] = true;
        }
        return false;
      }
      return false;
    }

    markNewSubtrees(tree);
  };
}
