## BMAD Framework – Observations & Issues
 
### 1. Course Correction Issues
- Course correction was **messy and inconsistent**.
- Created a separate *PoC scope impact* file without clear reason.
- Some documents were updated; others were skipped.
- Irrelevant requirements were still picked up after correction.
- Correction was done by Scrum Master — better handled by **PM or Architect** in our case.
 
---
 
### 2. Requirements & Test Coverage Gaps
- Some requirements are ignored.
- Tests are not always created for all requirements.
- Code reviews may miss uncovered requirements.
- Framework cannot be blindly trusted.
- Core review is inconsistent and may miss critical gaps (even on premium models).
- Running reviews multiple times improves results.
 
---
 
### 3. Flow & Process Problems
- Had to run the agent outside BMAD flow to make pass-through mode work (simple case).
- Stories are sometimes marked **Done** after code review even if incomplete.
- When requirements change slightly:
  - ACs become messy.
  - Reviews reference outdated requirements.
  - ACs are not cleaned properly after updates.
 
---
 
### 4. Story & File Structure Issues
- Often generates unnecessary file trees in story descriptions.
- Later complains about missing files during code review — even when irrelevant.
 
---
 
### 5. Implementation Inconsistencies
- During development, misunderstood JSON request structure.
- Produced incorrect/weird implementation.
- Story analysis phase had correct understanding.
- Story description reflected correct structure.
- Implementation phase regressed despite prior alignment.
 
---
 
### 6. Tooling Issues
- C# Copilot glitches when modifying BMAD-generated files manually.
- Shows previous diffs.
- Overrides manual changes.
 
---
 
## Overall Pattern
- Inconsistent state management across phases (analysis → story → implementation → review).
- Weak synchronization after requirement changes.
- Review logic overly rigid and not context-aware.
- Requires manual validation and repeated runs to ensure reliability.