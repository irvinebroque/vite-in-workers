export const assetProject = {
  entry: 'index.html',
  files: {
    'index.html': '<div id="root"></div><script type="module" src="/main.js"></script>',
    'main.js': 'import data from "./data.json"; import icon from "./icon.svg"; import "./style.css"; document.querySelector("#root").textContent=data.label; document.body.dataset.icon=icon; import("./lazy.js").then(m=>m.run());',
    'lazy.js': 'import "./lazy.css"; export function run() { document.body.dataset.loaded = "yes"; }',
    'lazy.css': 'body { background: rgb(240, 245, 250); }',
    'data.json': '{"label":"JSON import works"}',
    'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    'style.css': '@import "./color.css"; body { margin: 0; }',
    'color.css': 'body { color: green; }'
  }
};
