import { StateCreator } from "zustand";
import { Store } from "../index";

export type VisemeSet = Record<
  "neutral"|"ah"|"ee"|"oh"|"oo"|"mbp"|"fv"|"l"|"chsh",
  string // file path to PNG
>;

export interface Speaker {
  id: string;
  name: string;
  gender: "male" | "female";
  visemes: VisemeSet;
  transform: { x: number; y: number; scale: number };   // canvas position
  bgOpacity: number;      // 0–1  (invisible disk when 0)
  borderOpacity: number;  // 0–1
  faceFill: number;       // 0.9 default (90% of circle)
  ttsVoiceRef?: string;   // XTTS reference wav path
  audioFx?: { pitch: number; formant: number; reverb: number };
}

export interface SpeakerSlice {
  speakers: Speaker[];
  activeSpeakerId: string | null;
  addSpeaker: (s: Speaker) => void;
  updateSpeaker: (id: string, patch: Partial<Speaker>) => void;
  removeSpeaker: (id: string) => void;
}

export const createSpeakerSlice: StateCreator<Store, [], [], SpeakerSlice> = (set) => ({
  speakers: [],
  activeSpeakerId: null,
  addSpeaker: (s) => set((st) => ({ speakers: [...st.speakers, s] })),
  updateSpeaker: (id, patch) =>
    set((st) => ({
      speakers: st.speakers.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
    })),
  removeSpeaker: (id) =>
    set((st) => ({ speakers: st.speakers.filter((sp) => sp.id !== id) })),
});
