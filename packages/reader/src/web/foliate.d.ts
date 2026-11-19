// foliate-js ships plain ES modules without types; the bridge types what it uses itself.
declare module 'foliate-js/epub.js' {
  export class EPUB {
    constructor(loader: {
      loadText(path: string): Promise<string | null>;
      loadBlob(path: string): Promise<Blob>;
      getSize(path: string): number;
    });
    init(): Promise<unknown>;
  }
}
declare module 'foliate-js/view.js';
declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    add(
      key: string,
      range: Range,
      draw: (rects: DOMRect[], options?: unknown) => Element,
      options?: unknown,
    ): void;
    remove(key: string): void;
    static highlight: (rects: DOMRect[], options?: unknown) => Element;
    static underline: (rects: DOMRect[], options?: unknown) => Element;
  }
}
