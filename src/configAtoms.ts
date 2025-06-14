import { atom } from 'jotai';

export const isEditorAtom = atom(false);
export const fontSizeAtom = atom(16);
export const languages = ["French", "Haitian Creole", "Spanish"] as const;
export const languageAtom = atom<string>("French");
