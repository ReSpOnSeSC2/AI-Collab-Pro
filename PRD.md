# PRD: AI Collaboration Hub - Advanced Collaboration Engine

**Version:** 9.0.0
**Date:** 2024-07-27
**Author:** AI Architect

## 1. Introduction

The AI Collaboration Hub aims to provide a seamless interface for users to interact with multiple Large Language Models (LLMs) simultaneously. This update introduces an Advanced Collaboration Engine, enabling sophisticated multi-agent workflows where up to six LLMs can collaborate on a single user prompt, exchange intermediate thoughts, and produce a reconciled answer with rationale. This significantly enhances the Hub's capabilities beyond simple parallel querying, fostering deeper insights and more robust outputs.

## 2. Goals

*   Implement five distinct collaboration modes for multi-LLM interaction.
*   Enable LLMs to exchange intermediate thoughts/critiques based on the selected mode.
*   Provide a single, reconciled answer and rationale to the user.
*   Incorporate cost control mechanisms to manage API spend.
*   Enhance the UI to support mode selection and display collaborative process insights.
*   Maintain security and reliability of the platform.

## 3. Target Users

*   Researchers and analysts requiring diverse perspectives on complex topics.
*   Content creators seeking novel ideas and refined outputs.
*   Developers and problem-solvers looking for robust, multi-faceted solutions.
*   Anyone needing to mitigate single-model bias or hallucination.

## 4. Key Features (Collaboration Protocol)

The engine will support five collaboration modes, selectable by the user:

### 4.1. `round_table` (Default)
    *   **Description:** Classic synchronous consensus loop.
    *   **Flow:**
        1.  All agents draft an initial answer to the user's prompt.
        2.  Agents critique each other's drafts.
        3.  Agents vote on the best draft or key insights.
        4.  A lead agent (or a designated summarizer model) merges insights into a consolidated answer.
        5.  (Optional/TODO) Fact-check the merged answer.
        6.  Present final reconciled answer and rationale.

### 4.2. `sequential_critique_chain`
    *   **Description:** Low-trust pipeline critique.
    *   **Flow:**
        1.  Agent 0 (first in a predefined or dynamic order) generates an initial answer.
        2.  Agent 1 receives Agent 0's answer and provides a critique or amendment based on a `critiqueStyle` (e.g., `agree`, `balanced`, `disagree`).
        3.  This continues down the chain, with each subsequent agent critiquing/amending the output of the previous one.
        4.  The CollabEngine (a summarizer model) aggregates all critiques and the evolving answer to produce an overall consensus summary and the final refined answer.

### 4.3. `validated_consensus`
    *   **Description:** Hallucination-mitigation workflow.
    *   **Flow:**
        1.  Two agents (e.g., Agent 0 and Agent 1) co-draft an initial answer, possibly by each generating a draft and then a third agent (or one of them) merging.
        2.  The remaining agents (Agent 2 to N) act as verifiers. Each verifier runs a "RAG-Verify" step (TODO: actual RAG integration; for now, simulate by prompting for factual accuracy and source plausibility).
        3.  If >4% of lines (or key claims) are flagged as potentially inaccurate or unverified, the co-drafting agents (or a designated rewriter) rewrite the answer, addressing the flagged issues.
        4.  The final answer contains inline citations (if sources provided by RAG) or `⚠️ uncertain` tags for claims that could not be confidently verified.

