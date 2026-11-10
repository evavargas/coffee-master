# Coffee Master — Recipes, Personal Recipe Book & RAG Implementation

## Role

Act as a senior full-stack engineer and AI engineer working on Coffee Master, an existing AI-powered specialty coffee assistant.

Your task is to extend the existing application with a complete recipe management experience, AI-powered recipe adaptation, personal recipe collections, and a Retrieval-Augmented Generation (RAG) system.

You must work directly within the existing repository, understand the current architecture, preserve existing functionality, and implement the new features end to end.

Do not create a separate application or unnecessarily rewrite existing components.

---

# 1. Project Context

Coffee Master is an AI-powered specialty coffee assistant.

The existing application includes:

- An AI chat interface.
- A backend that communicates with Claude through its API.
- A knowledge base stored in a backend directory named `Knowledge`.
- Existing knowledge about specialty coffee, brewing methods, recipes, and related topics.
- A conversational interface where users ask questions and receive answers from Claude.
- Existing application infrastructure and database functionality.

The knowledge currently lives in the backend `Knowledge` directory and is used by the existing chat system.

The existing chat works correctly and must remain functional.

Before implementing anything, inspect the repository and understand:

- Frontend architecture and routing.
- Backend architecture and API endpoints.
- Existing database schema and migrations.
- Authentication and user identification.
- Current chat implementation.
- How Claude is called and how prompts are constructed.
- How the `Knowledge` directory is structured.
- How existing knowledge is currently loaded or provided to Claude.
- Existing deployment configuration and environment variables.
- Existing design system, components, and UI conventions.

Use the existing stack and conventions whenever possible.

Do not assume that a particular library, service, or database extension is already configured. Verify it first.

---

# 2. Product Vision

Coffee Master should evolve from a conversational AI assistant into a specialty coffee application where users can:

1. Explore existing coffee recipes derived from the existing knowledge base.
2. Open a recipe and understand its brewing parameters and instructions.
3. Ask Claude questions about a specific recipe.
4. Adapt existing recipes through conversation.
5. Generate completely new recipes through the chat.
6. Save recipes generated or adapted through the chat.
7. Save existing recipes to their personal recipe book.
8. Mark recipes as favorites.
9. Manage their own recipes and saved recipes in a dedicated section.
10. Use RAG to retrieve relevant coffee knowledge and recipes when interacting with Claude.

The experience should feel integrated and coherent.

The chat should remain the central AI experience, while recipes become persistent, structured objects that users can discover, modify, and save.

---

# 3. New Application Sections

Implement the following sections, integrating them into the existing navigation and application structure.

## 3.1 Recipes

Create a new Recipes section.

This section should display the recipes available in Coffee Master's existing knowledge base.

Requirements:

- Display recipes as cards or an appropriate recipe list.
- Show recipe name, brewing method, coffee information, and a short description when available.
- Allow users to search recipes.
- Allow filtering by brewing method when the information is available.
- Allow users to open a recipe detail page.
- Allow users to save a recipe to their personal recipe book.
- Allow users to mark a recipe as a favorite.
- Clearly distinguish recipes from the original Coffee Master knowledge base from user-created recipes.

Important:

The recipes must originate from the existing `Knowledge` directory.

Do not invent recipes or automatically create inaccurate recipe content.

Inspect the existing documents and determine how recipes can be extracted or structured reliably.

If the documents contain recipe information in inconsistent formats, implement a robust extraction or ingestion process that preserves the original information.

Every catalog recipe must retain a reference to its original source document when possible.

## 3.2 Recipe Detail

Implement a dedicated recipe detail view.

Display structured information when available:

- Recipe name.
- Brewing method.
- Coffee origin or characteristics.
- Coffee dose.
- Water amount.
- Coffee-to-water ratio.
- Water temperature.
- Grind size.
- Brewing time.
- Brewing instructions.
- Additional notes.
- Source information.

Do not require every field to exist.

Handle missing information gracefully.

The recipe detail page must include:

- Save recipe action.
- Favorite toggle.
- Ask Coffee Master about this recipe.
- Adapt this recipe action.

