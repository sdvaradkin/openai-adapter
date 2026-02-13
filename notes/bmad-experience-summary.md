# BMAD Framework – Developer Experience Summary

**Project:** OpenAI Adapter  
**Period:** February 3–13, 2026  
**Team:** Siarhei Dvaradkin, Artur Semenas

---

## 1. BMAD Flows Used

The team leveraged the following BMAD workflows and agent roles throughout the project:

| Flow / Agent | Purpose |
|---|---|
| **Product Brief (Analyst Agent)** | Extracted core product value via Advanced Elicitation and critical perspective challenge |
| **PRD Creation (PM Agent)** | 11-step structured workflow producing functional/non-functional requirements, user journeys |
| **Post-Mortem / Socratic Review** | User-triggered review phase to catch over-specification and unvalidated assumptions |
| **Red Team / Blue Team Review** | Adversarial critique of PRD to expose contradictions |
| **Epic & Story Creation (PM Agent)** | Structured decomposition of epics into user stories with acceptance criteria |
| **Context Story Generation (`CS`)** | Pre-implementation story documents with full architectural context |
| **Comprehensive Story Review** | End-to-end validation: code, tests, config, spec compliance |
| **Sprint Planning & Menu Navigation (SM Agent)** | Role-based menus for workflow discovery and execution |
| **Story Development (`/bmad:bmm:dev-story`, shorthand `DS`)** | Code generation, config scaffolding, test creation per story |
| **Code Review (`CR`)** | Automated pattern-based code review with terminal test/lint execution |
| **Course Correction (SM Agent)** | Mid-sprint requirement adjustments and scope re-alignment |
| **Git Workflow Configuration** | Config-driven branching strategy with PR confirmation gates |

Entry points evolved over time: natural language → slash commands (`/bmad:bmm:dev-story`) → shorthand codes (`DS`, `CR`, `CS`) → role-based menu selection.

---

## 2. What Was Beneficial

### Structured Workflows with State Tracking
The 11-step PRD workflow with YAML front-matter metadata (`stepsCompleted` array) provided clear, unambiguous progress tracking. Both AI and developers always knew the current state.

### Time Savings on Repetitive Tasks
BMAD automated boilerplate-heavy activities — scaffolding config files, generating test stubs, producing story documents. These specific tasks were noticeably faster. However, the overall development pace was slower than expected because AI frequently misunderstood requirements or lost track of them between phases, requiring repeated corrections that offset the gains from automation.

### Post-Mortem & Socratic Questioning
When explicitly triggered, the post-mortem workflow caught critical issues — unvalidated API assumptions, contradictions, and over-specification — that creation phases missed. Quality score with specific improvement items gave concrete guidance.

### Multi-Phase Workflow Checkpoints
Long workflows broken into phases with "Continue" confirmations gave developers visibility and the ability to steer mid-workflow.

### Team Planning + AI Execution Separation
Architectural decisions made in team meetings (option analysis, scope closure) translated into clear AI execution directives. Chat sessions became pure execution — no wasted context on "figure out what to do."

---

## 3. Challenges Developers Faced

### AI Over-Specification and Abstraction Level Drift
The most persistent issue: AI repeatedly mixed PRD-level requirements with architecture-level implementation details (e.g., specifying storage technology in PRD phase). Persona instructions alone ("ask WHY relentlessly") did not prevent this — explicit human correction was always required.

### Inconsistent Dependency Ordering
AI created task decompositions with backwards dependencies (e.g., "mapping engine" story placed after stories that depend on it). Only caught through team review and explicit questioning.

### Course Correction Was Messy
When requirements changed mid-sprint, acceptance criteria became inconsistent, reviews referenced outdated requirements, and some documents were updated while others were skipped. The correction flow lacked synchronization across artifacts.

### Requirements & Review Gaps
- Some requirements were silently ignored during implementation
- Tests were not always created for all requirements
- Code reviews could miss uncovered requirements even on premium models
- Running reviews multiple times improved results — single pass was unreliable

### Implementation Regression
In one case, the AI correctly understood the JSON request structure during story analysis, reflected it correctly in the story description, but then produced incorrect implementation — regressing despite prior alignment.

### Inconsistent Confirmation Gates
Confirmation behavior was unpredictable. Sometimes AI asked for approval before actions, sometimes it did not. In some cases it marked a story as "Done" right after code review, even when the developer intended to run another review round. The lack of consistent gating undermined trust in the workflow.

### Custom Workflows Ignored
Custom workflow configurations were not reliably picked up by the framework. For example, a custom git branching strategy was defined in BMAD config files but was completely ignored during execution — the AI continued with its default behavior.

### Tooling Friction
Manual edits to BMAD-generated files caused IDE glitches (showing previous diffs, overriding manual changes).

---

## Overall Assessment

BMAD provides useful structure for the planning phases — product brief, PRD, epic and story creation all benefited from the framework's step-by-step workflows and state tracking. The post-mortem and review flows, when explicitly triggered, caught real issues.

However, the transition from planning to implementation exposed significant gaps. Despite requirements being clearly defined across multiple stages (PRD, architecture, epics, stories), the AI consistently lost or misunderstood parts of them during actual coding. This made development slower than expected and required constant developer oversight.

Other persistent issues — messy course corrections, inconsistent confirmation behavior, ignored custom workflows, and unreliable single-pass reviews — mean the framework cannot be trusted to run autonomously. Developers must treat every AI output as a draft that needs validation.

BMAD works best as a **structured scaffolding tool for planning artifacts** and a **time saver for repetitive boilerplate tasks**. It is not yet reliable as an end-to-end development automation platform.
