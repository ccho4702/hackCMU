import "./globals.css";

export const metadata = {
  title: "Rehearse — Your next take, better",
  description: "Record a presentation, improve your delivery and script, and hear the next version in your voice.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
