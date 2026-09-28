import { mountPreviewPage } from '@myst-author/preview/page';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
mountPreviewPage(acquireVsCodeApi());
