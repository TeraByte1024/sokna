---
trigger: always_on
---

# Technical Stack & Environment
- Always write all source code in strict **TypeScript**. Avoid using `any` type; explicitly define `interface` or `type` for type safety.
- For backend services, authentication, and database interactions, utilize the latest **Supabase** Client SDK specifications.

# Architecture & Code Style
- Maintain a clean separation of concerns: decouple data-fetching/state-management logic from UI components.
- Wrap all Supabase asynchronous queries (CRUD, Auth) in `try-catch` blocks to ensure robust error handling and clear console logging.

# Development Philosophy & Principles

# 1. Security First
- Never hardcode sensitive data (API keys, secrets, database URLs). Always enforce the use of environment variables or secure storage config.
- Enforce secure asynchronous error handling (`try-catch`) on all external API requests and data mutations to prevent silent crashes and unhandled promise rejections.
- Ensure proper input validation and sanitization on the client side before triggering any remote database/backend queries.

# 2. Idiomatic & Best Practices
- Rely on official, built-in features and standard API patterns of the specified framework (Supabase) rather than introducing unnecessary third-party utility libraries.
- Adhere to idiomatic naming conventions: use PascalCase for classes/types, camelCase for variables/functions, and UPPER_CASE for constants.

# 3. Modern & Minimalist
- Prefer the latest ECMAScript/TypeScript features (e.g., optional chaining `?.`, nullish coalescing `??`, async/await) to keep the codebase clean and readable.
- Write highly generalized, reusable, and modular functions. Avoid redundant logic (DRY principle) and over-engineering; keep implementations as simple and direct as possible.
