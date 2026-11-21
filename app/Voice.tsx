"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, startVoice, stopVoice } from "./voice-actions";
import Markdown from "react-markdown";
import { AudioLines, Mic, MicOff, Square } from "lucide-react";
import type { VoiceSignal } from "./VoiceProvider";
import { createAudioMeter } from "../lib/audio-meter";

export default function Voice({
  signedIn,
  onSignIn,
  floating,
  onSignal,
}: {
  signedIn: boolean;
  onSignIn: () => Promise<void>;
  floating: boolean;
  onSignal: (change: Partial<VoiceSignal>) => void;
}) {
  const [message, setMessage] = useState("Offline"),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false);
  const [turns, setTurns] = useState<{ role: string; text: string }[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [micError, setMicError] = useState("");
  const dockTrigger = useRef<HTMLButtonElement>(null);
  const microphone = useRef<
    import("agora-rtc-sdk-ng").IMicrophoneAudioTrack | null
  >(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const waveform = useRef<HTMLDivElement>(null);
  const dockMeter = useRef<HTMLSpanElement>(null);
  const audioLevel = useRef<(() => number) | null>(null);
  const agentPlaybackLevel = useRef<(() => number) | null>(null);
  const connected = active && message === "CONNECTED";

  useEffect(() => {
    if (signedIn) return;
    let cancelled = false;
    async function openDemo() {
      try {
        const result = await signIn();
        if (cancelled) return;
        if (result === "Signed in") await onSignIn();
        else setLoginError(result);
      } catch {
        if (!cancelled) setLoginError("Unable to open the workspace. Refresh to retry.");
      }
    }
    void openDemo();
    return () => { cancelled = true; };
  }, [signedIn, onSignIn]);

  useEffect(() => {
    const bars = Array.from(
      (floating ? dockMeter.current : waveform.current)?.children ?? [],
    );
    if (!connected || !bars.length) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const levels = bars.map(() => 0);
    let previous = performance.now();
    let frame: number;
    function draw(now: number) {
      const elapsed = Math.min(now - previous, 50);
      previous = now;
      if (!reducedMotion.matches) {
        const target =
          (floating ? agentPlaybackLevel.current : audioLevel.current)?.() ?? 0;
        bars.forEach((bar, index) => {
          const distance = Math.abs(index - (bars.length - 1) / 2);
          const response = target > levels[index] ? 40 + distance * 7 : 175;
          levels[index] +=
            (target - levels[index]) * (1 - Math.exp(-elapsed / response));
          (bar as HTMLElement).style.setProperty(
            "--level",
            String(0.14 + 0.86 * levels[index]),
          );
        });
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      bars.forEach((bar) =>
        (bar as HTMLElement).style.removeProperty("--level"),
      );
    };
  }, [connected, floating]);
  useEffect(() => {
    const element = transcript.current;
    if (element && followTranscript.current)
      element.scrollTop = element.scrollHeight;
  }, [turns]);
  const close = useRef<null | (() => Promise<void>)>(null);
  async function toggleMic() {
    const track = microphone.current;
    if (!track || micBusy) return;
    setMicBusy(true);
    setMicError("");
    try {
      await track.setEnabled(muted);
      setMuted(!muted);
    } catch {
      setMicError("Could not change microphone state.");
    } finally {
      setMicBusy(false);
    }
  }
  async function toggle() {
    setBusy(true);
    let meterContext: AudioContext | undefined;
    try {
      if (close.current) {
        const cleanup = close.current;
        close.current = null;
        setActive(false);

        setMessage("Offline");
        await cleanup();
        return;
      }
      try {
        meterContext = new AudioContext();
        void meterContext.resume().catch(() => undefined);
      } catch {
        // Keep voice available when Web Audio is unavailable.
      }
      const sdk = (await import("agora-rtc-sdk-ng")).default;
      const timing = sdk as typeof sdk & {
        setParameter?: (key: string, value: boolean) => void;
      };
      timing.setParameter?.("ENABLE_AUDIO_PTS_METADATA", true);
      const mic = await sdk.createMicrophoneAudioTrack();
      microphone.current = mic;
      setMuted(false);
      setMicError("");
      const rtc = sdk.createClient({ mode: "rtc", codec: "vp8" });
      let id: string | undefined;
      let closeTranscript: (() => Promise<void>) | undefined;
      const cleanup = async () => {
        microphone.current = null;
        setSpeaking(false);
        onSignal({ sessionId: undefined });
        audioLevel.current = null;
        agentPlaybackLevel.current = null;
        await meterContext?.close().catch(() => undefined);
        mic.close();
        await closeTranscript?.().catch(() => undefined);
        await rtc.leave();
        if (id) await stopVoice(id);
      };
      try {
        const session = await startVoice();
        if (session.callbackUnavailable) {
          await cleanup();
          setMessage(
            "Session unavailable. The voice tools could not be reached. Check the callback proxy and HTTPS tunnel.",
          );
          return;
        }
        id = session.id;
        onSignal({ sessionId: session.id });
        rtc.on("user-published", async (user, type) => {
          if (type === "audio") {
            await rtc.subscribe(user, type);
            user.audioTrack?.play();
          }
        });
        rtc.on("connection-state-change", (state) => setMessage(state));
        await rtc.join(
          session.appId,
          session.channel,
          session.token,
          session.uid,
        );
        followTranscript.current = true;
        setTurns([]);
        setHistoryError(false);
        try {
          const [
            { default: AgoraRTM },
            { AgoraVoiceAI, AgoraVoiceAIEvents, TranscriptHelperMode },
          ] = await Promise.all([
            import("agora-rtm"),
            import("agora-agent-client-toolkit"),
          ]);
          const rtm = new AgoraRTM.RTM(session.appId, String(session.uid));
          await rtm.login({ token: session.token });
          closeTranscript = async () => {
            await rtm.logout();
          };
          await rtm.subscribe(session.channel);
          const ai = await AgoraVoiceAI.init({
            rtcEngine: rtc,
            rtmEngine: rtm,
            renderMode: TranscriptHelperMode.AUTO,
          });
          closeTranscript = async () => {
            try {
              ai.unsubscribe();
              ai.destroy();
            } finally {
              await rtm.logout();
            }
          };
          ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (items) => {
            const assistant = items.at(-1);
            if (
              assistant &&
              !["0", String(session.uid)].includes(String(assistant.uid)) &&
              assistant.text.trim()
            ) {
              onSignal({
                caption: {
                  turnId: assistant.turn_id,
                  text: assistant.text,
                  sessionId: session.id,
                  playbackAligned: Boolean(assistant.metadata?.words?.length),
                  receivedAt: Date.now(),
                },
              });
            }
            setTurns(
              items.flatMap(({ uid, text }) =>
                typeof text === "string" && text.trim()
                  ? [
                      {
                        role: ["0", String(session.uid)].includes(String(uid))
                          ? "user"
                          : "assistant",
                        text,
                      },
                    ]
                  : [],
              ),
            );
          });
          ai.on(AgoraVoiceAIEvents.AGENT_SPEAKING_CHANGED, (_, value) => {
            setSpeaking(value);
            onSignal({ speaking: value });
          });
          ai.on(AgoraVoiceAIEvents.AGENT_INTERRUPTED, () => {
            onSignal({ interruption: Date.now() });
          });
          ai.subscribeMessage(session.channel);
        } catch {
          setHistoryError(true);
          await closeTranscript?.().catch(() => undefined);
          closeTranscript = undefined;
        }
        await rtc.publish(mic);
        if (meterContext) {
          const microphoneLevel = createAudioMeter(meterContext);
          const agentLevel = createAudioMeter(meterContext);
          agentPlaybackLevel.current = () => {
            const agent = rtc.remoteUsers.find((user) => user.audioTrack);
            return agentLevel(agent?.audioTrack?.getMediaStreamTrack());
          };
          audioLevel.current = () =>
            Math.max(
              microphoneLevel(mic.getMediaStreamTrack()),
              agentPlaybackLevel.current?.() ?? 0,
            );
        }
        close.current = cleanup;
        setActive(true);
      } catch (error) {
        await cleanup();
        throw error;
      }
    } catch {
      if (meterContext?.state !== "closed")
        await meterContext?.close().catch(() => undefined);
      setMessage(
        "Session unavailable. Check sign-in, microphone permission and provider configuration.",
      );
    } finally {
      setBusy(false);
    }
  }
  const status = busy
    ? active
      ? "Ending session…"
      : "Connecting…"
    : connected
      ? "Connected"
      : active
        ? message.toLowerCase()
        : "Offline";
  const compact = floating && (active || busy);
  if (floating && !compact) return null;
  return (
    <section
      className={"voice panel" + (compact ? " voice-floating" : "")}
      aria-labelledby={compact ? undefined : "voice-heading"}
      aria-label={compact ? "Floating voice session" : undefined}
      onPointerEnter={(event) => {
        if (compact && event.pointerType === "mouse") setExpanded(true);
      }}
      onFocus={(event) => {
        if (
          compact &&
          event.target === dockTrigger.current &&
          event.target.matches(":focus-visible")
        )
          setExpanded(true);
      }}
      onKeyDown={(event) => {
        if (compact && event.key === "Escape") {
          setExpanded(false);
          dockTrigger.current?.focus();
        }
      }}
    >
      {compact && (
        <div className="voice-dock-bar">
          <button
            ref={dockTrigger}
            aria-expanded={expanded}
            aria-controls="voice-dock-transcript"
            onClick={() => setExpanded(!expanded)}
          >
            <span className="dock-avatar" aria-hidden="true">
              <AudioLines size={17} />
            </span>
            <span className="dock-identity">
              <strong>ShiftRelay</strong>
              <small>
                {speaking
                  ? "Speaking"
                  : muted
                    ? "Mic off"
                    : active
                      ? "Listening"
                      : status}
              </small>
            </span>
            <span className="dock-meter" ref={dockMeter} aria-hidden="true">
              {[6, 12, 19, 15, 25, 15, 19, 12, 6].map((height, index) => (
                <i key={index} style={{ height }} />
              ))}
            </span>
          </button>
          <button
            aria-label={muted ? "Turn microphone on" : "Turn microphone off"}
            title={muted ? "Turn mic on" : "Turn mic off"}
            disabled={!active || micBusy || busy}
            onClick={() => void toggleMic()}
          >
            {muted ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button
            aria-label="End voice session"
            title="End session"
            disabled={busy}
            onClick={() => void toggle()}
          >
            <Square size={15} />
          </button>
        </div>
      )}
      {compact && micError && (
        <p className="voice-error" role="alert">
          {micError}
        </p>
      )}
      {!compact && (
        <>
          <div className="voice-console">
            <div className="voice-heading">
              <AudioLines size={20} />
              <h2 id="voice-heading">Voice session</h2>
              <span className="voice-status" role="status">
                <i className={connected ? "online" : ""} />
                {status}
              </span>
            </div>
            <div
              ref={waveform}
              className={connected ? "wave live" : "wave"}
              aria-hidden="true"
            >
              {[
                14, 28, 18, 38, 26, 55, 34, 65, 45, 76, 59, 85, 59, 76, 45, 65,
                34, 55, 26, 38, 18, 28, 14,
              ].map((height, index) => (
                <i
                  key={index}
                  style={{
                    height: height + "%",
                  }}
                />
              ))}
            </div>
            {signedIn ? (
              <button className="voice-button" onClick={toggle} disabled={busy}>
                {active ? <Square size={15} /> : <Mic size={16} />}{" "}
                {busy ? status : active ? "End session" : "Start voice session"}
              </button>
            ) : (
              <p role="status">{loginError || "Opening workspace…"}</p>
            )}
            {message.startsWith("Session unavailable") && (
              <p className="voice-error" role="alert">
                {message}
              </p>
            )}
            {active && (
              <button
                className="secondary voice-mic-toggle"
                disabled={busy || micBusy}
                onClick={() => void toggleMic()}
              >
                {muted ? <MicOff size={16} /> : <Mic size={16} />}{" "}
                {muted ? "Turn mic on" : "Turn mic off"}
              </button>
            )}
            {micError && (
              <p className="voice-error" role="alert">
                {micError}
              </p>
            )}
          </div>
          <div className="transcript-heading">
            <h3>Transcript</h3>
            {connected && <span>Live</span>}
          </div>
        </>
      )}
      <div
        id="voice-dock-transcript"
        hidden={compact && !expanded}
        className="transcript"
        ref={transcript}
        onScroll={(event) => {
          const element = event.currentTarget;
          followTranscript.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            32;
        }}
        role="region"
        aria-label="Voice transcript"
        tabIndex={0}
      >
        {historyError && (
          <p className="muted" role="status">
            Transcript unavailable during this session.
          </p>
        )}
        {!turns.length && !historyError && (
          <p className="muted">
            {active
              ? "Start speaking to see the conversation here."
              : "Your conversation will appear here."}
          </p>
        )}
        {turns.map((turn, index) => (
          <article key={index} className="turn">
            <span className="avatar">{turn.role === "user" ? "OP" : "SR"}</span>
            <div>
              <strong>
                {turn.role === "user" ? "Operator" : "ShiftRelay"}
              </strong>
              <Markdown
                skipHtml
                components={{
                  img: ({ alt }) => alt ?? null,
                  a: ({ href, title, children }) => (
                    <a
                      href={href}
                      title={title}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {turn.text}
              </Markdown>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
