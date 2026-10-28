declare module '*.txt' {
  const text: string;
  export default text;
}

declare module '*.html' {
  const text: string;
  export default text;
}

declare module '*.bin' {
  const bytes: ArrayBuffer;
  export default bytes;
}

declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
