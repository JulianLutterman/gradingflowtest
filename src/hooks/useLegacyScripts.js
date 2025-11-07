import { useEffect, useState } from 'react';

const loadedScripts = new Map();

function loadScript(url) {
  if (loadedScripts.has(url)) {
    return loadedScripts.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = (error) => {
      reject(error);
    };
    document.body.appendChild(script);
  });

  loadedScripts.set(url, promise);
  return promise;
}

export function useLegacyScripts(urls = [], options = {}) {
  const { active = true, onLoaded } = options;
  const [state, setState] = useState({ status: 'idle', error: null });

  useEffect(() => {
    if (!active) return () => {};
    let isCancelled = false;

    (async () => {
      try {
        setState({ status: 'loading', error: null });
        for (const url of urls) {
          await loadScript(url);
        }
        if (!isCancelled) {
          setState({ status: 'ready', error: null });
          onLoaded?.();
        }
      } catch (error) {
        console.error('Failed to load legacy scripts', error);
        if (!isCancelled) {
          setState({ status: 'error', error });
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [active, urls, onLoaded]);

  return state;
}
