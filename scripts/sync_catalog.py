#!/usr/bin/env python3
"""Build ValoStore's cached catalogue from upstream metadata."""
from __future__ import annotations
import argparse,gzip,html,json,re,sys,time,urllib.request,xml.etree.ElementTree as ET
from datetime import datetime,timezone
from pathlib import Path

FDROID="https://f-droid.org/repo/index-v2.json"
FDROID_REPO="https://f-droid.org/repo/"
FLATHUB="https://dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz"
UA="ValoStoreCatalogSync/1.0"

def fetch(url,timeout=90):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept-Encoding":"gzip"})
    last=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req,timeout=timeout) as r:
                data=r.read()
                return gzip.decompress(data) if r.headers.get("Content-Encoding")=="gzip" else data
        except Exception as e:
            last=e
            if attempt<2: time.sleep(2**attempt)
    raise RuntimeError(f"failed to fetch {url}: {last}")

def text(v):
    if not v:return ""
    v=html.unescape(str(v))
    return re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",v)).strip()

def safe_html(v):
    if not v:return ""
    v=re.sub(r"<(script|style|iframe|object|embed)[^>]*>.*?</\1>","",v,flags=re.I|re.S)
    v=re.sub(r"\s+(on[a-z]+|style)\s*=\s*([\"']).*?\2","",v,flags=re.I|re.S)
    v=re.sub(r"\s+(href|src)\s*=\s*([\"'])\s*javascript:[^\"']*\2","",v,flags=re.I)
    return v.strip()

def loc(d):
    if not isinstance(d,dict):return {}
    for k in ("en-US","en_US","en"):
        if k in d and isinstance(d[k],dict):return d[k]
    for k,v in d.items():
        if str(k).lower().startswith("en") and isinstance(v,dict):return v
    return next((v for v in d.values() if isinstance(v,dict)),{})

def fdroid_icon(v):
    if isinstance(v,dict):
        if "name" in v:return FDROID_REPO+str(v["name"]).lstrip("/")
        v=loc(v)
    if isinstance(v,dict):v=v.get("name") or v.get("path") or ""
    return FDROID_REPO+str(v).lstrip("/") if v else ""

def fdroid(data):
    out=[]
    for appid,raw in (data.get("packages") or {}).items():
        if not isinstance(raw,dict):continue
        meta=raw.get("metadata") if isinstance(raw.get("metadata"),dict) else raw
        localized=raw.get("localized") or meta.get("localized") or {}
        l=loc(localized)
        versions=raw.get("versions") or {}
        latest=max((v for v in versions.values() if isinstance(v,dict)),key=lambda v:int(v.get("versionCode",0) or 0),default={})
        cats=meta.get("categories") or raw.get("categories") or []
        if isinstance(cats,str):cats=[cats]
        screenshots=[]
        for k,v in l.items():
            if str(k).lower().endswith("screenshots") and isinstance(v,list):
                for item in v:
                    p=item.get("name") if isinstance(item,dict) else item
                    if p:screenshots.append(FDROID_REPO+str(p).lstrip("/"))
        out.append({
            "id":"fdroid:"+appid,"source":"F-Droid","platform":"android","appId":appid,
            "name":text(l.get("name") or meta.get("name") or appid),
            "summary":text(l.get("summary") or meta.get("summary")),
            "descriptionHtml":safe_html(l.get("description") or meta.get("description")),
            "description":text(l.get("description") or meta.get("description")),
            "categories":[text(x) for x in cats if x],"license":text(meta.get("license") or raw.get("license")),
            "developer":text(meta.get("authorName") or meta.get("author") or meta.get("developer")),
            "homepage":meta.get("webSite") or meta.get("website") or meta.get("homepage") or "",
            "sourceCode":meta.get("sourceCode") or meta.get("source_code") or "",
            "issueTracker":meta.get("issueTracker") or "",
            "icon":fdroid_icon(raw.get("iconv2") or raw.get("icon") or l.get("icon")),
            "screenshots":list(dict.fromkeys(screenshots))[:12],
            "version":str(latest.get("versionName") or ""),
            "versionCode":latest.get("versionCode"),
            "updatedAt":datetime.fromtimestamp(latest["added"]/1000,timezone.utc).isoformat() if isinstance(latest.get("added"),(int,float)) else None,
            "antiFeatures":sorted((raw.get("antiFeatures") or {}).keys()) if isinstance(raw.get("antiFeatures"),dict) else [],
            "install":{"type":"fdroid","appId":appid,"url":f"https://f-droid.org/packages/{appid}/"},
            "upstream":f"https://f-droid.org/packages/{appid}/"
        })
    return out

