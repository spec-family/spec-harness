# `premises`

Is every live brief still about something true? It runs spec-guard over the live briefs' assertions and reports each premise - an assertion under a section in `assertions.premises` - that no longer holds as `stale-premise`: the defect was fixed another way, or the code the brief describes is gone, and an agent sent to fix it would fix nothing.

- Goals are left to `audit`, since a goal fails until its round is done.
- For the same reason, the premise of the brief a round is working on - the one `--brief`, `SPEC_BRIEF` or the branch names - is reported as `audit` reports it, `premise-retired`, a note that fails nothing: on the round's branch, a premise that no longer holds is the work being done.
- A premise spec-guard cannot read is `assertion-unreadable`, a warning, as in the audit: nothing checks it, so `--strict` fails the run on it, and the summary counts it apart from the premises that were checked.
- A brief `--brief` or `SPEC_BRIEF` names that spec-brief does not know is refused, exit 2, as every command that acts on a brief refuses it: read as no round, it held the round's own premise against it.
- A branch whose name reads as a brief's and names none is read as no round, as before, and so is a brief spec-brief has archived. CI runs `premises` on every branch, and `fix/brief-list-order`, which names `list` under the default `branches`, is no round's; an archived brief is a closed round, which retires no premise, and is what the branch of a round names once the round has archived it.

Run it in CI: exit 1 when a premise is stale, exit 2 when spec-guard is not there to ask, or `--brief` or `SPEC_BRIEF` names a brief that is not one. `--format gitlab`, `sarif` or `github` prints its findings for a forge, as `audit` does.
