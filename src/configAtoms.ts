import { atom } from 'jotai';

export const isEditorAtom = atom(false);
export const fontSizeAtom = atom(16);
export const languageAtom = atom<string>("French");

// Layouts: each is an array of arrays of component keys
export const availableLayouts = [
  {
    key: 'full',
    label: 'Transcript, Source | Translation',
    layout: [
      ["transcript", "sourceText"],
      ["translatedText"]
    ]
  },
  {
    key: 'transcript-source',
    label: 'Transcript | Source Text, Translation',
    layout: [
      ["transcript"],
      ["sourceText", "translatedText"]
    ]
  },
  {
    key: 'transcript-translation',
    label: 'Transcript | Translation',
    layout: [
      ["transcript"],
      ["translatedText"]
    ]
  },
  {
    key: 'translation-only',
    label: 'Translation Only',
    layout: [
      ["translatedText"]
    ]
  }
];

export const selectedLayoutKeyAtom = atom(availableLayouts[2].key);
