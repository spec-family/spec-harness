---
status: accepted
date: 2026-09-26
---

# ADR-0011: Releases are staged by CI, and name the siblings they need

## Context

spec-harness has never been published. Its siblings publish from a version tag
through npm's trusted publishing (spec-brief's ADR-0010, spec-graph's
ADR-0021): the registry accepts an upload from a named workflow in a named
repository on the strength of the OIDC token GitHub issues to that run, no
secret exists to leak, and each version carries a provenance attestation,
signed through Sigstore, that names the repository, the commit and the run.
A trusted publisher configured after 2026-09-03 permits `npm stage publish` by
default and a direct publish only where the package opts in; spec-brief's
and spec-graph's first tags under one were refused at the upload, and all
three siblings stage now.

Two things are particular to this package. npm attaches a trusted publisher
only to a package that already exists, so its first version cannot come from
the workflow meant to publish every version. And the harness runs its
siblings through their command lines (ADR-0002) and relies on what they
gained in the releases made alongside it; an older sibling answers, but
without it.

## Decision

**A version tag stages, and a person releases.** On a `v*` tag,
`.github/workflows/release.yml` runs four jobs, each with only the access it
needs.

1. **CI, again**, the whole matrix and the core mutation sweep on the tagged
   commit: `ci.yml` is callable. CI on main cancels a run when a newer push
   arrives, so a tagged commit may never have finished one.
2. **`pack`**, with read access alone. The commit must be on main, the tag
   must be `v` followed by the version in `package.json`, `CHANGELOG.md` must
   have a section for that version, and both plugin manifests must carry it
   (`scripts/release.ts`). It builds from clean, packs, and uploads the
   tarball with the notes.
3. **`publish`**, the one job with `id-token: write`, in the `npm`
   environment. It checks out nothing and builds nothing: it downloads the
   tarball, installs an npm new enough to stage (11.15 or later, inside
   11.x), and runs `npm stage publish` with provenance and `--ignore-scripts`.
   A compromised development dependency runs in `pack`, where there is no
   token to take.
4. **`github-release`**, with `contents: write` alone: the changelog section
   as the notes, and the tarball npm has as an asset.

The staged version waits on npmjs.com, installable by nobody, until a
maintainer runs `npm stage approve` with a second factor. A person decides
that each version goes out, and a run that is not the maintainer's can at
most queue one. A prerelease version, one with a `-`, is staged under the
`next` dist-tag and never becomes `latest`. Run by hand from main, the
workflow rehearses every job but the GitHub release, with
`npm stage publish --dry-run`; the OIDC exchange is the one step a rehearsal
cannot try.

**The first version is a placeholder, published by hand, without code.** A
maintainer publishes `0.0.0` from an empty directory outside the repository:
a `package.json` naming the package, its licence and its repository, and
saying it holds no code, with no `bin`, no files and no scripts. That claims
the name, and the trusted publisher is attached to it. 0.1.0 then comes from
its tag like every later version, and once it is approved, 0.0.0 is
deprecated in its favour. A placeholder with nothing in it to run needs no
provenance, because there is nothing for provenance to vouch for; every
version with code in it is built by CI from a tagged commit on main and
carries provenance. Publishing 0.1.0 itself by hand would ask users to trust
a workstation's `dist/` for the one version that has no attestation, and a
publish token would outlive its one use.

*Amended 2026-09-26.* That is what happened anyway: minutes after the
placeholder, an `npm publish` run in a checkout of this repository published
0.1.0 from a workstation, built from a commit no branch holds, with no
attestation. Its `dist/` matched CI's in behaviour - one expression written
two ways - but nothing proved it, and CI's staging of the tag then failed,
since npm never takes a version twice. 0.1.1 is the same code from CI, and
0.1.0 is deprecated in its favour. Nothing had stopped the mistake: `files`
and the registry settings both allow a person with a second factor to
publish. So `prepublishOnly` now refuses outside GitHub Actions, where
nothing runs it - the release stages a tarball, and a tarball's scripts are
not run.

*Amended 2026-10-01.* `publish` installs npm at an exact version, 11.20.0, the
one every staged release so far has used, rather than the newest 11.x: a range
would bring a version published an hour earlier into the one job that can
stage, past the cooldown Dependabot holds every other dependency to. Moving it
is an edit made on purpose. `pack` restores no dependency cache, because other
runs write it and the tarball comes from the lockfile and the registry alone.

**Each sibling has a minimum version**, below which the harness does not run
it:

| Sibling | Minimum | Why |
| --- | --- | --- |
| spec-brief, required | 0.2.0 | The plugin `waive` hook, through which spec-brief's archive asks this package whether a signed ruling allows a protected file (ADR-0006). Before it, the archive refuses such a round whatever was signed. |
| spec-graph, optional | 0.9.0 | An archived brief is a record, as `init` configures it, not a retired decision: a live brief that depends on one is not a `stale-premise`. |
| spec-guard, optional | 0.12.0 | Scopes and patterns read with the spec-core globs the harness reads them with, so the two agree on what a scope covers; and an archived brief's assertions withheld rather than run. |

