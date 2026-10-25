# Routewise Surface

A responsive UI for the Planning API. The interface is being migrated
incrementally to React and TypeScript; existing workflows continue to work
during the transition.

## Run locally

1. Install Node.js 20.19+ or 22.12+.

2. Install the frontend dependencies:

   ```sh
   npm install
   ```

3. Start the Planning backend from the Planning repository:

   ```sh
   bash ./mvnw spring-boot:run
   ```

4. Start the frontend development server:

   ```sh
   npm run dev
   ```

5. Open the URL printed by Vite (normally <http://localhost:5173>).

During development, `/api` requests are proxied to `http://localhost:8080` to
avoid browser CORS configuration. Set `VITE_API_PROXY_TARGET` in the shell to
use another local backend address. The **API settings** field can override the
proxy with a full API URL; that value is stored in this browser.
For a fixed deployment API address, set `VITE_API_BASE_URL` at build time.

## Quality checks

```sh
npm run lint
npm test
npm run build
```

## Migration status

The project-creation dialog and API call are the first React/TypeScript slice.
The remaining planning workspace is still served by the existing JavaScript
and is intentionally left functional while it is migrated in later steps.

## Using the workspace

- Create a project to start with a blank editable input.
- Add locations and fleet independently. Add orders after their pickup and
  drop-off locations have been created.
- Save constraints before submitting a plan or importing Excel.
- Excel import replaces the current project input; it does not modify existing
  plan snapshots.
- Create a plan when the readiness checklist is complete. Each submission
  captures the current input. Later edits are independent of previous plans.
- Open a completed plan to inspect its summary and JSON, or download the Excel
  workbook from the same result API.

Project ownership and authentication are not yet part of the backend API.
