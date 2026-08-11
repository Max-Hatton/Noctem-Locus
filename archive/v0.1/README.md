# Astronomy Companion — Foundation v0.1

This is the starting codebase for an offline-first astronomy observing app.

## What exists now

- Desktop-friendly responsive UI
- Pages for Tonight, Find Object, Equipment, Observations, and Settings
- Red/black night-vision mode
- Software brightness control down to 5%
- One-click Deep Night mode
- Local settings persistence with `localStorage`
- Observing location fields ready for the astronomy engine
- No remote images, fonts, or APIs in the interface

## Why this base

The UI and astronomy logic will live in TypeScript so they can be shared. The intended desktop shell is Tauri 2, which can target Windows now and iOS later. Native integrations (hardware brightness, serial/Bluetooth telescope sensors, filesystem, etc.) can be added behind platform-specific adapters without rewriting the astronomy UI.

## Run during development

1. Install Node.js.
2. Run `npm install` in this folder.
3. Run `npm run dev`.

## Planned next layer

1. Create a proper `LocationProfile` model.
2. Add Julian date / sidereal-time utilities.
3. Calculate Sun and Moon altitude/azimuth offline.
4. Add astronomical twilight and rise/set times.
5. Add a small offline object catalog and search.
6. Wrap the tested frontend in Tauri for a Windows installer.

## Night vision note

The current dimmer draws a black overlay over the app itself. It does not yet change the laptop's physical backlight. Hardware brightness control belongs in the later Tauri desktop adapter.
