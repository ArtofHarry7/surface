# Routewise Surface

A dependency-free responsive UI for the Planning API. It provides project
management, incremental locations/fleet/orders/constraints, Excel input,
planning submission and history, and JSON/XLSX results.

## Run locally

1. Start the Planning backend from the Planning repository:

   ```sh
   bash ./mvnw spring-boot:run
   ```

2. From this repository, start a static server on port 3000:

   ```sh
   python3 -m http.server 3000
   ```

3. Open <http://localhost:3000>.

The backend already permits the UI origin `http://localhost:3000`. The default
API address is `http://localhost:8080`; use **API settings** in the sidebar to
change it. The selected API address is stored in this browser.

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
