# Schedule-in-TimeLine backup

Source snapshot: `89fce9365b5005f07a86909d634b204a2734e1a7`.

The repository root contains all 110 tracked source files from the original main branch. The original 18 commits are preserved in `backup/schedule-history.bundle`. GitHub's initial backup commits are separate from the original history.

## Restore original history

Download or clone this repository, then run:

```sh
git bundle verify backup/schedule-history.bundle
git clone backup/schedule-history.bundle schedule-restored
```

Bundle SHA-256: `6ce5ac5b948311ffae0f515ab366c3ed96b71232d58fe66db0b5f2977e5312fe`.

This backs up application source and Git history. User-created schedules stored in browser localStorage are not included. Dependencies, build output, local environment files and TypeScript build cache are excluded.
