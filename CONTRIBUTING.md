# Contributing

## Getting started

```bash
npm ci
npm run lint      # tsc --noEmit, strict
npm run build     # emits dist/; a few integration tests run bin/spec-harness.js
npm test          # vitest: the unit suite and the integration suite
```

Node 22 or later. There are no runtime dependencies. The working agreements
and the module layout are in [`CLAUDE.md`](CLAUDE.md); the decisions and what
they cost are in [`docs/adr/`](docs/adr/README.md). Mutation testing runs in
GitHub Actions, not on a workstation: the core sweep is a CI job on every
change, and the full sweep runs for a change to what only it reaches
(below), weekly and on request (Actions, Mutation, Run workflow), in eight
parallel shards merged into one score.

npm 10, 11 and 12 install the same tree from the lockfile and run the same
suite. `npm ci` leaves the lockfile as it is under each of them; npm 10's
`npm install` writes it back without the `libc` fields npm 11 and 12 keep, so
a change to the lockfile is made with npm 11 or later.

A run of the suite works in one directory of its own in the system's
temporary directory, `spec-harness-test-*`, and removes it when it ends. A
run that is ended early leaves that directory, and a later run removes it
once a day has passed, with any other of that name
([ADR-0010](docs/adr/0010-toolchain-and-verification.md)).

`src/vendor/spec-core/` is spec-core's, copied by its `scripts/vendor.mjs` and
verified by hash. It is never edited here.

## A change only the full sweep reaches

The core sweep mutates the pure modules, the list in
`stryker.core.config.mjs`. The command line, `init`, the server, `round.ts`,
git and the siblings are mutated by the full sweep alone, and a pull request
that changes one of them, or what the sweep is made of, runs it: nine more
checks, and about twenty minutes where CI takes nine. The files are the
paths in `.github/workflows/mutation.yml`. A module added to `src/` goes into
the core sweep's list or into those paths, and `npm test` fails until it is
in one. Every push to such a pull request runs the sweep again and ends the
one before it.

The check `mutation (full)` ends with a summary, *Undetected mutants new
against main*: the mutants of the pull request, merged into main, that no
test detects and that main's newest full sweep did not have. The sweep does
not fail for them, so the pull request answers for them. Its description
lists each one the summary names and says what it is:

- killed, by a test the pull request adds, which the next push shows;
- equivalent, with the reason in a comment beside the code;
- or not of this change: a mutant main took after the commit the summary
  names, or one whose verdict differs between two sweeps of the same code.

A mutant is its file, its mutator, the text it replaces and what replaces
it, never its line, so one whose own text changed is listed as new. Where
the summary says *not compared*, main had no report to fetch, and nothing
is known of new survivors: download the two sweeps' `mutation-full`
artifacts and compare them with the same script,
`node scripts/mutation-compare.mjs <main's mutation.json> <this sweep's mutation.json>`.

A change to the integration suite, anything under `tests/integration`, or
to the vendored spec-core runs the sweep as well, since its verdicts are
made of both. A dependency's bump alone runs none, and neither does a unit
test alone; the weekly sweep reads those. Run it on a branch before then
where a change of that kind is meant to move a verdict
(`gh workflow run mutation.yml --ref <branch>`): a bump of spec-brief or
spec-guard, which the integration suite runs, or a change to
`tests/unit/git.test.ts` or `tests/unit/workspace.test.ts`, whose modules
the core sweep does not mutate whole.

## Sibling minimums

The oldest release of each sibling this one runs is `MINIMUM_VERSIONS` in
`src/versions.ts`, and the same minimums are `peerDependencies` in
`package.json`. A test fails when the two disagree, so a change to one is a
change to both. Raising a minimum asks every repository with the older
sibling to upgrade it; say so in the changelog, and why
([ADR-0011](docs/adr/0011-releases-are-staged-by-ci.md)).

`devDependencies` and the lockfile hold spec-brief and spec-guard at their
newest releases, so `npm test` runs what a user installs today. CI's
`test (minimum siblings)` job runs the suite again at the minimums. To do the
same here:

```bash
npm install --no-save $(node scripts/minimum-siblings.ts)
node scripts/minimum-siblings.ts --installed   # exits 1 unless those are installed
npm test
npm ci                                         # the newest again
```

When the suite fails at the minimums and passes at the newest, the harness
relies on something the minimum lacks: change the harness, or raise the
minimum.

## Releasing

