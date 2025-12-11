import React, { useEffect } from 'react';
import { Chat } from './Chat';
import './App.css';
import { branding } from './branding.config';
import { resolveBrandAsset } from './brandingAssets';

function App() {
  useEffect(() => {
    document.title = branding.appShortName;
    if (branding.appfaviconDescription) {
      let meta = document.querySelector("meta[name='description']");
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', branding.appfaviconDescription);
    }

    const faviconHref = resolveBrandAsset(branding.logoFavicon);
    if (faviconHref) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconHref;
    }
  }, []);

  return (
    <div className="brand-shell min-h-screen">
      <Chat />
    </div>
  );
}

export default App;
