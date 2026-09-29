import { mountPreviewPage } from '@myst-author/preview/page';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
// VS Code adds theme-colored defaults for code, kbd, and blockquote; the preview uses only myst-theme's styles.
document.getElementById('_defaultStyles')?.remove();
mountPreviewPage(acquireVsCodeApi());
