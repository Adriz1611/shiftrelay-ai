import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, AudioLines } from "lucide-react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "ShiftRelay AI · Voice-first incident handovers",
  description:
    "Investigate a failed deployment by voice, verify what changed, and hand off the evidence to the next engineer.",
};

const chapters = [
  {
    title: "Ask what changed.",
    copy: "Start with the failed deployment. Ask ShiftRelay to trace it back to the last passing run and take you to the strongest evidence.",
  },
  {
    title: "Check the evidence.",
    copy: "Read the Git diff and the failed step’s output in Incident X-Ray. Review the proposed GitHub comment and Discord update before they go out.",
  },
  {
    title: "Brief the next shift.",
    copy: "Start a fresh voice session. The handover carries forward the linked evidence, delivery receipts, and the next open check.",
  },
];

function Wordmark() {
  return (
    <Link href="/" className={styles.wordmark} aria-label="ShiftRelay AI home">
      <span className={styles.mark}><AudioLines size={20} aria-hidden="true" /></span>
      <span>ShiftRelay <small>AI</small></span>
    </Link>
  );
}

function WorkspaceLink() {
  return (
    <Link href="/workspace" className={styles.launch}>
      Open workspace <ArrowRight size={20} aria-hidden="true" />
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.wrap}>
          <Wordmark />
          <nav aria-label="Main navigation">
            <a className={styles.navStory} href="#how-it-works">How it works</a>
            <Link className={styles.navLink} href="/workspace">
              Workspace <ArrowDownRight size={17} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.intro}>
              <h1 id="landing-title">Pick up where the <em>last shift left off.</em></h1>
              <p>A voice-first incident workspace for engineers taking over a failed deployment. Ask what broke, check the evidence, and brief the next shift.</p>
              <WorkspaceLink />
            </div>

            <section className={styles.scenario} aria-labelledby="scenario-title">
              <h2 id="scenario-title">Bengaluru night market checkout demo</h2>
              <p>
                In this controlled scenario, the checkout quote service fails CI
                validation because its manifest is missing the required payment schema revision.
              </p>
              <figure>
                <figcaption><AudioLines size={20} aria-hidden="true" /> Try asking</figcaption>
                <blockquote>“What changed since the last passing checkout run?”</blockquote>
              </figure>
              <Link href="/workspace" className={styles.sourceLink}>
                Sign in to inspect GitHub sources <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </section>
          </div>
        </section>

        <aside className={styles.partners} aria-label="Voice technology">
          <div className={styles.wrap}>
            <p>Built for live voice</p>
            <div className={styles.partner}><Image src="/brands/agora.svg" alt="Agora" width={102} height={34} unoptimized /> <span>Live conversation</span></div>
            <div className={styles.partner}><Image src="/brands/murf.svg" alt="Murf" width={102} height={34} unoptimized /> <span>Falcon text-to-speech</span></div>
          </div>
        </aside>

        <section className={`${styles.wrap} ${styles.story}`} id="how-it-works" aria-labelledby="story-title">
          <h2 id="story-title">From first question<br />to next shift.</h2>
          <ol>
            {chapters.map((chapter) => (
              <li key={chapter.title}>
                <div><h3>{chapter.title}</h3><p>{chapter.copy}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <footer className={styles.footer}>
          <div className={styles.wrap}>
            <Wordmark />
            <WorkspaceLink />
          </div>
        </footer>
      </main>
    </div>
  );
}
