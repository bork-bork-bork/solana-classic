# Commit privacy

Use `python3 scripts/install-git-privacy.py` after cloning. Commits use Solana Classic Labs with an empty email address. The hooks check staged first-party content and messages for personal home-directory paths, email addresses, machine identifiers, protected account names and raw key material. Upstream Agave attribution stays intact.

The push hook refuses the retired branch, history outside the cleaned public anchor, and new commits with another identity. Review only explicitly staged files; never add private runtime data or tools. These are local safeguards, not a promise that every secret will be detected. Hooks can be bypassed, so review the diff before publication.