The table is `MINIMUM_VERSIONS` in `src/versions.ts`, and the same minimums
are `peerDependencies` in `package.json`, spec-graph and spec-guard marked
optional in `peerDependenciesMeta`, so npm checks an install against them; a
test holds the two together. At run time a sibling found in `node_modules`
is measured by the `version` its `package.json` declares. One below the
minimum, or one whose version cannot be read, is `outdated`: `doctor` reports
it with the minimum and exits 1, and every command that needed it reports it
as it reports a missing one - exit 2 without spec-brief, a finding that says
what was not checked without the others. It is never run. A command named
under `tools` in `.spec-harness.json` is run as named: which package it runs,
and so its version, is the configuration's to say, and `doctor` says its
version was not checked.

*Amended 2026-10-07.* The suite runs at both ends of that range, as a library
tests the range of a peer. `devDependencies` and the lockfile hold each
sibling at its newest release, so `npm test`, CI's matrix and a release's CI
run what a user installing today runs, and Dependabot proposes a sibling's
release in its next weekly run, with no cooldown. CI's
`test (minimum siblings)` job then installs each of those siblings at its
minimum over the lockfile's, with `npm install --no-save`, checks that
`node_modules` holds exactly the minimums, and runs the suite again. The
versions it installs are `MINIMUM_VERSIONS`, read from `src/versions.ts` by
`scripts/minimum-siblings.ts`, so the workflow names no version of its own.
Until then the lockfile held spec-brief and spec-guard at exactly their
minimums, 0.2.0 and 0.12.0, and nothing ran the 0.4.1 and 0.18.1 a new install
gets. When that job fails where the matrix passes, the harness relies on
something the minimum does not have: either the harness stops relying on it,
or the minimum is raised, as the consequences below say how. The suite runs
spec-brief and spec-guard; spec-graph it only stands in for, so neither end of
spec-graph's range is run, and its minimum rests on the reason in the table.

*Amended 2026-10-07.* The workflows ask of npm only what npm 10, 11 and 12
all do. `pack` runs the npm Node 24 carries, 11 today, and took the
tarball's name from `npm pack --json`: an array under npm 11, and under npm
12 an object keyed by the package's name, where the step fails before it
names a tarball. It now packs into a directory of its own and takes the one
tarball there, as spec-guard does; the bytes are the same under the three.
Every job installs with `npm ci --ignore-scripts`. npm 12 runs a dependency's
install script only where `allowScripts` in `package.json` names the package,
npm 10 and 11 run every one unless told not to, and nothing in the lockfile
needs one, so the flag gives the three one reading: a development dependency
runs in CI when the build or the suite loads it, and not by being installed.
`tests/npm.test.ts` holds both, and that no workflow passes npm a flag the
three do not all define, which npm 12 refuses. `publish` installs npm 11.20.0
as before.

*Amended 2026-10-07.* A rehearsal can try another npm without the pin moving.
Until now the only way to run the release under an npm other than 11.20.0 was
to move the pin on main, for every tag after it as well. Run by hand, the
workflow takes an input, `npm_version`, and `publish` installs that version
where a tag installs the pin:

```bash
gh workflow run release.yml --ref main                         # the pin
gh workflow run release.yml --ref main -f npm_version=12.2.0   # a candidate
```

The input is read by a rehearsal alone: a tag has no inputs, and the step
installs the pin for a tag whatever its environment holds. It is text nobody
vouched for, so it reaches the step through `env` and is never written into
the script, and nothing is installed unless it is one exact version, three
numbers and two dots - no range, dist-tag, address or path for npm to
resolve - and no older than 11.15.0. The npm that then answers
`npm --version` must be the one named, and the run says which npm it used and
whether that is the pin. A candidate runs in the one job that can stage, so it
is chosen as the pin is: a version that has been out long enough to trust.

The decision above says the OIDC exchange is the one step a rehearsal cannot
try, and that was wrong twice over. The workflow asked `npm view` first and
ran no `npm stage publish` at all for a version on npm, which main's nearly
always is, so a rehearsal there tried nothing of npm's staging. And npm
11.20.0 and 12.2.0 both ask npmjs.com to trade the run's identity for a token
before `--dry-run` holds anything back - `lib/commands/publish.js` calls the
exchange ahead of its dry-run branch - and report how it went at
`--loglevel verbose` and at no quieter level. That is read in their source; a
rehearsal's log is where it is seen. So every rehearsal now runs
`npm stage publish --dry-run --loglevel verbose` on the tarball `pack` built.
Over a published version npm stops at a check of its own, `You cannot publish
over the previously published versions`, after it has read the tarball and
tried the exchange; the workflow takes that one refusal, naming this version,
as where such a rehearsal ends, and fails on any other.

