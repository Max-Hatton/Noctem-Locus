# Third-party astronomical data

Noctem Locus application code and bundled astronomical data are licensed separately.

## HYG stellar data

The v0.11 offline star layer is derived from **HYG Database 4.1** maintained by Astronexus. Noctem Locus keeps stars through visual magnitude 7.0 and stores only the fields needed for offline charting/search.

Source: `astronexus/HYG-Database` (`hyg/CURRENT/hygdata_v41.csv`)

License: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.

## OpenNGC deep-sky data

The v0.11 NGC/IC layer is derived from **OpenNGC**, created and maintained by Mattia Verga and contributors. Noctem Locus excludes entries marked nonexistent/duplicate and keeps the fields needed for offline charting, search, size, magnitude, and object-type display.

Source: `mattiaverga/OpenNGC` (`database_files/NGC.csv`)

License: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**.

## Caldwell coverage

Most Caldwell designations are resolved through OpenNGC cross-references. Four catalog targets that are not represented cleanly by one NGC/IC row are supplied as small application-maintained records so Finder can cover C1 through C109:

- C9 — Cave Nebula / Sh2-155
- C14 — Double Cluster / NGC 869 + NGC 884
- C41 — Hyades
- C99 — Coalsack Nebula

These supplemental records contain only catalog identity, basic object classification, aliases, and J2000 pointing coordinates needed by Noctem Locus.

## Generated catalog artifact

`frontend/catalog-v011.js` is a transformed/compact data artifact derived from HYG and OpenNGC. That generated catalog data is distributed under **CC BY-SA 4.0**. This data license does not change the separate licensing status of the Noctem Locus application source code.
