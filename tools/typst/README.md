# Typst (PDF maker)

Used to make every PDF (ADR-004). The app runs the official command-line program as a separate process.

- Version: 0.14.2, `typst-x86_64-unknown-linux-musl.tar.xz`
- SHA-256: `a6044cbad2a954deb921167e257e120ac0a16b20339ec01121194ff9d394996d` (checked by the installer; any other file is refused)
- Install: `npm run setup:typst` (installs into `.tools/typst`, which is not committed)
- Fonts: only `assets/fonts` is visible to it (system fonts are ignored). Caveat Medium, SIL Open Font License; the license file sits beside the font.
- It exits normally on a missing font and silently swaps another, so the runner treats any warning as a failure.
- License: Apache-2.0.
