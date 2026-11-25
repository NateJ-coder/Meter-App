# Fuzio Meter Reader

The offline meter list is generated from `Buildings/app-database` and
`Buildings/capture-profile.json`. After changing those inputs, run
`node scripts/generate-mobile-meter-registry.mjs` from the repository root
and rebuild the app.

The November 2026 meter database records no individual water meters at
Genesis. Its two bulk water meters, borehole and mezzanine meters are still
captured and required. Vista Del Monte meters remain available but are not
required to complete a building, because readings also come from the utility
company. Transvalia remains accessible, with a notice that readings have stopped.
Existing captures are not removed by these settings.

Source changes do not update installed apps. See
[APP_UPDATE_GUIDE.md](APP_UPDATE_GUIDE.md) for the signed APK release process.
