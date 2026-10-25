import { useState, type FormEvent } from "react";
import { createProject } from "../api/projects";

export function ProjectCreateDialog() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    if (!name || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const project = await createProject(name);
      form.reset();
      const dialog = document.getElementById("projectDialog");
      if (dialog instanceof HTMLDialogElement && typeof dialog.close === "function") dialog.close();
      window.dispatchEvent(new CustomEvent("routewise:project-created", { detail: project }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The project could not be created.");
    } finally {
      setIsCreating(false);
    }
  }

  function closeDialog() {
    const dialog = document.getElementById("projectDialog");
    if (dialog instanceof HTMLDialogElement && typeof dialog.close === "function") dialog.close();
  }

  return (
    <>
      <div className="modal-top">
        <span className="modal-icon" aria-hidden="true">✳</span>
        <button className="icon-button close-modal" type="button" aria-label="Close" onClick={closeDialog}>×</button>
      </div>
      <div className="eyebrow">START A NEW JOURNEY</div>
      <h2>Create a project</h2>
      <p>Give this planning workspace a name. You can add locations, vehicles, and orders next.</p>
      <form id="projectForm" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="projectName">Project name</label>
        <input
          autoFocus
          className="text-input"
          id="projectName"
          maxLength={120}
          name="name"
          placeholder="e.g. West Coast deliveries"
          required
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-secondary close-modal" type="button" onClick={closeDialog}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={isCreating}>
            {isCreating ? "Creating…" : <>Create project <span aria-hidden="true">→</span></>}
          </button>
        </div>
      </form>
    </>
  );
}
