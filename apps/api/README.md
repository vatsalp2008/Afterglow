# @afterglow/api

The small edge API. Today it serves `GET /health`. Phase 5 adds `POST /refine`, which proxies a strokes-only PNG to a vision model with the API key kept server-side, plus rate limiting, request size limits, and Zod validation.
