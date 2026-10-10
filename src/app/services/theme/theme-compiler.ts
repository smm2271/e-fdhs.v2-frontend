import * as tree from 'css-tree';
import { MAX_THEME_BYTES } from './theme.types';

const SCOPE = '#campus-theme-root';
const decode = (value: string) => tree.ident.decode(value).toLowerCase();
const forbiddenFunctions = new Set(['url', 'src', 'image', 'image-set', '-webkit-image-set', 'paint', 'expression', 'element', '-moz-element', 'attr']);

export function compileThemeCss(css: string, namespace: string): string {
    if (new TextEncoder().encode(css).length > MAX_THEME_BYTES) throw new Error('主題檔案上限為 128 KiB。');
    const ast = tree.parse(css.replace(/^\uFEFF/, ''), { parseCustomProperty: true, onParseError: error => { throw error; } });
    const keyframes = new Map<string, string>();
    let nodes = 0;
    tree.walk(ast, node => {
      if (++nodes > 20000) throw new Error('主題過於複雜。');
      if (node.type === 'Raw') throw new Error('不支援或無法解析的 CSS。');
      if (node.type === 'Url') throw new Error('主題禁止 URL 資源（含遠端、本機與 data URL）。');
      if (node.type === 'Function' && forbiddenFunctions.has(decode(node.name))) throw new Error('主題包含不允許的 CSS 函式。');
      if (node.type === 'Atrule') {
        const name = decode(node.name);
        if (!['media', 'supports', 'keyframes'].includes(name) || !node.block || !node.prelude || node.prelude.type !== 'AtrulePrelude')
          throw new Error('只允許 @media、@supports、@keyframes；禁止 @import 與其他 at-rule。');
        node.name = name;
        if (name === 'keyframes') {
          const first = node.prelude.children.first;
          if (first?.type !== 'Identifier' || node.prelude.children.size !== 1) throw new Error('Keyframe 名稱必須為 identifier。');
          const original = tree.ident.decode(first.name);
          keyframes.set(original, tree.ident.encode('campus-' + namespace + '-' + original));
        }
      }
      if (node.type === 'Declaration') {
        const property = decode(node.property);
        if (node.important && (property.startsWith('animation') || property.startsWith('transition') || property === 'scroll-behavior'))
          throw new Error('動畫與 transition 不可使用 !important，以保留 reduced-motion 保護。');
        if (property === 'behavior' || property === '-moz-binding' || property.startsWith('-ms-')) throw new Error('不允許舊式程式碼執行屬性。');
        // Raw custom-property token strings can later be interpreted as URLs by
        // consuming properties. A positive function allowlist closes that path.
        tree.walk(node.value, child => {
          if (child.type === 'Function' && ![
            'var', 'env', 'calc', 'min', 'max', 'clamp', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb',
            'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark',
            'linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient',
            'repeating-radial-gradient', 'repeating-conic-gradient', 'translate', 'translatex', 'translatey',
            'translatez', 'translate3d', 'scale', 'scalex', 'scaley', 'scalez', 'scale3d',
            'rotate', 'rotatex', 'rotatey', 'rotatez', 'rotate3d', 'skew', 'skewx', 'skewy',
            'matrix', 'matrix3d', 'perspective', 'cubic-bezier', 'steps', 'blur', 'brightness',
            'contrast', 'drop-shadow', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate',
            'sepia', 'repeat', 'minmax', 'fit-content', 'counter', 'counters',
          ].includes(decode(child.name))) throw new Error('不支援的 CSS value 函式。');
        });
      }
    });
    const process = (block: tree.StyleSheet | tree.Block, frames = false): void => {
      block.children.forEach(node => {
        if (node.type === 'Atrule') {
          if (frames) throw new Error('Keyframes 內不可有 at-rule。');
          if (node.name === 'keyframes') {
            const first = (node.prelude as tree.AtrulePrelude).children.first as tree.Identifier;
            first.name = keyframes.get(tree.ident.decode(first.name))!;
            process(node.block!, true);
          } else process(node.block!);
        } else if (node.type === 'Rule') {
          if (node.prelude.type !== 'SelectorList') throw new Error('無效的 selector。');
          if (!frames) {
            const selectors: string[] = [];
            node.prelude.children.forEach(selector => {
              const original = tree.generate(selector);
              if (original === ':root') { selectors.push(SCOPE); return; }
              tree.walk(selector, part => {
                if (part.type === 'PseudoClassSelector' && ['root', 'host', 'host-context', 'scope'].includes(decode(part.name)))
                  throw new Error('只支援獨立的 :root；其他 selector 請使用公開 CSS Hooks。');
                if (part.type === 'PseudoElementSelector' && ['backdrop', 'view-transition', 'view-transition-group', 'view-transition-image-pair', 'view-transition-old', 'view-transition-new'].includes(decode(part.name)))
                  throw new Error('不可修改應用外部的 top-layer / view-transition 樣式。');
                if (part.type === 'TypeSelector' && ['html', 'body', 'app-root'].includes(decode(part.name)))
                  throw new Error('請用獨立 :root 設定 tokens，或使用公開 CSS Hooks。');
              });
              selectors.push(SCOPE + ' ' + original);
            });
            node.prelude = tree.parse(selectors.join(','), { context: 'selectorList' }) as tree.SelectorList;
          } else {
            node.prelude.children.forEach(selector => {
              const value = tree.generate(selector);
              if (!/^(from|to|(?:\d+(?:\.\d+)?|\.\d+)%)$/.test(value)) throw new Error('無效的 keyframe selector。');
            });
          }
          node.block.children.forEach(declaration => {
            if (declaration.type !== 'Declaration') throw new Error('不支援 CSS nesting。');
            const property = decode(declaration.property);
            if (property === 'animation' || property === 'animation-name') {
              tree.walk(declaration.value, value => {
                if (value.type === 'Function' && decode(value.name) === 'var') throw new Error('動畫名稱不可使用 var()，請直接引用 keyframe 名稱。');
                if (value.type === 'Identifier' && keyframes.has(tree.ident.decode(value.name)))
                  value.name = keyframes.get(tree.ident.decode(value.name))!;
              });
            }
          });
        } else throw new Error('無效的 stylesheet 結構。');
      });
    };
    if (ast.type !== 'StyleSheet' || ast.children.isEmpty) throw new Error('主題沒有 CSS 規則。');
    process(ast);
    return tree.generate(ast);
  }
