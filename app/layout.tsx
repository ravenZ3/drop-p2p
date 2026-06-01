import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'drop — p2p file transfer',
  description: 'Send files directly browser-to-browser. No upload, no login, no server. Encrypted by default.',
  openGraph: {
    title: 'drop — p2p file transfer',
    description: 'Send files directly browser-to-browser. No upload, no login, no server.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
