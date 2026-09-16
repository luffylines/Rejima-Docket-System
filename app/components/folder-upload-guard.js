'use client';

import { useEffect } from 'react';

export default function FolderUploadGuard() {
  useEffect(() => {
    function routeUploadToFolders(event) {
      const button = event.target?.closest?.('button');
      if (!button || button.closest('.folder-shell')) return;

      const label = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isGlobalUpload = label.includes('upload documents') || label.includes('drop & secure files');
      if (!isGlobalUpload) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

      const folderButton = Array.from(document.querySelectorAll('.sidebar nav button')).find((item) => {
        const text = (item.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return text === 'folders' || text === 'shared folders';
      });

      if (folderButton) {
        folderButton.click();
      }
    }

    document.addEventListener('click', routeUploadToFolders, true);
    return () => document.removeEventListener('click', routeUploadToFolders, true);
  }, []);

  return null;
}
