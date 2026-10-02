/** Language server arguments for a content server and, optionally, a project folder that overrides the client's; hosts pass them when they start the server. */
export const lspArgs = (contentServer: string | undefined, root?: string) => [
  ...(contentServer ? [`--content-server=${contentServer}`] : []),
  ...(root ? [`--root=${root}`] : []),
];
