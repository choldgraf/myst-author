// CSS imports: Vite loads them as styles, and the JupyterLab build as text (see packages/jupyterlab/build.mjs).
declare module '*.css' {
  const css: string;
  export default css;
}
