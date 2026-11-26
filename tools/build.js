// Builds dist/standalone.html: one self-contained file (engine + example data + app + css inline) for offline use / e-mail.
const fs = require('fs'); const r = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
let html = r('index.html');
html = html.replace('<link rel="stylesheet" href="src/style.css">', '<style>\n' + r('src/style.css') + '\n</style>');
for (const f of ['src/engine.js', 'src/examples.js', 'src/app.js'])
  html = html.replace(new RegExp('<script src="' + f.replace('/', '\\/').replace('.', '\\.') + '"[^>]*></script>'), () => '<script>\n' + r(f) + '\n</script>');
fs.mkdirSync(__dirname + '/../dist', { recursive: true }); fs.writeFileSync(__dirname + '/../dist/standalone.html', html);
console.log('dist/standalone.html', (html.length / 1024).toFixed(0) + ' kB'); if (/<script src=/.test(html)) { console.error('external script left in!'); process.exit(1); }
