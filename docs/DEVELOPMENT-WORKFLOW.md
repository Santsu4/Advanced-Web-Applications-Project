# Development Workflow

This document describes how RIO tasks move from selection to review and merging.
See [Contributing Guidelines](../CONTRIBUTING.md) for the contribution checklist
and [Coding Standards](CODING-STANDARDS.md) for code conventions.

## Branching Strategy

The `main` branch contains the latest reviewed and integrated code.

- Create a new branch for each task or feature.
- Use lowercase, descriptive branch names.
- Separate words with hyphens.
- Do not commit directly to `main`.
- Merge changes through pull requests.

### Branch Naming

When a branch is associated with a GitHub issue, include the issue number
after the prefix, followed by a descriptive name:
`<prefix>/<issue-number>-<description>`.
Branches without an associated issue use `<prefix>/<description>`.

Use the following prefixes:

| Prefix      | Purpose                                     | Example                     |
| ----------- | ------------------------------------------- | --------------------------- |
| `feature/`  | New functionality                           | `feature/42-movie-search`   |
| `fix/`      | Bug fixes                                   | `fix/57-search-results`     |
| `docs/`     | Documentation                               | `docs/63-update-readme`     |
| `chore/`    | Maintenance and configuration               | `chore/71-setup-eslint`     |
| `refactor/` | Code restructuring without behavior changes | `refactor/84-movie-service` |

## Sprint Task Management

We use GitHub Projects to organize, assign, and track development tasks throughout each sprint.

### Picking Up Tasks

At the beginning of each sprint, or whenever you have completed your assigned work:

1. Open the **Actionable** view in GitHub Projects.
2. Select an available task that is not already assigned to another contributor.
3. Assign the task to yourself.
4. Change its status from **Backlog** to **Todo**.
5. Set the **Sprint** field to the corresponding sprint.

Only pick up tasks that you intend to work on during the current sprint.

### Starting a Task

When you begin working on a task:

1. Change its status from **Todo** to **In progress**.
2. Set the **Start date** to the date you begin working.
3. Set the **Estimated completion date** to your expected finish date.
4. Create a branch following the agreed branching conventions.

Keep the task status and estimated completion date updated if your progress or timeline changes.

### Submitting a Task for Review

Once the implementation is ready:

1. Ensure the implementation meets the task requirements.
2. Run the available tests, linting, and formatting checks.
3. Commit and push your changes.
4. Create a pull request targeting `main` and link it to the corresponding issue.
5. Request a review from your teammate.
6. Change the task status from **In progress** to **In review**.

Keep the task **In review** while awaiting approval. If changes are requested, move it back to **In progress**, address the feedback, and return it to **In review** when ready.

### Completing a Task

Once the pull request has been reviewed:

1. Obtain the required approval.
2. Ensure all required checks pass.
3. Merge the pull request into `main`.
4. Confirm that the corresponding issue is closed.
5. Change the task status from **In review** to **Done**.

A task should only be marked **Done** once its changes have been successfully merged.

### General Guidelines

- Keep GitHub Projects updated to reflect your actual progress.
- Do not start tasks already assigned to another contributor without coordinating first.
- Communicate blockers or delays as early as possible.
- Update task estimates when necessary.
- Pick up another available task when you have no remaining assigned work.
- Do not merge your own pull request without the agreed review and approval process.

## Commit Guidelines

Follow the principles from
[How to Write a Git Commit Message](https://cbea.ms/git-commit).

- Use the imperative mood in the subject line.
- Capitalize the subject line.
- Do not end the subject line with a period.
- Limit the subject line to approximately 50 characters.
- Separate the subject and body with a blank line.
- Wrap the body at approximately 72 characters.
- Explain what changed and why, rather than how.
- Keep commits focused on one logical change.

Example:

```text
Add movie search endpoint

Allow clients to retrieve movies matching a search query.
This provides the API foundation for the frontend search feature.
```

## Pull Requests

All changes should be submitted through pull requests.

Before opening a pull request:

1. Ensure the changes relate to the assigned task.
2. Review your own code.
3. Run available formatting, linting, and tests.
4. Update relevant documentation when necessary.
5. Provide a clear description of the changes.

At least one teammate should review the pull request before merging.
