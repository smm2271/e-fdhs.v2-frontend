# Frontend

## Broadcast Feed mock preview

Open `/broadcasts` after starting the development server. The default mock user is 資訊股長;
use the Mock 身分 selector to preview 班代表 or read-only 一般學生 permissions.

- `src/app/services/broadcast/broadcast.mock.ts` contains all sample data and users.
  The scenario clock is fixed at 2026/10/07 15:00 (Asia/Taipei).
- `broadcast.store.ts` owns weekly filtering, grouping, confirmation, replies and the navigation
  badge. Future API integration belongs at this boundary; currently all mutations are in memory
  and reset on reload. `BROADCAST_CLOCK` can be replaced independently.
- `src/app/pages/broadcast/` contains the feed and recursive inline reply renderer.
  One table becomes cards through CSS at widths of 768px and below.
- No Broadcast API, backend changes, authentication integration or extra dependencies are included.
  The existing login route remains at `/`; the student navigation is introduced on the feed
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
