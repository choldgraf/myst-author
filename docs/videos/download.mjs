// `npm run docs:videos`: download the demo videos into docs/videos/, skipping any that are already there.
// They're attachments on https://github.com/choldgraf/myst-author/issues/7, so they stay out of git.
// mystmd can't show a remote video in a figure yet: https://github.com/jupyter-book/mystmd/issues/3100
// Delete a video to download it again.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const videos = {
  'web-editor.mp4': 'https://github.com/user-attachments/assets/3154528c-bd78-4687-9e75-0d7e3066c060',
  'jupyterlab.mp4': 'https://github.com/user-attachments/assets/4c51f822-06a0-4330-b7f6-1a48efe1a8bd',
  'vscode.mp4': 'https://github.com/user-attachments/assets/845c3d82-7ed7-4bc2-806e-4aed6bdc38bd',
};

for (const [name, url] of Object.entries(videos)) {
  const file = join(import.meta.dirname, name);
  if (existsSync(file)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${name}: ${res.status} from ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
