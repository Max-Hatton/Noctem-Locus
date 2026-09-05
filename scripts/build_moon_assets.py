"""Build the offline lunar atlas from official USGS downloads (Python 3 stdlib only).

Run from the repository root:
    python scripts/build_moon_assets.py --source-dir work/moon-source --refresh

The source directory caches unmodified remote files. Omitting --refresh rebuilds
from that cache without network access. Pillow is optional and used only to verify
the JPEG dimensions, never to transform the scientific image.
"""

import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import shutil
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


CATALOG_URL = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz"
IMAGE_URL = (
    "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map"
    "&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=LROC_WAC&STYLES="
    "&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=4096&HEIGHT=2048&FORMAT=image/jpeg"
)
CAPABILITIES_URL = (
    "https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map"
    "&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities"
)
NS = {"k": "http://www.opengis.net/kml/2.2"}


def fetch(url, path):
    request = urllib.request.Request(url, headers={"User-Agent": "Noctem-Locus lunar data builder"})
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = response.read()
    path.write_bytes(payload)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_features(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("MOON_nomenclature_center_pts.kml"))
    features = []
    for placemark in root.findall(".//k:Placemark", NS):
        source = {item.attrib["name"]: item.text for item in placemark.findall(".//k:SimpleData", NS)}
        if source["approval"] != "Adopted by IAU":
            continue
        latitude = float(source["center_lat"])
        # Normalize east-positive 0..360 into -180..180 without losing source precision.
        longitude = round((float(source["center_lon"]) + 180) % 360 - 180, 8)
        diameter = float(source["diameter"])
        feature_id = source["link"].rstrip("/").rsplit("/", 1)[-1]
        if not feature_id.isdigit():
            raise ValueError(f"Unexpected USGS feature link: {source['link']}")
        if not (math.isfinite(latitude) and -90 <= latitude <= 90 and math.isfinite(longitude)):
            raise ValueError(f"Invalid coordinates: {feature_id}")
        if not math.isfinite(diameter) or diameter < 0:
            raise ValueError(f"Invalid feature size: {feature_id}")
        features.append({
            "id": feature_id,
            "name": placemark.findtext("k:name", namespaces=NS),
            "type": source["type"],
            "latitude": latitude,
            "longitude": longitude,
            # Gazetteer uses zero for unknown sizes; do not imply a zero-size feature.
            "diameterKm": diameter if diameter > 0 else None,
        })
    if len({feature["id"] for feature in features}) != len(features):
        raise ValueError("Duplicate USGS feature IDs")
    features.sort(key=lambda feature: (feature["name"].casefold(), feature["id"]))
    return features


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("work/moon-source"))
    parser.add_argument("--refresh", action="store_true", help="Download a new official-source snapshot")
    parser.add_argument("--snapshot-date", default=datetime.date.today().isoformat())
    args = parser.parse_args()
    datetime.date.fromisoformat(args.snapshot_date)
    args.source_dir.mkdir(parents=True, exist_ok=True)
    sources = {"moon.kmz": CATALOG_URL, "moon-surface.jpg": IMAGE_URL, "wms.xml": CAPABILITIES_URL}
    for name, url in sources.items():
        path = args.source_dir / name
        if args.refresh:
            fetch(url, path)
        elif not path.exists():
            parser.error(f"Missing cached source {path}; use --refresh to download")

    image_source = args.source_dir / "moon-surface.jpg"
    if image_source.read_bytes()[:2] != b"\xff\xd8":
        raise ValueError("USGS image download is not a JPEG (possibly a WMS error)")
    try:
        from PIL import Image
    except ImportError:
        Image = None
    if Image:
        with Image.open(image_source) as surface:
            if surface.size != (4096, 2048):
                raise ValueError(f"Unexpected surface image size: {surface.size}")

    features = read_features(args.source_dir / "moon.kmz")
    frontend = Path(__file__).resolve().parents[1] / "frontend"
    data_dir = frontend / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(image_source, data_dir / "moon-surface.jpg")
    metadata = {
        "snapshotDate": args.snapshot_date,
        "count": len(features),
        "source": "IAU/USGS Gazetteer of Planetary Nomenclature",
        "catalogUrl": CATALOG_URL,
        "catalogSha256": sha256(args.source_dir / "moon.kmz"),
        "imageUrl": IMAGE_URL,
        "imageSha256": sha256(image_source),
        "projection": "equirectangular",
        "longitudeWest": -180,
        "longitudeEast": 180,
        "latitudeTop": 90,
        "latitudeBottom": -90,
        "width": 4096,
        "height": 2048,
    }
    catalog = (
        "// Generated by scripts/build_moon_assets.py from official IAU/USGS public-domain data.\n"
        "// See data/MOON_DATA.md. Longitudes are east-positive degrees in [-180, 180).\n"
        "window.noctemMoonData = " + json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "window.noctemMoonFeatures = [\n"
        + ",\n".join(json.dumps(feature, ensure_ascii=False, separators=(",", ":")) for feature in features)
        + "\n];\n"
    )
    (frontend / "moon-features.js").write_text(catalog, encoding="utf-8", newline="\n")
    (data_dir / "moon-source-manifest.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"Wrote {len(features):,} features and {image_source.stat().st_size:,}-byte surface JPEG")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
