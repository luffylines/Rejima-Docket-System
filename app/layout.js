import './globals.css';
import './admin.css';
import './preview.css';
import './folders.css';
import './folder-trash.css';
import FolderUploadGuard from './components/folder-upload-guard';

export const metadata = {
  title: 'Rejima Docket System',
  description: 'Secure internal document storage and docket tracking system.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <FolderUploadGuard />
        {children}
      </body>
    </html>
  );
}
