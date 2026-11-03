// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => "/grouping",
  Link: ({
    children,
    to,
    className,
    title,
    "aria-label": label,
  }: {
    children: ReactNode;
    to: string;
    className?: string;
    title?: string;
    "aria-label"?: string;
  }) => (
    <a href={to} className={className} title={title} aria-label={label}>
      {children}
    </a>
  ),
}));
vi.mock("@/server/functions/session", () => ({
  getStaffSession: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/features/auth/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

describe("staff navigation", () => {
  it("uses the same expanded navigation on grouping and other pages", () => {
    const view = render(<AdminShell>Overview</AdminShell>);
    const normal = screen.getByRole("navigation", { name: "Admin navigation" });
    const expandedMarkup = normal.innerHTML;
    const expandedClasses = normal.className;
    expect(
      screen.getByRole("button", { name: "Collapse navigation" }).textContent,
    ).toBe("");
    view.rerender(<AdminShell workspace>Grouping</AdminShell>);
    expect(normal.innerHTML).toBe(expandedMarkup);
    expect(normal.className).toBe(expandedClasses);
    expect(
      screen
        .getByRole("button", { name: "Collapse navigation" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("remembers collapsing and expanding across page mounts", () => {
    const view = render(<AdminShell workspace>Grouping</AdminShell>);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse navigation" }),
    );
    expect(window.localStorage.getItem("carve.navigationCollapsed")).toBe(
      "true",
    );
    view.unmount();
    render(<AdminShell>Students</AdminShell>);
    const expand = screen.getByRole("button", { name: "Expand navigation" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    const nav = within(
      screen.getByRole("navigation", { name: "Admin navigation" }),
    );
    expect(
      nav.getByRole("link", { name: "Grouping" }).getAttribute("title"),
    ).toBe("Grouping");
    fireEvent.click(expand);
    expect(window.localStorage.getItem("carve.navigationCollapsed")).toBe(
      "false",
    );
    cleanup();
    render(<AdminShell workspace>Grouping</AdminShell>);
    expect(
      screen.getByRole("button", { name: "Collapse navigation" }),
    ).toBeTruthy();
  });

  it("still toggles when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    render(<AdminShell workspace>Grouping</AdminShell>);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse navigation" }),
    );
    expect(
      screen.getByRole("button", { name: "Expand navigation" }),
    ).toBeTruthy();
  });
});
