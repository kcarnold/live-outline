// TODO: Replace this with the example code from https://github.com/handlewithcarecollective/react-prosemirror/blob/main/demo/main.tsx
// Note: other useful references:
// - https://github.com/ProseMirror/website/blob/master/example/markdown/index.js
// - https://github.com/ProseMirror/website/blob/master/src/collab/schema.js (may not be needed)

import * as Y from 'yjs';

import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
} from "@handlewithcare/react-prosemirror";
import { EditorState, Transaction } from 'prosemirror-state';


import { exampleSetup } from 'prosemirror-example-setup';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { redo, undo, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';

import { gapCursor } from "prosemirror-gapcursor";
import "prosemirror-gapcursor/style/gapcursor.css";


// For markdown conversion
import { defaultMarkdownSerializer, schema } from 'prosemirror-markdown';
import { useCallback, useEffect, useRef, useState } from 'react';
//import { Awareness } from 'y-protocols/awareness.js';


const ProseMirrorEditor = ({ yDoc, onTextChanged, editable, onTranslationTrigger }: {
  yDoc: Y.Doc,
  onTextChanged: (text: string) => void,
  editable: boolean,
  onTranslationTrigger?: () => void
}) => {
  const yXmlFragment = yDoc.getXmlFragment('prosemirror');
  // @ts-ignore
  window.yXmlFragment = yXmlFragment; // For debugging

  // Hack: The keymap in the editor state would otherwise close over a stale value of onTranslationTrigger.
  const onTranslationTriggerRef = useRef<(() => void) | undefined>(onTranslationTrigger);
  useEffect(() => {
    onTranslationTriggerRef.current = onTranslationTrigger;
  }
  , [onTranslationTrigger]);

  const [editorState, setEditorState] = useState(() => 
    EditorState.create({ schema, plugins: [
      reactKeys(),
      ySyncPlugin(yXmlFragment),
      //yCursorPlugin(yDoc.getMap('cursors')),
      yUndoPlugin(),
      keymap({
        // https://github.com/yjs/yjs-demos/blob/main/prosemirror/prosemirror.js#L36
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        'Tab': sinkListItem(schema.nodes.list_item),
        'Shift-Tab': liftListItem(schema.nodes.list_item),
        'Mod-Enter': (_state, _dispatch) => {
          if (onTranslationTriggerRef.current) {
            onTranslationTriggerRef.current();
            return true;
          }
          return false;
        }
      }),
      ...exampleSetup({ schema, history: false, menuBar: false }),
      gapCursor(),
    ] })
  );

  const dispatchTransaction = useCallback((transaction: Transaction) => {
          const newState = editorState.apply(transaction);
          setEditorState(newState);
  
          // Convert content to markdown when it changes
          if (transaction.docChanged && onTextChanged) {
            const serializedContent = defaultMarkdownSerializer.serialize(newState.doc);
            onTextChanged(serializedContent);
          }
        }, [editorState, onTextChanged]);
        
  return (
    <ProseMirror
      state={editorState}
      editable={() => editable}
      dispatchTransaction={dispatchTransaction}
    >
      <ProseMirrorDoc />
    </ProseMirror>
  );

};
export default ProseMirrorEditor;
