import { useAtomValue } from "jotai";
import { useCallback, useRef } from "react";
import * as Y from "yjs";
import { isEditorAtom, languages } from "./configAtoms";
import ProseMirrorEditor from "./ProseMirrorEditor";
import TranslationControls from "./TranslationControls";
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
    <div className="flex flex-col gap-1 h-full"> {/* Added h-full for full height */}
      <h2 className="font-semibold text-xs text-gray-600 dark:text-gray-300 leading-tight">
        Original Text
      </h2>
      <div className="flex-1 min-h-0 overflow-auto"> {/* Make editor scrollable */}
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
        <div className={"flex justify-center min-h-[36px]"}>
          <TranslationControls
            translationError={translationError}
            isTranslating={isTranslating}
            onReset={doResetTranslations}
            onTranslate={doTranslationsSync}
          />
        </div>
      ) : null}
    </div>
  );
}
