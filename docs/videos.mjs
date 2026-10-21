// `npm run docs:videos`: download the demo videos into docs/videos/, skipping any that are already there.
// They're attachments on https://github.com/choldgraf/myst-author/issues/7, so they stay out of git.
// Delete a video to download it again.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const videos = {
  'web-editor.mp4': 'https://github.com/user-attachments/assets/8d4ffe16-00a5-44d9-8914-c3bc4ebab7bc',
  'jupyterlab.mp4': 'https://github.com/user-attachments/assets/d3f229f0-66e0-4fad-9622-46063b70aaf9',
  'vscode.mp4': 'https://github.com/user-attachments/assets/a67030c8-8445-496b-8f6c-ff8cc808eed8',
};

const dir = join(import.meta.dirname, 'videos');
mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(videos)) {
  const file = join(dir, name);
  if (existsSync(file)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${name}: ${res.status} from ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