The interface should clearly indicate whether a recipe belongs to the original Coffee Master catalog or the user's personal collection.

## 3.3 My Recipes

Create a dedicated My Recipes section.

This section is the user's personal recipe book.

It should contain:

- Recipes saved from the original catalog.
- Recipes created by the user through Claude.
- Recipes adapted from existing recipes.
- Recipes marked as favorites.

Provide appropriate organization, such as:

- All recipes.
- Favorites.
- Created by me.
- Saved from Coffee Master.

Users must be able to:

- Open a recipe.
- Remove a recipe from their collection.
- Mark or unmark favorites.
- Edit their own recipes.
- Continue adapting their recipes through the chat.

Do not allow users to modify original Coffee Master catalog recipes directly.

Saving an existing catalog recipe should create a personal association with that recipe rather than duplicating its entire content unnecessarily.

Saving an adapted recipe should create a separate user-owned recipe.

---

# 4. Recipe Data Model

Design a structured recipe representation.

Use a consistent schema across the backend, frontend, database, and AI outputs.

A recipe should support fields similar to:

{
  "name": "Sweet V60",
  "description": "A sweet and balanced pour-over recipe",
  "method": "V60",
  "coffee": {
    "origin": "Colombia",
    "process": "Washed",
    "dose_g": 15
  },
  "water": {
    "amount_g": 250,
    "temperature_c": 93
  },
  "ratio": "1:16.7",
  "grind_size": "Medium-fine",
  "brew_time_seconds": 180,
  "steps": [
    {
      "description": "Bloom with 45g of water",
      "time_seconds": 30
    }
  ],
  "notes": "Adjust grind size according to extraction",
  "source": "Coffee Master Knowledge",
  "parent_recipe_id": null
}

This is only an illustrative schema.

Adapt it to the actual content available in the project.

Requirements:

- Support incomplete recipes.
- Support structured brewing instructions.
- Support optional fields.
- Support recipes created from scratch.
- Support recipes adapted from other recipes.
- Preserve the relationship between an adapted recipe and its original recipe.
- Support recipe ownership.
- Support favorite status.
- Support recipe source attribution.
- Support recipe versioning or revision history when appropriate.

Avoid storing recipe information exclusively as plain text if it can reasonably be represented structurally.

---

# 5. Chat Integration With Recipes

The existing chat must remain functional.

Extend it to support recipe-specific conversations.

## 5.1 Chat From a Recipe

When the user opens a recipe and selects "Ask Coffee Master" or "Adapt Recipe":

- Open the existing chat interface.
- Pass the recipe identifier or structured recipe data into the chat context.
- Make the selected recipe available to Claude.
- Clearly indicate which recipe the conversation is about.
- Allow the user to ask questions or request modifications.

Examples:

- Make this recipe sweeter.
- Reduce acidity.
- Adjust it for a different coffee.
- Change the coffee dose to 20 grams.
- Explain why this recipe uses this grind size.
- Adapt it for AeroPress.
- Improve extraction consistency.

The original recipe must remain unchanged.

The AI should generate an adaptation rather than modifying the original catalog recipe.

## 5.2 Recipe Context

Implement a reliable mechanism for providing recipe context to Claude.

The context should include:

- The original recipe.
- Relevant retrieved coffee knowledge.
- Relevant conversation history.
- User instructions.

Do not rely only on the frontend sending arbitrary text.

The backend must construct and manage the AI context appropriately.

## 5.3 Save Recipe From Chat

Users must be able to save a recipe generated or adapted through a conversation.

Implement a clear action such as:

"Save Recipe"

When selected:

1. Identify the recipe proposed by Claude.
2. Convert it into the structured recipe format.
3. Validate the recipe data.
4. Present a preview or confirmation step when appropriate.
5. Save it as a user-owned recipe.
6. Associate it with the relevant conversation.
7. Preserve its relationship with the original recipe when applicable.
8. Make it immediately available in My Recipes.

Do not save recipes automatically after every AI response.

The user must explicitly choose to save.

