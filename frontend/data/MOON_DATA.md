# Offline lunar map data

Source snapshot downloaded 2026-09-04. These assets load locally; Moon Map does not
contact the data providers at runtime. All map terrain and feature positions come
from the sources below. No generated terrain or invented feature measurements are
included.

## Surface raster

`moon-surface.jpg` is the **LRO LROC WAC Global Morphology Mosaic**, created by the
LROC team at Arizona State University from NASA Lunar Reconnaissance Orbiter Wide
Angle Camera observations and served by the USGS Astrogeology Science Center.

- [Product metadata and scientific references](https://astrogeology.usgs.gov/search/map/moon_lro_lroc_wac_global_morphology_mosaic_100m)
- [USGS documentation for the Moon WMS service](https://stac.astrogeology.usgs.gov/docs/examples/to_qgis/)
- [WMS layer capabilities](https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities)
- [Exact 4096 × 2048 JPEG export](https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=LROC_WAC&STYLES=&SRS=EPSG:4326&BBOX=-180,-90,180,90&WIDTH=4096&HEIGHT=2048&FORMAT=image/jpeg)

Credit: **NASA / LROC / Arizona State University / USGS**. The USGS product metadata
identifies the data as public domain and requests author attribution. The WMS
`LROC_WAC` layer describes the June 2013 mosaic with an edge correction made in
February 2016. No local stretching, flipping, resampling, or image editing was
applied to the downloaded export. The JPEG contains grayscale imagery in RGB
channels and is 2,095,605 bytes.

### Coordinate contract

The export is a simple cylindrical / equirectangular full-globe raster. USGS WMS
uses `SRS=EPSG:4326` for its longitude/latitude export interface; the body being
mapped is the Moon, with the underlying lunar sphere radius 1,737.4 km.

- Left edge: **180° west** (`longitude = -180`).
- Center: **0° longitude**, the approximate center of the near side.
- Right edge: **180° east** (`longitude = +180`), meeting the left edge.
- Longitude increases eastward from left to right.
- Top edge: north pole, **+90° latitude**.
- Horizontal center line: equator, **0° latitude**.
- Bottom edge: south pole, **−90° latitude**.
- Latitude is planetocentric and north-positive.

Normalized texture coordinates, measured from the image's top-left corner:

```js
u = (longitudeEastDegrees + 180) / 360;
v = (90 - latitudeNorthDegrees) / 180;
```

Use horizontal wrap at the longitude seam and vertical clamp at the poles. Pixel
centers are `longitude = -180 + (x + 0.5) * 360 / 4096` and
`latitude = 90 - (y + 0.5) * 180 / 2048`. A graphics API that measures texture `v`
from the bottom needs the corresponding vertical upload/sampling adjustment.

### Observing limitations

This is a morphology mosaic: small-scale shadows and brightness reflect the
original observations, assembled across multiple dates, rather than the selected
observing time. The app's phase overlay indicates illumination on a spherical
Moon; it does **not** simulate time-specific shadows cast by individual craters or
mountains. The source also documents brightness differences at polar mosaic joins.
The bundled export resolves about 2.67 km per pixel at the lunar equator and
cannot resolve every small catalog feature, even when zoomed in.

## Named feature catalog

`../moon-features.js` contains **9,086 IAU-adopted features** covering the entire
Moon, including 1,615 primary craters and 7,063 satellite features. Entries are
derived from the IAU/USGS **Gazetteer of Planetary Nomenclature** official Moon KML
export, linked by the USGS GIS download page.

- [Gazetteer GIS downloads and coordinate conventions](https://planetarynames.wr.usgs.gov/GIS_Downloads)
- [Official Moon KMZ snapshot download](https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz)
- [Gazetteer home](https://planetarynames.wr.usgs.gov/)

Credit: **International Astronomical Union (IAU) / USGS**. The accompanying KMZ
metadata declares the data public domain. The USGS download page identifies lunar
coordinates with the LOLA 2011 control network. Official downloads change over
time; this bundle is a dated snapshot, with source hashes recorded in
`moon-source-manifest.json`.

The script exposes `window.noctemMoonFeatures`, an array of records:

| Property | Source and meaning |
| --- | --- |
| `id` | USGS feature ID, as a string, extracted from the official `link` field. The corresponding record is `https://planetarynames.wr.usgs.gov/Feature/{id}`. |
| `name` | Official KML placemark name, retaining punctuation and Unicode spelling. |
| `type` | Original Gazetteer descriptor term, such as `Crater, craters`, `Mare, maria`, or `Satellite Feature`. |
| `latitude` | Source `center_lat`, north-positive planetocentric degrees. |
| `longitude` | Source `center_lon`, normalized from east-positive 0–360° to east-positive −180–180°. |
| `diameterKm` | Source `diameter` in kilometers. Four source values are zero (unknown), represented as `null`; no sizes are fabricated. |

The Gazetteer's diameter field is a nominal feature size; for a linear or
irregular feature it is not a literal circular outline. Catalog coordinates are
feature centers. Their numerical precision does not imply that every feature is
resolved by the bundled surface raster. The renderer must determine which
features face the observer rather than treating the full-globe list as visible.

`window.noctemMoonData` contains snapshot and image-coordinate metadata. The same
metadata is available as `moon-source-manifest.json` for audits without executing
JavaScript.

## Rebuilding

From the repository root, with Python 3:

```text
python scripts/build_moon_assets.py --source-dir work/moon-source --refresh
```

This downloads official source files into a local scratch/cache directory and
rebuilds the compact JavaScript and surface asset. Without `--refresh` the script
requires that cache and performs no network access. `--snapshot-date YYYY-MM-DD`
sets the documented source retrieval date when rebuilding a saved snapshot.
Pillow, when installed, is used only to verify image dimensions; the downloaded
JPEG is copied byte-for-byte. Update the counts and snapshot date in this document
when refreshing the source data.
