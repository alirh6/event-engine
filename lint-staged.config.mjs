// Root ESLint does not process the separate dashboard project.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const lintRootFiles = (files) => {
  const rootFiles = files.filter((file) => !file.replace(/\\/g, '/').includes('/client/'));

  const quotedFiles = rootFiles.map((file) => JSON.stringify(file)).join(' ');

  return rootFiles.length ? [`eslint --fix ${quotedFiles}`, `prettier --write ${quotedFiles}`] : [];
};

export default {
  '*.{js,mjs,cjs,ts,tsx}': lintRootFiles,
  'client/**/*.{js,mjs,cjs,ts,tsx}': ['prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  'prisma/**/*.prisma': ['prisma format --schema'],
};
