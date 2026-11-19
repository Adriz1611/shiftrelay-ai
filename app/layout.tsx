import "./globals.css";
import { VoiceProvider } from "./VoiceProvider";
export const metadata = { title: "ShiftRelay · Incident workspace" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VoiceProvider>{children}</VoiceProvider>
      </body>
    </html>
  );
}
