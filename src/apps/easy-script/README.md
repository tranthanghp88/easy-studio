# Easy Script Studio

Built for creators who want to produce English podcast/video scripts faster, with less technical setup and a cleaner workflow.

The app focuses on one workflow:

```text
Topic → Clean English Script → Bilingual Review → Export
```

Voice generation, subtitle sync, and video rendering are handled inside the dedicated Easy English Voice/Video app.

## Chạy dev

Lần đầu:

```bat
install.bat
```

Các lần sau:

```bat
dev.bat
```

Khi dependency lỗi/cache lỗi:

```bat
clean-install.bat
```

## API Settings

Open `API Settings` to save your keys locally:

- Gemini API Key
- OpenAI API Key, optional
- Test Connection

Auto mode will choose the best available AI provider automatically. Manual provider/model settings are hidden inside Advanced Settings.

API keys are saved locally in the Electron user data folder and are not saved into project JSON files.

## Creator workflow

1. Enter topic, duration, difficulty, and tone/mood.
2. Click `Quick Generate Script`.
3. Review each script section.
4. Use Vietnamese comparison for faster proofreading.
5. Export the final script.

## Characters

- `A:` = Adam = male voice
- `R:` = Raychel = female voice
- `BOTH:` = both react together, used lightly

## Script sections

The app keeps your script organized into clear creator sections like Hook, Intro, Main Content, and CTA.

For export, the script still keeps voice pacing and style lines inside the script so the next workflow step can use them correctly.

Required creator sections:

- Hook
- Intro
- Main content
- CTA at the beginning
- CTA in the middle
- CTA at the end

The AI can create additional body/story sections when needed, usually 8–12 sections total.

## Smart Bilingual Review

The app automatically creates a Vietnamese comparison beside the English script so Vietnamese creators can check meaning faster without copying text to another tool.

## Product direction

Easy Script Studio is a stable script production app for Easy English video/podcast creators. It is not an AI playground or a generic writing tool.


## Step 5 — Humanizer Pass

The final improvement step focuses on removing AI perfection from the dialogue.

Goals:
- Keep the original structure and story flow
- Preserve Hook / Intro / Main Content / CTA sections
- Make conversations sound slightly imperfect and more human
- Reduce over-polished podcast-host wording
- Keep CTA soft and casual

The app now prefers:
- underreactions
- small misunderstandings
- awkward interruptions
- self-corrections
- incomplete sentences
- gentle disagreement
- casual unnecessary remarks

instead of:
- inspirational phrasing
- therapist-like responses
- overly perfect callbacks
- overly supportive reactions
- polished AI dialogue
