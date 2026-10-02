import { create } from "zustand";
import type { TraineeView } from "../engine/view";
import type { SessionClient } from "../session/SessionClient";

interface SessionStore {
  client: SessionClient | null;
  view: TraineeView | null;
  experience: "STANDARD" | "DEMO" | null;
  setClient: (
    client: SessionClient,
    view: TraineeView,
    experience?: "STANDARD" | "DEMO",
  ) => void;
  setView: (view: TraineeView) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  client: null,
  view: null,
  experience: null,
  setClient: (client, view, experience = "STANDARD") => {
    const previous = get().client;
    if (previous && previous !== client) previous.dispose();
    set({ client, view, experience });
  },
  setView: (view) => set({ view }),
  clear: () => {
    get().client?.dispose();
    set({ client: null, view: null, experience: null });
  },
}));
