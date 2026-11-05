# shadcn/ui source provenance

Official upstream: https://github.com/shadcn-ui/ui
Pinned commit: 8a3536678a528cc012b9e62484290e79d0be410f
Source: apps/v4/registry/new-york-v4/ui/{button,input,select,popover,tooltip,alert-dialog}.tsx
Destination: src/renderer/components/ui/*.tsx
License: MIT, reproduced without alteration in shadcn-ui.txt alongside this notice.
Both files are included in the packaged application via electron-builder.yml.

Adaptations: local cn and Button import paths; removed example animation/transition classes;
Tooltip defaults to 250ms and 8px offset with no arrow; Select/Popover accept a portal
container so nested controls remain in their owning editor focus scope; confirmation
overlay receives an application class. Approved A Zinc tokens and application sizing
are supplied by local Tailwind v4 theme and renderer styles. Radix primitives, actual
shadcn source variants, slots, focus/keyboard behavior and component composition are used.
