import Anser from 'anser';
import { escapeCarriageReturn } from 'escape-carriage';
import type { GenericNode } from 'myst-common';
import { Details, MyST } from 'myst-to-react';

// Code cell outputs, drawn like @myst-theme/jupyter's `Outputs` and `SafeOutput` on a mystmd site, with the same classes.
// That package also brings thebe and JupyterLab, so these copy its plain-HTML path.
// HTML output shows in a sandbox that doesn't run its scripts, which would run with the editor's access to your files.
// So outputs that need scripts, such as plotly, show their plain text.
export function Outputs({ node }: { node: GenericNode }) {
  const align = node.align === 'center' ? 'text-center' : node.align === 'right' ? 'text-right' : 'text-left';
  const spacing = node.children?.some((c: GenericNode) => c.jupyter_data) ? 'mb-5' : '';
  const outputs = (
    <div id={node.identifier || undefined} className={`max-w-full overflow-y-visible m-0 not-prose relative ${align} ${spacing} ${node.visibility === 'remove' ? 'hidden' : ''}`}>
      <MyST ast={node.children} />
    </div>
  );
  return node.visibility === 'hide' ? <Details title="Output">{outputs}</Details> : outputs;
}

export function Output({ node }: { node: GenericNode }) {
  const out = node.jupyter_data;
  const pre = (className: string, text: string) => <pre className={`text-sm font-thin font-system overflow-auto ${className}`}><Ansi text={text} /></pre>;
  if (out.output_type === 'stream') return pre(`myst-jp-stream-output ${out.name === 'stderr' ? 'jupyter-error' : 'jupyter-output'}`, [out.text].flat().join(''));
  if (out.output_type === 'error') return pre('myst-jp-error-output jupyter-error', [out.traceback ?? `${out.ename}: ${out.evalue}`].flat().join('\n'));
  const data = out.data ?? {};
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp'].map((type) => data[type]).find(Boolean);
  const text = data['text/plain']?.content;
  const html: string | undefined = data['text/html']?.content;
  if (html && !/<script/i.test(html)) return <HtmlOutput html={html} />; // HTML that needs its scripts shows its plain text instead
  if (image) return <img src={image.path} alt={text ?? 'Image produced in Jupyter'} />;
  return (
    <div className="font-mono text-sm whitespace-pre-wrap myst-jp-safe-output-text">
      <Ansi text={text ?? `This output (${Object.keys(data).join(', ')}) shows on the built site, but not in the editor.`} />
    </div>
  );
}

/** HTML output, such as a pandas table, in an iframe that can't run scripts, sized to fit. */
function HtmlOutput({ html }: { html: string }) {
  const fit = (frame: HTMLIFrameElement) => frame.contentDocument && (frame.style.height = `${frame.contentDocument.body.scrollHeight}px`);
  const page = `<style>body { margin: 0; font: 14px system-ui, sans-serif; }</style>${html}`;
  return <iframe sandbox="allow-same-origin" srcDoc={page} onLoad={(e) => fit(e.currentTarget)} className="w-full border-0" />;
}

/**
 * ANSI-coloured text, with myst-theme's `ansi-*` classes, like the ANSI renderer that mystmd sites use.
 * That's a wrapper for anser and escape-carriage, which only supports React 18, so this does the same with them.
 */
function Ansi({ text }: { text: string }) {
  return Anser.ansiToJson(escapeCarriageReturn(text), { use_classes: true, remove_empty: true }).map((part, i) => (
    <span key={i} className={[part.fg && `${part.fg}-fg`, part.bg && `${part.bg}-bg`, part.decoration && `ansi-${part.decoration}`].filter(Boolean).join(' ') || undefined}>{part.content}</span>
  ));
}
