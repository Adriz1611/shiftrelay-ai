"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Voice from "./Voice";

export type Caption = {
  turnId: number;
  text: string;
  sessionId: string;
  playbackAligned: boolean;
  receivedAt: number;
};
export type VoiceSignal = {
  sessionId?: string;
  caption?: Caption;
  interruption?: number;
  speaking?: boolean;
};
const VoiceContext = createContext<{
  signal: VoiceSignal;
  mount: (element: HTMLDivElement | null) => void;
  configure: (signedIn: boolean, refresh: () => Promise<void>) => void;
} | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [destination, setDestination] = useState<HTMLDivElement | null>(null);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const [signal, setSignal] = useState<VoiceSignal>({});
  const [operator, setOperator] = useState({
    signedIn: false,
    refresh: async () => {},
  });
  useEffect(() => {
    const element = document.createElement("div");
    element.className = "voice-host";
    setTarget(element);
    return () => element.remove();
  }, []);
  useEffect(() => {
    if (target && (destination || dock))
      (destination ?? dock)?.appendChild(target);
  }, [target, destination, dock]);
  const configure = useCallback(
    (signedIn: boolean, refresh: () => Promise<void>) => {
      setOperator((previous) =>
        previous.signedIn === signedIn && previous.refresh === refresh
          ? previous
          : { signedIn, refresh },
      );
    },
    [],
  );
  const onSignal = useCallback((change: Partial<VoiceSignal>) => {
    setSignal((previous) =>
      "sessionId" in change ? change : { ...previous, ...change },
    );
  }, []);
  const context = useMemo(
    () => ({ signal, mount: setDestination, configure }),
    [signal, configure],
  );
  return (
    <VoiceContext.Provider value={context}>
      {children}
      <div className="voice-dock-host" ref={setDock} />
      {target &&
        createPortal(
          <Voice
            signedIn={operator.signedIn}
            onSignIn={operator.refresh}
            floating={!destination}
            onSignal={onSignal}
          />,
          target,
        )}
    </VoiceContext.Provider>
  );
}

export function usePersistentVoice() {
  const context = useContext(VoiceContext);
  if (!context) throw new Error("VoiceProvider is required");
  return context;
}
