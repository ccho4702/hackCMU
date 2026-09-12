import localFont from "next/font/local";

import "./globals.css";
import "./spotify-preview.css";
import "./light-preview.css";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata = {
  title: "Optune — Optimize your voice. Hear your best.",
  description:
    "Record a rehearsal, get timestamped delivery coaching and a revised script, then practice it in your own voice.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${pretendard.variable} h-full antialiased`}>
      <body className="spotify-design min-h-full">{children}</body>
    </html>
  );
}