### 4.4. `creative_brainstorm_swarm`
    *   **Description:** Maximize creativity and novel idea generation.
    *   **Flow:**
        *   **Phase A – Solo Ideation:** Each participating agent independently generates 3-5 novel angles, solutions, or creative concepts related to the user's prompt. No critique occurs at this stage.
        *   **Phase B – Idea Fusion:** All agents receive the collected ideas from Phase A. Each agent must then select at least two distinct ideas (can be their own or others') and merge them into a new, more complex "mega-idea," explaining why this fusion is exciting or promising.
        *   **Phase C – Vote & Amplify:** Agents review all "mega-ideas." Each agent up-votes one mega-idea they find most original or impactful (cannot vote for their own). The mega-idea with the most votes is selected. This top pick is then collaboratively expanded upon by all agents for one final turn to flesh it out.
    *   **Note:** Minimal verification; emphasizes breadth and novelty.

### 4.5. `hybrid_guarded_braintrust`
    *   **Description:** Balance creativity with safety and factual grounding.
    *   **Flow:**
        1.  **Turn 1 – Creative Ideation:** Execute Phase A (Solo Ideation) of the `creative_brainstorm_swarm` mode to generate a diverse set of raw ideas.
        2.  **Turn 2 – Validation Sweep:** Select the top 3-5 most promising raw ideas (e.g., by a simple keyword score or a quick LLM ranking). Subject these ideas to the RAG-Verify sweep from the `validated_consensus` mode (simulated verification for now).
        3.  **Turn 3 – Rank & Elaborate:** Ideas that survive the validation sweep are ranked based on a combined score (e.g., creativity score from an LLM + evidence/verification score). The highest-ranking idea is then fleshed out by one or more agents into the final answer, annotated with confidence levels for key claims.

### Shared Rules (Applicable to all modes):

*   **Global Timeout:** 13 seconds per full collaboration cycle. If fewer than 3 agents complete their primary contribution within this time, a partial answer with a disclaimer will be returned.
*   **Message Persistence (TODO):** User prompts, intermediate agent thoughts, and final answers should be persisted to a `session_messages` table in a PostgreSQL database. Each agent should ideally receive only the diff since its last turn to conserve context window (advanced optimization). *For current implementation: In-memory session storage will be used, with a note for future Postgres integration.*
*   **Real-time Events (Simulation):** Real-time events (e.g., agent typing, new thought generated) will be broadcast to the connected client via WebSocket messages, simulating a Redis pub/sub channel like `collab:<sessionId>`. Payload: `{type: string, agent: string, text: string, tokens: number}`.
*   **Cost Cap:** A `costCapDollars` field in the request will allow users to set a budget. The collaboration will be aborted if the projected API spend (based on token counts and model pricing) exceeds this budget.

## 5. UI/UX Requirements

*   **Mode Selection:** Users must be able to select one of the five collaboration modes before submitting a prompt.
*   **Responsive Design:** The interface must be responsive for desktop and mobile (Tailwind CSS principles, though current implementation uses custom CSS).
*   **Agent Display:**
    *   Display per-agent avatars (generic or provider-specific).
    *   Stream intermediate thoughts/actions from each agent in real-time in their respective columns or a dedicated collaboration panel.
    *   Display score bars or voting indicators where applicable by the mode.
*   **Scratchpad Inspection:** After a run, users should be able to click on any participating agent to view its full "scratchpad" (all its intermediate thoughts, critiques, generated content for that run).
*   **Cost Display:** The UI footer should display the estimated cost of the completed collaboration run.
*   **Dark Mode:** UI must be dark-mode friendly and consistent with the existing theme.

## 6. Technical Requirements

### 6.1. Backend

*   **Platform:** Node.js, Express.js, WebSocket (`ws` library).
*   **LLM SDKs:** `@anthropic-ai/sdk`, `@google/generative-ai`, `openai`.
*   **Cost Estimation:** Implement logic to estimate API costs based on token usage and model pricing (from `public/config/models-*.json`).
*   **Security:**
    *   Implement prompt sandboxing for each agent turn to mitigate prompt injection risks, especially forbidding tool use or function-calling unless explicitly part of a collaboration step.
    *   Continue existing security practices.
*   **Reliability:**
    *   Implement exponential back-off for API calls on 429/5xx errors (many SDKs handle this, but ensure robust error handling).
    *   Log PII-free traces (TODO: OpenTelemetry and Grafana integration).

### 6.2. Frontend

*   **Framework:** Vanilla JavaScript with direct DOM manipulation (as per existing structure).
*   **Real-time Updates:** Handle WebSocket messages for streaming agent thoughts, status, and final results.

## 7. Data Model (Conceptual for future Postgres)

*   `Sessions`: `session_id (PK)`, `user_id`, `start_time`, `end_time`, `collaboration_mode`, `cost_cap_dollars`, `actual_cost_dollars`.
*   `SessionMessages`: `message_id (PK)`, `session_id (FK)`, `agent_id` (or 'user', 'system'), `timestamp`, `role` (e.g., 'user_prompt', 'agent_draft', 'agent_critique', 'agent_vote', 'system_summary'), `content_text`, `token_count`, `parent_message_id` (for threading).

## 8. Stretch Goals (Marked as TODO in code)

*   **Team Leader Promotion:** Allow users to promote a specific agent's answer/approach to guide the next round of collaboration.
*   **RAG Enhancer:** Integrate a RAG pipeline using a Supabase vector store to inject relevant documents into agent prompts.
*   **Voice Input/Output:** Use Web Speech API for voice input, process through CollabEngine, and synthesize voice output.
*   **Semantic Search Fallback:** If no consensus is reached, use semantic search over agent responses to provide a summary of diverse viewpoints.

## 9. Non-Goals (For this version)

*   Full replacement of existing single-AI or simple parallel chat functionality (this is an additive feature).
*   User accounts and authentication beyond the existing basic setup.
*   Direct Redis or PostgreSQL integration (will simulate/mock where necessary and add TODOs).