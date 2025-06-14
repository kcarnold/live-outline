import { atom } from 'jotai';

export const isEditorAtom = atom(false);
export const fontSizeAtom = atom(16);
export const languages = ["French", "Haitian Creole", "Spanish"] as const;
export const languageAtom = atom<string>("French");

// Layouts: each is an array of arrays of component keys
export const availableLayouts = [
  {
    key: 'translation-only',
    label: 'Translation Only',
    layout: [
      ["video", "translatedText"]
    ]
  },
  {
    key: 'transcript-translation',
    label: 'Transcript | Translation',
    layout: [
      ["transcript"],
      ["translatedText", "video"]
    ]
  },
  {
    key: 'full',
    label: 'Transcript, Source | Translation',
    layout: [
      ["transcript", "sourceText"],
      ["translatedText", "video"]
    ]
  },
  {
    key: 'transcript-source',
    label: 'Transcript | Source Text, Translation',
    layout: [
      ["transcript", "video"],
      ["sourceText", "translatedText"]
    ]
  },
];

export const selectedLayoutKeyAtom = atom(availableLayouts[0].key);