If a conversation contains multiple recipe versions, allow the user to save the specific version they selected.

## 5.4 Recipe Generation From Chat

Users should also be able to create recipes without starting from an existing recipe.

For example:

"I have a washed Colombian coffee and a V60. I want a sweeter cup."

Claude should be able to generate a complete recipe using:

- Relevant information from the Coffee Master knowledge base.
- The user's requirements.
- Brewing parameters.
- Appropriate instructions.

When Claude generates a complete recipe, the UI should recognize it as a recipe and offer the option to save it.

Implement a reliable structured output mechanism rather than relying exclusively on fragile text parsing.

Use the existing Claude integration and supported structured output capabilities where appropriate.

---

# 6. Favorites

Implement favorite functionality for catalog recipes and personal recipes.

Requirements:

- Users can favorite existing catalog recipes.
- Users can favorite their own recipes.
- Favorite status persists across sessions.
- Favorites appear in the My Recipes section.
- Favorite status is independent of whether the recipe is saved in the personal collection, unless the existing product design requires otherwise.

Prefer a dedicated relationship or favorite model if appropriate.

Avoid storing favorites only in local frontend state.

Ensure favorites are associated with the authenticated user.

---

# 7. RAG Implementation

Implement a real Retrieval-Augmented Generation system for Coffee Master.

The objective is to allow Claude to retrieve relevant information from the existing knowledge base and recipe catalog instead of relying exclusively on manually provided context.

## 7.1 Knowledge Sources

Use the existing backend `Knowledge` directory as the primary source of knowledge.

The system should support:

- Existing coffee documentation.
- Existing recipe information.
- Future knowledge documents.
- Structured recipe data.

Do not replace or remove the existing knowledge base.

Preserve its existing functionality.

## 7.2 Document Ingestion Pipeline

Implement a reusable ingestion pipeline.

The pipeline should:

1. Discover supported documents in the `Knowledge` directory.
2. Read and extract document content.
3. Normalize text where appropriate.
4. Split documents into meaningful chunks.
5. Preserve source metadata.
6. Generate embeddings.
7. Store chunks and embeddings in the vector database.
8. Track document versions or content hashes.
9. Avoid unnecessarily processing unchanged documents.
10. Support reprocessing documents when their content changes.

The pipeline should be idempotent.

Running it multiple times should not create duplicate documents or chunks.

Preserve metadata such as:

- Document name.
- Source path.
- Document type.
- Recipe identifier when applicable.
- Chunk identifier.
- Content hash.
- Ingestion timestamp.
- Relevant section or title.

Implement ingestion as a separate operation from normal chat requests.

Do not regenerate embeddings every time the user sends a message.

## 7.3 Chunking Strategy

Implement an appropriate chunking strategy.

Consider:

- Document structure.
- Section headings.
- Recipe boundaries.
- Paragraph boundaries.
- Chunk size.
- Overlap between chunks.

Avoid splitting recipes in ways that separate their brewing parameters from their instructions.

Prefer meaningful chunks rather than arbitrary fixed-length text whenever possible.

Make chunking configurable.

## 7.4 Embeddings

Use an embedding model appropriate for semantic search.

Inspect the existing infrastructure and available dependencies before choosing a provider.

If no embedding provider exists, use a suitable embedding API and implement it behind a reusable service.

Keep embedding generation separate from Claude's answer generation.

Do not assume Claude itself generates embeddings.

Handle:

- API errors.
- Rate limits.
- Retry behavior.
- Embedding dimension consistency.
- Provider configuration.

Never hardcode API keys.

## 7.5 Vector Storage

Use the existing Supabase/PostgreSQL infrastructure if appropriate.

If pgvector is available or can be enabled safely, use it for vector storage and similarity search.

Create appropriate migrations and indexes.

The vector storage layer should support:

- Document chunks.
- Embeddings.
- Source metadata.
- Recipe references.
- Semantic similarity queries.

Do not introduce a separate vector database unless there is a strong architectural reason.

## 7.6 Retrieval

When the user asks a question:

1. Generate an embedding for the query.
2. Search for semantically relevant knowledge chunks.
3. Retrieve the most relevant results.
4. Optionally apply metadata filtering.
5. Construct a context containing the retrieved information.
6. Pass the context to Claude.
7. Generate the response using the existing chat flow.

The retrieval process should support questions about:

- Brewing methods.
- Coffee characteristics.
- Extraction.
- Recipes.
- Recipe adaptations.
- Troubleshooting.
- Coffee preparation techniques.

Use relevance thresholds or other appropriate safeguards.

Do not send irrelevant retrieved documents to Claude merely because they are the closest available matches.

## 7.7 Retrieval Quality

Implement a reasonable initial retrieval strategy and make it possible to improve it.

Consider:

- Top-K retrieval.
- Similarity thresholds.
- Metadata filtering.
- Hybrid search if useful.
- Deduplication of retrieved chunks.
- Context size limits.
- Ranking of retrieved content.

Do not overengineer the initial implementation.

Prioritize correctness and maintainability.

## 7.8 AI Context and Grounding

Update the existing Claude system prompt to explain that:

- Retrieved knowledge is reference material.
- The assistant should use it when relevant.
- The assistant should not invent facts about Coffee Master recipes.
- The assistant should distinguish documented information from general recommendations.
- If the knowledge base does not contain sufficient information, it should communicate uncertainty.
- The assistant can propose adaptations, but should not claim they were experimentally validated unless that is actually known.

When possible, preserve source references so the application can display where information came from.

---

# 8. Database and Backend Architecture

Inspect the existing database before creating new tables.

Design the necessary schema for:

- Catalog recipes.
- User recipes.
- Saved recipe associations.
- Favorites.
- Recipe versions or adaptations.
- Chat-to-recipe associations.
- Knowledge documents.
- Knowledge chunks and embeddings.

Use migrations.

Requirements:

- Proper foreign keys.
- Appropriate indexes.
- Referential integrity.
- Ownership constraints.
- Efficient queries.
- Clear separation between catalog and user-generated content.

If the application already uses Supabase authentication, integrate with the existing user identity.

If Row Level Security is already used, extend it appropriately.

Users must not be able to access, modify, or delete other users' private recipes.

Do not expose service-role credentials in the frontend.

Implement the necessary backend API endpoints using existing conventions.

---

# 9. UI/UX Requirements

Maintain Coffee Master's existing design language.

Inspect the current UI before designing new screens.

Requirements:

- Responsive layouts.
- Consistent navigation.
- Recipe cards.
- Recipe detail view.
- My Recipes.
- Favorite indicators.
- Save recipe interactions.
- Recipe adaptation flow.
- Clear loading states.
- Error states.
- Empty states.
- Confirmation feedback.

Avoid unnecessary complexity.

The new sections should feel like natural extensions of the existing application.

Do not redesign the entire application unless necessary.

Use existing components and styling conventions whenever possible.

---

# 10. Security and Reliability

Pay particular attention to:

- User authentication.
- Recipe ownership.
- Access control.
- Input validation.
- API key protection.
- AI output validation.
- Database integrity.
- Ingestion failures.
- Embedding failures.
- Retrieval failures.
- Rate limits.
- Unexpected document formats.

Do not trust AI-generated structured data without validation.

Do not allow AI output to directly execute database operations.

All persistence must pass through validated backend logic.

Implement reasonable logging and error handling.

---

# 11. Testing

Add tests for the new functionality.

At minimum, test:

- Knowledge ingestion.
- Chunk generation.
- Embedding generation.
- Vector retrieval.
- Recipe extraction or catalog ingestion.
- Recipe creation.
- Recipe adaptation.
- Recipe saving from chat.
- Favorite persistence.
- User ownership.
- Unauthorized access prevention.
- Existing chat behavior.
- Error handling.

Test the complete flow:

1. User opens a catalog recipe.
2. User asks Claude to adapt it.
3. Claude generates a structured adaptation.
4. User saves the adaptation.
5. The recipe appears in My Recipes.
6. The user marks it as favorite.
7. The recipe remains available after refreshing the application.

