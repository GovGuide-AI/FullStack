> **Superseded — kept for history only.**
>
> This document describes a *different product*: an AI meeting assistant for
> Google Meet and Zoom, built on Flutter Web, Go with Gin, and PASETO tokens.
> That product is not what this repository builds.
>
> This repository is GovGuide-AI, a bilingual guide to Ethiopian government
> services built as a single Next.js application. See [AGENTS.md](../../AGENTS.md)
> and `.cursor/rules/project-architecture.mdc` for the current architecture.
>
> The spec is retained because it was recovered from a lost session and is the
> only surviving record of that earlier direction. Do not implement from it.

# Recovered project specification

Recovered on 2026-07-25 from the Cursor conversation index
(`conversation-search.db`, conversation `cdd4c8ba-53fb-4167-8c38-ae160747d661`,
last updated 2026-07-24 21:59). This is the original wording of the spec, kept
verbatim so nothing is lost to paraphrase.

---

## Product

The proposed system is a web-based AI meeting assistant designed to seamlessly augment online conversations without disrupting the natural flow of communication. Unlike conventional AI meeting tools that continuously intervene, the assistant operates as a passive participant that listens to the conversation in real time while remaining silent unless explicitly invoked by the user. During meetings conducted through platforms such as Google Meet or Zoom, the AI continuously maintains contextual awareness of the discussion, allowing users to press a dedicated button whenever they require assistance. Upon activation, the AI can answer questions regarding previous parts of the conversation, generate concise summaries, clarify concepts that were discussed, provide contextual recommendations, or answer general knowledge questions while leveraging the conversation history accumulated throughout the meeting. This interaction model enables the AI to function as an intelligent third participant whose responses are intentionally user-driven rather than intrusive, thereby preserving the natural dynamics of the meeting while still providing immediate access to contextual intelligence. AI inference will be powered through the OpenRouter API, allowing flexibility in selecting and switching between supported large language models without requiring architectural changes. The OpenRouter API key will be securely managed through environment variables and will never be hardcoded within the application's source code.

## Sessions and privacy

To ensure privacy and controlled access, the application introduces a secure session management workflow centered around shareable collaboration links. Users wishing to utilize the AI assistant will first create a private session and distribute a unique invitation link exclusively to other participants who should have access to the AI's capabilities. This design ensures that conversation data remains isolated within authorized sessions and is never exposed to unintended users. Once participants join the shared workspace, the AI assistant is configured by providing the meeting identifier for supported platforms such as Google Meet or Zoom, allowing it to join and begin processing the conversation. Throughout the meeting, only authenticated participants belonging to that shared session can interact with the AI and receive its responses. Initially, user interaction will be implemented through a dedicated web page that provides the AI controls and conversation interface; however, the architecture is intentionally designed to support migration to a browser extension in a future release, enabling a significantly more seamless experience by allowing users to access the assistant directly alongside their meeting without switching browser tabs.

## Technology stack

The technology stack emphasizes performance, scalability, maintainability, and security across the entire system. The frontend will be developed using Flutter Web, enabling a highly responsive, cross-platform user interface that follows a minimalist design philosophy inspired by modern productivity software rather than conventional AI chat applications. The interface will prioritize simplicity by utilizing Google Sans typography, generous whitespace, subtle animations, and an uncluttered layout that avoids unnecessary navigation menus, oversized branding, or distracting interface elements, thereby allowing users to focus entirely on their meeting and AI interactions. The backend will be implemented in Go using the Gin framework to provide high-performance RESTful APIs over HTTPS while leveraging WebSockets for low-latency, bidirectional communication required for real-time button events and AI interactions, with future support for continuous live chat. PostgreSQL will serve as the primary relational database, offering transactional integrity, efficient indexing, and long-term scalability for user accounts, meeting sessions, conversation metadata, and application state. Authentication and authorization will be secured using PASETO tokens instead of traditional JWTs, providing stronger cryptographic guarantees and eliminating several common implementation vulnerabilities associated with JWT misuse. Additional middleware will enforce authentication, authorization, rate limiting, request validation, secure session management, and comprehensive error handling, resulting in a robust, secure, and production-ready architecture. The project will be configured using a .env file to separate sensitive configuration from the codebase. At a minimum, the environment configuration will include the PostgreSQL connection parameters (host, port, database name, username, password, and SSL configuration) along with the OpenRouter API key. A sample .env.example file will be provided so developers can easily configure their local environment while ensuring that secrets remain excluded from version control.

---

## What was not recovered

The previous session had begun scaffolding the Go backend and Flutter Web
frontend. None of that code survived — all three repositories (`Backend`,
`Frontend`, `FullStack`) contain only their initial commit and a README. The
last recorded progress note was "Fixing the embed path (Go doesn't allow `..` in
embed paths) and continuing with services and handlers."

The assistant's answers about OpenRouter model selection and hallucination were
never written to disk and are unrecoverable. They have been re-derived from live
OpenRouter data in the accompanying canvas.
