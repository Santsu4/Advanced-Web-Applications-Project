# Contributing Guidelines

This document defines the development practices for RIO.
All contributors should follow these guidelines to maintain a
consistent and organized codebase.

## Getting Started

1. Clone the repository.
2. Read the `README.md` to understand the project.
3. Check GitHub Projects for available tasks.
4. Follow the agreed development workflow.

Local environment setup instructions will be added once the
application is initialized.

## Branching Strategy

The `main` branch contains the latest reviewed and integrated code.

- Create a new branch for each task or feature.
- Use lowercase, descriptive branch names.
- Separate words with hyphens.
- Do not commit directly to `main`.
- Merge changes through pull requests.

### Branch Naming

Use the following prefixes:

| Prefix      | Purpose                                     | Example                  |
| ----------- | ------------------------------------------- | ------------------------ |
| `feature/`  | New functionality                           | `feature/movie-search`   |
| `fix/`      | Bug fixes                                   | `fix/search-results`     |
| `docs/`     | Documentation                               | `docs/update-readme`     |
| `chore/`    | Maintenance and configuration               | `chore/setup-eslint`     |
| `refactor/` | Code restructuring without behavior changes | `refactor/movie-service` |

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

## Coding Standards

The project uses the following technologies:

- React and TypeScript for the frontend.
- Express for the REST API.
- PostgreSQL for the database.

To maintain consistent code quality:

- Use meaningful names for variables, functions, and files.
- Keep functions focused on a single responsibility.
- Avoid unnecessary code duplication.
- Follow the agreed project architecture.
- Use Prettier for formatting.
- Use ESLint for code quality checks.

Shared formatting and linting configurations will be added
when the applications are initialized.

### Naming Conventions

Follow these conventions to maintain consistency across
the codebase.

| Element                     | Convention                            | Example               |
| --------------------------- | ------------------------------------- | --------------------- |
| Variables                   | camelCase                             | `movieTitle`          |
| Functions                   | camelCase                             | `getMovieById()`      |
| React components            | PascalCase                            | `MovieCard`           |
| Component files             | PascalCase                            | `MovieCard.tsx`       |
| Custom React hooks          | camelCase with `use` prefix           | `useMovies.ts`        |
| TypeScript types/interfaces | PascalCase                            | `Movie`, `MovieProps` |
| Constants                   | UPPER_SNAKE_CASE for global constants | `MAX_RESULTS`         |
| Boolean variables           | is/has/can prefix                     | `isLoading`           |
| Utility files               | camelCase                             | `formatDate.ts`       |
| Backend modules             | lowercase                             | `movies/`             |
| Database tables             | snake_case, plural                    | `movie_screenings`    |
| Database columns            | snake_case                            | `screening_time`      |
| API endpoints               | lowercase, plural nouns               | `/api/movies`         |

#### General Rules

- Use descriptive names that clearly express their purpose.
- Avoid unclear abbreviations such as `usr`, `mv`, or `tmp`.
- Use verbs for function names, such as `fetchMovies()`.
- Use nouns for React component names, such as `MovieCard`.
- Keep naming consistent across related files and modules.
- Use English for all identifiers and code comments.

## Communication

- Use GitHub Projects to track tasks and progress.
- Discuss significant architectural changes before implementation.
- Document important technical decisions.
- Communicate blockers and potential conflicts early.
- Review each other's work constructively.

## Updating These Guidelines

These guidelines may be updated as the project develops.
Significant changes should be discussed and reviewed by the team.
