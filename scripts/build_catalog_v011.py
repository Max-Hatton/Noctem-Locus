#!/usr/bin/env python3
import csv,json,math,pathlib,re,urllib.request
R=pathlib.Path(__file__).resolve().parents[1]; T=R/'.catalog-build'; T.mkdir(exist_ok=True)
OUT=R/'frontend/catalog-v011.js'; LIM=7.0
H='https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
O='https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv'
def dl(u,p):
 if not p.exists(): urllib.request.urlretrieve(u,p)
def num(v):
 try:return float(v) if str(v).strip() else None
 except:return None
def n(v,d=4): return None if v is None else round(v,d)
def hms(v):
 try:
  a,b,c=map(float,v.split(':')); return a+b/60+c/3600
 except:return None
def dms(v):
 try:
  s=-1 if v.startswith('-') else 1;a,b,c=map(float,v.lstrip('+-').split(':'));return s*(a+b/60+c/3600)
 except:return None
def stars(p):
 out=[]; cv={}
 with p.open(encoding='utf-8-sig',newline='') as f:
  for r in csv.DictReader(f):
   m,ra,de=num(r.get('mag')),num(r.get('ra')),num(r.get('dec'))
   if m is None or ra is None or de is None or m>LIM: continue
   sid=(r.get('id') or '').strip(); hip=(r.get('hip') or '').strip(); proper=(r.get('proper') or '').strip(); bf=(r.get('bf') or '').strip(); con=(r.get('con') or '').strip()
   name=proper or bf or (f'HIP {hip}' if hip else f'HYG {sid}')
   out.append([sid,name,proper,bf,hip,n(ra,6),n(de,5),n(m,2),con,(r.get('spect') or '').strip(),n(num(r.get('ci')),3)])
   if con and m<=5.5:
    q=cv.setdefault(con,[0.,0.,0.,0]); rr=math.radians(ra*15); dd=math.radians(de); q[0]+=math.cos(dd)*math.cos(rr);q[1]+=math.cos(dd)*math.sin(rr);q[2]+=math.sin(dd);q[3]+=1
 out.sort(key=lambda x:(x[7],x[1])); labs=[]
 for con,(x,y,z,c) in sorted(cv.items()):
  q=math.sqrt(x*x+y*y+z*z)
  if q: labs.append([con,n((math.degrees(math.atan2(y,x))%360)/15,5),n(math.degrees(math.asin(z/q)),4),int(c)])
 return out,labs
def dsos(p):
 out=[]; cc=0
 with p.open(encoding='utf-8-sig',newline='') as f:
  for r in csv.DictReader(f,delimiter=';'):
   typ=(r.get('Type') or '').strip(); ident=(r.get('Name') or '').strip()
   if typ in ('NonEx','Dup') or not ident.startswith(('NGC','IC')) or (r.get('M') or '').strip(): continue
   ra,de=hms(r.get('RA') or ''),dms(r.get('Dec') or '')
   if ra is None or de is None: continue
   aliases=[ident]; aliases += [x.strip() for x in (r.get('Common names') or '').split(',') if x.strip()]
   ids=r.get('Identifiers') or ''
   for m in re.finditer(r'(?:Caldwell\s*|C\s*)(\d{1,3})(?=\D|$)',ids,re.I): aliases.append('C'+str(int(m.group(1))))
   seen=set(); aliases=[a for a in aliases if not (a.casefold() in seen or seen.add(a.casefold()))]
   if any(re.fullmatch(r'C\d{1,3}',a,re.I) for a in aliases): cc+=1
   mag=num(r.get('V-Mag')); mag=mag if mag is not None else num(r.get('B-Mag'))
   common=((r.get('Common names') or '').split(',')[0]).strip()
   out.append([ident,common,n(ra,6),n(de,5),n(mag,2),typ,(r.get('Const') or '').strip(),n(num(r.get('MajAx')),2),n(num(r.get('MinAx')),2),n(num(r.get('PosAng')),1),aliases])
 out.sort(key=lambda x:(0 if x[0].startswith('NGC') else 1,int(re.sub(r'\D','',x[0]) or 999999))); return out,cc
def main():
 hp=T/'hyg.csv';op=T/'openngc.csv';dl(H,hp);dl(O,op);s,c=stars(hp);d,cc=dsos(op)
 p={'version':'0.11.0','license':'CC BY-SA 4.0','starMagnitudeLimit':LIM,'stars':s,'dsos':d,'constellations':c,'meta':{'starCount':len(s),'dsoCount':len(d),'caldwellAliasCount':cc,'hygSource':'HYG 4.1','dsoSource':'OpenNGC'}}
 head='/* Noctem Locus v0.11 data: HYG 4.1 + OpenNGC, CC BY-SA 4.0. See THIRD_PARTY_DATA.md. */\n'
 OUT.write_text(head+'window.NOCTEM_CATALOG_V011='+json.dumps(p,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
 print(f'stars={len(s)} dsos={len(d)} caldwell={cc} size={OUT.stat().st_size}')
if __name__=='__main__': main()
