# FIX V37 Stability Notes

- Fixed Easy Voice Việt provider flow: Auto/Gemini/Vertex validate only the selected provider.
- Vertex service-account JSON now generates an access token via google-auth-library.
- Fixed BGM volume decay: BGM preview no longer overwrites the original voice path.
- BGM mixing always uses voice as master timeline. BGM loops/cuts to match voice length.
- Added BGM fade-out control in UI.
- Removed “Bỏ chọn BGM” button from BGM Manager.
