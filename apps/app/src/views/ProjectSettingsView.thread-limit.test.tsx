// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSidebarThreadLimitSetting } from "./ProjectSettingsView";

const mockUpdateProject = vi.hoisted(() => ({
  isPending: false,
  mutate: vi.fn(),
}));

vi.mock("@/hooks/mutations/project-mutations", () => ({
  useUpdateProject: () => mockUpdateProject,
}));

function renderSetting(sidebarThreadRowLimit: 5 | 10 | 20 | 50 | null = null) {
  return render(
    <ProjectSidebarThreadLimitSetting
      project={{ id: "proj_test", sidebarThreadRowLimit }}
    />,
  );
}

describe("ProjectSidebarThreadLimitSetting", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("updates the server-backed thread-row limit for this project", async () => {
    renderSetting();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Maximum visible threads" }),
      { button: 0 },
    );
    fireEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "10 threads" }),
    );

    expect(mockUpdateProject.mutate).toHaveBeenCalledWith({
      id: "proj_test",
      sidebarThreadRowLimit: 10,
    });
  });

  it("shows the persisted project value and can return it to unlimited", async () => {
    renderSetting(5);

    expect(
      screen.getByRole("button", { name: "Maximum visible threads" })
        .textContent,
    ).toContain("5 threads");

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Maximum visible threads" }),
      { button: 0 },
    );
    fireEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Unlimited" }),
    );

    expect(mockUpdateProject.mutate).toHaveBeenCalledWith({
      id: "proj_test",
      sidebarThreadRowLimit: null,
    });
  });
});
