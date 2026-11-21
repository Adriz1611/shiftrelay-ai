"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Mic } from "lucide-react";
import styles from "./repository-room.module.css";

const Briefing = dynamic(() => import("./repo-briefing/BriefingView"));
const History = dynamic(() => import("./repo-history/HistoryView"));
const Paths = dynamic(() => import("./repo-paths/PathsView"));
const modes = {
  briefing: "Briefing",
  history: "History & live",
  plan: "Sprint plan",
  onboard: "Getting started",
  health: "Health",
} as const;
export type RepoMode = keyof typeof modes;
type Selection = { mode: RepoMode; hours?: number; id?: number };
type Dictation = {
  lang: string;
  start(): void;
  abort(): void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export default function RepositoryRoom({
  initial,
  activeVoice,
  onClose,
}: {
  initial: Selection;
  activeVoice: boolean;
  onClose: () => void;
}) {
  const [selection, select] = useState(initial);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const speech = useRef<Dictation | null>(null);
  useEffect(() => {
    select(initial);
    setNotice("");
  }, [initial]);
  useEffect(
    () => () => {
      speech.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (activeVoice) speech.current?.abort();
  }, [activeVoice]);
  function ask(value: string) {
    const input = value.trim().toLowerCase();
    const budget = input.match(/(?:^|\s)(-?\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/);
    let next: Selection;
    if (budget) {
      const hours = Number(budget[1]);
      if (hours < 0.25 || hours > 168) {
        setNotice("Choose a budget from 0.25 to 168 hours.");
        return;
      }
      next = { mode: "plan", hours };
    } else if (/plan|weekend|sprint/.test(input)) next = { mode: "plan" };
    else if (/new contributor|onboard|getting started/.test(input))
      next = { mode: "onboard" };
    else if (/health|review load|bus factor/.test(input))
      next = { mode: "health" };
    else if (/history|time.travel|live|timeline/.test(input))
      next = { mode: "history" };
    else if (/on fire|brief|urgent/.test(input)) next = { mode: "briefing" };
    else {
      setNotice(
        "Try “What’s on fire?”, “I have 6 hours”, or choose a view below.",
      );
      return;
    }
    select({ ...next, id: Date.now() });
    setNotice("");
    setQuery("");
  }
  function dictate() {
    if (listening) {
      speech.current?.abort();
      return;
    }
    const browser = window as Window & {
      SpeechRecognition?: new () => Dictation;
      webkitSpeechRecognition?: new () => Dictation;
    };
    const Recognition =
      browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice(
        "Dictation is unavailable in this browser. Type a command or use the Agora session.",
      );
      return;
    }
    const instance = new Recognition();
    speech.current = instance;
    instance.lang = "en-US";
    instance.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript;
      if (text) {
        setQuery(text);
        ask(text);
      }
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => {
      setListening(false);
      setNotice("Dictation stopped. You can type the command.");
    };
    try {
      instance.start();
      setListening(true);
      setNotice("");
    } catch {
      setNotice("Could not start browser dictation.");
    }
  }
  return (
    <section className={styles.room} aria-labelledby="repo-room-title">
      <button className="secondary" onClick={onClose}>
        <ArrowLeft size={16} /> Back to incident
      </button>
      <header className={styles.header}>
        <div>
          <h1 id="repo-room-title">Repository field notes.</h1>
          <p>Follow the work from first report to next contribution.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(query);
          }}
          className={styles.form}
        >
          <label htmlFor="repo-command">Ask about this repository</label>
          <div>
            <input
              id="repo-command"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What’s on fire?"
            />
            <button
              type="button"
              aria-label={
                listening ? "Stop dictation" : "Dictate repository command"
              }
              title={
                activeVoice
                  ? "Use the active Agora session"
                  : "Use browser speech recognition"
              }
              disabled={activeVoice}
              aria-pressed={listening}
              onClick={dictate}
            >
              <Mic size={17} />
            </button>
            <button type="submit" aria-label="Run repository command">
              <ArrowRight size={18} />
            </button>
          </div>
          <small role="status">
            {notice ||
              (listening
                ? "Listening for a repository command…"
                : activeVoice
                  ? "Your Agora session can open these views."
                  : "Optional dictation uses your browser’s speech service.")}
          </small>
        </form>
      </header>
      <nav aria-label="Repository views" className={styles.nav}>
        {(Object.keys(modes) as RepoMode[]).map((mode) => (
          <button
            key={mode}
            aria-current={mode === selection.mode ? "page" : undefined}
            onClick={() => {
              select({ mode });
              setNotice("");
            }}
          >
            {modes[mode]}
          </button>
        ))}
      </nav>
      <div key={selection.mode + ":" + String(selection.id || 0)}>
        {selection.mode === "history" ? (
          <History />
        ) : selection.mode === "plan" || selection.mode === "onboard" ? (
          <Paths mode={selection.mode} hours={selection.hours} />
        ) : (
          <Briefing mode={selection.mode} />
        )}
      </div>
    </section>
  );
}
