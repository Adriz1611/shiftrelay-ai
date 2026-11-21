import "./globals.css";
import { VoiceProvider } from "./VoiceProvider";
export const metadata = {
  title: "ShiftRelay AI · Voice-first incident investigation",
  description: "Investigate a failed deployment by voice, inspect the evidence and hand the next engineer a verified record.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VoiceProvider>{children}</VoiceProvider>
      </body>
    </html>
  );
}
