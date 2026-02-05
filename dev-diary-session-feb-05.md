# BMAD Framework Evidence - PRD Session

**Date:** February 5, 2026  
**Sources:** chat1.json, chat2.json, transcript.vtt

## Technique 1: 11-Step PRD Workflow

**Context:** chat1.json shows user request "Let's proceed with PRD step 11". chat2.json shows YAML: `stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']`

**Key Findings:**
- AI successfully completed all 11 workflow steps
- Produced comprehensive PRD: 73 Functional Requirements, 12 NFR categories, 3 user journeys
- YAML frontmatter tracked progress through phases
- AI could verify completion: "Yes, the PRD work appears complete"

**Key Misses:**
- AI over-specified implementation details (storage technology) in requirements phase
- Developer had to correct: "Let's remove all FRs and NFRs regarding storage specifics. We only need to know that the adapter uses some storage somehow"
- No workflow constraint prevented architecture-level detail in PRD phase

## Technique 2: Post-Mortem Analysis with Socratic Questioning

**Context:** chat2.json - User: "Let's do post-mortem analysis of PRD". AI loaded PM agent, began systematic review.

**Key Findings:**
- Post-mortem caught over-specification issue before architecture phase started
- **Socratic questioning applied:** "Does Response API actually use correlation IDs for server-side state? (Need OpenAI docs confirmation)"
- **Challenge assumptions:** "Are all 11 'common features' truly translatable? (Needs technical validation)"
- **Critical analysis:** "What's the actual field mapping between the two APIs? (Mentioned but not specified)"
- Generated quality score 7.9/10 with 8 specific improvement areas
- Recommended next steps with time estimates (~8 hours to fix critical issues)

**Key Misses:**
- AI didn't self-identify the over-specification problem during creation
- Critical questions only appeared in review, not during PRD generation

**Developer Steering:** User explicitly requested post-mortem, then directed specific correction: "Let's discuss storage in architecture document"

## Technique 3: Red Team / Blue Team Review Pattern

**Context:** chat2.json post-mortem section - implicit adversarial review

**Key Findings:**
- **Blue team (creation):** AI generated comprehensive PRD with 73 FRs, 47+ NFRs
- **Red team (critique):** Post-mortem identified 8 major issues including:
  - OpenAI API Assumptions Need Validation
  - State Management Architecture Has Gaps  
  - Technology Stack Undefined
  - Error Handling Philosophy vs Reality
- **Challenge mode:** "This is contradictory. Which is it?" (re: state management)
- **Reality checks:** "This violates 'zero application changes' claim (NFR-U3)"

**Key Misses:**
- No explicit role separation during workflow
- AI didn't challenge itself during creation phase
- Framework didn't enforce checkpoint reviews

**Developer Steering:** User initiated: "Let's do post-mortem analysis of PRD" to trigger red team critique

## Team Discussion Context

**Source:** transcript.vtt (Russian conversation between Siarhei and Artur)

**Relevant Exchange:**
- "требует только изменений конфигурационного файла приложения... Но не переписывание его кода" (requires only config file changes, not code rewriting)
- "Формат пелла разный" (formats are different between APIs)

**Insight:** Team validated zero-refactor requirement from PRD in parallel technical discussion. Shows PRD aligned with actual technical understanding.

## Summary: Framework Performance

**What Worked:**
- Structured workflow completed successfully
- State tracking visible to both AI and human
- **Post-mortem with Socratic questioning caught critical issues:** Questions like "Does Response API actually use correlation IDs?" exposed unvalidated assumptions
- **Red team critique valuable:** Identified 8 problems including contradictions that creation phase missed
- AI responded immediately to correction directives

**What Failed:**
- **No proactive questioning during creation:** Socratic questions only appeared in post-mortem, not during PRD generation
- **No self-challenge mechanism:** AI didn't question its own output despite PM persona
- AI mixed abstraction levels (PRD vs architecture scope)
- No automatic constraint on phase-appropriate detail
- Required manual steering at critical juncture
- **Persona insufficient:** PM agent's "asks 'WHY?' relentlessly" didn't apply to own output

**Steering Overhead:**
- 1 major correction required
- Developer provided explicit scope: "We only need to know that adapter uses some storage somehow"
- AI complied immediately when boundaries clear

**Critical Questions for Framework Viability:**
1. **Can BMAD automatically enforce phase boundaries, or will every session require manual steering?**
2. **Should proactive questioning be integrated into creation steps, not just available in post-mortem?**
3. **Why didn't the PM persona's questioning behavior apply to the AI's own output during creation?**
