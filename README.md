# Frontend

## Broadcast Feed API and mock preview

The default development server and production build use the real Backend API.
Start the backend on port 8000, run `npm start`, log in at `/`, then follow
「查看本週廣播」. The development proxy forwards `/auth` and `/users` unchanged,
and rewrites `/api/broadcasts...` to the backend's `/broadcasts...` endpoints.
The browser page route `/broadcasts` must stay with Angular, including refreshes.
Production hosting must implement the same proxy mapping on the same origin
and serve HTTPS for the existing Secure HttpOnly `__Host-session` cookie.
No session token is stored in frontend code or browser storage.

For an explicit UI-only mock preview, run `npm start -- --configuration mock`
and open `/broadcasts`. The default mock user is 資訊股長; use the Mock 身分
selector to preview 班代表 or read-only 一般學生. Production configuration
replaces the environment with `broadcastMock: false`; the mode factory also
disables mocks whenever `production` is true. Do not deploy a mock build.

- `src/app/services/broadcast/broadcast.mock.ts` contains all sample data and users.
  The scenario clock is fixed at 2026/10/07 15:00 (Asia/Taipei).
- `broadcast.store.ts` owns weekly filtering, grouping, confirmation, replies and the navigation
  badge. `broadcast.api.ts` calls the API with `withCredentials: true`, loads all feed pages,
  and maps backend target capabilities into the existing UI. State changes follow successful
  responses; failed submissions retain the draft. The clock refreshes every minute and reloads
  the feed when the Taipei display week changes. `BROADCAST_CLOCK` can be replaced in tests.
- `src/app/pages/broadcast/` contains the feed and recursive inline reply renderer.
  One table becomes cards through CSS at widths of 768px and below.
- Teachers see separate rows for each visible target thread, with the class name beside the sender.
  Confirmation and reply controls use backend capabilities for that particular target.
  The same component renders API and mock data; no extra dependencies are required.
  The existing login route remains at `/`, and the navigation badge lives on the feed
  because this project does not yet have a shared student layout.

Validation: `npm test -- --watch=false` and `npm run build`. This project has no lint script
or lint target. On Windows with script execution disabled, use `npm.cmd` / `npx.cmd`.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
