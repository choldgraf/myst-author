import { mountPreviewPage } from '@myst-author/preview/page';
import '@myst-author/preview/page.css';

// The preview on its own, for a host editor that embeds it in an iframe (the JupyterLab extension).
mountPreviewPage({ postMessage: (m) => parent.postMessage(m, '*') });
