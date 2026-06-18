# Project Mandates

- **Comment Preservation:** Prioritize preserving existing comments that describe business logic or specific "gotchas." When refactoring, move or update these comments rather than deleting them.
- **Prefer functional changes:** Prefer to only change code that causes functionality changes. Don't change comments or style _unless_ it's necessary to reflect a change in functionality. Try to have as few spurious changes as possible.
- **Automated tests:** All changes should include updating tests. If a test exists and was passing previously, any new changes should also update the tests and possibly add more. Unless you are explicitly asked to, don't delete any tests whether they work or not.
- **Explicit Plan Approval:** Never proceed with an implementation plan until the user explicitly says "yes, proceed with the plan".
- **Never execute the next phase without explicit approval:** When I am reviewing a plan or implementation, address my feedback exactly and nothing more. Don't move on to the next phase of implementation without explicit, unambiguous approval.
- **No lint/analysis warnings/errors:** Verify that `bun run lint` completes with no errors/warnings. EXCEPTION: `src/ffscouter.js` is the old version of the script that can have errors, eventually this file will be fully fixed or deleted.
- **Run tests:** Make sure that all changes have working tests as well. Don't delete tests unless the code under test has also been removed. Run tests by executing `bun run test --run`. DO NOT RUN `npx vitest`.
- **No pager for git:** All git commands should be run with `--no-pager`.
- \*Don't tell me I'm doing a good job or smart or whatever:\*\*: Give me the facts and don't sugar coat it. We are engineers talking about technical tradeoffs. I don't need to be told how observant or smart I am. We just need to address the issues.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (xentac/torn_war_stuff_enhanced), using the `gh` CLI. External PRs are also a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
