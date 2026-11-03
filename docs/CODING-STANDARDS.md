# Coding Standards

These standards apply to RIO frontend and backend code.
See [Contributing Guidelines](../CONTRIBUTING.md) for the contribution checklist.

The project uses the following technologies:

- React with JavaScript (`.jsx` and `.js`) for the frontend.
- Node.js with Express and JavaScript (`.js`) for the REST API.
- PostgreSQL for the database.

To maintain consistent code quality:

- Use meaningful names for variables, functions, and files.
- Keep functions focused on a single responsibility.
- Avoid unnecessary code duplication.
- Follow the agreed [project architecture](ARCHITECTURE.md).
- Use Prettier for formatting.
- Use ESLint for code quality checks.

Shared formatting and linting configurations will be added
when the applications are initialized.

## Naming Conventions

Follow these conventions to maintain consistency across
the codebase.

| Element            | Convention                            | Example            |
| ------------------ | ------------------------------------- | ------------------ |
| Variables          | camelCase                             | `movieTitle`       |
| Functions          | camelCase                             | `getMovieById()`   |
| React components   | PascalCase                            | `MovieCard`        |
| Component files    | PascalCase                            | `MovieCard.jsx`    |
| Custom React hooks | camelCase with `use` prefix           | `useMovies.js`     |
| Constants          | UPPER_SNAKE_CASE for global constants | `MAX_RESULTS`      |
| Boolean variables  | is/has/can prefix                     | `isLoading`        |
| Utility files      | camelCase                             | `formatDate.js`    |
| Backend modules    | lowercase                             | `movies/`          |
| Database tables    | snake_case, plural                    | `movie_screenings` |
| Database columns   | snake_case                            | `screening_time`   |
| API endpoints      | lowercase, plural nouns               | `/api/movies`      |

### General Rules

- Use descriptive names that clearly express their purpose.
- Avoid unclear abbreviations such as `usr`, `mv`, or `tmp`.
- Use verbs for function names, such as `fetchMovies()`.
- Use nouns for React component names, such as `MovieCard`.
- Keep naming consistent across related files and modules.
- Use English for all identifiers and code comments.
