import json,sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
f=TTFont(sys.argv[1]); gs=f.getGlyphSet(); cmap=f.getBestCmap()
names={'gClef':0xE050,'hWhole':0xE0A2,'hHalf':0xE0A3,'hBlack':0xE0A4,'dot':0xE1E7,
'f8u':0xE240,'f8d':0xE241,'f16u':0xE242,'f16d':0xE243,
'flat':0xE260,'natural':0xE261,'sharp':0xE262,'dsharp':0xE263,'dflat':0xE264,
'rWhole':0xE4E3,'rHalf':0xE4E4,'rQuarter':0xE4E5,'r8':0xE4E6,'r16':0xE4E7}
for i in range(10): names['t%d'%i]=0xE080+i
out={}
for k,cp in names.items():
    g=cmap[cp]; pen=SVGPathPen(gs, lambda v: ('%.0f'%v))
    gs[g].draw(TransformPen(pen,(1,0,0,-1,0,0)))
    out[k]={'d':pen.getCommands(),'w':round(gs[g].width)}
print(json.dumps(out,separators=(',',':')))
