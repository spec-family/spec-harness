# `context [brief]`

The packet an agent starts a round with: the brief in full - it is the contract - then what it implies:

- the files the round may write and must not change, as the guard reads them;
- the rulings already signed;
- the briefs it depends on, and whether they are done;
- the architecture rules spec-guard holds that code to;
- the documents the brief links to, whole, until the packet reaches its budget (`context.budget`, 60,000 characters). Documents left out are named by path, not dropped. Each is headed by its first level-one heading and the status its front matter gives under `status`, in English as every spec-* tool reads it, whatever language the document is written in.

`--base` names the base the rulings are verified against.

**The rules over the scope.** spec-guard is asked about where `affectedFiles` can reach, not the whole repository ([ADR-0001](https://github.com/spec-family/spec-harness/blob/main/docs/adr/0001-the-harness-decides-the-agent-writes.md)):

- for a pattern, the directory it reaches: `src` for `src/**` or `src/`;
- for a name with no glob syntax that exists, `src` or `src/a.ts`, that name;
- for a name the round has yet to create, the directory that will hold it, the root for a name at the top, since it may become a directory as well as a file.

Rules spec-guard could not read are named as unread, with what it said, never as none; a repository where no spec file matches spec-guard's patterns has none.

A spec pattern of spec-guard's that matches no file beside others that do is neither. spec-guard 0.22.0 and later refuse the question for it, exit 2, and still answer with the rules of every spec file that did match. The packet lists those rules as it lists any, under one sentence that names the pattern: `` spec-guard's pattern `rfcs/*.md` matched no spec file, so a rule kept under it is not listed here; remove the pattern from spec-guard's `specs`. `` `context --format json` and `start_round` name the patterns as `unmatchedSpecs`, an empty list where spec-guard names none. An older spec-guard says nothing of such a pattern, and its rules are listed as they were.

**What it could not read is named, never left out.** A cited document whose front matter opens on its first line and is never closed is one spec-core's scanner reads as having no front matter: its status was not read, and the packet says so, with the fix - close the block with `---` on a line of its own - rather than showing a document without one. So is each line of closed front matter that is not `key: value`, such as `status accepted` without its colon, or an indented line with no key above it: spec-core's reader passes over it, so a status written on it was not read, and the packet names the document, the line as written and spec-core's reason. `context --format json` and `start_round` list them as `unreadableFrontMatter`, each with its `path`, `line`, `text` and `reason`. The notes fail nothing; `context` exits 0.

A pattern the guard cannot read - malformed, too large to compile, or naming no path, such as `{./,src}` - is named as unread where it is listed, with spec-core's reason, the one the guard gives when it passes over it:

| Unreadable in | What the packet says of it | In `context --format json` and `start_round` |
| --- | --- | --- |
| `affectedFiles` | It puts no path in the scope, and spec-guard is not asked about it. When no pattern in `affectedFiles` can be read, the packet says the scope could not be read, never that spec-guard holds no rule over it. | `unreadableScope`, each with its `pattern` and `reason` |
| `protectedFiles` | Until it is fixed, the guard refuses every write but to the brief, and no ruling waives the refusal. | `unreadableProtections`, each with its `pattern` and `reason` |
| a signed ruling's paths | The guard passes over it, so it allows nothing. | `unreadableRulingPaths`, each with its `pattern`, `reason` and `ruling` |

A pattern a leading `/` roots at the filesystem's root, alone or on a brace alternative, such as `/docs` or `{/docs,src/**}`, can be read, and names no path the guard decides, all of which are repository-relative. Where it is listed, it is marked:

- in the scope, as putting no path in it: spec-guard is not asked about it, so the rules over the rest of the scope stand;
- as a protection, as protecting no path;
- as a ruling's path, as allowing nothing.
