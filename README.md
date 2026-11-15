# VoiceOps

A Turkish-language voice assistant for warehouse operations, built as a team hackathon prototype. Warehouse staff can ask about an order or stock level, request a daily summary, or update stock in a seeded demo database.

[Original team repository](https://github.com/fkaanc/voiceops_hackathon_google) · [Demo video](https://youtu.be/LeW9xG2TdmA) · [Pitch deck](VoiceOps_pitchdeck.pdf)

## How it works

| Layer | Implementation |
| --- | --- |
| Voice and dashboard | [React/Vite UI](frontend/src/App.tsx) with browser speech recognition, Turkish speech synthesis and a text input |
| Command routing | [FastAPI service](backend/app/main.py) and [Gemini function calling](backend/app/services/gemini_agent.py) |
| Warehouse operations | [Backend tools](backend/app/services/tools.py) over SQLite and SQLAlchemy models |

My contribution was the [initial application scaffold](https://github.com/fkaanc/voiceops_hackathon_google/commit/f354218) and a follow-up that [introduced an app factory and router, handled empty input and expanded API tests](https://github.com/fkaanc/voiceops_hackathon_google/commit/cf31313). The upstream history has the full team’s work.

## Run the demo

Use Python 3, Node.js, npm and Bash. Use Chrome and allow microphone access for voice input.

```sh
npm run setup
npm run set-key
npm run dev
```

Add your own Gemini API key at the prompt. Open [the dashboard](http://127.0.0.1:5173) or [the API docs](http://127.0.0.1:8000/docs). Try `Kritik stokları göster` or `Bugünün özetini ver`.

`npm run test` runs the backend tests, frontend lint and build. `npm run reset-db` replaces local demo records with the seed data.

## Türkçe

VoiceOps, depo çalışanlarının Türkçe sesli komutlarla sipariş ve stok sorgulaması yapabildiği bir hackathon prototipi. Stok güncellemeleri yerel demo veritabanına yazılır. Mikrofon kullanmak istemeyenler komutları metin olarak da girebilir.