A rehearsal under an npm shows that it installs over the one Node 24 carries,
that it takes the command line the release passes, where npm 12 refuses a flag
it does not define, that it reads the tarball, and, on the lines that start
`npm verbose oidc`, whether npmjs.com gave this workflow a token. It does not
show that a release works. `--dry-run` signs nothing and uploads nothing: no
provenance statement is made, nothing goes to Sigstore or to the staging
endpoint, and whether the token may stage is never asked. spec-brief's and
spec-graph's first tags passed every step before the upload and were refused
there. The first tag after the pin moves is the first time that npm signs and
uploads. `tests/npm.test.ts` runs the step's script, on Linux where the
workflow runs it, against a stand-in for npm: the pin for a tag whatever the
run is handed, the version a rehearsal names, and nothing installed for any
other text; and it holds that the input is written into no script.

**What the first rehearsal showed.** On 2026-10-07 a rehearsal dispatched from
main, run 37598779650 under the pin, read as the source said: `POST 201` from
the exchange, `npm verbose oidc Successfully retrieved and set token`, then
npm's version check on 0.9.1, which the workflow takes as the rehearsal's
end. So npmjs.com does give a rehearsal dispatched from main a token.
spec-guard's ADR-0019 has the same day's dry run under 12.2.0, which read the
same as far as a dry run goes.

*Amended 2026-10-26.* From 0.22.0 the package is `@spec-family/spec-harness`,
published from the repository `spec-family/spec-harness`: that day the family
moved to a GitHub organization and an npm scope of its own, and its versions
go on under the new names
([spec-core's ADR-0005](https://github.com/spec-family/spec-core/blob/main/docs/adr/0005-the-family-contract.md#names),
amended 2026-10-26). 0.1.0 to 0.21.0 were published as
`@descent-vtt/spec-harness` from `DescentVTT/spec-harness`, and keep that
name on the registry. The new name has its own placeholder, `0.0.0`, and its
own trusted publisher on npmjs.com, for the repository
`spec-family/spec-harness`, the workflow `release.yml` and the environment
`npm`, which a maintainer configures once this change has merged.

**The minimums are each sibling's first release under the new scope.** No
release under `@spec-family` looks for an `@descent-vtt` package, so the
harness finds a sibling in `node_modules/@spec-family/<name>` alone, and
the oldest release with code there is the one the move published:

| Sibling | Minimum | Was |
| --- | --- | --- |
| spec-brief, required | 0.12.0 | 0.2.0 |
| spec-graph, optional | 0.21.0 | 0.9.0 |
| spec-guard, optional | 0.30.0 | 0.12.0 |

Each is later than the release the table above gives a reason for, and has
what it brought. Below them the scope holds a placeholder with no code,
`0.0.0`, and a `0.0.0-stage` of the same kind, read on npm on 2026-10-29.
Raising the minimums turns no project away that could have run: a project
with `@descent-vtt` siblings alone has none this release looks for, and
`doctor` names each as not installed, with `npm install --save-dev
@spec-family/<name>`. `devDependencies` hold spec-brief and spec-guard at
`^0.12.0` and `^0.30.0`, their newest releases, so CI's
`test (minimum siblings)` job installs what the lockfile does until a later
one is published.

*Amended 2026-11-08.* **The plugin's version is written once, in its
manifest.** `pack` held both plugin manifests to the package's version:
`.claude-plugin/plugin.json` and the plugin's entry in
`.claude-plugin/marketplace.json`. Claude Code reads the manifest's
`version` before the entry's, whatever `strict` says, and
`claude plugin validate` warns where both name one (the manifest
reference, *Metadata precedence*, and the marketplace reference, *Plugin
entries*: https://code.claude.com/docs/en/plugins/manifest-reference and
https://code.claude.com/docs/en/plugins/marketplace-reference, read
2026-11-08). So the entry's version was read by nothing but the warning.
The entry names none now, and `scripts/release.ts` holds the manifest to the
package's version and the entry to having none: a version on it fails
`pack` and the test suite, as a manifest at another version does. The
version Claude Code installs and names its cache directory by is the one it
was, the manifest's.

## Consequences

- A maintainer sets up npmjs.com once: publish the placeholder; in the
  package's settings add a trusted publisher - GitHub Actions, repository
  `spec-family/spec-harness`, workflow `release.yml`, environment `npm`; then
  set publishing access to require two-factor authentication and disallow
  tokens, which leaves this workflow and a person with a second factor as
  the only ways to publish. `CONTRIBUTING.md` has the steps.
- **A maintainer approves each release**: `npm stage list
  @spec-family/spec-harness`, `npm stage view <id>`, then `npm stage approve
  <id>` with a second factor, or the Staged Packages tab on npmjs.com. The
  tag's run ends with those commands in its summary.
- The `npm` environment in the repository's settings is where a required
  reviewer goes, if a release should wait for one.
- The changelog and plugin-manifest checks also run in the test suite, so the
  pull request that bumps the version fails without its notes, before anyone
  tags it.
- 0.0.0 has no code and no provenance, and is deprecated. 0.1.0 has code and
  no provenance, and is deprecated. Every later version has provenance.
- Raising a minimum changes `MINIMUM_VERSIONS` and `peerDependencies`
  together, and a repository with the older sibling must upgrade it: the
  changelog says so under the version that raises it.
- The actions stay pinned by commit, as in the siblings; CI's concurrency
  group names the calling workflow, so a push to main does not cancel a
  release's CI halfway.
