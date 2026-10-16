import './style.css';
import { t } from './i18n';
import { mount, showBanner } from './ui/app';
import { loadSettings } from './ui/settings';

const root = document.getElementById('app');
if (root) mount(root, { settings: loadSettings(), raw: {} });

// WEB-017: offline after the first visit; a new deployment shows a reload notice.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && hadController) {
            showBanner(t('web.update'), t('web.update.reload'), () => {
              navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
              worker.postMessage('skipWaiting');
            });
          }
        });
      });
    })
    .catch(() => {
      /* service worker unavailable: the site still works online */
    });
}
