# WorkRail WR icon

On 2026-11-18 the user selected app option F (WR monogram) and menu option E
(modular). BrandKit art direction and image generation recreated the selected
WR tile on a transparent background. `workrail-wr-source.png` is the generated
source; ImageMagick encodes the deployed `icon.png` at 256px and `icon.ico` at
16, 24, 32, 48, 64 and 256px. These are raster derivatives, not independently
pixel-hinted artwork. No external logo pack was imported.

Windows window/tray/executable/installer use ICO; renderer/About/notifications
and other platforms use PNG. The source PNG is not added to packaged resources.
Small-size visual inspection and platform verification are recorded in
`docs/implementation/2026-11-18-workrail-polish-and-recovery.md`.

The older `icon.svg` is the previous W-rail artwork, retained for the historical
WorkRail 1.0.0 implementation record. It is not the source of the current icon
and is not used by the app or installer.
