import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../api/projects";
import { ProjectCreateDialog } from "./ProjectCreateDialog";

vi.mock("../api/projects", () => ({
  createProject: vi.fn()
}));

const createProjectMock = vi.mocked(createProject);

afterEach(() => {
  cleanup();
  window.removeEventListener("routewise:project-created", onProjectCreated);
});

const onProjectCreated = vi.fn();

describe("ProjectCreateDialog", () => {
  it("creates a project, resets the form, and notifies the existing workspace", async () => {
    const project = { id: "project-123", name: "  North routes  " };
    createProjectMock.mockResolvedValue(project);
    window.addEventListener("routewise:project-created", onProjectCreated);
    render(<ProjectCreateDialog />);

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: project.name } });
    fireEvent.submit(screen.getByRole("button", { name: /create project/i }).closest("form")!);

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledWith("North routes"));
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledOnce());
    expect(onProjectCreated.mock.calls[0][0]).toMatchObject({
      detail: project
    });
    expect(screen.getByLabelText("Project name")).toHaveValue("");
  });

  it("shows the API error and keeps the project name available for correction", async () => {
    createProjectMock.mockRejectedValue(new Error("Project name is already in use."));
    render(<ProjectCreateDialog />);

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "North routes" } });
    fireEvent.submit(screen.getByRole("button", { name: /create project/i }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Project name is already in use.");
    expect(screen.getByLabelText("Project name")).toHaveValue("North routes");
    expect(createProjectMock).toHaveBeenCalledOnce();
  });
});
