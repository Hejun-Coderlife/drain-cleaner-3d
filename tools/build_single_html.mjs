/* 打包成单个 HTML（app.js 内联、can.png 转 base64），双击就能打开；three.js 仍从 unpkg 加载，需要联网
   用法：node tools/build_single_html.mjs [输出.html]                                              */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'hyper-clean-3d.html');
const png = 'data:image/png;base64,' + readFileSync(join(ROOT, 'can.png')).toString('base64');
const app = readFileSync(join(ROOT, 'app.js'), 'utf8').replace(/'can\.png(\?v=\w+)?'/, `'${png}'`);
if (app.includes('</script')) throw new Error('app.js 里有 </script，不能直接内联');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace(/import '\.\/app\.js(\?v=\w+)?';/, () => app);
if (html.includes("'./app.js")) throw new Error('没找到 app.js 的 import');
writeFileSync(OUT, html);
console.log('完成：', OUT, (html.length / 1048576).toFixed(1) + ' MB');
