# V35 fixes

- Easy Voice Việt provider logic restored to Auto: Vertex + Gemini, Gemini only, or Vertex only.
- BGM Manager V2: Match Voice Length / Loop To Voice Length, Fade Out seconds.
- BGM output is forced to voice duration to prevent long BGM extending final audio/video.
- BGM mixing uses original freshly concatenated voice audio in render pipeline and avoids cumulative volume decay.
- BGM loop is only applied when mode=loop.
