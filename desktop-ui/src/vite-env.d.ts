/// <reference types="vite/client" />

declare module "*.ttf?inline" {
  const dataUrl: string;
  export default dataUrl;
}

declare module "*.ttf?url" {
  const url: string;
  export default url;
}
