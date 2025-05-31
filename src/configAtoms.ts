import { atom } from 'jotai';

export const showSourceTextAtom = atom(true);
export const fontSizeAtom = atom(16);
export const showTranscriptAtom = atom(true);
export const languageAtom = atom<string>("French");
