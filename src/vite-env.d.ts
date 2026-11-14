/// <reference types="vite/client" />

declare module 'virtual:project-source-archive' {
  export interface ArchivedProjectFile {
    path: string;
    content: string;
    encoding: 'utf8' | 'base64';
  }
  const files: ArchivedProjectFile[];
  export default files;
}
