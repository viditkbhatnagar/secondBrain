import React, { useEffect } from 'react';

// This simple listener decodes anchors like #open-document:<docId>:<chunkId>
// and sets a custom event for your library component to handle opening/highlighting.
export const HashListener: React.FC = () => {
  useEffect(() => {
    const handler = () => {
      const hash = decodeURIComponent(window.location.hash || '');
      if (hash.startsWith('#open-document:')) {
        const parts = hash.replace('#open-document:', '').split(':');
        const [documentId, chunkId] = parts;
        window.dispatchEvent(new CustomEvent('open-document-chunk', { detail: { documentId, chunkId } }));
      }
    };
    handler();
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return null;
};

export default HashListener;