Also test:

1. User starts a new conversation.
2. Claude generates a new recipe.
3. User saves it.
4. The recipe appears in the personal recipe book.

---

# 12. Implementation Strategy

Do not immediately start changing files without understanding the repository.

Follow this sequence:

## Phase 1 — Repository Analysis

Inspect the repository and document:

- Existing architecture.
- Current chat flow.
- Knowledge ingestion mechanism.
- Database schema.
- Authentication.
- Relevant frontend components.
- Existing dependencies.

Identify the smallest changes needed to implement the features.

## Phase 2 — Architecture and Data Model

Design the database schema, API contracts, recipe representation, and RAG architecture.

Check whether existing components can be reused.

## Phase 3 — Knowledge Ingestion and RAG

Implement:

- Document processing.
- Chunking.
- Embeddings.
- Vector storage.
- Semantic retrieval.
- Integration with Claude.

Preserve the current chat behavior.

## Phase 4 — Recipe Catalog

Implement:

- Recipe extraction and ingestion.
- Recipe catalog.
- Recipe detail.
- Search and filters.
- Favorite functionality.

## Phase 5 — Personal Recipe Book

Implement:

- Saved catalog recipes.
- User-created recipes.
- Recipe adaptations.
- Recipe management.
- Ownership and permissions.

## Phase 6 — Chat and Recipe Integration

Implement:

- Chat from recipe.
- Recipe context.
- Recipe adaptation.
- Structured recipe generation.
- Save recipe from chat.

## Phase 7 — Testing and Verification

Run the existing tests and new tests.

Verify the complete user flows.

Resolve regressions.

## Phase 8 — Documentation

Document:

- New architecture.
- Database migrations.
- Knowledge ingestion.
- Embedding provider configuration.
- Vector search.
- Environment variables.
- How to add or update knowledge documents.
- How to add catalog recipes.
- How recipe saving works.
- How to run tests.
- Deployment requirements.

---

# 13. Development Rules

Follow these rules throughout the implementation:

1. Preserve existing working functionality.
2. Do not rewrite the existing chat unnecessarily.
3. Do not invent content for the knowledge base.
4. Do not claim that RAG works until it is implemented and tested.
5. Do not hardcode credentials.
6. Do not introduce unnecessary dependencies.
7. Do not duplicate existing functionality.
8. Prefer reusable services and clear separation of responsibilities.
9. Follow the existing code conventions.
10. Use database migrations for schema changes.
11. Validate all AI-generated recipe data.
12. Preserve the original recipe when creating adaptations.
13. Make user-generated recipes private by default.
14. Keep the knowledge ingestion process separate from runtime chat.
15. Ensure the application works when the vector database or embedding provider is temporarily unavailable, using a safe fallback where appropriate.
16. Do not silently discard knowledge or user recipes.
17. Do not mark tasks as complete without verification.

---

# 14. Expected Deliverables

At the end of the implementation, provide:

1. A summary of the architecture.
2. A list of implemented features.
3. A list of modified and created files.
4. Database migrations created.
5. New API endpoints.
6. How RAG works in the implementation.
7. How the recipe ingestion process works.
8. How recipes are saved and associated with users.
9. Tests executed and their results.
10. Any remaining limitations.
11. Required environment variables.
12. Instructions to run the application locally.
13. Instructions to deploy the changes.

Clearly distinguish implemented functionality from anything that remains incomplete.

---

# 15. Start Now

Begin by inspecting the existing repository.

Do not stop after producing an architectural proposal.

After analyzing the current application, proceed with implementation in manageable stages.

If you encounter a significant architectural decision that could affect existing functionality, explain the options and choose the safest approach.

Otherwise, make reasonable engineering decisions and continue.

The final objective is a working Coffee Master application with a recipe catalog, a personal recipe book, recipe adaptation through Claude, recipe saving from chat, favorites, and a real RAG pipeline integrated with the existing knowledge base.

Prioritize a working, maintainable implementation over unnecessary complexity.
