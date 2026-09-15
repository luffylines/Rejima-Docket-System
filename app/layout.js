import './globals.css';

export const metadata = {
  title: 'Rejima Docket System',
  description: 'Secure internal document storage and docket tracking system.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
