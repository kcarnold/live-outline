import { useAtomValue } from "jotai";
import { useCallback, useRef } from "react";
import * as Y from "yjs";
import { isEditorAtom, languages } from "./configAtoms";
import ProseMirrorEditor from "./ProseMirrorEditor";
import { useTranslationManager } from "./useTranslationManager";

export function SourceTextTranslationManager({ ydoc }: { ydoc: Y.Doc }) {
  const sourceTextRef = useRef("");
  const isEditor = useAtomValue(isEditorAtom);
  const {
    isTranslating,
    translationError,
    doTranslations,
    doResetTranslations,
  } = useTranslationManager({
    languages,
    sourceTextRef,
  });

  const doTranslationsSync = useCallback(() => {
    doTranslations().catch((err) => {
      console.error("Error during translation:", err);
    });
  }, [doTranslations]);

  return (
    <div className="flex flex-col gap-1 h-full">
      <h2 className="font-semibold text-xs text-gray-600 dark:text-gray-300 leading-tight">
        Original Text
      </h2>
      <div className="flex-1 min-h-0 overflow-auto">
        <ProseMirrorEditor
          yDoc={ydoc}
          onTextChanged={
            isEditor
              ? (val) => {
                  sourceTextRef.current = val;
                }
              : () => null
          }
          editable={isEditor}
          onTranslationTrigger={isEditor ? doTranslationsSync : () => null}
        />
      </div>
      {isEditor ? (
        <div className="flex justify-end">
          {translationError !== "" && (
            <div className="p-2 bg-red-800 text-white rounded-md mx-2">
              <b>Translation Error</b>: {translationError}
            </div>
          )}
          <button
            className="bg-gray-600 text-white font-medium py-1 px-2 rounded hover:bg-gray-700 transition-colors mr-2"
            onClick={doResetTranslations}
          >
            Reset
          </button>
          <button
            className={`text-white font-medium py-1 px-2 rounded transition-colors ${
              isTranslating
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            onClick={doTranslationsSync}
            disabled={isTranslating}
          >
            {isTranslating ? "Translating..." : "Translate"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
