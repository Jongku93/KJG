"""src/app.html 의 __GLYPHS__ 자리에 tools/glyphs.json 을 넣어 index.html 을 만든다."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'src' / 'app.html').read_text(encoding='utf-8')
glyphs = (root / 'tools' / 'glyphs.json').read_text(encoding='utf-8').strip()
assert src.count('__GLYPHS__') == 1
(root / 'index.html').write_text(src.replace('__GLYPHS__', glyphs), encoding='utf-8')
print('index.html built')