Versions are staged by CI from a tag and released by a maintainer with a
second factor, never published from a workstation
([ADR-0011](docs/adr/0011-releases-are-staged-by-ci.md)).

1. On a branch, set the version and give it notes:
   `npm version <x.y.z> --no-git-tag-version`, set the same version in
   `.claude-plugin/plugin.json` and twice in `server.json` (`version`, and
   the package's `version`), then move the changelog's `## Unreleased`
   entries under `## <x.y.z>`. The test suite fails until the changelog has
   a section for the version and the manifest and `server.json` carry it.
   The plugin's entry
   in `.claude-plugin/marketplace.json` names no version: Claude Code reads
   the manifest's first, and `claude plugin validate` warns where both do.
2. Merge to main.
3. Tag the merge commit and push the tag:

   ```bash
   git tag -a v<x.y.z> -m "spec-harness <x.y.z>"
   git push origin v<x.y.z>
   ```

The release workflow runs CI again, packs, stages the version on npm with
provenance and makes the GitHub release. Then a maintainer releases it with a
second factor: `npm stage list @spec-family/spec-harness`,
`npm stage view <id>`, `npm stage approve <id>`. A prerelease (`0.2.0-rc.1`)
is staged under the `next` dist-tag. To try the workflow without publishing,
run it by hand from main (Actions, Release, Run workflow): it does everything
but the signing, the upload and the GitHub release. That rehearsal can try
another npm than the one the release pins, without moving the pin: name one
exact version in its `npm_version` input, as in
`gh workflow run release.yml --ref main -f npm_version=12.2.0`. A tag stages
with the pin whatever was rehearsed, and ADR-0011 says what a rehearsal does
and does not show.

4. Once npm serves the version, list it in the official MCP Registry:

   ```bash
   gh workflow run mcp-registry.yml --ref main -f version=<x.y.z>
   ```

   or Actions, MCP Registry, Run workflow, with the version.
   [`mcp-registry.yml`](.github/workflows/mcp-registry.yml) lists the server
   as `io.github.spec-family/spec-harness`. The registry reads the package
   from npm, so the listing waits for the approval, which GitHub never hears
   of. The workflow checks out the version's tag; stops unless `server.json`,
   `package.json` and npm all name the version, and npm serves it with
   `server.json`'s name as its `mcpName`; downloads `mcp-publisher` at one
   version and checks its SHA-256; logs in with the run's GitHub OIDC token,
   which needs no secret; and publishes `server.json`. A run before the
   approval stops at npm, and says so.

### Once, before the first release under a name

npm attaches a trusted publisher only to a package that exists, so the name is
claimed by hand with a placeholder that has no code in it, and every version
with code comes from the workflow. `@descent-vtt/spec-harness` was set up so
before 0.1.0, and `@spec-family/spec-harness`, the name from 2026-10-26,
before 0.22.0.

1. **Publish the placeholder.** In an empty directory outside the repository,
   so that nothing of the work tree can be packed, write this `package.json`
   and publish it with your second factor:

   ```json
   {
     "name": "@spec-family/spec-harness",
     "version": "0.0.0",
     "description": "A placeholder that claims the name for spec-harness. It contains no code; install 0.22.0 or later.",
     "license": "MIT",
     "repository": {
       "type": "git",
       "url": "git+https://github.com/spec-family/spec-harness.git"
     }
   }
   ```

   ```bash
   npm pack --dry-run                    # one file: package.json
   npm publish --access public
   npm view @spec-family/spec-harness    # 0.0.0, the latest
   ```

2. **Attach the trusted publisher.** On npmjs.com, in the package's settings,
   add a trusted publisher: GitHub Actions, repository
   `spec-family/spec-harness`, workflow `release.yml`, environment `npm`.
3. **Close every other way in.** In the same settings, set publishing access
   to require two-factor authentication and disallow tokens. The workflow and
   a person with a second factor are then the only ways to publish.
4. **Release 0.22.0** as above: tag the commit on main that carries it, wait
   for the run to stage it, and approve it. The `npm` environment is the one
   0.1.0's run created, which came with the repository when it moved; a
   required reviewer, if a release should wait for one, goes on it.
5. **Deprecate the placeholder** once a version with code is installable:

   ```bash
   npm deprecate @spec-family/spec-harness@0.0.0 "A placeholder without code; install 0.22.0 or later."
   ```

## Commits

A subject that says what changed, in the imperative, and a body that says
why. Changes reach main through pull requests.