def nstag(t):return t.split("}")[-1]
def child(p,n):
    return next((x for x in p if nstag(x.tag)==n),None)
def children(p,n):return [x for x in p if nstag(x.tag)==n]
def ctext(p,n):
    x=child(p,n);return "".join(x.itertext()).strip() if x is not None else ""

def flathub(data):
    try:root=ET.fromstring(gzip.decompress(data))
    except OSError:root=ET.fromstring(data)
    out=[]
    for comp in root.iter():
        if nstag(comp.tag)!="component":continue
        idn=child(comp,"id")
        if idn is None or not (idn.text or "").strip():continue
        appid=idn.text.strip()
        if appid.startswith("org.freedesktop.") or ".Platform" in appid or ".Sdk" in appid:continue
        desc=child(comp,"description")
        desc_html=ET.tostring(desc,encoding="unicode") if desc is not None else ""
        if desc_html:desc_html=re.sub(r"^<[^>]+>|</[^>]+>$","",desc_html,count=1)
        dev=child(comp,"developer")
        developer=ctext(dev,"name") if dev is not None else ctext(comp,"developer-name")
        cats=[(x.text or "").strip() for block in children(comp,"categories") for x in children(block,"category") if x.text]
        keys=[(x.text or "").strip() for block in children(comp,"keywords") for x in children(block,"keyword") if x.text]
        lic=ctext(comp,"project_license") or ctext(comp,"project-license")
        urls={}
        for block in children(comp,"urls"):
            for x in block:
                if x.text:urls[nstag(x.tag)]=x.text.strip()
        icon=""
        for x in children(comp,"icon"):
            value=(x.text or "").strip()
            if value.startswith("http"):icon=value;break
            if value:icon=f"https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/{appid}.png";break
        icon=icon or f"https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/{appid}.png"
        shots=[]
        for block in children(comp,"screenshots"):
            for shot in children(block,"screenshot"):
                for image in children(shot,"image"):
                    if image.text and image.text.strip().startswith("http"):shots.append(image.text.strip())
        releases=[]
        for block in children(comp,"releases"):
            for rel in children(block,"release"):
                releases.append({"version":rel.attrib.get("version",""),"date":rel.attrib.get("date",""),"timestamp":rel.attrib.get("timestamp",""),"notes":text(ctext(rel,"description"))})
        releases.sort(key=lambda x:x.get("date",""),reverse=True)
        latest=releases[0] if releases else {}
        out.append({
            "id":"flathub:"+appid,"source":"Flathub","platform":"linux","appId":appid,
            "name":text(ctext(comp,"name") or appid),"summary":text(ctext(comp,"summary")),
            "descriptionHtml":safe_html(desc_html),"description":text(desc_html),
            "categories":[text(x) for x in cats],"keywords":[text(x) for x in keys],
            "license":text(lic),"metadataLicense":text(ctext(comp,"metadata_license") or ctext(comp,"metadata-license")),
            "developer":text(developer),"homepage":urls.get("homepage",""),
            "sourceCode":urls.get("vcs-browser") or urls.get("source",""),
            "icon":icon,"screenshots":list(dict.fromkeys(shots))[:12],
            "version":latest.get("version",""),"updatedAt":latest.get("date") or None,
            "releases":releases[:8],
            "install":{"type":"flatpak","remote":"flathub","appId":appid,"command":f"flatpak install flathub {appid}"},
            "upstream":f"https://flathub.org/apps/{appid}"
        })
    return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--output",default="data/catalog.json");a=ap.parse_args()
    f=fdroid(json.loads(fetch(FDROID).decode()))
    h=flathub(fetch(FLATHUB))
    apps=sorted(f+h,key=lambda x:(x["name"].casefold(),x["id"]))
    if len(f)<100 or len(h)<100:raise RuntimeError(f"unexpectedly small sync: F-Droid={len(f)}, Flathub={len(h)}")
    data={"schemaVersion":2,"generatedAt":datetime.now(timezone.utc).isoformat(),"sources":{"fdroid":{"name":"F-Droid","index":FDROID},"flathub":{"name":"Flathub","appstream":FLATHUB}},"counts":{"total":len(apps),"fdroid":len(f),"flathub":len(h)},"apps":apps}
    p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(".tmp");tmp.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":")),encoding="utf-8");tmp.replace(p)
    print(json.dumps(data["counts"]))
if __name__=="__main__":main()
