import * as Y from 'yjs';

import {
  ProseMirror,
  ProseMirrorDoc,
  reactKeys,
} from "@handlewithcare/react-prosemirror";
import { EditorState } from 'prosemirror-state';


import { exampleSetup } from 'prosemirror-example-setup';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { redo, undo, yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror';

// For markdown conversion
import { defaultMarkdownSerializer, schema } from 'prosemirror-markdown';
import { useEffect, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness.js';


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

  const [editorState, setEditorState] = useState(
    EditorState.create({ schema, plugins: [
      reactKeys(),
      ySyncPlugin(yXmlFragment),
      //yCursorPlugin(yDoc.getMap('cursors')),
      yUndoPlugin(),
      ...exampleSetup({ schema, history: false, menuBar: false }),
        keymap({
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
    ] })
  );

  return (
    <ProseMirror
      state={editorState}
      editable={() => editable}
      dispatchTransaction={(transaction) => {
        const newState = editorState.apply(transaction);
        setEditorState((s) => s.apply(transaction));

        // Convert content to markdown when it changes
        if (transaction.docChanged && onTextChanged) {
          const serializedContent = defaultMarkdownSerializer.serialize(newState.doc);
          onTextChanged(serializedContent);
        }
      }}
    >
      <ProseMirrorDoc />
    </ProseMirror>
  );

};
export default ProseMirrorEditor;
